import {
  HUNT_DOMAIN_ID,
  HUNT_DOMAIN_DEFINITION,
  ensureHuntDomain,
} from "./hunt-domain.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = "daggerheart-campaign-toolkit";

let dependencies = null;

export function configureHuntCardMaintenance(value) {
  dependencies = value;
}

function maintenanceDependencies() {
  if (!dependencies) {
    throw new Error("Hunt card maintenance dependencies are not configured.");
  }
  return dependencies;
}

const normalizedChoice = (...args) =>
  maintenanceDependencies().normalizedChoice(...args);
const domainIcon = (...args) =>
  maintenanceDependencies().domainIcon(...args);

const HUNT_CARD_ROLE_SCHEMA_VERSION = 1;

const HUNT_CARD_ROLE_CONTRACT = Object.freeze({
  "Appui dÃ©fensif": {
    combatRole: "support",
    huntRole: null,
  },
  "Conversion": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Couverture": {
    combatRole: "support",
    huntRole: null,
  },
  "Cuistot": {
    combatRole: null,
    huntRole: "preparation",
  },
  "Diversion": {
    combatRole: "support",
    huntRole: null,
  },
  "Extracteur": {
    combatRole: null,
    huntRole: "extraction",
  },
  "Feinte dâ€™approche": {
    combatRole: "opener",
    huntRole: null,
  },
  "Frappe dâ€™Ã©puisement": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Frappe de rupture": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Frappe mutilante": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Guidage du finisher": {
    combatRole: "support",
    huntRole: null,
  },
  "Naturaliste": {
    combatRole: null,
    huntRole: "knowledge",
  },
  "Ouverture": {
    combatRole: "opener",
    huntRole: null,
  },
  "Ouverture prÃ©cise": {
    combatRole: "opener",
    huntRole: null,
  },
  "Provocation": {
    combatRole: "opener",
    huntRole: null,
  },
  "Tacticien": {
    combatRole: "support",
    huntRole: "logistics",
  },
  "Traqueur": {
    combatRole: null,
    huntRole: "tracking",
  },
});

const LEGACY_HUNT_CARD_NAMES = Object.freeze([
  "Appui dÃ©fensif",
  "Conversion",
  "Couverture",
  "Cuistot",
  "Diversion",
  "Extracteur",
  "Feinte dâ€™approche",
  "Frappe dâ€™Ã©puisement",
  "Frappe de rupture",
  "Frappe mutilante",
  "Guidage du finisher",
  "Naturaliste",
  "Ouverture",
  "Ouverture prÃ©cise",
  "Provocation",
  "Tacticien",
  "Traqueur",
]);

