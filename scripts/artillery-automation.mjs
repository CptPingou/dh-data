const MODULE_ID = "daggerheart-campaign-toolkit";

function normalizedChoice(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}


const ARTILLERY_DOMAIN_ID = "artillery";

const ARTILLERY_DOMAIN_DEFINITION = Object.freeze({
  id: ARTILLERY_DOMAIN_ID,
  label: "Artillery",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png",
  description:
    "Artillery est le domaine de la puissance de feu, du contrÃ´le de zone et des attaques Ã  fort impact.",
  color: "#8a5a24",
});

const FLAG_SCOPE = "daggerheart-campaign-toolkit";
export const ARTILLERY_AUTOMATION_VERSION = "P2.11c.6e";

function artilleryBaseAction({
  id = foundry.utils.randomID(),
  name,
  description = "",
  type = "effect",
  img = ARTILLERY_DOMAIN_DEFINITION.src,
  range = "",
  targetAmount = null,
  stressCost = 0,
  usesMax = "",
  recovery = null,
  consumeOnSuccess = false,
}) {
  return {
    type,
    _id: id,
    systemPath: "actions",
    description,
    chatDisplay: true,
    actionType: "action",
    cost: stressCost > 0
      ? [{
          key: "stress",
          value: stressCost,
          scalable: false,
          step: null,
          itemId: null,
          consumeOnSuccess: false,
        }]
      : [],
    uses: {
      value: null,
      max: usesMax,
      recovery,
      consumeOnSuccess,
    },
    target: { type: "any", amount: targetAmount },
    effects: [],
    name,
    img,
    range,
    baseAction: false,
    originItem: { type: "itemCollection" },
    triggers: [],
    areas: [],
  };
}

function artilleryAttackAction(options = {}) {
  const action = artilleryBaseAction({ ...options, type: "attack" });
  action.damage = { main: null, resources: {} };
  action.roll = {
    type: options.rollType ?? null,
    trait: null,
    difficulty: options.rollDifficulty ?? null,
    bonus: null,
    advState: "neutral",
    diceRolling: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      compare: null,
      treshold: null,
    },
    useDefault: false,
  };
  action.save = {
    trait: options.saveTrait ?? null,
    difficulty: options.saveDifficulty ?? null,
    damageMod: options.saveDamageMod ?? "none",
  };
  return action;
}


function artilleryHealingAction({
  name,
  description = "",
  img = ARTILLERY_DOMAIN_DEFINITION.src,
  stress = 0,
  usesMax = "",
  recovery = null,
}) {
  const action = artilleryBaseAction({
    name,
    description,
    type: "healing",
    img,
    range: "self",
    targetAmount: null,
    usesMax,
    recovery,
    consumeOnSuccess: false,
  });

  action.target = { type: "self", amount: null };
  action.damage = {
    main: null,
    resources: {
      stress: {
        value: {
          custom: { enabled: true, formula: String(stress) },
          multiplier: "prof",
          flatMultiplier: 1,
          dice: "d6",
          bonus: null,
        },
        applyTo: "stress",
        base: false,
        resultBased: false,
        valueAlt: {
          multiplier: "prof",
          flatMultiplier: 1,
          dice: "d6",
          bonus: null,
          custom: { enabled: false, formula: "" },
        },
        fullRestore: false,
        itemId: null,
      },
    },
  };
  action.roll = {
    type: null,
    trait: null,
    difficulty: null,
    bonus: null,
    advState: "neutral",
    diceRolling: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      compare: null,
      treshold: null,
    },
    useDefault: false,
  };

  return action;
}

function artilleryDamage({ dice, count = 1, bonus = 0, damageType = "physical" }) {
  return {
    value: {
      custom: { enabled: false, formula: "" },
      multiplier: "flat",
      flatMultiplier: count,
      dice,
      bonus,
    },
    applyTo: "hitPoints",
    type: [damageType],
    base: false,
    resultBased: false,
    valueAlt: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      bonus: null,
      custom: { enabled: false, formula: "" },
    },
    includeBase: false,
    direct: false,
    fullRestore: false,
    itemId: null,
  };
}

