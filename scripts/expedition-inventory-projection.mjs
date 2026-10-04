import {
  containerStorageCapacity,
  resolveEffectiveStorageProfile,
} from "./expedition-storage.mjs";

const clone = (value) =>
  value == null
    ? value
    : globalThis.structuredClone
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

function activeEntries(container) {
  return (container?.contents ?? []).filter((entry) => {
    const state =
      entry?.itemRef?.lifecycle?.state ?? "legacy";

    return !["consumed", "deleted"].includes(state);
  });
}

function projectEntry(entry) {
  const ref = entry?.itemRef ?? {};
  const lifecycle = ref.lifecycle?.state ?? "legacy";

  const material =
    ref.snapshot?.flags?.[
      "daggerheart-campaign-toolkit"
    ]?.material ?? null;

  return {
    entryId: entry?.entryId ?? null,
    quantity: Math.max(0, Number(entry?.quantity) || 0),

    item: {
      sourceId: ref.sourceId ?? null,
      kind: ref.kind ?? null,
      type: ref.type ?? null,
      name: ref.name ?? ref.sourceId ?? "Objet",
      img: ref.img ?? null,
      materialId:
        material?.materialId ?? null,
      lifecycle,
    },
  };
}

function normalizeCapabilities(value = {}) {
  const transferTo = [
    ...new Set(
      (Array.isArray(value.transferTo)
        ? value.transferTo
        : [])
        .map((containerId) =>
          String(containerId ?? "").trim()
        )
        .filter(Boolean)
    ),
  ];

  return {
    view: value.view === true,
    receive: value.receive === true,
    transfer: value.transfer === true,
    transferTo,
    returnToActor: value.returnToActor === true,
    consume: value.consume === true,
    delete: value.delete === true,
  };
}

export function projectInventoryContainer(
  container,
  {
    capabilities = {},
    role = null,
  } = {}
) {
  if (!container?.containerId) {
    throw new Error(
      "Inventory projection requires container.containerId."
    );
  }

  const resolvedCapabilities =
    normalizeCapabilities(capabilities);

  if (!resolvedCapabilities.view) {
    return null;
  }

  const capacity =
    containerStorageCapacity(container, {
      resolveStorage: resolveEffectiveStorageProfile,
    });

  return {
    containerId: container.containerId,
    type: container.type ?? null,
    name: container.name ?? container.containerId,
    scope: container.scope ?? null,

    holder: {
      kind: container.holderRef?.kind ?? null,
      id: container.holderRef?.id ?? null,
    },

    role:
      typeof role === "string" &&
      role.trim()
        ? role.trim()
        : null,

    accessState:
      container.presentation?.accessState === "stored"
        ? "stored"
        : "available",

    capacity: {
      slots: capacity.slots,
      used: capacity.used,
      free: capacity.free,
    },

    storageProfile:
      container.storageProfile
        ? clone(container.storageProfile)
        : null,

    materialStorage:
      container.materialStorage
        ? clone(container.materialStorage)
        : null,

    rules: clone(container.rules ?? []),

    entries: activeEntries(container)
      .map(projectEntry),

    capabilities: resolvedCapabilities,
  };
}

export function projectExpeditionInventory({
  manifest,
  capabilityResolver,
  roleResolver = null,
  logisticsPhase = null,
} = {}) {
  if (!manifest?.expeditionId) {
    throw new Error(
      "Inventory projection requires manifest.expeditionId."
    );
  }

  if (typeof capabilityResolver !== "function") {
    throw new Error(
      "Inventory projection requires capabilityResolver."
    );
  }

  const containers = [];

  for (const container of manifest.containers ?? []) {
    const capabilities =
      capabilityResolver(container) ?? {};

    const projected =
      projectInventoryContainer(container, {
        capabilities,
        role:
          typeof roleResolver === "function"
            ? roleResolver(container)
            : null,
      });

    if (projected) {
      containers.push(projected);
    }
  }

  return {
    schemaVersion: 1,
    kind: "expedition-inventory-projection",

    expeditionId: manifest.expeditionId,
    logisticsPhase:
      typeof logisticsPhase === "string" &&
      logisticsPhase.trim()
        ? logisticsPhase.trim()
        : null,
    revision: Math.max(
      0,
      Number(manifest.revision) || 0
    ),
    phase: manifest.phase ?? null,
    authority: manifest.authority ?? null,

    containers,
  };
}
