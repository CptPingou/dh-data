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

function usedSlots(container) {
  const contents = activeEntries(container);

  const slotted = new Set(
    contents
      .map((entry) => entry?.slotId)
      .filter(Boolean)
  );

  return slotted.size || contents.length;
}

function projectEntry(entry) {
  const ref = entry?.itemRef ?? {};
  const lifecycle = ref.lifecycle?.state ?? "legacy";

  return {
    entryId: entry?.entryId ?? null,
    slotId: entry?.slotId ?? null,
    quantity: Math.max(0, Number(entry?.quantity) || 0),

    item: {
      sourceId: ref.sourceId ?? null,
      kind: ref.kind ?? null,
      type: ref.type ?? null,
      name: ref.name ?? ref.sourceId ?? "Objet",
      img: ref.img ?? null,
      lifecycle,
    },
  };
}

function normalizeCapabilities(value = {}) {
  return {
    view: value.view === true,
    receive: value.receive === true,
    transfer: value.transfer === true,
    returnToActor: value.returnToActor === true,
    consume: value.consume === true,
    delete: value.delete === true,
  };
}

export function projectInventoryContainer(
  container,
  {
    capabilities = {},
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
    Math.max(0, Number(container.capacity?.slots) || 0);

  const used = usedSlots(container);

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
      container.presentation?.playerRole ??
      null,

    accessState:
      container.presentation?.accessState === "stored"
        ? "stored"
        : "available",

    capacity: {
      slots: capacity,
      used,
      free: Math.max(0, capacity - used),
    },

    layout: {
      slots: (container.layout?.slots ?? []).map(
        (slot) => ({
          slotId: slot?.slotId ?? null,
          label: slot?.label ?? null,
        })
      ),
    },

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
      });

    if (projected) {
      containers.push(projected);
    }
  }

  return {
    schemaVersion: 1,
    kind: "expedition-inventory-projection",

    expeditionId: manifest.expeditionId,
    revision: Math.max(
      0,
      Number(manifest.revision) || 0
    ),
    phase: manifest.phase ?? null,
    authority: manifest.authority ?? null,

    containers,
  };
}
