import { localizeNativeEquipmentEmbedded } from "./equipment-native-fr.mjs";
import { applyContentLocale, getImportLocale } from "./content-locale.mjs";
const MODULE_ID = "daggerheart-campaign-toolkit";
const PILOT_URL = `modules/${MODULE_ID}/data/pilot.json`;
const CLASS_PRESENTATION_URL = `modules/${MODULE_ID}/data/class-presentation.json`;
const FLAG_SCOPE = MODULE_ID;
const PILOT_MAPPING_VERSION = "P2.3.4e-fix2c";
const FALLBACK_CLASS_IMAGE = "icons/svg/mystery-man.svg";

let classPresentationPromise = null;

async function classPresentation() {
  classPresentationPromise ??= fetch(CLASS_PRESENTATION_URL, { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`class-presentation.json introuvable (${response.status})`);
      return response.json();
    })
    .catch(error => {
      console.error(`${MODULE_ID} | unable to load owned class presentation`, error);
      return { entries: {} };
    });
  return classPresentationPromise;
}

async function ownedClassImage(raw) {
  const explicit = raw?.presentation?.img ?? raw?.img;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const sourceId = raw?.id;
  const catalog = await classPresentation();
  const mapped = sourceId ? catalog?.entries?.[sourceId]?.img : null;
  return typeof mapped === "string" && mapped.trim()
    ? mapped.trim()
    : FALLBACK_CLASS_IMAGE;
}

function textValue(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    for (const key of ["rules_text", "description", "text", "summary", "notes"]) {
      if (typeof v[key] === "string") return v[key];
    }
  }
  return "";
}

function nameOf(raw, fallback) {
  return raw?.identity?.name ?? raw?.name ?? raw?.label ?? fallback;
}

function rules(raw) {
  return raw?.rules ?? raw?.mechanics ?? raw?.system ?? {};
}

function provenanceFlags(raw, sourcePath) {
  return {
    [FLAG_SCOPE]: {
      pilot: true,
      sourceId: raw?.id ?? null,
      sourcePath,
      source: raw?.source ?? null,
      mappingVersion: PILOT_MAPPING_VERSION,
    }
  };
}

function setMappingGaps(data, gaps = []) {
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].mappingGaps = [...new Set(gaps.filter(Boolean))];
}

function clearItemLinks(value) {
  // ItemLinkFields serializes as an array in current Foundryborne.
  // Keep this helper defensive so sanitation survives minor schema changes.
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return [];
  return [];
}

function sanitizeEmbeddedActorData(data) {
  // Native SRD Actor templates carry their own feature Items/effects. They are
  // never valid defaults for another imported Actor.
  data.items = [];
  // Remove cloned-document effects entirely. Foundry will restore only the
  // neutral schema default, never the source template semantics.
  data.effects = [];
}

function baseDescription(raw) {
  const content = raw?.content ?? {};
  const desc =
    textValue(content.rules_text) ||
    textValue(content) ||
    textValue(raw?.rules_text) ||
    textValue(raw?.description);
  if (!desc) return "";
  // Canonical DH-DATA may deliberately carry sanitized rich text (notably
  // class/class-feature prose bootstrapped from the SRD Foundry source).
  // Preserve that markup; plain-text sources are escaped as before.
  if (/<\/?[a-z][\s\S]*>/i.test(desc)) return desc;
  return `<p>${foundry.utils.escapeHTML(desc)}</p>`;
}

