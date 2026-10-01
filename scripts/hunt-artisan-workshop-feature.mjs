import {
  HUNT_ARTISAN_CARD_SOURCE_ID,
  hasHuntArtisanCard,
} from "./weapon-augment-workshop.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FEATURE_PACK = `${MODULE_ID}.dh-features`;
export const HUNT_ARTISAN_WORKSHOP_FEATURE_ID = "MHARTWORKSHOP001";
export const HUNT_ARTISAN_WORKSHOP_FEATURE_SOURCE_ID =
  "monster-hunter.hunt.feature.weapon-workshop";
const CHAT_BUTTON_CLASS = "dct-hunt-workshop-chat-button";

function sourceIdOf(item) {
  const flags = item?.flags?.[MODULE_ID] ?? {};
  return flags.canonicalSourceId ?? flags.sourceId ?? null;
}

export function isHuntArtisanWorkshopFeature(item) {
  if (!item || item.type !== "feature") return false;
  return (
    sourceIdOf(item) === HUNT_ARTISAN_WORKSHOP_FEATURE_SOURCE_ID ||
    (item.id ?? item._id) === HUNT_ARTISAN_WORKSHOP_FEATURE_ID
  );
}

function embeddedWorkshopFeatures(actor) {
  return actor?.items?.filter?.((item) => isHuntArtisanWorkshopFeature(item)) ?? [];
}

async function featureSource() {
  const pack = game.packs.get(FEATURE_PACK);
  if (!pack) throw new Error(`Pack indisponible : ${FEATURE_PACK}`);

  const doc = await pack.getDocument(HUNT_ARTISAN_WORKSHOP_FEATURE_ID);
  if (!doc) {
    throw new Error(
      `Feature Atelier absente du compendium (${HUNT_ARTISAN_WORKSHOP_FEATURE_ID}).`,
    );
  }

  const source = doc.toObject();
  delete source._id;
  return source;
}

function sourceActionsOf(source) {
  const actions = source?.system?.actions;
  return actions && typeof actions === "object"
    ? foundry.utils.deepClone(actions)
    : {};
}

async function applyFeatureSource(item, source) {
  const update = foundry.utils.deepClone(source);
  delete update._id;
  delete update.type;

  const actions = sourceActionsOf(update);
  update.system ??= {};
  update.system.actions = {};

  await item.update(update);
  if (Object.keys(actions).length > 0) {
    await item.update({ "system.actions": actions });
  }

  return item;
}

function featureNeedsRefresh(item, source) {
  const flags = item?.flags?.[MODULE_ID] ?? {};
  const actions = item?.system?.actions;
  const actionCount = Number(actions?.size ?? Object.keys(actions ?? {}).length ?? 0);
  return !(
    actionCount === 0 &&
    flags.sourceId === HUNT_ARTISAN_WORKSHOP_FEATURE_SOURCE_ID &&
    item.name === source?.name &&
    item.img === source?.img &&
    item.system?.description === source?.system?.description
  );
}

function actorFromWorkshopMessage(message) {
  const origin = message?.system?.origin ?? message?._source?.system?.origin ?? null;
  if (!origin) return null;

  const item = globalThis.fromUuidSync?.(origin) ?? null;
  if (!isHuntArtisanWorkshopFeature(item)) return null;

  const actor = item?.parent;
  if (actor?.documentName !== "Actor" || actor.type !== "character") return null;
  if (!hasHuntArtisanCard(actor)) return null;
  if (!(actor.isOwner || game.user?.isGM)) return null;
  return actor;
}

async function openWorkshop(actor, button = null) {
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api?.weaponAugmentWorkshop?.open) {
    ui.notifications?.error("Atelier d’armes de chasse indisponible.");
    return;
  }

  if (button) button.disabled = true;
  try {
    await api.weaponAugmentWorkshop.open(actor);
  } catch (error) {
    console.error(`${MODULE_ID} | workshop feature chat action failed`, error);
    ui.notifications?.error(
      `Atelier d’armes de chasse : ${error?.message ?? "erreur inconnue"}`,
    );
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function renderWorkshopChatButton(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!(root instanceof HTMLElement)) return;
  if (root.querySelector(`.${CHAT_BUTTON_CLASS}`)) return;

  const actor = actorFromWorkshopMessage(message);
  if (!actor) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = CHAT_BUTTON_CLASS;
  button.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> Atelier d’armes de chasse';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openWorkshop(actor, button);
  });

  const footer = root.querySelector(".ability-card-footer")
    ?? root.querySelector("footer")
    ?? root.querySelector(".message-content")
    ?? root;
  footer.append(button);
}

