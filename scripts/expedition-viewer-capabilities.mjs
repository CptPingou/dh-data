function flag(value) {
  return value === true;
}

export function normalizeContainerCapabilities(
  value = {}
) {
  return {
    view: flag(value.view),
    receive: flag(value.receive),
    transfer: flag(value.transfer),
    returnToActor: flag(value.returnToActor),
    consume: flag(value.consume),
    delete: flag(value.delete),
  };
}

export function createViewerCapabilities({
  characterId = null,
  expedition = {},
  containers = {},
  workshop = {},
  research = {},
} = {}) {
  const normalizedContainers = {};

  for (const [
    containerId,
    capabilities,
  ] of Object.entries(containers ?? {})) {
    normalizedContainers[containerId] =
      normalizeContainerCapabilities(
        capabilities
      );
  }

  return {
    schemaVersion: 1,
    kind: "expedition-viewer-capabilities",

    identity: {
      characterId:
        typeof characterId === "string" &&
        characterId.trim()
          ? characterId
          : null,
    },

    expedition: {
      view: flag(expedition.view),
      manage: flag(expedition.manage),
    },

    containers: normalizedContainers,

    workshop: {
      view: flag(workshop.view),
      craft: flag(workshop.craft),
    },

    research: {
      view: flag(research.view),
      discover: flag(research.discover),
      document: flag(research.document),
    },
  };
}

export function containerCapabilityResolver(
  viewerCapabilities
) {
  const containers =
    viewerCapabilities?.containers ?? {};

  return (container) =>
    normalizeContainerCapabilities(
      containers[
        container?.containerId
      ] ?? {}
    );
}
