let dependencies = null;

export function configureDomainCardImport(value) {
  dependencies = value;
}

function domainDependencies() {
  if (!dependencies) {
    throw new Error("Domain Card import dependencies are not configured.");
  }

  return dependencies;
}

const buildItem = (...args) => domainDependencies().buildItem(...args);
const normalizedChoice = (...args) => domainDependencies().normalizedChoice(...args);
const domainIcon = (...args) => domainDependencies().domainIcon(...args);
const ensureArtilleryDomain = (...args) => domainDependencies().ensureArtilleryDomain(...args);
const ensureHuntDomain = (...args) => domainDependencies().ensureHuntDomain(...args);

let MODULE_ID = null;
let FLAG_SCOPE = null;
let PILOT_MAPPING_VERSION = null;
let ARTILLERY_DOMAIN_ID = null;
let HUNT_DOMAIN_ID = null;

export function configureDomainCardConstants(value) {
  MODULE_ID = value.MODULE_ID;
  FLAG_SCOPE = value.FLAG_SCOPE;
  PILOT_MAPPING_VERSION = value.PILOT_MAPPING_VERSION;
  ARTILLERY_DOMAIN_ID = value.ARTILLERY_DOMAIN_ID;
  HUNT_DOMAIN_ID = value.HUNT_DOMAIN_ID;
}

export async function importCanonicalDomainCard(sourcePath) {
  if (!game.user?.isGM) {
    throw new Error("LÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢import dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢une carte de domaine Toolkit est rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©servÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© au MJ.");
  }

  const cleanPath = String(sourcePath ?? "").replace(/^\/+/, "");
  if (!cleanPath.startsWith("data/homebrew/") || !cleanPath.endsWith(".json")) {
    throw new Error(`Chemin de carte de domaine non autorisÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©: ${cleanPath}`);
  }

  const response = await fetch(`modules/${MODULE_ID}/${cleanPath}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${cleanPath} introuvable (${response.status}).`);
  }

  const raw = await response.json();
  if (raw?.kind !== "domain_card" || !raw?.id) {
    throw new Error(`${cleanPath} nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢est pas une carte de domaine canonique valide.`);
  }

  if (normalizedChoice(raw?.domain) === HUNT_DOMAIN_ID) {
    const registration = await ensureHuntDomain();
    if (!registration.green) {
      throw new Error("Le domaine Chasse nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢a pas pu ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªtre enregistrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© dans Foundryborne.");
    }
  }
  if (normalizedChoice(raw?.domain) === ARTILLERY_DOMAIN_ID) {
    const registration = await ensureArtilleryDomain();
    if (!registration.green) {
      throw new Error("Le domaine Artillery nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢a pas pu ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªtre enregistrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© dans Foundryborne.");
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
      `Campaign Toolkit : ${created.name} importÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e dans dh-domain-cards.`
    );

    return created;
  } finally {
    await pack.configure({ locked: true });
  }
}

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
    throw new Error("Le classement des cartes de Domaine est rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©servÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© au MJ.");
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