function artilleryProneEffect(description) {
  return {
    name: "Ã€ terre",
    img: "icons/svg/falling.svg",
    transfer: false,
    _id: foundry.utils.randomID(),
    type: "base",
    system: {
      changes: [],
      duration: { type: "temporary", description: "" },
      rangeDependence: null,
      stacking: null,
      targetDispositions: [],
    },
    disabled: false,
    duration: {
      value: null,
      units: "seconds",
      expiry: null,
      expired: false,
    },
    description,
    tint: "#ffffff",
    statuses: ["prone"],
    sort: 0,
    flags: {},
    start: null,
    showIcon: 1,
    folder: null,
    origin: null,
  };
}

function addArtilleryEffectToAction(data, action, effect, { onSave = false } = {}) {
  data.effects ??= [];
  data.effects.push(effect);
  action.effects ??= [];
  action.effects.push({ _id: effect._id, onSave });
}


export function serializedActions(value) {
  if (Array.isArray(value)) return [...value];
  if (value?.contents) return [...value.contents];
  if (value instanceof Map) return [...value.values()];
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

let nativeDomainActionSpecimenPromise = null;
async function nativeDomainActionSpecimens() {
  if (nativeDomainActionSpecimenPromise) return nativeDomainActionSpecimenPromise;

  nativeDomainActionSpecimenPromise = (async () => {
    const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
    if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

    const specimens = {
      attack: null,
      effect: null,
      damage: null,
      healing: null,
      proneEffect: null,
      transferEffect: null,
      actionContainer: "array",
    };

    const docs = await pack.getDocuments();
    specimens.transferEffect = nativeTransferEffectSpecimen(docs);

    for (const doc of docs) {
      // Never use the Artillery cards we are currently rebuilding as schema
      // specimens. We want already-valid Foundryborne 2.9.4 data.
      if (normalizedChoice(doc.system?.domain) === ARTILLERY_DOMAIN_ID) continue;

      const raw = doc.toObject();
      const sourceActions = raw?.system?.actions;
      if (sourceActions && !Array.isArray(sourceActions) && typeof sourceActions === "object") {
        specimens.actionContainer = "object";
      }

      for (const action of serializedActions(sourceActions)) {
        const type = normalizedChoice(action?.type);
        if (type && Object.prototype.hasOwnProperty.call(specimens, type) && !specimens[type]) {
          specimens[type] = foundry.utils.deepClone(action);
        }
        if (
          type === "attack" &&
          !specimens.attack &&
          action?.roll &&
          action?.save &&
          action?.damage
        ) {
          specimens.attack = foundry.utils.deepClone(action);
        }
      }

      for (const effect of Array.isArray(raw?.effects) ? raw.effects : []) {
        if (
          !specimens.proneEffect &&
          Array.isArray(effect?.statuses) &&
          effect.statuses.includes("prone")
        ) {
          specimens.proneEffect = foundry.utils.deepClone(effect);
        }
      }

      if (specimens.attack && specimens.healing && specimens.proneEffect) break;
    }

    if (!specimens.attack) {
      throw new Error("Aucun specimen natif d'Action attack trouvÃ© dans dh-domain-cards.");
    }

    console.info(`${MODULE_ID} | P2.11c.4a2 native Artillery specimens`, {
      attack: Boolean(specimens.attack),
      effect: Boolean(specimens.effect),
      damage: Boolean(specimens.damage),
      healing: Boolean(specimens.healing),
      proneEffect: Boolean(specimens.proneEffect),
      transferEffect: Boolean(specimens.transferEffect),
      actionContainer: specimens.actionContainer,
    });

    return specimens;
  })();

  return nativeDomainActionSpecimenPromise;
}


function nativeTransferEffectSpecimen(docs) {
  for (const doc of docs) {
    if (normalizedChoice(doc.system?.domain) === ARTILLERY_DOMAIN_ID) continue;
    const raw = doc.toObject();
    for (const effect of Array.isArray(raw?.effects) ? raw.effects : []) {
      if (
        effect?.type === "base" &&
        effect?.system &&
        Array.isArray(effect.system.changes)
      ) {
        return foundry.utils.deepClone(effect);
      }
    }
  }
  return null;
}

function artilleryEffectDraft({
  name,
  description = "",
  changes = [],
  transfer = true,
  disabled = false,
  img = ARTILLERY_DOMAIN_DEFINITION.src,
}) {
  return {
    name,
    img,
    transfer,
    _id: foundry.utils.randomID(),
    type: "base",
    system: {
      changes,
      duration: {
        description: "",
      },
      rangeDependence: null,
      stacking: null,
      targetDispositions: [],
    },
    disabled,
    duration: {
      value: null,
      units: "seconds",
      expiry: null,
      expired: false,
    },
    description,
    tint: "#ffffff",
    statuses: [],
    sort: 0,
    flags: {},
    start: null,
    showIcon: 1,
    folder: null,
    origin: null,
  };
}

function hydrateNativeEffect(specimen, draft) {
  if (!specimen) return draft;

  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();
  clone._id = id;

  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.origin = null;
  return merged;
}

function hydrateNativeAction(specimen, draft) {
  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();

  clone._id = id;

  // Merge onto a known-valid Foundryborne ActionField source so fields added or
  // made mandatory by 2.9.4 are retained instead of guessed by the Toolkit.
  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.systemPath = "actions";
  merged.baseAction = false;
  merged.originItem ??= { type: "itemCollection" };
  merged.triggers ??= [];
  merged.areas ??= [];
  merged.effects ??= [];
  merged.cost ??= [];
  merged.uses ??= {
    value: null,
    max: "",
    recovery: null,
    consumeOnSuccess: false,
  };

  return merged;
}

function hydrateNativeProneEffect(specimen, draft) {
  if (!specimen) return draft;

  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();
  clone._id = id;

  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.statuses = ["prone"];
  merged.origin = null;
  return merged;
}

export async function applyArtilleryDomainCardAutomation(data, raw) {
  const sourceId = String(raw?.id ?? "");
  if (!sourceId.startsWith("homebrew.artificer.domain-card.artillery.")) return null;

  const nativeSpecimens = await nativeDomainActionSpecimens();

  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].artilleryAutomation = {
    version: ARTILLERY_AUTOMATION_VERSION,
    status: "text-only",
  };

  const actionMap = {};
  const register = (action) => {
    actionMap[action._id] = action;
    return action;
  };

  if (sourceId.endsWith(".concussive-shot")) {
    const action = register(artilleryAttackAction({
      name: "DÃ©charge concussive",
      description:
        "<p>AprÃ¨s une attaque rÃ©ussie, marquez 1 Stress. La cible est repoussÃ©e dâ€™un cran de portÃ©e et effectue un jet de RÃ©action dâ€™AgilitÃ© (12). En cas dâ€™Ã©chec, elle est mise Ã€ terre. Si un adversaire est mis Ã€ terre ainsi, il marque aussi 1 Stress.</p><p><em>Le recul et le Stress de la cible restent Ã  appliquer manuellement.</em></p>",
      img: "icons/magic/sonic/explosion-shock-wave-teal.webp",
      targetAmount: 1,
      stressCost: 1,
      saveTrait: "agility",
      saveDifficulty: 12,
    }));
    action.roll.type = null;
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Ã‰chec au jet de RÃ©action dâ€™AgilitÃ© (12) de Tir concussif.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: ["stress-cost", "agility-reaction-12", "prone-on-failed-save"],
      manual: ["forced-movement-one-range-step", "target-stress-if-adversary-and-prone"],
    };
  }

  if (sourceId.endsWith(".shockwave")) {
    const action = register(artilleryAttackAction({
      name: "Onde de choc",
      description:
        "<p>Effectuez un jet dâ€™Incantation contre une cible Ã  portÃ©e Lointaine. En cas de rÃ©ussite, les adversaires Ã  portÃ©e TrÃ¨s proche de la cible effectuent un jet de RÃ©action dâ€™AgilitÃ© (13). Ils subissent 1d6+2 dÃ©gÃ¢ts physiques dans tous les cas ; ceux qui Ã©chouent sont Ã©galement mis Ã€ terre.</p>",
      img: "icons/magic/earth/projectile-stone-landslide.webp",
      range: "far",
      rollType: "spellcast",
      saveTrait: "agility",
      saveDifficulty: 13,
      saveDamageMod: "none",
    }));
    action.damage.main = artilleryDamage({
      dice: "d6",
      count: 1,
      bonus: 2,
      damageType: "physical",
    });
    action.areas = [{
      name: "Onde de choc",
      type: "placed",
      shape: "emanation",
      size: "veryClose",
      effects: [],
      hasHole: false,
    }];
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Ã‰chec au jet de RÃ©action dâ€™AgilitÃ© (13) dâ€™Onde de choc.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "native",
      automated: [
        "spellcast-roll",
        "far-range",
        "very-close-area",
        "physical-damage-1d6+2",
        "agility-reaction-13",
        "prone-on-failed-save",
      ],
      manual: [],
    };
  }

  if (sourceId.endsWith(".carpet-bomb")) {
    const action = register(artilleryAttackAction({
      name: "Bombardement en tapis",
      description:
        "<p>Une fois par repos long, effectuez un jet dâ€™Incantation contre un point Ã  portÃ©e Lointaine. En cas de rÃ©ussite, tous les adversaires dans une zone TrÃ¨s proche subissent 3d10+5 dÃ©gÃ¢ts physiques et effectuent un jet de RÃ©action dâ€™AgilitÃ© (15). Ceux qui Ã©chouent sont mis Ã€ terre.</p><p><strong>RÃ©ussite critique :</strong> Ã©tendez manuellement la zone Ã  portÃ©e Proche.</p>",
      img: "icons/magic/fire/projectile-meteor-salvo-strong-red.webp",
      range: "far",
      rollType: "spellcast",
      saveTrait: "agility",
      saveDifficulty: 15,
      saveDamageMod: "none",
      usesMax: "1",
      recovery: "longRest",
      consumeOnSuccess: false,
    }));
    action.damage.main = artilleryDamage({
      dice: "d10",
      count: 3,
      bonus: 5,
      damageType: "physical",
    });
    action.areas = [{
      name: "Bombardement en tapis",
      type: "placed",
      shape: "emanation",
      size: "veryClose",
      effects: [],
      hasHole: false,
    }];
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Ã‰chec au jet de RÃ©action dâ€™AgilitÃ© (15) de Bombardement en tapis.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: [
        "spellcast-roll",
        "far-range",
        "very-close-area",
        "physical-damage-3d10+5",
        "agility-reaction-15",
        "prone-on-failed-save",
        "one-per-long-rest",
      ],
      manual: ["critical-success-expand-area-to-close"],
    };
  }



  if (sourceId.endsWith(".battle-rhythm")) {
    register(
      artilleryBaseAction({
        name: "Moment de calme",
        description:
          "<p>Une fois par repos, pendant un moment de calme entre deux vagues, effacez 2 Stress et gagnez 1 Cob Round.</p>",
        type: "effect",
        img: ARTILLERY_DOMAIN_DEFINITION.src,
        range: "self",
        targetAmount: null,
        usesMax: "1",
        recovery: "shortRest",
        consumeOnSuccess: false,
      })
    );

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "runtime-authoritative",
      automated: [
        "critical-attack-clear-1-stress-runtime",
        "calm-clear-2-stress-runtime",
        "calm-gain-1-cob-round-runtime",
        "one-per-rest-native",
      ],
      manual: [],
      runtimeApi: "artificerResource",
    };
  }

  if (sourceId.endsWith(".decisive-strike")) {
    register(
      artilleryBaseAction({
        name: "Armer Frappe dÃ©cisive",
        description:
          "<p>Une fois par repos long, avant votre prochain jet dâ€™attaque, dÃ©pensez tous vos Cob Rounds. Le prochain jet dâ€™attaque gagne +1 et +2d6 dÃ©gÃ¢ts par Cob Round dÃ©pensÃ©. En cas de rÃ©ussite, la cible ne peut pas effectuer de RÃ©actions jusquâ€™au dÃ©but de votre prochaine action.</p>",
        type: "effect",
        img: ARTILLERY_DOMAIN_DEFINITION.src,
        range: "self",
        targetAmount: null,
        usesMax: "1",
        recovery: "longRest",
        consumeOnSuccess: false,
      })
    );

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-runtime",
      automated: [
        "spend-all-cob-rounds-runtime",
        "next-attack-bonus-plus-one-per-cob-runtime-effect",
        "next-damage-plus-2d6-per-cob-manual-chat",
        "effect-consumed-on-next-attack",
        "one-per-long-rest-native",
      ],
      manual: [
        "successful-target-cannot-react-until-start-of-next-action",
      ],
      runtimeApi: "artificerResource",
    };
  }

  if (sourceId.endsWith(".heavy-volley")) {
    const effect = hydrateNativeEffect(
      nativeSpecimens.transferEffect,
      artilleryEffectDraft({
        name: "VolÃ©e lourde",
        description:
          "<p>Ajoute un dÃ© aux jets de dÃ©gÃ¢ts : d6 au Tier 1, d8 au Tier 2, d10 au Tier 3, d12 au Tier 4.</p><p><em>P2.11c.4b automatise nativement le bonus Tier 1 ; le changement de taille du dÃ© avec le Tier reste suivi par le flag Toolkit jusquâ€™Ã  ce quâ€™un hook de scaling sÃ»r soit validÃ©.</em></p>",
        transfer: true,
        disabled: false,
        img: "icons/skills/ranged/arrows-flying-salvo-blue.webp",
        changes: [
          {
            key: "system.bonuses.damage.physical.dice",
            type: "add",
            value: "d6",
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.magical.dice",
            type: "add",
            value: "d6",
            priority: null,
            phase: "initial",
          },
        ],
      })
    );
    data.effects ??= [];
    data.effects.push(effect);

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: ["tier-1-extra-d6-physical", "tier-1-extra-d6-magical"],
      manual: ["tier-scaling-d6-d8-d10-d12"],
      tierScaling: {
        1: "d6",
        2: "d8",
        3: "d10",
        4: "d12",
      },
    };
  }

  if (sourceId.endsWith(".siege-stance")) {
    const stance = hydrateNativeEffect(
      nativeSpecimens.transferEffect,
      artilleryEffectDraft({
        name: "Posture de siÃ¨ge",
        description:
          "<p>Tant que la posture est active : +2 aux jets dâ€™attaque et +1d8 aux jets de dÃ©gÃ¢ts. Vous ne pouvez pas Ãªtre dÃ©placÃ© contre votre volontÃ©. La posture prend fin dÃ¨s que vous vous dÃ©placez.</p><p><em>Lâ€™immunitÃ© au dÃ©placement forcÃ© et la fin automatique au mouvement restent manuelles dans P2.11c.4b.</em></p>",
        transfer: false,
        disabled: false,
        img: "icons/skills/ranged/cannon-barrel-firing-orange.webp",
        changes: [
          {
            key: "system.bonuses.roll.attack.bonus",
            type: "add",
            value: 2,
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.physical.dice",
            type: "add",
            value: "d8",
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.magical.dice",
            type: "add",
            value: "d8",
            priority: null,
            phase: "initial",
          },
        ],
      })
    );
    data.effects ??= [];
    data.effects.push(stance);

    const action = register(
      artilleryBaseAction({
        name: "Adopter la posture de siÃ¨ge",
        description:
          "<p>Une fois par repos, adoptez la Posture de siÃ¨ge : +2 aux attaques et +1d8 dÃ©gÃ¢ts tant que vous ne vous dÃ©placez pas.</p>",
        type: "effect",
        img: "icons/skills/ranged/cannon-barrel-firing-orange.webp",
        usesMax: "1",
        recovery: "shortRest",
        consumeOnSuccess: false,
      })
    );
    action.effects = [{ _id: stance._id, onSave: false }];

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: [
        "one-per-rest",
        "attack-bonus-2",
        "extra-d8-physical",
        "extra-d8-magical",
        "apply-siege-stance-effect",
      ],
      manual: [
        "forced-movement-immunity",
        "remove-effect-when-actor-moves",
      ],
    };
  }

  if (!Object.keys(actionMap).length) return data.flags[FLAG_SCOPE].artilleryAutomation;

  const hydratedActions = Object.values(actionMap).map((draft) => {
    const type = normalizedChoice(draft?.type);
    const specimen =
      nativeSpecimens[type] ??
      nativeSpecimens.attack;
    return hydrateNativeAction(specimen, draft);
  });

  // Preserve the same source container shape as existing valid domain cards in
  // this exact Foundryborne runtime.
  data.system.actions =
    nativeSpecimens.actionContainer === "object"
      ? Object.fromEntries(hydratedActions.map((action) => [action._id, action]))
      : hydratedActions;

  data.flags[FLAG_SCOPE].artilleryAutomation.specimen = {
    actionContainer: nativeSpecimens.actionContainer,
    nativeAttack: true,
    nativeProne: Boolean(nativeSpecimens.proneEffect),
  };

  return data.flags[FLAG_SCOPE].artilleryAutomation;
}

