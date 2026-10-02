import { MODULE_ID, FLAG_SCOPE } from "./import-constants.mjs";
const PILOT_URL = `modules/${MODULE_ID}/data/pilot.json`;
import { localizeNativeEquipmentEmbedded } from "./equipment-native-fr.mjs";
import { applyContentLocale, getImportLocale } from "./content-locale.mjs";
import {
  ownedClassImage,
  nameOf,
  rules,
  provenanceFlags,
  setMappingGaps,
  clearItemLinks,
  sanitizeEmbeddedActorData,
  baseDescription,
  normalizedToken,
  mapTrait,
  mapRange,
  mapDamageTypes,
  parseWeaponDamage,
  appendFeatureDescription,
} from "./import-primitives.mjs";


import { HUNT_DOMAIN_ID, HUNT_DOMAIN_DEFINITION, ensureHuntDomain } from "./hunt-domain.mjs";
import {
  ARTILLERY_DOMAIN_ID,
  ensureArtilleryDomain,
} from "./artillery-domain.mjs";
export { ensureArtilleryDomain } from "./artillery-domain.mjs";
export { HUNT_DOMAIN_ID, HUNT_DOMAIN_DEFINITION, ensureHuntDomain };
import {
  normalizeHuntCardIcons,
  huntIconStatus,
  normalizeHuntCardRoles,
  huntCardRoleStatus,
  migrateLegacyHuntCards,
  huntMigrationStatus,
} from "./hunt-card-maintenance.mjs";
import { importHuntPilot } from "./hunt-import.mjs";
export { importHuntPilot };
import {
  importCanonicalAdversary,
  importTetsucabra,
  tetsucabraStatus,
} from "./adversary-import.mjs";
export { importCanonicalAdversary, importTetsucabra, tetsucabraStatus };
import { artilleryAutomationStatus } from "./artillery-automation.mjs";
export { artilleryAutomationStatus };
import { syncOwnedArtilleryCards } from "./artillery-owned-sync.mjs";
export { syncOwnedArtilleryCards };
import {
  artificerArtilleryStatus,
  importArtificerArtillery,
} from "./artificer-artillery-import.mjs";
export { artificerArtilleryStatus, importArtificerArtillery };

import {
  importCanonicalDomainCard,
  organizeDomainCardsByDomain,
  domainCardFolderStatus,
} from "./domain-card-import.mjs";
export {
  importCanonicalDomainCard,
  organizeDomainCardsByDomain,
  domainCardFolderStatus,
};

import {
  buildItem,
  buildLinkedSourceFeature,
  ensureSourceEquipmentFeatureCatalog,
} from "./item-builder.mjs";

export {
  buildItem,
  buildLinkedSourceFeature,
  ensureSourceEquipmentFeatureCatalog,
};
import { buildActor } from "./actor-builder.mjs";
export { buildActor };
export {
  normalizeHuntCardIcons,
  huntIconStatus,
  normalizeHuntCardRoles,
  huntCardRoleStatus,
  migrateLegacyHuntCards,
  huntMigrationStatus,
};
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
  ui.notifications.info("Campaign Toolkit : P2.3.2 mapping importé");
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
