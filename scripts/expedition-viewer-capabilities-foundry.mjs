import {
  createViewerCapabilities,
} from "./expedition-viewer-capabilities.mjs";

import {
  userCanAccessContainer,
  userOwnsBackpack,
} from "./expedition-inventory-policy.mjs";

function viewerCharacterId(user, manifest) {
  const actorId = user?.character?.id ?? null;

  if (!actorId) return null;

  const character =
    (manifest?.characters ?? []).find(
      (candidate) =>
        candidate?.foundryActorUuid ===
          `Actor.${actorId}` ||
        candidate?.actorUuid ===
          `Actor.${actorId}` ||
        candidate?.characterId === actorId
    );

  return character?.characterId ?? actorId;
}

function containerCapabilities(
  user,
  container
) {
  const view =
    userCanAccessContainer(user, container);

  if (!view) {
    return { view: false };
  }

  const gm = user?.isGM === true;

  const ownBackpack =
    container?.type === "backpack" &&
    userOwnsBackpack(user, container);

  const shared =
    container?.type !== "backpack";

  return {
    view: true,

    receive:
      gm ||
      ownBackpack ||
      shared,

    transfer:
      gm ||
      ownBackpack ||
      shared,

    returnToActor:
      gm ||
      ownBackpack,

    consume:
      gm ||
      ownBackpack,

    delete:
      gm,
  };
}

export function createFoundryViewerCapabilities({
  user,
  manifest,
} = {}) {
  if (!user) {
    throw new Error(
      "Foundry viewer capabilities require user."
    );
  }

  if (!manifest?.expeditionId) {
    throw new Error(
      "Foundry viewer capabilities require manifest."
    );
  }

  const containers = {};

  for (const container of manifest.containers ?? []) {
    if (!container?.containerId) continue;

    containers[container.containerId] =
      containerCapabilities(
        user,
        container
      );
  }

  const gm = user.isGM === true;

  return createViewerCapabilities({
    characterId:
      viewerCharacterId(user, manifest),

    expedition: {
      view: true,
      manage: gm,
    },

    containers,

    workshop: {
      view: true,
      craft: true,
    },

    research: {
      view: true,
      discover: true,
      document: gm,
    },
  });
}
