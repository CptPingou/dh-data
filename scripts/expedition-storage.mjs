const positiveInteger = (value, fallback = 1) => {
  const number = Math.floor(Number(value));
  return Number.isInteger(number) && number > 0
    ? number
    : fallback;
};

export function normalizeStorageProfile(storage = {}) {
  const stackable = storage?.stackable !== false;

  return {
    slotCost: positiveInteger(storage?.slotCost, 1),
    stackable,
    stackLimit: stackable
      ? positiveInteger(storage?.stackLimit, 1)
      : 1,
  };
}

export function resolveEntryStorageProfile(entry) {
  const toolkitFlags =
    entry?.itemRef?.snapshot?.flags?.["daggerheart-campaign-toolkit"];

  const explicit =
    toolkitFlags?.storage ??
    entry?.itemRef?.storage ??
    null;

  if (explicit && typeof explicit === "object") {
    return normalizeStorageProfile(explicit);
  }

  // Compatibility: one existing legacy entry consumes one abstract slot.
  return {
    slotCost: 1,
    stackable: true,
    stackLimit: Math.max(
      1,
      Math.floor(Number(entry?.quantity) || 1)
    ),
  };
}

export function storageStackCount(quantity, storage = {}) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty === 0) return 0;

  const profile = normalizeStorageProfile(storage);

  if (!profile.stackable) return qty;

  return Math.ceil(qty / profile.stackLimit);
}

export function storageSlotCost(quantity, storage = {}) {
  const profile = normalizeStorageProfile(storage);

  return (
    storageStackCount(quantity, profile) *
    profile.slotCost
  );
}

export function containerUsedSlots(
  container,
  {
    resolveStorage = () => null,
  } = {}
) {
  let used = 0;

  for (const entry of container?.contents ?? []) {
    const lifecycle =
      entry?.itemRef?.lifecycle?.state ?? "legacy";

    if (
      lifecycle === "consumed" ||
      lifecycle === "deleted"
    ) {
      continue;
    }

    const quantity =
      Math.max(0, Math.floor(Number(entry?.quantity) || 0));

    if (quantity === 0) continue;

    const storage =
      resolveStorage(entry) ?? {};

    used += storageSlotCost(quantity, storage);
  }

  return used;
}

export function containerStorageCapacity(
  container,
  options = {}
) {
  const slots =
    Math.max(
      0,
      Math.floor(Number(container?.capacity?.slots) || 0)
    );

  const used =
    containerUsedSlots(container, options);

  return {
    slots,
    used,
    free: Math.max(0, slots - used),
    overflow: Math.max(0, used - slots),
    fits: used <= slots,
  };
}

export const expeditionStorageApi = Object.freeze({
  version: 1,
  normalizeProfile: normalizeStorageProfile,
  resolveEntryProfile: resolveEntryStorageProfile,
  stackCount: storageStackCount,
  slotCost: storageSlotCost,
  usedSlots: containerUsedSlots,
  capacity: containerStorageCapacity,
});