export function huntArtisanWorkshopFeatureStatus(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
    return { green: false, reason: "actor-not-character", shouldHave: false, count: 0 };
  }

  const shouldHave = hasHuntArtisanCard(actor);
  const features = embeddedWorkshopFeatures(actor);
  return {
    green: features.length === (shouldHave ? 1 : 0),
    reason: "ok",
    shouldHave,
    count: features.length,
    featureIds: features.map((item) => item.id),
  };
}

export async function reconcileHuntArtisanWorkshopFeature(actor) {
  if (!game.user?.isGM) {
    return { green: false, reason: "gm-only", changed: false };
  }

  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
    return { green: false, reason: "actor-not-character", changed: false };
  }

  const shouldHave = hasHuntArtisanCard(actor);
  const existing = embeddedWorkshopFeatures(actor);

  if (!shouldHave) {
    if (!existing.length) {
      return { green: true, reason: "absent-as-expected", changed: false };
    }

    await actor.deleteEmbeddedDocuments(
      "Item",
      existing.map((item) => item.id),
    );

    return {
      green: true,
      reason: "removed-without-artisan",
      changed: true,
      removed: existing.length,
    };
  }

  if (existing.length === 1) {
    const source = await featureSource();
    if (featureNeedsRefresh(existing[0], source)) {
      await applyFeatureSource(existing[0], source);
      return {
        green: true,
        reason: "refreshed-from-source",
        changed: true,
        featureId: existing[0].id,
      };
    }

    return {
      green: true,
      reason: "already-present",
      changed: false,
      featureId: existing[0].id,
    };
  }

  if (existing.length > 1) {
    await actor.deleteEmbeddedDocuments(
      "Item",
      existing.slice(1).map((item) => item.id),
    );
    return {
      green: true,
      reason: "deduplicated",
      changed: true,
      featureId: existing[0].id,
      removed: existing.length - 1,
    };
  }

  const source = await featureSource();
  const createSource = foundry.utils.deepClone(source);
  const actions = sourceActionsOf(createSource);
  createSource.system ??= {};
  createSource.system.actions = {};

  const created = await actor.createEmbeddedDocuments("Item", [createSource]);
  const feature = created?.[0] ?? null;
  if (feature && Object.keys(actions).length > 0) {
    await feature.update({ "system.actions": actions });
  }

  return {
    green: Boolean(feature),
    reason: feature ? "created" : "create-failed",
    changed: Boolean(feature),
    featureId: feature?.id ?? null,
  };
}

export async function reconcileAllHuntArtisanWorkshopFeatures() {
  if (!game.user?.isGM) {
    return { green: false, reason: "gm-only", changed: 0, checked: 0 };
  }

  let changed = 0;
  let checked = 0;
  const errors = [];

  for (const actor of game.actors ?? []) {
    if (actor?.type !== "character") continue;
    checked += 1;
    try {
      const result = await reconcileHuntArtisanWorkshopFeature(actor);
      if (result.changed) changed += 1;
    } catch (error) {
      errors.push({ actorId: actor.id, actorName: actor.name, error: error.message });
    }
  }

  return { green: errors.length === 0, checked, changed, errors };
}

function relevantEmbeddedItem(item) {
  if (item?.parent?.documentName !== "Actor") return false;
  if (item.parent.type !== "character") return false;
  return (
    sourceIdOf(item) === HUNT_ARTISAN_CARD_SOURCE_ID ||
    isHuntArtisanWorkshopFeature(item)
  );
}

export function registerHuntArtisanWorkshopFeatureRuntime() {
  Hooks.once("ready", async () => {
    if (!game.user?.isGM) return;
    const result = await reconcileAllHuntArtisanWorkshopFeatures();
    console.info(`${MODULE_ID} | Hunt Artisant workshop feature`, result);
  });

  const reconcileParent = async (item) => {
    if (!game.user?.isGM || !relevantEmbeddedItem(item)) return;
    // Defer until the actor's embedded collection reflects the mutation.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await reconcileHuntArtisanWorkshopFeature(item.parent);
  };

  Hooks.on("createItem", (item) => { void reconcileParent(item); });
  Hooks.on("deleteItem", (item) => { void reconcileParent(item); });
  Hooks.on("renderChatMessageHTML", renderWorkshopChatButton);

  return Object.freeze({
    green: true,
    hooks: ["ready", "createItem", "deleteItem", "renderChatMessageHTML"],
  });
}

export const huntArtisanWorkshopFeatureApi = Object.freeze({
  featureId: HUNT_ARTISAN_WORKSHOP_FEATURE_ID,
  featureSourceId: HUNT_ARTISAN_WORKSHOP_FEATURE_SOURCE_ID,
  isFeature: isHuntArtisanWorkshopFeature,
  status: huntArtisanWorkshopFeatureStatus,
  reconcile: reconcileHuntArtisanWorkshopFeature,
  reconcileAll: reconcileAllHuntArtisanWorkshopFeatures,
  register: registerHuntArtisanWorkshopFeatureRuntime,
});