function normalizedChoice(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

const DOMAIN_ICON_KEYS = new Set([
  "arcana",
  "blade",
  "bone",
  "codex",
  "dread",
  "grace",
  "midnight",
  "sage",
  "splendor",
  "valor",
  "hunt",
  "artillery",
  "blood",
]);

const TOOLKIT_DOMAIN_ICONS = Object.freeze({
  artillery:
    "modules/daggerheart-campaign-toolkit/assets/icons/artillery.svg",
  hunt:
    "modules/daggerheart-campaign-toolkit/assets/icons/hunt.svg",
  blood:
    "modules/daggerheart-campaign-toolkit/assets/icons/blood.svg",
});

function domainIcon(domain) {
  const key = normalizedChoice(domain);
  if (!key || !DOMAIN_ICON_KEYS.has(key)) return null;

  return (
    TOOLKIT_DOMAIN_ICONS[key] ??
    `systems/daggerheart/assets/icons/domains/${key}.svg`
  );
}


import { HUNT_DOMAIN_ID, HUNT_DOMAIN_DEFINITION, ensureHuntDomain } from "./hunt-domain.mjs";
export { HUNT_DOMAIN_ID, HUNT_DOMAIN_DEFINITION, ensureHuntDomain };
import {
  configureHuntCardMaintenance,
  normalizeHuntCardIcons,
  huntIconStatus,
  normalizeHuntCardRoles,
  huntCardRoleStatus,
  migrateLegacyHuntCards,
  huntMigrationStatus,
} from "./hunt-card-maintenance.mjs";
import { configureHuntImport, importHuntPilot } from "./hunt-import.mjs";
export { importHuntPilot };
import {
  configureAdversaryImport,
  importCanonicalAdversary,
  importTetsucabra,
  tetsucabraStatus,
} from "./adversary-import.mjs";
export { importCanonicalAdversary, importTetsucabra, tetsucabraStatus };
import {
  configureNativeMapping,
} from "./native-mapping.mjs";
import { artilleryAutomationStatus } from "./artillery-automation.mjs";
export { artilleryAutomationStatus };
import { syncOwnedArtilleryCards } from "./artillery-owned-sync.mjs";
export { syncOwnedArtilleryCards };
import {
  configureArtificerArtilleryImport,
  artificerArtilleryStatus,
  importArtificerArtillery,
} from "./artificer-artillery-import.mjs";
export { artificerArtilleryStatus, importArtificerArtillery };

import {
  configureItemBuilder,
  configureItemBuilderConstants,
  buildItem,
  buildLinkedSourceFeature,
  ensureSourceEquipmentFeatureCatalog,
} from "./item-builder.mjs";

export {
  buildItem,
  buildLinkedSourceFeature,
  ensureSourceEquipmentFeatureCatalog,
};
import { configureActorBuilder, buildActor } from "./actor-builder.mjs";
export { buildActor };
export {
  normalizeHuntCardIcons,
  huntIconStatus,
  normalizeHuntCardRoles,
  huntCardRoleStatus,
  migrateLegacyHuntCards,
  huntMigrationStatus,
};
const ARTILLERY_DOMAIN_ID = "artillery";

const ARTILLERY_DOMAIN_DEFINITION = Object.freeze({
  id: ARTILLERY_DOMAIN_ID,
  label: "Artillery",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png",
  description:
    "Artillery est le domaine de la puissance de feu, du contrÃƒÆ’Ã‚Â´le de zone et des attaques ÃƒÆ’Ã‚Â  fort impact.",
  color: "#8a5a24",
});

export async function ensureArtilleryDomain() {
  if (!game.user?.isGM) {
    throw new Error("LÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢enregistrement du domaine Artillery est rÃƒÆ’Ã‚Â©servÃƒÆ’Ã‚Â© au MJ.");
  }

  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) {
    throw new Error("Foundryborne Homebrew setting key introuvable.");
  }

  const current = foundry.utils.deepClone(
    game.settings.get(CONFIG.DH.id, settingKey) ?? {}
  );

  current.domains ??= {};
  const previous = current.domains[ARTILLERY_DOMAIN_ID] ?? null;
  const changed =
    !previous ||
    previous.id !== ARTILLERY_DOMAIN_DEFINITION.id ||
    previous.label !== ARTILLERY_DOMAIN_DEFINITION.label ||
    previous.src !== ARTILLERY_DOMAIN_DEFINITION.src ||
    previous.description !== ARTILLERY_DOMAIN_DEFINITION.description ||
    previous.color !== ARTILLERY_DOMAIN_DEFINITION.color;

  if (changed) {
    current.domains[ARTILLERY_DOMAIN_ID] = {
      ...ARTILLERY_DOMAIN_DEFINITION,
    };
    await game.settings.set(CONFIG.DH.id, settingKey, current);
  }

  const allAfter = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const registered =
    allAfter[ARTILLERY_DOMAIN_ID] ??
    current.domains[ARTILLERY_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[ARTILLERY_DOMAIN_ID] ??
    null;

  return {
    green: Boolean(registered),
    changed,
    reloadRecommended: changed && !allAfter[ARTILLERY_DOMAIN_ID],
    domain: registered,
  };
}

function normalizedToken(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
    : "";
}


function mapTrait(value) {
  const token = normalizedToken(value);
  const aliases = {
    agility: "agility",
    strength: "strength",
    finesse: "finesse",
    instinct: "instinct",
    presence: "presence",
    knowledge: "knowledge",
  };
  return aliases[token] ?? null;
}

function mapRange(value) {
  const token = normalizedToken(value);
  const aliases = {
    melee: "melee",
    veryclose: "veryClose",
    close: "close",
    far: "far",
    veryfar: "veryFar",
  };
  return aliases[token] ?? null;
}

function mapDamageTypes(value) {
  const token = String(value ?? "").trim().toLowerCase();
  if (token === "phy") return ["physical"];
  if (token === "mag") return ["magical"];
  if (token === "phy/mag" || token === "mag/phy") return ["physical", "magical"];
  return [];
}

function parseWeaponDamage(value) {
  const text = String(value ?? "").replace(/\s+/g, "");
  const match = /^d(4|6|8|10|12|20)([+-]\d+)?$/i.exec(text);
  if (!match) return null;
  return { dice: `d${match[1]}`, bonus: Number(match[2] ?? 0) };
}

function appendFeatureDescription(existing, feature, label = "Feature") {
  if (!feature || typeof feature !== "object") return existing ?? "";
  const name = typeof feature.name === "string" ? feature.name.trim() : "";
  const text = typeof feature.text === "string" ? feature.text.trim() : "";
  if (!name && !text) return existing ?? "";
  const safeName = foundry.utils.escapeHTML(name || label);
  const safeText = foundry.utils.escapeHTML(text);
  return `${existing ?? ""}<p><strong>${safeName}.</strong>${safeText ? ` ${safeText}` : ""}</p>`;
}

async function loadPilot() {
  const response = await fetch(PILOT_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`pilot.json introuvable (${response.status}). Lance d'abord export_foundry_pilot.py.`);
  }
  const payload = await response.json();
  if (payload?.phase !== "P2.3.1") throw new Error("pilot.json n'est pas un payload P2.3.1");
  return payload;
}

