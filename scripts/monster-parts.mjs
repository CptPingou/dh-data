const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = MODULE_ID;

/**
 * P2.9c.2 — Generic Monster Parts contract.
 *
 * Colossus remains responsible for multipart presentation/state and the GM
 * decides when a part is Broken. This layer only describes and validates the
 * semantic link: part -> fracture threshold -> visible effect -> consequence
 * -> optional loot references.
 */
export const MONSTER_PART_SCHEMA_VERSION = 1;

function huntingOf(document) {
  return document?.flags?.[FLAG_SCOPE]?.hunting ?? document?.hunting ?? null;
}

export function monsterPartDefinition(document) {
  const hunting = huntingOf(document);
  if (!hunting || hunting.colossusPart !== true) return null;

  const brokenEffect = hunting.brokenEffect ?? {};
  return {
    sourceId: document?.flags?.[FLAG_SCOPE]?.sourceId ?? document?.id ?? null,
    name: document?.name ?? null,
    partId: hunting.partId ?? null,
    parentSourceId: hunting.parentSourceId ?? null,
    fractureThreshold: Number.isFinite(Number(hunting.fractureThreshold))
      ? Number(hunting.fractureThreshold)
      : null,
    effectId: brokenEffect.id ?? null,
    effectName: brokenEffect.name ?? null,
    consequence: brokenEffect.rule ?? null,
    application: brokenEffect.application ?? "manual-on-principal",
    lootRefs: Array.isArray(hunting.lootRefs) ? [...hunting.lootRefs] : [],
  };
}

export function validateMonsterPart(document, { effectCatalog = null } = {}) {
  const part = monsterPartDefinition(document);
  if (!part) return { green: false, errors: ["not-a-monster-part"], part: null };

  const errors = [];
  if (!part.partId) errors.push("missing-part-id");
  if (!part.parentSourceId) errors.push("missing-parent-source-id");
  if (!(part.fractureThreshold > 0)) errors.push("invalid-fracture-threshold");
  if (!part.effectId) errors.push("missing-broken-effect-id");
  if (!part.consequence) errors.push("missing-broken-consequence");
  if (part.application !== "manual-on-principal") errors.push("unsupported-application");
  if (effectCatalog && part.effectId && !effectCatalog[part.effectId]) errors.push("unknown-broken-effect");

  return { green: errors.length === 0, errors, part };
}

async function resolveActor(actorOrUuid) {
  if (actorOrUuid instanceof Actor) return actorOrUuid;
  if (actorOrUuid?.actor instanceof Actor) return actorOrUuid.actor;
  if (typeof actorOrUuid === "string") {
    const doc = await foundry.utils.fromUuid(actorOrUuid);
    if (doc instanceof Actor) return doc;
    if (doc?.actor instanceof Actor) return doc.actor;
  }
  throw new Error("Actor de partie introuvable.");
}

export async function monsterPartsStatus(actorOrUuid = null, { effectCatalog = null } = {}) {
  if (!actorOrUuid) {
    return {
      green: true,
      schemaVersion: MONSTER_PART_SCHEMA_VERSION,
      contract: ["partId", "parentSourceId", "fractureThreshold", "brokenEffect", "lootRefs"],
      automation: false,
    };
  }

  const actor = await resolveActor(actorOrUuid);
  const result = validateMonsterPart(actor, { effectCatalog });
  const output = { actor: actor.uuid, ...result };
  console.log(`${MODULE_ID} | Monster Part status`, output);
  return output;
}

export function createMonsterPartsApi(huntingEffectsApi) {
  return Object.freeze({
    schemaVersion: MONSTER_PART_SCHEMA_VERSION,
    definition: monsterPartDefinition,
    validate(document) {
      return validateMonsterPart(document, { effectCatalog: huntingEffectsApi?.catalog ?? null });
    },
    status(actorOrUuid = null) {
      return monsterPartsStatus(actorOrUuid, { effectCatalog: huntingEffectsApi?.catalog ?? null });
    },
    async applyBrokenEffect(partActorOrUuid, principalActorOrUuid) {
      const partActor = await resolveActor(partActorOrUuid);
      const validation = validateMonsterPart(partActor, { effectCatalog: huntingEffectsApi?.catalog ?? null });
      if (!validation.green) throw new Error(`Partie Monster Hunter invalide: ${validation.errors.join(", ")}`);
      if (!huntingEffectsApi?.set) throw new Error("API Hunting Effects indisponible.");
      const principal = await resolveActor(principalActorOrUuid);
      return huntingEffectsApi.set(principal, validation.part.effectId, true);
    },
  });
}
