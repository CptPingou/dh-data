const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = MODULE_ID;

const ARTIFICER_CLASS_SOURCE_ID = "homebrew.artificer.class.artificer";
const BATTLE_RHYTHM_SOURCE_ID =
  "homebrew.artificer.domain-card.artillery.battle-rhythm";
const DECISIVE_STRIKE_SOURCE_ID =
  "homebrew.artificer.domain-card.artillery.decisive-strike";

const COUNTER_KEY = "cobRounds";
const COUNTER_LABEL = "Cob Rounds";
const COUNTER_SOURCE_ID = "homebrew.artificer.runtime-resource.cob-rounds";
const COUNTER_ICON =
  "modules/daggerheart-campaign-toolkit/assets/icons/domains/artillery.png";
const COUNTER_FEATURE_FLAG = "artificerResourceFeature";
const DECISIVE_STRIKE_FLAG = "decisiveStrike";
const DECISIVE_STRIKE_EFFECT_FLAG = "decisiveStrikeEffect";

function sourceIdOf(item) {
  return item?.flags?.[FLAG_SCOPE]?.sourceId ?? null;
}

function actorItems(actor) {
  return actor?.items?.contents ?? [...(actor?.items ?? [])];
}

export function isArtificer(actor) {
  return actorItems(actor).some(
    (item) =>
      item?.type === "class" &&
      sourceIdOf(item) === ARTIFICER_CLASS_SOURCE_ID
  );
}

export function hasBattleRhythm(actor) {
  return actorItems(actor).some(
    (item) =>
      item?.type === "domainCard" &&
      sourceIdOf(item) === BATTLE_RHYTHM_SOURCE_ID
  );
}

export function hasDecisiveStrike(actor) {
  return actorItems(actor).some(
    (item) =>
      item?.type === "domainCard" &&
      sourceIdOf(item) === DECISIVE_STRIKE_SOURCE_ID
  );
}

function legacyResourceState(actor) {
  const raw =
    actor?.flags?.[FLAG_SCOPE]?.artificer?.resources?.[COUNTER_KEY] ?? {};
  const value = Math.max(0, Number(raw?.value) || 0);
  const max =
    raw?.max == null || raw?.max === ""
      ? null
      : Math.max(0, Number(raw.max) || 0);

  return {
    key: COUNTER_KEY,
    label: COUNTER_LABEL,
    value: max == null ? value : Math.min(value, max),
    max,
  };
}

function counterFeature(actor) {
  return actorItems(actor).find(
    (item) =>
      item?.type === "feature" &&
      (
        item?.flags?.[FLAG_SCOPE]?.[COUNTER_FEATURE_FLAG] === COUNTER_KEY ||
        sourceIdOf(item) === COUNTER_SOURCE_ID
      )
  ) ?? null;
}

function nativeResourceOf(feature) {
  const resource = feature?.system?.resource ?? null;
  if (!resource || resource?.type !== "simple") return null;
  return resource;
}