export async function seedPack(packId, docs, documentClass) {
  const pack = game.packs.get(`${MODULE_ID}.${packId}`);
  if (!pack) throw new Error(`Compendium absent: ${packId}`);

  await pack.configure({ locked: false });
  try {
    const index = await pack.getIndex({ fields: [`flags.${FLAG_SCOPE}.pilot`] });
    const pilotIds = index
      .filter((e) => foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true)
      .map((e) => e._id);

    for (const id of pilotIds) {
      const doc = await pack.getDocument(id);
      if (doc) await doc.delete();
    }

    for (const data of docs) {
      await documentClass.create(data, { pack: pack.collection });
    }
  } finally {
    await pack.configure({ locked: true });
  }
}

export async function importPilot() {
  if (!game.user?.isGM) throw new Error("P2.3.1 pilot import is GM-only.");

  const payload = await loadPilot();
  const itemEntries = payload.entries.filter((e) =>
    ["class", "subclass", "domain_card", "weapon", "armor"].includes(e.kind)
  );
  const actorEntries = payload.entries.filter((e) =>
    ["adversary", "environment"].includes(e.kind)
  );

  const itemDocs = [];
  for (const entry of itemEntries) itemDocs.push(await buildItem(entry));

  const actorDocs = [];
  for (const entry of actorEntries) actorDocs.push(await buildActor(entry));

  await seedPack("pilot-items", itemDocs, Item);
  await seedPack("pilot-actors", actorDocs, Actor);

  const result = await pilotStatus();
  console.log(`${MODULE_ID} | P2.3.2 mapped pilot imported`, result);
  ui.notifications.info("Campaign Toolkit : P2.3.2 mapping importÃƒÆ’Ã‚Â©");
  return result;
}

