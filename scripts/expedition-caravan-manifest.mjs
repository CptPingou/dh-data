import {
  normalizeExpeditionManifest,
  validateExpeditionManifest,
} from "./expedition-manifest.mjs";

import {
  caravanEquipmentDefinition,
  createCaravanEquipmentComponent,
  installCaravanComponentInSlot,
  removeCaravanComponentFromSlot,
} from "./expedition-caravan-equipment.mjs";

const clone = (value) =>
  value == null
    ? value
    : (
        globalThis.structuredClone
          ? structuredClone(value)
          : JSON.parse(
              JSON.stringify(value)
            )
      );

function nonEmpty(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function positiveInteger(
  value
) {
  return (
    Number.isInteger(value) &&
    value > 0
  );
}

function assertManifestGreen(
  manifest,
  context
) {
  const validation =
    validateExpeditionManifest(
      manifest
    );

  if (!validation.green) {
    throw new Error(
      context +
      ": " +
      validation.errors.join(
        "; "
      )
    );
  }
}

function containerIdForComponent(
  componentId
) {
  return (
    "caravan-" +
    componentId
  );
}

function activeContainerContents(
  container
) {
  return (
    container?.contents ?? []
  ).filter(
    (entry) =>
      Number(entry?.quantity) > 0
  );
}

export function installCaravanEquipmentInManifest(
  manifest,
  {
    slotId,
    definitionId,
    componentId,
    componentName = null,

    containerId = null,
    capacitySlots = null,

    storageProfile = null,
  } = {}
) {
  const definition =
    caravanEquipmentDefinition(
      definitionId
    );

  if (!definition) {
    throw new Error(
      "Unknown caravan equipment definition " +
      String(definitionId)
    );
  }

  if (!nonEmpty(slotId)) {
    throw new Error(
      "slotId is required"
    );
  }

  if (!nonEmpty(componentId)) {
    throw new Error(
      "componentId is required"
    );
  }

  const original =
    normalizeExpeditionManifest(
      manifest
    );

  assertManifestGreen(
    original,
    "Source manifest is invalid"
  );

  const next =
    clone(original);

  const resolvedContainerId =
    definition.storage
      ? (
          nonEmpty(containerId)
            ? containerId.trim()
            : containerIdForComponent(
                componentId.trim()
              )
        )
      : null;

  if (
    definition.storage &&
    !positiveInteger(
      capacitySlots
    )
  ) {
    throw new Error(
      "Storage caravan equipment requires capacitySlots > 0"
    );
  }

  if (
    resolvedContainerId &&
    (next.containers ?? []).some(
      (container) =>
        container.containerId ===
        resolvedContainerId
    )
  ) {
    throw new Error(
      "Caravan equipment container id already exists " +
      resolvedContainerId
    );
  }

  const component =
    createCaravanEquipmentComponent(
      definitionId,
      {
        componentId:
          componentId.trim(),

        name:
          componentName,

        containerId:
          resolvedContainerId,
      }
    );

  const installed =
    installCaravanComponentInSlot(
      next.caravan,
      {
        slotId:
          slotId.trim(),

        component,
      }
    );

  next.caravan =
    installed.caravan;

  let container = null;

  if (definition.storage) {
    container = {
      containerId:
        resolvedContainerId,

      type:
        "caravan",

      name:
        component.name,

      scope:
        "expedition",

      holderRef: {
        kind:
          "expedition",

        id:
          next.expeditionId,
      },

      capacity: {
        slots:
          capacitySlots,
      },

      storageProfile:
        storageProfile &&
        typeof storageProfile ===
          "object" &&
        !Array.isArray(
          storageProfile
        )
          ? clone(
              storageProfile
            )
          : {
              accepts: [],
              mergeStacks: true,
            },

      presentation: {
        playerRole:
          "caravan",

        playerAccess:
          true,
      },

      rules: [],
      contents: [],
    };

    next.containers.push(
      container
    );
  }

  next.revision =
    Math.max(
      1,
      Number(next.revision) || 1
    ) + 1;

  assertManifestGreen(
    next,
    "Installed caravan equipment produced invalid manifest"
  );

  return {
    changed: true,

    manifest:
      next,

    slotId:
      slotId.trim(),

    component:
      clone(component),

    container:
      clone(container),
  };
}

export function removeCaravanEquipmentFromManifest(
  manifest,
  {
    slotId,
  } = {}
) {
  if (!nonEmpty(slotId)) {
    throw new Error(
      "slotId is required"
    );
  }

  const original =
    normalizeExpeditionManifest(
      manifest
    );

  assertManifestGreen(
    original,
    "Source manifest is invalid"
  );

  const slot =
    (original.caravan
      ?.cargoSlots ?? [])
      .find(
        (candidate) =>
          candidate.id ===
          slotId.trim()
      ) ?? null;

  if (!slot) {
    throw new Error(
      "Unknown caravan cargo slot " +
      slotId
    );
  }

  if (!slot.componentId) {
    return {
      changed: false,

      reason:
        "cargo-slot-empty",

      manifest:
        original,

      component:
        null,

      container:
        null,
    };
  }

  const component =
    (original.caravan
      ?.components ?? [])
      .find(
        (candidate) =>
          candidate.id ===
          slot.componentId
      ) ?? null;

  if (!component) {
    throw new Error(
      "Cargo slot " +
      slot.id +
      " references unknown component " +
      slot.componentId
    );
  }

  const container =
    component.containerId
      ? (
          original.containers
            .find(
              (candidate) =>
                candidate.containerId ===
                component.containerId
            ) ?? null
        )
      : null;

  if (
    component.containerId &&
    !container
  ) {
    throw new Error(
      "Caravan component " +
      component.id +
      " references unknown container " +
      component.containerId
    );
  }

  const contents =
    activeContainerContents(
      container
    );

  if (contents.length) {
    return {
      changed: false,

      reason:
        "container-not-empty",

      manifest:
        original,

      component:
        clone(component),

      container:
        clone(container),

      entryCount:
        contents.length,
    };
  }

  const next =
    clone(original);

  const removed =
    removeCaravanComponentFromSlot(
      next.caravan,
      {
        slotId:
          slotId.trim(),
      }
    );

  if (!removed.changed) {
    return {
      ...removed,
      manifest:
        original,
    };
  }

  next.caravan =
    removed.caravan;

  if (component.containerId) {
    next.containers =
      next.containers.filter(
        (candidate) =>
          candidate.containerId !==
          component.containerId
      );
  }

  next.revision =
    Math.max(
      1,
      Number(next.revision) || 1
    ) + 1;

  assertManifestGreen(
    next,
    "Removed caravan equipment produced invalid manifest"
  );

  return {
    changed: true,

    reason: null,

    manifest:
      next,

    slotId:
      slotId.trim(),

    component:
      clone(component),

    container:
      clone(container),
  };
}

export function caravanInstalledContainerIds(
  manifest
) {
  return [
    ...new Set(
      (
        manifest?.caravan
          ?.components ?? []
      )
        .map(
          (component) =>
            typeof component
              ?.containerId ===
              "string"
              ? component.containerId.trim()
              : ""
        )
        .filter(Boolean)
    ),
  ];
}

export function isInstalledCaravanContainer(
  manifest,
  container
) {
  const id =
    typeof container
      ?.containerId ===
      "string"
      ? container.containerId.trim()
      : "";

  if (!id) {
    return false;
  }

  return caravanInstalledContainerIds(
    manifest
  ).includes(id);
}

export const expeditionCaravanManifest = {
  install:
    installCaravanEquipmentInManifest,

  remove:
    removeCaravanEquipmentFromManifest,

  installedContainerIds:
    caravanInstalledContainerIds,

  isInstalledContainer:
    isInstalledCaravanContainer,
};