function normalizedHuntCardName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€™â€˜`Â´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

const LEGACY_HUNT_CARD_NAME_KEYS = new Set(
  LEGACY_HUNT_CARD_NAMES.map(normalizedHuntCardName)
);

function isLegacyHuntCardName(name) {
  return LEGACY_HUNT_CARD_NAME_KEYS.has(normalizedHuntCardName(name));
}


export async function normalizeHuntCardIcons() {
  if (!game.user?.isGM) {
    throw new Error("La normalisation des icÃ´nes Chasse est rÃ©servÃ©e au MJ.");
  }

  const domain = await ensureHuntDomain();
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  let packChanged = 0;
  let actorChanged = 0;

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (
        doc.type === "domainCard" &&
        normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID &&
        doc.img !== HUNT_DOMAIN_DEFINITION.src
      ) {
        await doc.update({ img: HUNT_DOMAIN_DEFINITION.src });
        packChanged += 1;
      }
    }
  } finally {
    await pack.configure({ locked: true });
  }

  for (const actor of game.actors ?? []) {
    const updates = actor.items
      .filter(
        (item) =>
          item.type === "domainCard" &&
          normalizedChoice(item.system?.domain) === HUNT_DOMAIN_ID &&
          item.img !== HUNT_DOMAIN_DEFINITION.src
      )
      .map((item) => ({
        _id: item.id,
        img: HUNT_DOMAIN_DEFINITION.src,
      }));

    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      actorChanged += updates.length;
    }
  }

  const result = {
    green: true,
    icon: HUNT_DOMAIN_DEFINITION.src,
    domainChanged: domain.changed,
    packChanged,
    actorChanged,
    changed: domain.changed || packChanged > 0 || actorChanged > 0,
  };

  console.log(`${MODULE_ID} | P2.11b.1 Hunt icon normalized`, result);
  ui.notifications.info(
    `Campaign Toolkit : icÃ´ne Chasse synchronisÃ©e (${packChanged} compendium, ${actorChanged} personnage(s)).`
  );
  return result;
}

export async function huntIconStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) return { green: false, reason: "dh-domain-cards absent" };

  const docs = await pack.getDocuments();
  const packCards = docs.filter(
    (doc) =>
      doc.type === "domainCard" &&
      normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
  );

  const actorCards = [];
  for (const actor of game.actors ?? []) {
    for (const item of actor.items ?? []) {
      if (
        item.type === "domainCard" &&
        normalizedChoice(item.system?.domain) === HUNT_DOMAIN_ID
      ) {
        actorCards.push({
          actor: actor.name,
          actorId: actor.id,
          item: item.name,
          itemId: item.id,
          img: item.img,
          green: item.img === HUNT_DOMAIN_DEFINITION.src,
        });
      }
    }
  }

  const allDomains = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const configDomain = allDomains[HUNT_DOMAIN_ID] ?? CONFIG?.DH?.DOMAIN?.domains?.[HUNT_DOMAIN_ID] ?? null;

  const rows = packCards.map((doc) => ({
    scope: "compendium",
    owner: "dh-domain-cards",
    name: doc.name,
    id: doc.id,
    img: doc.img,
    green: doc.img === HUNT_DOMAIN_DEFINITION.src,
  })).concat(actorCards.map((row) => ({
    scope: "actor",
    owner: row.actor,
    name: row.item,
    id: row.itemId,
    img: row.img,
    green: row.green,
  })));

  const result = {
    green:
      configDomain?.src === HUNT_DOMAIN_DEFINITION.src &&
      rows.every((row) => row.green),
    icon: HUNT_DOMAIN_DEFINITION.src,
    domainIcon: configDomain?.src ?? null,
    compendiumCards: packCards.length,
    actorCards: actorCards.length,
    invalid: rows.filter((row) => !row.green),
    rows,
  };

  console.table(rows);
  return result;
}


export async function normalizeHuntCardRoles() {
  if (!game.user?.isGM) {
    throw new Error("La normalisation des rÃ´les Chasse est rÃ©servÃ©e au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  const docs = await pack.getDocuments();
  const changes = [];
  const missing = [];

  await pack.configure({ locked: false });
  try {
    for (const [expectedName, roles] of Object.entries(HUNT_CARD_ROLE_CONTRACT)) {
      const key = normalizedHuntCardName(expectedName);
      const candidates = docs.filter(
        (doc) =>
          normalizedHuntCardName(doc.name) === key &&
          normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
      );

      if (candidates.length !== 1) {
        missing.push({
          name: expectedName,
          found: candidates.length,
        });
        continue;
      }

      const doc = candidates[0];
      const current =
        doc.flags?.[FLAG_SCOPE]?.huntingCardRoles ?? {};

      const next = {
        schemaVersion: HUNT_CARD_ROLE_SCHEMA_VERSION,
        combatRole: roles.combatRole,
        huntRole: roles.huntRole,
      };

      if (
        current.schemaVersion === next.schemaVersion &&
        current.combatRole === next.combatRole &&
        current.huntRole === next.huntRole
      ) {
        continue;
      }

      await doc.update({
        [`flags.${FLAG_SCOPE}.huntingCardRoles`]: next,
      });

      changes.push({
        id: doc.id,
        name: doc.name,
        combatRole: next.combatRole,
        huntRole: next.huntRole,
      });
    }
  } finally {
    await pack.configure({ locked: true });
  }

  const result = {
    green: missing.length === 0,
    expected: Object.keys(HUNT_CARD_ROLE_CONTRACT).length,
    changed: changes.length,
    missing,
    changes,
  };

  console.table(
    Object.entries(HUNT_CARD_ROLE_CONTRACT).map(([name, roles]) => ({
      name,
      combatRole: roles.combatRole,
      huntRole: roles.huntRole,
    }))
  );
  console.log(`${MODULE_ID} | P2.11a.4 Hunt card roles`, result);

  if (result.green) {
    ui.notifications.info(
      `Campaign Toolkit : rÃ´les Chasse normalisÃ©s (${changes.length} modification(s)).`
    );
  } else {
    ui.notifications.warn(
      `Campaign Toolkit : rÃ´les Chasse incomplets (${missing.length} anomalie(s)).`
    );
  }

  return result;
}

export async function huntCardRoleStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    return { green: false, reason: "dh-domain-cards absent" };
  }

  const docs = await pack.getDocuments();
  const rows = Object.entries(HUNT_CARD_ROLE_CONTRACT).map(([expectedName, roles]) => {
    const key = normalizedHuntCardName(expectedName);
    const candidates = docs.filter(
      (doc) =>
        normalizedHuntCardName(doc.name) === key &&
        normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
    );

    const doc = candidates.length === 1 ? candidates[0] : null;
    const stored = doc?.flags?.[FLAG_SCOPE]?.huntingCardRoles ?? null;

    return {
      expectedName,
      found: Boolean(doc),
      id: doc?.id ?? null,
      domain: doc?.system?.domain ?? null,
      combatRole: stored?.combatRole ?? null,
      huntRole: stored?.huntRole ?? null,
      expectedCombatRole: roles.combatRole,
      expectedHuntRole: roles.huntRole,
      schemaVersion: stored?.schemaVersion ?? null,
      green:
        Boolean(doc) &&
        stored?.schemaVersion === HUNT_CARD_ROLE_SCHEMA_VERSION &&
        stored?.combatRole === roles.combatRole &&
        stored?.huntRole === roles.huntRole,
    };
  });

  const result = {
    green: rows.every((row) => row.green),
    expected: rows.length,
    valid: rows.filter((row) => row.green).length,
    combat: {
      opener: rows.filter((row) => row.combatRole === "opener").length,
      finisher: rows.filter((row) => row.combatRole === "finisher").length,
      support: rows.filter((row) => row.combatRole === "support").length,
      none: rows.filter((row) => row.combatRole == null).length,
    },
    hunt: {
      preparation: rows.filter((row) => row.huntRole === "preparation").length,
      extraction: rows.filter((row) => row.huntRole === "extraction").length,
      knowledge: rows.filter((row) => row.huntRole === "knowledge").length,
      logistics: rows.filter((row) => row.huntRole === "logistics").length,
      tracking: rows.filter((row) => row.huntRole === "tracking").length,
      none: rows.filter((row) => row.huntRole == null).length,
    },
    rows,
  };

  console.table(rows);
  return result;
}


export async function migrateLegacyHuntCards() {
  if (!game.user?.isGM) {
    throw new Error("La migration Valor â†’ Chasse est rÃ©servÃ©e au MJ.");
  }

  const domain = await ensureHuntDomain();
  if (!domain.green) {
    throw new Error("Le domaine Chasse nâ€™est pas disponible.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  const docs = await pack.getDocuments();

  const isMonsterHunterLegacyCard = (doc) => {
    if (!isLegacyHuntCardName(doc.name)) return false;

    // Runtime compendium rows produced by the older homebrew rail do not
    // necessarily carry sourcePath/sourceId provenance flags. The historical
    // discriminator we *do* have is the temporary domain assignment itself:
    // Monster Hunter cards lived in Valor. Once migrated, they live in Hunt.
    //
    // This also safely excludes same-name core cards such as Bone/Tacticien.
    const domain = normalizedChoice(doc.system?.domain);
    return domain === "valor" || domain === HUNT_DOMAIN_ID;
  };

  const candidates = docs.filter(isMonsterHunterLegacyCard);

  const byName = new Map(
    candidates.map((doc) => [normalizedHuntCardName(doc.name), doc])
  );

  const missing = LEGACY_HUNT_CARD_NAMES.filter(
    (name) => !byName.has(normalizedHuntCardName(name))
  );

  const wrongDomain = [];
  const alreadyHunt = [];
  const migrated = [];

  await pack.configure({ locked: false });

  try {
    for (const name of LEGACY_HUNT_CARD_NAMES) {
      const doc = byName.get(normalizedHuntCardName(name));
      if (!doc) continue;

      const currentDomain = normalizedChoice(doc.system?.domain);

      if (currentDomain === HUNT_DOMAIN_ID) {
        alreadyHunt.push(doc.name);
        continue;
      }

      if (currentDomain !== "valor") {
        wrongDomain.push({
          name: doc.name,
          domain: doc.system?.domain ?? null,
        });
        continue;
      }

      const update = {
        "system.domain": HUNT_DOMAIN_ID,
      };

      const currentImg = String(doc.img ?? "");
      if (
        !currentImg ||
        /(?:^|\/)domains\/valor\.(?:png|webp|svg)$/i.test(currentImg) ||
        currentImg === "icons/svg/item-bag.svg"
      ) {
        update.img = HUNT_DOMAIN_DEFINITION.src;
      }

      await doc.update(update);

      migrated.push({
        id: doc.id,
        name: doc.name,
        sourceId: doc.flags?.[FLAG_SCOPE]?.sourceId ?? null,
        from: currentDomain,
        to: HUNT_DOMAIN_ID,
      });
    }
  } finally {
    await pack.configure({ locked: true });
  }

  const result = {
    green: missing.length === 0 && wrongDomain.length === 0,
    expected: LEGACY_HUNT_CARD_NAMES.length,
    found: candidates.length,
    migrated: migrated.length,
    alreadyHunt: alreadyHunt.length,
    missing,
    wrongDomain,
    cards: migrated,
  };

  console.table(
    [
      ...migrated.map((card) => ({
        name: card.name,
        status: "migrated",
        from: card.from,
        to: card.to,
        sourceId: card.sourceId,
      })),
      ...alreadyHunt.map((name) => ({
        name,
        status: "already-hunt",
        from: "hunt",
        to: "hunt",
        sourceId:
          byName.get(normalizedHuntCardName(name))?.flags?.[FLAG_SCOPE]?.sourceId ??
          null,
      })),
      ...wrongDomain.map((row) => ({
        name: row.name,
        status: "wrong-domain",
        from: row.domain,
        to: "hunt",
        sourceId:
          byName.get(normalizedHuntCardName(row.name))?.flags?.[FLAG_SCOPE]?.sourceId ??
          null,
      })),
      ...missing.map((name) => ({
        name,
        status: "missing",
        from: null,
        to: "hunt",
        sourceId: null,
      })),
    ]
  );

  console.log(`${MODULE_ID} | P2.11a.2 legacy Hunt migration`, result);

  if (result.green) {
    ui.notifications.info(
      `Campaign Toolkit : ${LEGACY_HUNT_CARD_NAMES.length} cartes Chasse validÃ©es (${migrated.length} migrÃ©es).`
    );
  } else {
    ui.notifications.warn(
      `Campaign Toolkit : migration Chasse incomplÃ¨te â€” ${missing.length} absente(s), ${wrongDomain.length} domaine(s) inattendu(s).`
    );
  }

  return result;
}

export async function huntMigrationStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    return { green: false, reason: "dh-domain-cards absent" };
  }

  const docs = await pack.getDocuments();

  const isMonsterHunterLegacyCard = (doc) => {
    const domain = normalizedChoice(doc.system?.domain);
    return domain === "valor" || domain === HUNT_DOMAIN_ID;
  };

  const rows = LEGACY_HUNT_CARD_NAMES.map((name) => {
    const key = normalizedHuntCardName(name);

    // Prefer the migrated Hunt row if both variants somehow coexist, then
    // fall back to the legacy Valor row.
    const matching = docs.filter(
      (candidate) =>
        isMonsterHunterLegacyCard(candidate) &&
        normalizedHuntCardName(candidate.name) === key
    );

    const doc =
      matching.find(
        (candidate) => normalizedChoice(candidate.system?.domain) === HUNT_DOMAIN_ID
      ) ??
      matching.find(
        (candidate) => normalizedChoice(candidate.system?.domain) === "valor"
      ) ??
      null;

    return {
      expectedName: name,
      found: Boolean(doc),
      id: doc?.id ?? null,
      name: doc?.name ?? null,
      domain: doc?.system?.domain ?? null,
      level: doc?.system?.level ?? null,
      recallCost: doc?.system?.recallCost ?? null,
      cardType: doc?.system?.type ?? null,
      sourceId: doc?.flags?.[FLAG_SCOPE]?.sourceId ?? null,
    };
  });

  const green = rows.every(
    (row) => row.found && normalizedChoice(row.domain) === HUNT_DOMAIN_ID
  );

  console.table(rows);
  return {
    green,
    expected: LEGACY_HUNT_CARD_NAMES.length,
    found: rows.filter((row) => row.found).length,
    hunt: rows.filter(
      (row) => normalizedChoice(row.domain) === HUNT_DOMAIN_ID
    ).length,
    rows,
  };
}