export async function clearPilot() {
  if (!game.user?.isGM) throw new Error("P2.3.1 pilot clear is GM-only.");
  await seedPack("pilot-items", [], Item);
  await seedPack("pilot-actors", [], Actor);
  return pilotStatus();
}

export async function pilotStatus() {
  const result = {};
  for (const [key, packId] of [["items", "pilot-items"], ["actors", "pilot-actors"]]) {
    const pack = game.packs.get(`${MODULE_ID}.${packId}`);
    if (!pack) {
      result[key] = { available: false, count: 0 };
      continue;
    }
    const index = await pack.getIndex({
      fields: [`flags.${FLAG_SCOPE}.pilot`, "type", "name"]
    });
    const pilot = index.filter((e) =>
      foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true
    );
    result[key] = {
      available: true,
      count: pilot.length,
      documents: pilot.map((e) => ({ name: e.name, type: e.type })),
    };
  }

  console.table({
    pilotItems: result.items.count,
    pilotActors: result.actors.count,
  });
  return result;
}


export async function mappingAudit() {
  const rows = [];
  for (const packId of ["pilot-items", "pilot-actors"]) {
    const pack = game.packs.get(`${MODULE_ID}.${packId}`);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: [`flags.${FLAG_SCOPE}.pilot`] });
    for (const entry of index.filter((e) => foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true)) {
      const doc = await pack.getDocument(entry._id);
      const source = doc?.toObject();
      if (!source) continue;
      rows.push({
        pack: packId,
        name: source.name,
        type: source.type,
        sourceId: foundry.utils.getProperty(source, `flags.${FLAG_SCOPE}.sourceId`) ?? null,
        mappingVersion: foundry.utils.getProperty(source, `flags.${FLAG_SCOPE}.mappingVersion`) ?? null,
        tier: source.system?.tier ?? null,
        domain: source.system?.domain ?? null,
        level: source.system?.level ?? null,
        evasion: source.system?.evasion ?? null,
        difficulty: source.system?.difficulty ?? null,
      });
    }
  }
  console.table(rows);
  return rows;
}


export async function importCanonicalDomainCard(sourcePath) {
  if (!game.user?.isGM) {
    throw new Error("LÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢import dÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢une carte de domaine Toolkit est rÃƒÆ’Ã‚Â©servÃƒÆ’Ã‚Â© au MJ.");
  }

  const cleanPath = String(sourcePath ?? "").replace(/^\/+/, "");
  if (!cleanPath.startsWith("data/homebrew/") || !cleanPath.endsWith(".json")) {
    throw new Error(`Chemin de carte de domaine non autorisÃƒÆ’Ã‚Â©: ${cleanPath}`);
  }

  const response = await fetch(`modules/${MODULE_ID}/${cleanPath}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${cleanPath} introuvable (${response.status}).`);
  }

  const raw = await response.json();
  if (raw?.kind !== "domain_card" || !raw?.id) {
    throw new Error(`${cleanPath} nÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢est pas une carte de domaine canonique valide.`);
  }

  if (normalizedChoice(raw?.domain) === HUNT_DOMAIN_ID) {
    const registration = await ensureHuntDomain();
    if (!registration.green) {
      throw new Error("Le domaine Chasse nÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢a pas pu ÃƒÆ’Ã‚Âªtre enregistrÃƒÆ’Ã‚Â© dans Foundryborne.");
    }
  }
  if (normalizedChoice(raw?.domain) === ARTILLERY_DOMAIN_ID) {
    const registration = await ensureArtilleryDomain();
    if (!registration.green) {
      throw new Error("Le domaine Artillery nÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢a pas pu ÃƒÆ’Ã‚Âªtre enregistrÃƒÆ’Ã‚Â© dans Foundryborne.");
    }
  }

  const entry = {
    kind: "domain_card",
    key: raw.id,
    corpus: raw?.source?.corpus ?? "homebrew",
    source_path: cleanPath,
    data: raw,
  };

  const data = await buildItem(entry);
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].managed = true;
  data.flags[FLAG_SCOPE].kind = "domain_card";
  data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
  data.flags[FLAG_SCOPE].contentOrigin = "homebrew";

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    const previous = docs.filter(
      (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === raw.id
    );

    for (const doc of previous) {
      await doc.delete();
    }

    const created = await Item.create(data, {
      pack: pack.collection,
    });

    ui.notifications.info(
      `Campaign Toolkit : ${created.name} importÃƒÆ’Ã‚Â©e dans dh-domain-cards.`
    );

    return created;
  } finally {
    await pack.configure({ locked: true });
  }
}