function normalizedNativeMax(rawMax) {
  if (rawMax == null || rawMax === "") return null;
  const numeric = Number(rawMax);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function resourceState(actor) {
  const feature = counterFeature(actor);
  const native = nativeResourceOf(feature);

  if (native) {
    const max = normalizedNativeMax(native.max);
    const value = Math.max(0, Number(native.value) || 0);
    return {
      key: COUNTER_KEY,
      label: COUNTER_LABEL,
      value: max == null ? value : Math.min(value, max),
      max,
      storage: "native-feature",
      featureId: feature.id,
    };
  }

  return {
    ...legacyResourceState(actor),
    storage: "legacy-flag",
    featureId: feature?.id ?? null,
  };
}

function cloneResourceData(resource) {
  if (!resource) return null;
  return resource?.toObject?.() ??
    foundry.utils.deepClone(resource);
}

function simpleResourceSpecimen(actor) {
  // Prefer an already-valid native simple resource on the same Actor.
  // Seaborne / "Connaître la marée" is the reference specimen validated
  // against Foundryborne 2.10.5.
  for (const item of actorItems(actor)) {
    if (item === counterFeature(actor)) continue;
    const resource = nativeResourceOf(item);
    if (resource) return cloneResourceData(resource);
  }

  // Then accept any already-valid simple resource present in the world.
  for (const otherActor of game.actors ?? []) {
    for (const item of actorItems(otherActor)) {
      const resource = nativeResourceOf(item);
      if (resource) return cloneResourceData(resource);
    }
  }

  // A previously migrated Cob feature is itself a valid specimen.
  const own = nativeResourceOf(counterFeature(actor));
  if (own) return cloneResourceData(own);

  return null;
}

function cobResourceFromSpecimen(specimen, value, max = null) {
  if (!specimen) {
    throw new Error(
      "Aucun compteur natif simple disponible comme specimen. " +
      "Ajoutez/ouvrez un personnage possédant une feature native à compteur " +
      "(ex. Connaître la marée / Seaborne), puis relancez ensure()."
    );
  }

  const resource = foundry.utils.deepClone(specimen);
  resource.type = "simple";
  resource.value = Math.max(0, Number(value) || 0);

  // Cob Rounds has no source-defined maximum. An empty max is the native
  // "no cap displayed" representation; do not inherit Seaborne's level cap.
  resource.max =
    max == null || max === ""
      ? ""
      : String(Math.max(0, Number(max) || 0));

  // Battle Rhythm owns gain/recovery semantics; the counter itself must not
  // auto-reset on short/long rest or session recovery.
  resource.recovery = null;
  resource.icon = "fa-solid fa-bullseye";

  return resource;
}

async function nativeFeatureTemplate(actor, initialState) {
  const pack = game.packs.get(`${MODULE_ID}.dh-features`);
  if (!pack) throw new Error("Compendium Toolkit dh-features absent.");

  const docs = await pack.getDocuments();
  const specimen = docs.find((doc) => doc.type === "feature") ?? null;
  if (!specimen) throw new Error("Aucun specimen natif feature dans dh-features.");

  const resourceSpecimen = simpleResourceSpecimen(actor);
  const data = specimen.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data._stats;

  data.effects = [];
  data.name = COUNTER_LABEL;
  data.img = COUNTER_ICON;
  data.flags ??= {};
  data.flags[FLAG_SCOPE] = {
    [COUNTER_FEATURE_FLAG]: COUNTER_KEY,
    sourceId: COUNTER_SOURCE_ID,
    managed: true,
    contentOwner: MODULE_ID,
    contentOrigin: "homebrew-runtime",
    runtimeFeature: "artificer-resource",
    nativeResourceSchema: "seaborne-simple",
  };

  if (data.system) {
    data.system.description =
      "<p><strong>Cob Rounds</strong> de l’Artificier. " +
      "Ce compteur utilise la même ressource native simple que " +
      "<em>Connaître la marée</em> (Seaborne).</p>";
    if ("gmNotes" in data.system) data.system.gmNotes = "";
    if ("granter" in data.system) data.system.granter = null;
    if ("featureForm" in data.system) data.system.featureForm = "passive";
    if ("actorResources" in data.system) data.system.actorResources = [];
    data.system.resource = cobResourceFromSpecimen(
      resourceSpecimen,
      initialState.value,
      initialState.max
    );
    if ("actions" in data.system) {
      data.system.actions = Array.isArray(data.system.actions) ? [] : {};
    }
  }

  return data;
}

export async function ensureArtificerResourceFeature(actor) {
  if (!actor) throw new Error("Actor requis.");
  if (!isArtificer(actor)) {
    return { green: true, eligible: false, actor: actor.name, feature: null };
  }

  let feature = counterFeature(actor);
  const nativeBefore = nativeResourceOf(feature);

  // Migration rule:
  // - an already-native Cob feature is authoritative;
  // - an old pseudo-feature ("Cob Rounds [N]") migrates the legacy flag value.
  const state = nativeBefore ? resourceState(actor) : legacyResourceState(actor);

  if (!feature) {
    const data = await nativeFeatureTemplate(actor, state);
    const created = await actor.createEmbeddedDocuments("Item", [data]);
    feature = created?.[0] ?? null;
  } else {
    const update = {};

    if (feature.name !== COUNTER_LABEL) update.name = COUNTER_LABEL;
    if (feature.img !== COUNTER_ICON) update.img = COUNTER_ICON;
    if (sourceIdOf(feature) !== COUNTER_SOURCE_ID) {
      update[`flags.${FLAG_SCOPE}.sourceId`] = COUNTER_SOURCE_ID;
    }
    if (
      feature?.flags?.[FLAG_SCOPE]?.[COUNTER_FEATURE_FLAG] !== COUNTER_KEY
    ) {
      update[`flags.${FLAG_SCOPE}.${COUNTER_FEATURE_FLAG}`] = COUNTER_KEY;
    }
    if (
      feature?.flags?.[FLAG_SCOPE]?.nativeResourceSchema !== "seaborne-simple"
    ) {
      update[`flags.${FLAG_SCOPE}.nativeResourceSchema`] = "seaborne-simple";
    }

    if (!nativeBefore) {
      update["system.resource"] = cobResourceFromSpecimen(
        simpleResourceSpecimen(actor),
        state.value,
        state.max
      );
    }

    if (Object.keys(update).length) await feature.update(update);
  }

  const finalState = resourceState(actor);

  // Keep the old flag as a migration mirror for this milestone only.
  await actor.update({
    [`flags.${FLAG_SCOPE}.artificer.resources.${COUNTER_KEY}`]: {
      value: finalState.value,
      max: finalState.max,
    },
  });

  return {
    green: Boolean(feature && nativeResourceOf(feature)),
    eligible: true,
    actor: actor.name,
    feature: feature?.name ?? null,
    featureId: feature?.id ?? null,
    resource: finalState,
  };
}

async function persistState(actor, state) {
  if (!actor) throw new Error("Actor requis.");

  let feature = counterFeature(actor);
  if (!feature || !nativeResourceOf(feature)) {
    await ensureArtificerResourceFeature(actor);
    feature = counterFeature(actor);
  }

  const current = resourceState(actor);
  const next = {
    value: Math.max(0, Number(state?.value) || 0),
    max:
      state?.max === undefined
        ? current.max
        : state?.max == null || state?.max === ""
          ? null
          : Math.max(0, Number(state.max) || 0),
  };

  if (next.max != null) next.value = Math.min(next.value, next.max);

  if (!feature || !nativeResourceOf(feature)) {
    throw new Error("Feature Cob Rounds native introuvable après ensure().");
  }

  const update = {
    "system.resource.value": next.value,
    "system.resource.max": next.max == null ? "" : String(next.max),
  };
  await feature.update(update);

  // Compatibility mirror. Reads now prefer the native Feature resource.
  await actor.update({
    [`flags.${FLAG_SCOPE}.artificer.resources.${COUNTER_KEY}`]: {
      value: next.value,
      max: next.max,
    },
  });

  return resourceState(actor);
}


function actorStress(actor) {
  const value = Number(actor?.system?.resources?.stress?.value) || 0;
  const max = Number(actor?.system?.resources?.stress?.max) || 0;
  return { value: Math.max(0, value), max: Math.max(0, max) };
}

export async function clearArtificerStress(actor, amount = 1) {
  if (!actor) throw new Error("Actor requis.");
  const stress = actorStress(actor);
  const cleared = Math.min(stress.value, Math.max(0, Number(amount) || 0));
  const value = stress.value - cleared;

  if (cleared > 0) {
    await actor.update({ "system.resources.stress.value": value });
  }

  return { value, max: stress.max, cleared };
}

export async function resolveBattleRhythmCalm(actor) {
  if (!actor) throw new Error("Actor requis.");
  if (!isArtificer(actor) || !hasBattleRhythm(actor)) {
    return {
      green: false,
      reason: "missing-artificer-or-battle-rhythm",
    };
  }

  const stress = await clearArtificerStress(actor, 2);
  const resource = await gainCobRounds(actor, 1);
  return { green: true, stress, resource };
}

export async function setCobRounds(actor, value, { max } = {}) {
  if (!actor) throw new Error("Actor requis.");
  const current = resourceState(actor);
  return persistState(actor, {
    value,
    max: max === undefined ? current.max : max,
  });
}

export async function gainCobRounds(actor, amount = 1, options = {}) {
  const current = resourceState(actor);
  return setCobRounds(
    actor,
    current.value + Math.max(0, Number(amount) || 0),
    options
  );
}

export async function spendCobRounds(actor, amount = 1) {
  const current = resourceState(actor);
  const cost = Math.max(0, Number(amount) || 0);
  if (current.value < cost) {
    return {
      green: false,
      spent: 0,
      reason: "insufficient-cob-rounds",
      resource: current,
    };
  }

  const resource = await setCobRounds(actor, current.value - cost);
  return { green: true, spent: cost, resource };
}

export async function spendAllCobRounds(actor) {
  const current = resourceState(actor);
  const spent = current.value;
  const resource = await setCobRounds(actor, 0);
  return { green: true, spent, resource };
}


function decisiveStrikeState(actor) {
  const raw = actor?.flags?.[FLAG_SCOPE]?.artificer?.[DECISIVE_STRIKE_FLAG] ?? null;
  if (!raw || typeof raw !== "object") {
    return {
      armed: false,
      spent: 0,
      effectId: null,
      armedAt: null,
    };
  }

  return {
    armed: raw.armed === true,
    spent: Math.max(0, Number(raw.spent) || 0),
    effectId: raw.effectId ?? null,
    armedAt: raw.armedAt ?? null,
  };
}

function decisiveStrikeEffect(actor) {
  return [...(actor?.effects ?? [])].find(
    (effect) => effect?.flags?.[FLAG_SCOPE]?.[DECISIVE_STRIKE_EFFECT_FLAG] === true
  ) ?? null;
}

async function postDecisiveStrikeDamageChat(actor, spent) {
  const count = Math.max(0, Number(spent) || 0);
  if (!actor || count <= 0) return false;

  const dice = count * 2;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="daggerheart-campaign-toolkit decisive-strike-manual-damage">
        <p><strong>Frappe décisive</strong></p>
        <p>Ajoutez manuellement <strong>+${dice}d6 dégâts</strong> aux dégâts de cette attaque.</p>
        <p><small>${count} Cob Round(s) dépensé(s).</small></p>
      </div>
    `,
  });

  return true;
}

async function clearDecisiveStrikeState(actor, { deleteEffect = true } = {}) {
  if (!actor) throw new Error("Actor requis.");

  const effect = decisiveStrikeEffect(actor);
  if (deleteEffect && effect) {
    await effect.delete();
  }

  await actor.update({
    [`flags.${FLAG_SCOPE}.artificer.${DECISIVE_STRIKE_FLAG}`]: null,
  });

  return decisiveStrikeState(actor);
}

function decisiveStrikeEffectData(spent) {
  const count = Math.max(0, Number(spent) || 0);
  const damageDice = `${count * 2}d6`;

  return {
    name: `Frappe décisive [${count} Cob]`,
    type: "base",
    img: COUNTER_ICON,
    disabled: false,
    transfer: false,
    description:
      `<p>Frappe décisive armée : +${count} au prochain jet d’attaque et +${damageDice} aux dégâts.</p>`,
    flags: {
      [FLAG_SCOPE]: {
        [DECISIVE_STRIKE_EFFECT_FLAG]: true,
        managed: true,
        spentCobRounds: count,
      },
    },
    system: {
      changes: [
        {
          key: "system.bonuses.roll.attack.bonus",
          type: "add",
          value: count,
          priority: null,
          phase: "initial",
        },
      ],
      duration: { description: "" },
      rangeDependence: null,
      stacking: null,
      targetDispositions: [],
    },
    duration: {
      value: null,
      units: "seconds",
      expiry: null,
      expired: false,
    },
    statuses: [],
    showIcon: 1,
  };
}

export async function armDecisiveStrike(actor) {
  if (!actor) throw new Error("Actor requis.");
  if (!isArtificer(actor) || !hasDecisiveStrike(actor)) {
    return {
      green: false,
      armed: false,
      reason: "missing-artificer-or-decisive-strike",
    };
  }

  const existing = decisiveStrikeState(actor);
  if (existing.armed) {
    return {
      green: true,
      armed: true,
      changed: false,
      reason: "already-armed",
      ...existing,
    };
  }

  const current = resourceState(actor);
  if (current.value <= 0) {
    return {
      green: false,
      armed: false,
      changed: false,
      reason: "no-cob-rounds",
      resource: current,
    };
  }

  const spent = await spendAllCobRounds(actor);
  const created = await actor.createEmbeddedDocuments(
    "ActiveEffect",
    [decisiveStrikeEffectData(spent.spent)]
  );
  const effect = created?.[0] ?? null;

  if (!effect) {
    // Fail safe: restore the resource if Foundry rejected the effect.
    await gainCobRounds(actor, spent.spent);
    throw new Error("Impossible de créer l’effet Frappe décisive.");
  }

  const state = {
    armed: true,
    spent: spent.spent,
    effectId: effect.id,
    armedAt: Date.now(),
  };

  await actor.update({
    [`flags.${FLAG_SCOPE}.artificer.${DECISIVE_STRIKE_FLAG}`]: state,
  });

  return {
    green: true,
    changed: true,
    ...state,
    resource: resourceState(actor),
  };
}


export async function decisiveStrikeStatus(actor) {
  if (!actor) throw new Error("Actor requis.");
  const feature = counterFeature(actor);
  return {
    actor: actor.name,
    artificer: isArtificer(actor),
    decisiveStrike: hasDecisiveStrike(actor),
    resource: resourceState(actor),
    counterFeature: feature?.name ?? null,
    state: decisiveStrikeState(actor),
    effect: decisiveStrikeEffect(actor)?.name ?? null,
  };
}

function getProperty(object, path) {
  return foundry.utils.getProperty(object, path);
}

const CRITICAL_FLAG_PATHS = Object.freeze([
  "flags.daggerheart.roll.result.isCritical",
  "flags.daggerheart.roll.result.critical",
  "flags.daggerheart.roll.isCritical",
  "flags.daggerheart.roll.critical",
  "flags.daggerheart.rollResult.isCritical",
  "flags.daggerheart.rollResult.critical",
  "flags.daggerheart.result.isCritical",
  "flags.daggerheart.result.critical",
]);

const ATTACK_FLAG_PATHS = Object.freeze([
  "flags.daggerheart.action.type",
  "flags.daggerheart.roll.type",
  "flags.daggerheart.rollType",
  "flags.daggerheart.actionType",
]);

function explicitCriticalFlag(message) {
  for (const path of CRITICAL_FLAG_PATHS) {
    const value = getProperty(message, path);
    if (value === true) return true;
    if (typeof value === "string" && value.toLowerCase() === "critical") return true;
  }
  return false;
}

function explicitAttackFlag(message) {
  for (const path of ATTACK_FLAG_PATHS) {
    const value = getProperty(message, path);
    if (typeof value === "string" && value.toLowerCase().includes("attack")) {
      return true;
    }
  }

  const source =
    getProperty(message, "flags.daggerheart.item") ??
    getProperty(message, "flags.daggerheart.sourceItem") ??
    null;

  if (source?.type === "weapon") return true;
  return false;
}

function collectActiveDice(term, out = []) {
  if (!term) return out;

  if (Number(term?.faces) > 0 && Array.isArray(term?.results)) {
    const values = term.results
      .filter((result) => result?.active !== false && result?.discarded !== true)
      .map((result) => Number(result?.result))
      .filter(Number.isFinite);

    if (values.length) {
      out.push({
        faces: Number(term.faces),
        values,
        flavor: term?.options?.flavor ?? null,
      });
    }
  }

  for (const child of term?.terms ?? []) collectActiveDice(child, out);
  for (const child of term?.dice ?? []) collectActiveDice(child, out);
  return out;
}

function dualityCriticalFallback(message) {
  if (message?.type !== "dualityRoll") return false;

  const rolls = Array.isArray(message?.rolls) ? message.rolls : [];
  for (const roll of rolls) {
    const dice = [];
    for (const term of roll?.terms ?? []) collectActiveDice(term, dice);

    // Daggerheart can change the size of the Duality Dice. A critical is based
    // on matching Hope/Fear results, not on the dice necessarily being d12s.
    const singleResultDice = dice
      .filter((die) => die.values.length === 1)
      .map((die) => die.values[0]);

    if (
      singleResultDice.length >= 2 &&
      singleResultDice[0] === singleResultDice[1]
    ) {
      return true;
    }
  }

  return false;
}

function messageActor(message) {
  const actorId =
    message?.speaker?.actor ??
    getProperty(message, "flags.daggerheart.actorId") ??
    null;
  return actorId ? game.actors.get(actorId) ?? null : null;
}

function isAttackMessage(message) {
  if (explicitAttackFlag(message)) return true;

  const title = String(message?.system?.title ?? "").toLowerCase();
  if (
    title.includes("attack") ||
    title.includes("attaque")
  ) {
    return true;
  }

  const sourceItemId = message?.system?.source?.item ?? null;
  const actor = messageActor(message);
  const sourceItem = sourceItemId && actor
    ? actor.items?.get?.(sourceItemId) ?? null
    : null;

  if (sourceItem?.type === "weapon") return true;

  const sourceActionId = message?.system?.source?.action ?? null;
  if (sourceActionId && sourceItem) {
    const actions = sourceItem?.system?.actions;
    const action =
      actions?.get?.(sourceActionId) ??
      actions?.[sourceActionId] ??
      null;
    if (String(action?.type ?? "").toLowerCase() === "attack") return true;
  }

  const flavor = String(message?.flavor ?? "").toLowerCase();
  const content = String(message?.content ?? "").toLowerCase();
  return (
    flavor.includes("attack") ||
    flavor.includes("attaque") ||
    content.includes("attack roll") ||
    content.includes("jet d’attaque") ||
    content.includes("jet d'attaque")
  );
}


function messageSourceItem(message) {
  const actor = messageActor(message);
  const itemId = message?.system?.source?.item ?? null;
  return actor && itemId ? actor.items?.get?.(itemId) ?? null : null;
}

function isBattleRhythmCalmMessage(message) {
  const sourceItem = messageSourceItem(message);
  if (sourceIdOf(sourceItem) !== BATTLE_RHYTHM_SOURCE_ID) return false;

  const title = String(message?.system?.title ?? "").toLowerCase();
  return (
    title.includes("moment de calme") ||
    title.includes("battle rhythm") ||
    title.includes("rythme de bataille")
  );
}

function isDecisiveStrikeMessage(message) {
  const sourceItem = messageSourceItem(message);
  if (sourceIdOf(sourceItem) !== DECISIVE_STRIKE_SOURCE_ID) return false;

  // Foundryborne emits custom effect Actions as `abilityUse` messages without
  // `system.title`. The authoritative discriminator is therefore the source
  // Item UUID/id carried by system.source.
  if (message?.type === "abilityUse") return true;

  const title = String(message?.system?.title ?? "").toLowerCase();
  return (
    title.includes("frappe décisive") ||
    title.includes("frappe decisive") ||
    title.includes("decisive strike")
  );
}

export function inspectCriticalMessage(message) {
  const actor = messageActor(message);
  const explicitCritical = explicitCriticalFlag(message);
  const fallbackCritical = dualityCriticalFallback(message);
  const attack = isAttackMessage(message);

  const dualityDice = (Array.isArray(message?.rolls) ? message.rolls : [])
    .flatMap((roll) => {
      const dice = [];
      for (const term of roll?.terms ?? []) collectActiveDice(term, dice);
      return dice;
    });

  return {
    messageId: message?.id ?? null,
    actorId: actor?.id ?? null,
    actor: actor?.name ?? null,
    messageType: message?.type ?? null,
    title: message?.system?.title ?? "",
    attack,
    explicitCritical,
    fallbackCritical,
    critical: explicitCritical || fallbackCritical,
    dualityDice,
    artificer: Boolean(actor && isArtificer(actor)),
    battleRhythm: Boolean(actor && hasBattleRhythm(actor)),
  };
}

const processedCriticalMessages = new Set();

export async function handleArtificerCriticalMessage(message) {
  if (!message?.id || processedCriticalMessages.has(message.id)) {
    return { green: true, changed: false, reason: "already-processed-or-no-id" };
  }

  const actor = messageActor(message);
  if (!actor) {
    return { green: true, changed: false, reason: "actor-not-found" };
  }

  if (
    isArtificer(actor) &&
    hasDecisiveStrike(actor) &&
    isDecisiveStrikeMessage(message)
  ) {
    processedCriticalMessages.add(message.id);
    const armed = await armDecisiveStrike(actor);

    if (!armed.green) {
      ui.notifications?.warn?.(
        armed.reason === "no-cob-rounds"
          ? `${actor.name} : aucun Cob Round à dépenser pour Frappe décisive.`
          : `${actor.name} : Frappe décisive n’a pas pu être armée.`
      );
      return {
        green: true,
        changed: false,
        kind: "decisive-strike-arm",
        armed,
      };
    }

    ui.notifications?.info?.(
      `${actor.name} : Frappe décisive armée — ${armed.spent} Cob Round(s), +${armed.spent} à l’attaque, +${armed.spent * 2}d6 dégâts.`
    );

    console.info(`${MODULE_ID} | Decisive Strike armed`, {
      actor: actor.name,
      messageId: message.id,
      armed,
    });

    return {
      green: true,
      changed: armed.changed !== false,
      kind: "decisive-strike-arm",
      armed,
    };
  }

  // Battle Rhythm's calm action is a visible once-per-rest trigger.
  if (
    isArtificer(actor) &&
    hasBattleRhythm(actor) &&
    isBattleRhythmCalmMessage(message)
  ) {
    processedCriticalMessages.add(message.id);
    const resolved = await resolveBattleRhythmCalm(actor);

    ui.notifications?.info?.(
      `${actor.name} : Rythme de bataille — ${resolved.stress.cleared} Stress effacé(s), ${COUNTER_LABEL} +1 (${resolved.resource.value})`
    );

    console.info(`${MODULE_ID} | Battle Rhythm calm -> clear Stress + Cob Rounds`, {
      actor: actor.name,
      messageId: message.id,
      stress: resolved.stress,
      resource: resolved.resource,
    });

    return {
      green: true,
      changed: true,
      kind: "battle-rhythm-calm",
      ...resolved,
    };
  }

  const pendingStrike = decisiveStrikeState(actor);
  if (pendingStrike.armed && isAttackMessage(message)) {
    // The effect has already contributed to this roll/damage preparation.
    // Remove it now so it cannot leak onto a later attack.
    await clearDecisiveStrikeState(actor);

    ui.notifications?.info?.(
      `${actor.name} : Frappe décisive consommée (${pendingStrike.spent} Cob Round(s)).`
    );

    await postDecisiveStrikeDamageChat(actor, pendingStrike.spent);

    console.info(`${MODULE_ID} | Decisive Strike consumed on attack`, {
      actor: actor.name,
      messageId: message.id,
      spent: pendingStrike.spent,
    });

    // Source clause "target cannot take reactions until the start of your next
    // action" stays manual until a reliable success/result + target-duration
    // specimen is validated in Foundryborne.
  }

  const inspection = inspectCriticalMessage(message);
  if (
    !inspection.actorId ||
    !inspection.attack ||
    !inspection.critical ||
    !inspection.artificer ||
    !inspection.battleRhythm
  ) {
    return { green: true, changed: false, inspection };
  }

  // Canonical Battle Rhythm: a critical attack clears 1 Stress. It does NOT
  // generate a Cob Round; Cob Rounds come from the once-per-rest calm action.
  processedCriticalMessages.add(message.id);
  const stress = await clearArtificerStress(actor, 1);

  if (stress.cleared > 0) {
    ui.notifications?.info?.(
      `${actor.name} : Rythme de bataille — 1 Stress effacé`
    );
  }

  console.info(`${MODULE_ID} | Battle Rhythm critical -> clear 1 Stress`, {
    actor: actor.name,
    messageId: message.id,
    stress,
  });

  return {
    green: true,
    changed: stress.cleared > 0,
    kind: "battle-rhythm-critical",
    inspection,
    stress,
  };
}

let hooksInstalled = false;
export function registerArtificerResourceRuntime() {
  if (hooksInstalled) return { green: true, installed: true, duplicate: true };
  hooksInstalled = true;


  Hooks.on("createChatMessage", (message) => {
    void handleArtificerCriticalMessage(message).catch((error) => {
      console.error(`${MODULE_ID} | Artificer critical hook failed`, error);
    });
  });


  Hooks.on("createItem", (item) => {
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return;
    if (
      sourceIdOf(item) === ARTIFICER_CLASS_SOURCE_ID ||
      sourceIdOf(item) === BATTLE_RHYTHM_SOURCE_ID ||
      sourceIdOf(item) === DECISIVE_STRIKE_SOURCE_ID
    ) {
      void ensureArtificerResourceFeature(actor).catch((error) => {
        console.error(`${MODULE_ID} | Artificer resource feature sync failed`, error);
      });
    }
  });

  Hooks.once("ready", () => {
    if (!game.user?.isGM) return;
    for (const actor of game.actors ?? []) {
      if (!isArtificer(actor)) continue;
      void ensureArtificerResourceFeature(actor).catch((error) => {
        console.error(`${MODULE_ID} | Artificer resource bootstrap failed`, actor?.name, error);
      });
    }
  });

  return { green: true, installed: true, duplicate: false };
}

export async function artificerResourceStatus(actor = null) {
  const actors = actor
    ? [actor]
    : [...(game.actors ?? [])].filter((candidate) => isArtificer(candidate));

  const rows = [];
  for (const candidate of actors) {
    const feature = counterFeature(candidate);
    const state = resourceState(candidate);
    rows.push({
      actor: candidate.name,
      artificer: isArtificer(candidate),
      battleRhythm: hasBattleRhythm(candidate),
      feature: feature?.name ?? null,
      value: state.value,
      max: state.max,
      green: Boolean(feature),
    });
  }

  console.table(rows);
  return {
    green: rows.every((row) => row.green),
    actors: rows.length,
    rows,
  };
}

export const artificerResourceApi = Object.freeze({
  key: COUNTER_KEY,
  label: COUNTER_LABEL,
  isArtificer,
  hasBattleRhythm,
  hasDecisiveStrike,
  ensure: ensureArtificerResourceFeature,
  get: resourceState,
  set: setCobRounds,
  gain: gainCobRounds,
  spend: spendCobRounds,
  spendAll: spendAllCobRounds,
  clearStress: clearArtificerStress,
  resolveBattleRhythmCalm,
  armDecisiveStrike,
  clearDecisiveStrike: clearDecisiveStrikeState,
  decisiveStrikeStatus,
  inspectCriticalMessage,
  handleCriticalMessage: handleArtificerCriticalMessage,
  status: artificerResourceStatus,
});
