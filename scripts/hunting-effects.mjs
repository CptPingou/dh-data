const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = MODULE_ID;

/**
 * P2.9b.4 — Hunting Effects
 *
 * These are deliberately lightweight Foundry statuses. Colossus and the GM
 * decide when a monster part becomes Broken; the Toolkit only keeps the
 * consequence visible on the principal Actor. No combat lifecycle or damage
 * automation is introduced here.
 */
export const HUNTING_STATUS_EFFECTS = Object.freeze({
  "mh-wet": Object.freeze({
    id: "mh-wet",
    name: "Mouillé",
    img: "modules/daggerheart-campaign-toolkit/assets/icons/status/wet.svg",
    category: "hunting",
    appliesTo: Object.freeze(["character", "adversary"]),
    description: "La cible est trempée. Cet état peut affecter aussi bien un chasseur qu’un monstre et reste visible tant que la fiction le justifie.",
    rule: "Les effets et dégâts de type Éclair sont doublés contre une cible Mouillée. L’application du multiplicateur reste arbitrée à la table.",
  }),
  "mh-broken-fangs": Object.freeze({
    id: "mh-broken-fangs",
    name: "Crocs brisés",
    img: "modules/daggerheart-campaign-toolkit/assets/icons/status/broken-fangs.svg",
    category: "monster-part",
    description: "Les crocs du monstre sont fracturés. Cet état reste visible tant que la fracture affecte le combat.",
    rule: "Mâchoire de pierre ne repousse plus la cible. Le Croc de Tetsucabra est disponible au dépeçage.",
  }),
  "mh-injured-forelegs": Object.freeze({
    id: "mh-injured-forelegs",
    name: "Pattes avant blessées",
    img: "modules/daggerheart-campaign-toolkit/assets/icons/status/broken-fangs.svg",
    category: "monster-part",
    description: "Les pattes avant du monstre sont blessées ou fracturées et gênent ses charges.",
    rule: "Charge tectonique ne provoque plus son déplacement forcé. La réaction conserve son attaque de base.",
  }),
  "mh-injured-hindlegs": Object.freeze({
    id: "mh-injured-hindlegs",
    name: "Pattes arrière blessées",
    img: "modules/daggerheart-campaign-toolkit/assets/icons/status/broken-fangs.svg",
    category: "monster-part",
    description: "Les pattes arrière du monstre sont blessées ou fracturées et gênent ses déplacements brusques.",
    rule: "Percée souterraine permet toujours de s'enfouir et de ressortir, mais plus de se repositionner immédiatement au contact d'une cible.",
  }),
});

function configStatus(effect) {
  return {
    id: effect.id,
    name: effect.name,
    img: effect.img,
    description: effect.description,
    flags: {
      [FLAG_SCOPE]: {
        hunting: true,
        category: effect.category,
        appliesTo: effect.appliesTo ?? null,
        description: effect.description,
        rule: effect.rule,
      },
    },
  };
}

export function registerHuntingStatusEffects() {
  CONFIG.statusEffects ??= [];
  let added = 0;
  for (const effect of Object.values(HUNTING_STATUS_EFFECTS)) {
    if (CONFIG.statusEffects.some(row => row?.id === effect.id)) continue;
    CONFIG.statusEffects.push(configStatus(effect));
    added += 1;
  }
  console.log(`${MODULE_ID} | Hunting status effects ready`, {
    registered: Object.keys(HUNTING_STATUS_EFFECTS).length,
    added,
  });
  return { registered: Object.keys(HUNTING_STATUS_EFFECTS).length, added };
}

async function resolveActor(actorOrUuid) {
  if (actorOrUuid instanceof Actor) return actorOrUuid;
  if (actorOrUuid?.actor instanceof Actor) return actorOrUuid.actor;
  if (typeof actorOrUuid === "string") {
    const doc = await foundry.utils.fromUuid(actorOrUuid);
    if (doc instanceof Actor) return doc;
    if (doc?.actor instanceof Actor) return doc.actor;
  }
  throw new Error("Actor Hunting introuvable. Passez un Actor, un TokenDocument ou son UUID.");
}

function definition(effectId) {
  const effect = HUNTING_STATUS_EFFECTS[effectId];
  if (!effect) throw new Error(`État Hunting inconnu: ${effectId}`);
  return effect;
}

export async function setHuntingStatus(actorOrUuid, effectId, active = true) {
  const actor = await resolveActor(actorOrUuid);
  const effect = definition(effectId);
  await actor.toggleStatusEffect(effect.id, { active: Boolean(active) });

  // Keep the rule accessible from the created ActiveEffect even though the
  // actual mechanical interpretation remains table-managed.
  const activeEffect = actor.effects.find(row => row.statuses?.has?.(effect.id));
  if (activeEffect) {
    await activeEffect.update({
      [`flags.${FLAG_SCOPE}.hunting`]: true,
      [`flags.${FLAG_SCOPE}.category`]: effect.category,
      [`flags.${FLAG_SCOPE}.appliesTo`]: effect.appliesTo ?? null,
      [`flags.${FLAG_SCOPE}.description`]: effect.description,
      [`flags.${FLAG_SCOPE}.rule`]: effect.rule,
    });
  }

  return {
    actor: actor.uuid,
    effectId: effect.id,
    name: effect.name,
    category: effect.category,
    appliesTo: effect.appliesTo ?? null,
    description: effect.description,
    active: actor.statuses?.has?.(effect.id) ?? Boolean(activeEffect),
    rule: effect.rule,
  };
}

export async function toggleHuntingStatus(actorOrUuid, effectId) {
  const actor = await resolveActor(actorOrUuid);
  definition(effectId);
  const active = !(actor.statuses?.has?.(effectId) ?? false);
  return setHuntingStatus(actor, effectId, active);
}

export async function huntingEffectsStatus(actorOrUuid = null) {
  const registered = Object.values(HUNTING_STATUS_EFFECTS).map(effect => ({
    id: effect.id,
    name: effect.name,
    category: effect.category,
    appliesTo: effect.appliesTo ?? null,
    registered: CONFIG.statusEffects?.some(row => row?.id === effect.id) ?? false,
    description: effect.description,
    rule: effect.rule,
  }));

  let actor = null;
  let active = [];
  if (actorOrUuid) {
    actor = await resolveActor(actorOrUuid);
    active = registered.filter(row => actor.statuses?.has?.(row.id)).map(row => row.id);
  }

  const result = {
    green: registered.every(row => row.registered),
    registered,
    actor: actor?.uuid ?? null,
    active,
  };
  console.table(registered);
  return result;
}

export const huntingEffectsApi = Object.freeze({
  catalog: HUNTING_STATUS_EFFECTS,
  set: setHuntingStatus,
  toggle: toggleHuntingStatus,
  status: huntingEffectsStatus,
});