configureItemBuilder({
  ownedClassImage,
  nameOf,
  rules,
  provenanceFlags,
  setMappingGaps,
  clearItemLinks,
  baseDescription,
  normalizedChoice,
  domainIcon,
  normalizedToken,
  mapTrait,
  mapRange,
  mapDamageTypes,
  parseWeaponDamage,
  appendFeatureDescription,
});

configureItemBuilderConstants({
  MODULE_ID,
  FLAG_SCOPE,
  PILOT_MAPPING_VERSION,
  ARTILLERY_DOMAIN_ID,
});

configureNativeMapping({
  rules,
  normalizedToken,
  mapRange,
  mapDamageTypes,
});

configureActorBuilder({
  nameOf,
  rules,
  provenanceFlags,
  setMappingGaps,
  sanitizeEmbeddedActorData,
  baseDescription,
  normalizedChoice,
  normalizedToken,
});

configureAdversaryImport({
  buildActor,
});

configureHuntImport({
  importCanonicalDomainCard,
});

configureHuntCardMaintenance({
  normalizedChoice,
  domainIcon,
});

function domainFolderLabel(domain) {
  const key = normalizedChoice(domain);
  const configured =
    CONFIG?.DH?.DOMAIN?.allDomains?.()?.[key] ??
    CONFIG?.DH?.DOMAIN?.domains?.[key] ??
    null;

  if (configured?.label) {
    const localized = game.i18n?.localize?.(configured.label);
    if (localized && localized !== configured.label) return localized;
    return configured.label;
  }

  const labels = {
    artillery: "Artillery",
    hunt: "Chasse",
    hunting: "Hunting",
    blood: "Blood",
  };
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

async function compendiumFolders(pack) {
  if (pack?.folders?.contents) return [...pack.folders.contents];
  if (Array.isArray(pack?.folders)) return [...pack.folders];

  // Fallback for Foundry versions where the pack does not expose a direct
  // collection but Folder documents can still be queried by compendium.
  return game.folders?.filter?.(
    (folder) => folder.pack === pack.collection
  ) ?? [];
}

async function ensureDomainCardFolder(pack, domain) {
  const key = normalizedChoice(domain);
  if (!key) return null;

  const existing = (await compendiumFolders(pack)).find(
    (folder) =>
      folder.type === "Item" &&
      folder.flags?.[FLAG_SCOPE]?.domainCardFolder === key
  );
  if (existing) return existing;

  // Also adopt an existing same-name Item folder instead of duplicating it.
  const label = domainFolderLabel(key);
  const sameName = (await compendiumFolders(pack)).find(
    (folder) => folder.type === "Item" && folder.name === label
  );
  if (sameName) {
    await sameName.update({
      [`flags.${FLAG_SCOPE}.domainCardFolder`]: key,
    });
    return sameName;
  }

  return Folder.create(
    {
      name: label,
      type: "Item",
      sorting: "a",
      flags: {
        [FLAG_SCOPE]: {
          domainCardFolder: key,
          managed: true,
        },
      },
    },
    { pack: pack.collection }
  );
}


export async function organizeDomainCardsByDomain() {
  if (!game.user?.isGM) {
    throw new Error("Le classement des cartes de Domaine est rÃƒÆ’Ã‚Â©servÃƒÆ’Ã‚Â© au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    const domains = [
      ...new Set(
        docs
          .map((doc) => normalizedChoice(doc.system?.domain))
          .filter(Boolean)
      ),
    ].sort();

    const folders = new Map();
    for (const domain of domains) {
      folders.set(domain, await ensureDomainCardFolder(pack, domain));
    }

    let changed = 0;
    const rows = [];
    for (const doc of docs) {
      const domain = normalizedChoice(doc.system?.domain);
      if (!domain) {
        rows.push({
          name: doc.name,
          domain: null,
          folder: null,
          changed: false,
        });
        continue;
      }

      const folder = folders.get(domain);
      const currentFolderId =
        typeof doc.folder === "string"
          ? doc.folder
          : doc.folder?.id ?? doc.folder?._id ?? null;
      const targetFolderId = folder?.id ?? folder?._id ?? null;
      const needsUpdate = Boolean(targetFolderId) && currentFolderId !== targetFolderId;

      if (needsUpdate) {
        await doc.update({ folder: targetFolderId });
        changed += 1;
      }

      rows.push({
        name: doc.name,
        domain,
        folder: folder?.name ?? null,
        changed: needsUpdate,
      });
    }

    console.table(
      domains.map((domain) => ({
        domain,
        folder: folders.get(domain)?.name ?? null,
        cards: rows.filter((row) => row.domain === domain).length,
      }))
    );

    const result = {
      green:
        rows
          .filter((row) => row.domain)
          .every((row) => Boolean(row.folder)),
      domains: domains.length,
      cards: docs.length,
      changed,
      folders: domains.map((domain) => ({
        domain,
        name: folders.get(domain)?.name ?? null,
        id: folders.get(domain)?.id ?? null,
      })),
      unclassified: rows.filter((row) => !row.domain).map((row) => row.name),
    };

    console.log(`${MODULE_ID} | domain-card folders`, result);
    return result;
  } finally {
    await pack.configure({ locked: true });
  }
}

export async function domainCardFolderStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) return { green: false, reason: "dh-domain-cards absent" };

  const docs = await pack.getDocuments();
  const folders = await compendiumFolders(pack);
  const managedFolders = folders.filter(
    (folder) => folder.flags?.[FLAG_SCOPE]?.domainCardFolder
  );

  const rows = docs.map((doc) => {
    const domain = normalizedChoice(doc.system?.domain);
    const folderId =
      typeof doc.folder === "string"
        ? doc.folder
        : doc.folder?.id ?? doc.folder?._id ?? null;
    const folder = folders.find((candidate) => candidate.id === folderId) ?? null;
    return {
      name: doc.name,
      domain,
      folder: folder?.name ?? null,
      folderDomain: folder?.flags?.[FLAG_SCOPE]?.domainCardFolder ?? null,
      ok:
        !domain ||
        folder?.flags?.[FLAG_SCOPE]?.domainCardFolder === domain,
    };
  });

  const result = {
    green: rows.every((row) => row.ok),
    cards: rows.length,
    domains: [...new Set(rows.map((row) => row.domain).filter(Boolean))].length,
    folders: managedFolders.length,
    invalid: rows.filter((row) => !row.ok),
    unclassified: rows.filter((row) => !row.domain).map((row) => row.name),
  };

  if (result.invalid.length) console.table(result.invalid);
  console.log(`${MODULE_ID} | domain-card folder status`, result);
  return result;
}

configureArtificerArtilleryImport({
  ensureArtilleryDomain,
  normalizedChoice,
  organizeDomainCardsByDomain,
});

/**
 * Import one canonical homebrew adversary without rebuilding any owned Item pack.
 * This deliberately keeps the Actor legacy/native-template route isolated from
 * syncAutonomousSources(): Foundry is the session runtime, while DH-DATA remains
 * the canonical source.
 */
