const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = MODULE_ID;

export const MH_ADVERSARY_TEMPLATE_VERSION = 1;

function huntingOf(doc) {
  return doc?.flags?.[FLAG_SCOPE]?.hunting ?? doc?.hunting ?? null;
}

function sourceIdOf(doc) {
  return doc?.flags?.[FLAG_SCOPE]?.sourceId ?? doc?.id ?? null;
}

function expectedParts(hunting) {
  const rows = hunting?.colossus?.parts;
  return Array.isArray(rows) ? rows : [];
}

/**
 * P2.9c.3 — Reusable Monster Hunter adversary template.
 *
 * This deliberately describes content, not combat automation. A MH adversary
 * is a normal Daggerheart adversary with Hunting metadata, optional Colossus
 * parts and loot links. Monster Parts and Hunting Effects remain separate
 * primitives and the GM owns fracture timing/adjudication.
 */
export function monsterHunterAdversaryDefinition(document) {
  const hunting = huntingOf(document);
  if (!hunting) return null;
  return {
    templateVersion: MH_ADVERSARY_TEMPLATE_VERSION,
    sourceId: sourceIdOf(document),
    name: document?.name ?? null,
    tier: document?.system?.tier ?? document?.tier ?? null,
    role: document?.system?.type ?? document?.role ?? null,
    tags: Array.isArray(hunting.tags) ? [...hunting.tags] : [],
    loot: Array.isArray(hunting.loot) ? foundry.utils.deepClone(hunting.loot) : [],
    parts: expectedParts(hunting).map(row => ({
      partId: row.id ?? null,
      name: row.name ?? null,
      sourceId: row.sourceId ?? null,
      fractureThreshold: Number.isFinite(Number(row.fractureThreshold)) ? Number(row.fractureThreshold) : null,
      brokenEffectId: row.brokenEffectId ?? null,
      lootSourceIds: Array.isArray(row.lootSourceIds) ? [...row.lootSourceIds] : [],
    })),
  };
}

export function validateMonsterHunterAdversary(document) {
  const definition = monsterHunterAdversaryDefinition(document);
  if (!definition) return { green: false, errors: ["missing-hunting-extension"], definition: null };
  const errors = [];
  if (!definition.sourceId) errors.push("missing-source-id");
  if (!definition.name) errors.push("missing-name");
  if (!(Number(definition.tier) > 0)) errors.push("invalid-tier");
  if (!definition.role) errors.push("missing-role");
  if (!definition.tags.length) errors.push("missing-hunting-tags");

  const seen = new Set();
  for (const part of definition.parts) {
    if (!part.partId) errors.push("part-missing-id");
    if (!part.sourceId) errors.push(`part-missing-source:${part.partId ?? "?"}`);
    if (!(part.fractureThreshold > 0)) errors.push(`part-invalid-ft:${part.partId ?? "?"}`);
    if (!part.brokenEffectId) errors.push(`part-missing-effect:${part.partId ?? "?"}`);
    if (part.partId && seen.has(part.partId)) errors.push(`duplicate-part-id:${part.partId}`);
    if (part.partId) seen.add(part.partId);
  }
  return { green: errors.length === 0, errors, definition };
}

async function resolveActor(actorOrUuid) {
  if (actorOrUuid instanceof Actor) return actorOrUuid;
  if (actorOrUuid?.actor instanceof Actor) return actorOrUuid.actor;
  if (typeof actorOrUuid === "string") {
    const doc = await foundry.utils.fromUuid(actorOrUuid);
    if (doc instanceof Actor) return doc;
    if (doc?.actor instanceof Actor) return doc.actor;
  }
  throw new Error("Adversaire Monster Hunter introuvable.");
}

export function createMonsterHunterAdversaryApi({ monsterPartsApi, importCanonicalAdversary }) {
  return Object.freeze({
    version: MH_ADVERSARY_TEMPLATE_VERSION,
    definition: monsterHunterAdversaryDefinition,
    validate: validateMonsterHunterAdversary,

    async import({ principalPath, partPaths = [] } = {}) {
      if (!principalPath) throw new Error("principalPath est requis.");
      const principal = await importCanonicalAdversary(principalPath);
      const parts = [];
      for (const path of partPaths) parts.push(await importCanonicalAdversary(path));
      return { principal, parts };
    },

    async status(actorOrUuid) {
      const actor = await resolveActor(actorOrUuid);
      const base = validateMonsterHunterAdversary(actor);
      if (!base.green) return { actor: actor.uuid, ...base };

      const pack = game.packs.get(`${MODULE_ID}.dh-adversaries`);
      if (!pack) return { green: false, actor: actor.uuid, errors: ["dh-adversaries-absent"], definition: base.definition };
      const docs = await pack.getDocuments();
      const partRows = [];
      const errors = [];

      for (const expected of base.definition.parts) {
        const part = docs.find(doc => sourceIdOf(doc) === expected.sourceId) ?? null;
        if (!part) {
          errors.push(`missing-part:${expected.sourceId}`);
          partRows.push({ ...expected, green: false, uuid: null, errors: ["missing-part"] });
          continue;
        }
        const check = monsterPartsApi.validate(part);
        const linkErrors = [...check.errors];
        if (check.part?.parentSourceId !== base.definition.sourceId) linkErrors.push("wrong-parent-source-id");
        if (check.part?.partId !== expected.partId) linkErrors.push("part-id-mismatch");
        if (check.part?.fractureThreshold !== expected.fractureThreshold) linkErrors.push("fracture-threshold-mismatch");
        if (check.part?.effectId !== expected.brokenEffectId) linkErrors.push("broken-effect-mismatch");
        if (linkErrors.length) errors.push(...linkErrors.map(e => `${expected.partId}:${e}`));
        partRows.push({ ...expected, green: linkErrors.length === 0, uuid: part.uuid, errors: linkErrors });
      }

      const result = {
        green: errors.length === 0,
        actor: actor.uuid,
        templateVersion: MH_ADVERSARY_TEMPLATE_VERSION,
        sourceId: base.definition.sourceId,
        name: base.definition.name,
        tags: base.definition.tags,
        lootLinks: base.definition.loot.length,
        parts: partRows,
        errors,
        automation: false,
      };
      console.table(partRows);
      console.log(`${MODULE_ID} | Monster Hunter adversary template status`, result);
      return result;
    },
  });
}
