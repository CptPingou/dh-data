import { serializedActions } from "./artillery-automation.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = "daggerheart-campaign-toolkit";

function artillerySourceId(item) {
  const sourceId = item?.flags?.[FLAG_SCOPE]?.sourceId;
  return typeof sourceId === "string" &&
    sourceId.startsWith("homebrew.artificer.domain-card.artillery.")
    ? sourceId
    : null;
}

function actionSyncKey(action) {
  return [
    String(action?.name ?? "").trim().toLowerCase(),
    String(action?.type ?? "").trim().toLowerCase(),
  ].join("::");
}

function preserveOwnedActionUseValues(sourceActions, ownedActions) {
  const source = foundry.utils.deepClone(sourceActions ?? {});
  const ownedByKey = new Map();

  for (const action of serializedActions(ownedActions)) {
    const key = actionSyncKey(action);
    if (!key || key === "::") continue;
    ownedByKey.set(key, action);
  }

  const apply = (action) => {
    const previous = ownedByKey.get(actionSyncKey(action));
    if (
      previous?.uses &&
      action?.uses &&
      previous.uses.value !== undefined &&
      previous.uses.value !== null
    ) {
      action.uses.value = previous.uses.value;
    }
    return action;
  };

  if (Array.isArray(source)) return source.map(apply);

  if (source && typeof source === "object") {
    for (const [key, action] of Object.entries(source)) {
      source[key] = apply(action);
    }
  }

  return source;
}

function ownedArtilleryCardUpdateData(sourceDoc, ownedDoc) {
  const source = sourceDoc.toObject();
  const owned = ownedDoc.toObject();
  const sourceSystem = foundry.utils.deepClone(source.system ?? {});
  const ownedSystem = owned.system ?? {};

  // Runtime/session state belongs to the Actor copy, not the compendium.
  // Keep current use counters while accepting source max/recovery/action data.
  if ("actions" in sourceSystem) {
    sourceSystem.actions = preserveOwnedActionUseValues(
      sourceSystem.actions,
      ownedSystem.actions
    );
  }

  // If a future Artillery card gains a native resource, keep only its current
  // value while still syncing the source schema/max.
  if (
    sourceSystem.resource &&
    ownedSystem.resource &&
    ownedSystem.resource.value !== undefined
  ) {
    sourceSystem.resource.value = ownedSystem.resource.value;
  }

  // Preserve known sheet-placement/runtime selectors when present on the Actor
  // copy. They are character state rather than canonical card definition.
  for (const key of [
    "inVault",
    "vault",
    "loadout",
    "equipped",
    "active",
    "selected",
    "prepared",
  ]) {
    if (Object.prototype.hasOwnProperty.call(ownedSystem, key)) {
      sourceSystem[key] = foundry.utils.deepClone(ownedSystem[key]);
    }
  }

  return {
    name: source.name,
    img: source.img,
    system: sourceSystem,
    [`flags.${FLAG_SCOPE}`]: foundry.utils.deepClone(
      source.flags?.[FLAG_SCOPE] ?? {}
    ),
  };
}

async function replaceOwnedCardEffects(sourceDoc, ownedDoc) {
  const currentIds = [...(ownedDoc.effects ?? [])].map((effect) => effect.id);
  if (currentIds.length) {
    await ownedDoc.deleteEmbeddedDocuments("ActiveEffect", currentIds);
  }

  const sourceEffects = (sourceDoc.toObject().effects ?? []).map((effect) => {
    const clone = foundry.utils.deepClone(effect);
    delete clone._stats;
    return clone;
  });

  if (sourceEffects.length) {
    await ownedDoc.createEmbeddedDocuments(
      "ActiveEffect",
      sourceEffects,
      { keepId: true }
    );
  }

  return sourceEffects.length;
}

export async function syncOwnedArtilleryCards({ cards = null } = {}) {
  if (!game.user?.isGM) {
    throw new Error("La synchronisation des cartes Artillery possÃ©dÃ©es est rÃ©servÃ©e au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

  const sourceDocs = Array.isArray(cards) && cards.length
    ? cards
    : await pack.getDocuments();

  const sourceById = new Map();
  for (const sourceDoc of sourceDocs) {
    const sourceId = artillerySourceId(sourceDoc);
    if (sourceId) sourceById.set(sourceId, sourceDoc);
  }

  const rows = [];
  let actorsScanned = 0;
  let cardsFound = 0;
  let cardsUpdated = 0;
  let effectsReplaced = 0;

  for (const actor of game.actors ?? []) {
    actorsScanned += 1;

    for (const ownedDoc of actor.items ?? []) {
      const sourceId = artillerySourceId(ownedDoc);
      if (!sourceId) continue;

      cardsFound += 1;
      const sourceDoc = sourceById.get(sourceId);
      if (!sourceDoc) {
        rows.push({
          actor: actor.name,
          item: ownedDoc.name,
          sourceId,
          green: false,
          reason: "source-card-missing",
        });
        continue;
      }

      const updateData = ownedArtilleryCardUpdateData(sourceDoc, ownedDoc);
      await ownedDoc.update(updateData);
      const effectCount = await replaceOwnedCardEffects(sourceDoc, ownedDoc);

      cardsUpdated += 1;
      effectsReplaced += effectCount;
      rows.push({
        actor: actor.name,
        item: ownedDoc.name,
        sourceId,
        green: true,
        effects: effectCount,
      });
    }
  }

  const missing = rows.filter((row) => !row.green);
  const result = {
    green: missing.length === 0,
    actorsScanned,
    cardsFound,
    cardsUpdated,
    effectsReplaced,
    missing,
    rows,
  };

  console.info(`${MODULE_ID} | owned Artillery cards sync`, result);

  if (result.green) {
    ui.notifications?.info?.(
      `Campaign Toolkit : ${cardsUpdated} carte(s) Artillery possÃ©dÃ©e(s) synchronisÃ©e(s).`
    );
  } else {
    ui.notifications?.warn?.(
      `Campaign Toolkit : synchronisation Artillery partielle (${missing.length} source(s) manquante(s)).`
    );
  }

  return result;
}


