import {
  createViewerCapabilities,
} from "./expedition-viewer-capabilities.mjs";

import {
  userCanAccessContainer,
  userCanTransferBetweenContainers,
  userOwnsBackpack,
  userCharacterId,
} from "./expedition-inventory-policy.mjs";

function containerCapabilities(
  user,
  container,
  manifest
) {
  const view =
    userCanAccessContainer(
      user,
      container,
      manifest
    );

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

  const manifestContainers =
    (manifest.containers ?? [])
      .filter(
        (container) =>
          container?.containerId
      );

  for (const container of manifestContainers) {
    const capabilities =
      containerCapabilities(
        user,
        container,
        manifest
      );

    if (
      capabilities.view &&
      capabilities.transfer
    ) {
      capabilities.transferTo =
        manifestContainers
          .filter(
            (destination) =>
              destination.containerId !==
                container.containerId &&
              userCanTransferBetweenContainers({
                user,
                manifest,
                source: container,
                destination,
              })
          )
          .map(
            (destination) =>
              destination.containerId
          );
    } else {
      capabilities.transferTo = [];
    }

    containers[container.containerId] =
      capabilities;
  }

  const gm = user.isGM === true;

  return createViewerCapabilities({
    characterId:
      userCharacterId(user, manifest),

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
