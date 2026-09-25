export const EXPEDITION_ITEM_LIFECYCLE_VERSION = 1;

export const EXPEDITION_ITEM_STATES = Object.freeze([
  "active",
  "consumed",
  "modified",
  "deleted",
  "legacy",
]);

const VALID_STATES = new Set(EXPEDITION_ITEM_STATES);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeExpeditionItemState(itemRef) {
  const state = itemRef?.lifecycle?.state;
  return VALID_STATES.has(state) ? state : "legacy";
}

export function expeditionItemLifecycleStatus(entry) {
  const itemRef = entry?.itemRef ?? null;
  const state = normalizeExpeditionItemState(itemRef);

  return {
    state,
    version:
      Number.isInteger(itemRef?.lifecycle?.version)
        ? itemRef.lifecycle.version
        : null,
    revision:
      Number.isInteger(itemRef?.lifecycle?.revision)
        ? itemRef.lifecycle.revision
        : null,
    note: nonEmpty(itemRef?.lifecycle?.note)
      ? itemRef.lifecycle.note
      : null,
    legacy: state === "legacy",
    terminal: state === "consumed" || state === "deleted",
    usable: state !== "consumed" && state !== "deleted",
    historyEntries: Array.isArray(itemRef?.lifecycle?.history)
      ? itemRef.lifecycle.history.length
      : 0,
  };
}

export function createActiveItemLifecycle() {
  return {
    version: EXPEDITION_ITEM_LIFECYCLE_VERSION,
    state: "active",
    revision: 1,
  };
}

export function setExpeditionItemLifecycle(entry, state, {
  note = null,
} = {}) {
  if (!entry?.itemRef || typeof entry.itemRef !== "object") {
    return {
      changed: false,
      reason: "entry-item-ref-not-found",
      entry,
    };
  }

  if (!VALID_STATES.has(state)) {
    return {
      changed: false,
      reason: "invalid-item-lifecycle-state",
      entry,
    };
  }

  const previous = expeditionItemLifecycleStatus(entry);
  const previousRevision =
    Number.isInteger(entry.itemRef?.lifecycle?.revision)
      ? entry.itemRef.lifecycle.revision
      : 0;

  entry.itemRef.lifecycle = {
    version: EXPEDITION_ITEM_LIFECYCLE_VERSION,
    state,
    revision: previousRevision + 1,
    ...(nonEmpty(note) ? { note } : {}),
  };

  return {
    changed:
      previous.state !== state ||
      previous.note !== (nonEmpty(note) ? note : null),
    previous,
    current: expeditionItemLifecycleStatus(entry),
    entry,
  };
}

export function migrateLegacyExpeditionItem(entry, {
  note = "Entrée legacy adoptée par le lifecycle v1",
} = {}) {
  const status = expeditionItemLifecycleStatus(entry);

  if (!status.legacy) {
    return {
      changed: false,
      previous: status,
      current: status,
      entry,
    };
  }

  return setExpeditionItemLifecycle(entry, "active", { note });
}

export function scanExpeditionItemLifecycle(manifest) {
  const entries = [];

  for (const container of manifest?.containers ?? []) {
    for (const entry of container?.contents ?? []) {
      entries.push({
        containerId: container.containerId ?? null,
        containerName: container.name ?? null,
        entryId: entry.entryId ?? null,
        itemName: entry.itemRef?.name ?? null,
        quantity: entry.quantity ?? null,
        ...expeditionItemLifecycleStatus(entry),
      });
    }
  }

  const counts = Object.fromEntries(
    EXPEDITION_ITEM_STATES.map((state) => [state, 0])
  );

  for (const entry of entries) {
    counts[entry.state] = (counts[entry.state] ?? 0) + 1;
  }

  return {
    green: true,
    version: EXPEDITION_ITEM_LIFECYCLE_VERSION,
    entries,
    counts,
  };
}

function appendLifecycleHistory(entry, event) {
  entry.itemRef.lifecycle ??= createActiveItemLifecycle();
  entry.itemRef.lifecycle.history ??= [];
  entry.itemRef.lifecycle.history.push({
    at: new Date().toISOString(),
    ...clone(event),
  });
}

function nextLifecycleRevision(entry) {
  const current = Number(entry?.itemRef?.lifecycle?.revision);
  return Number.isInteger(current) && current >= 0 ? current + 1 : 1;
}

function ensureMutableLifecycle(entry) {
  const status = expeditionItemLifecycleStatus(entry);

  if (status.terminal) {
    return {
      green: false,
      reason: status.state === "consumed" ? "entry-consumed" : "entry-deleted",
      status,
    };
  }

  if (status.legacy) {
    entry.itemRef.lifecycle = {
      version: EXPEDITION_ITEM_LIFECYCLE_VERSION,
      state: "active",
      revision: 1,
      history: [{
        at: new Date().toISOString(),
        kind: "migrated",
        from: "legacy",
        to: "active",
      }],
    };
  }

  return { green: true, status: expeditionItemLifecycleStatus(entry) };
}

export function consumeExpeditionItem(entry, { quantity = 1, note = null } = {}) {
  if (!entry?.itemRef) {
    return { changed: false, reason: "entry-item-ref-not-found", entry };
  }

  const mutable = ensureMutableLifecycle(entry);
  if (!mutable.green) {
    return { changed: false, reason: mutable.reason, entry };
  }

  const available = Math.max(0, Number(entry.quantity) || 0);
  const qty = Math.floor(Number(quantity));

  if (!Number.isFinite(qty) || qty <= 0) {
    return { changed: false, reason: "invalid-quantity", entry };
  }

  if (qty > available) {
    return { changed: false, reason: "quantity-exceeds-entry", entry };
  }

  const previousQuantity = available;
  const remainingQuantity = available - qty;
  const previousState = normalizeExpeditionItemState(entry.itemRef);

  entry.quantity = remainingQuantity;
  entry.itemRef.lifecycle.version = EXPEDITION_ITEM_LIFECYCLE_VERSION;

  if (remainingQuantity === 0) {
    entry.slotId = null;
    entry.itemRef.lifecycle.state = "consumed";
  }

  entry.itemRef.lifecycle.revision = nextLifecycleRevision(entry);
  if (nonEmpty(note)) entry.itemRef.lifecycle.note = note;

  appendLifecycleHistory(entry, {
    kind: "consumed",
    quantity: qty,
    fromQuantity: previousQuantity,
    toQuantity: remainingQuantity,
    fromState: previousState,
    toState: entry.itemRef.lifecycle.state,
    ...(nonEmpty(note) ? { note } : {}),
  });

  return {
    changed: true,
    consumedQuantity: qty,
    previousQuantity,
    remainingQuantity,
    terminal: remainingQuantity === 0,
    current: expeditionItemLifecycleStatus(entry),
    entry,
  };
}

export function modifyExpeditionItem(entry, {
  snapshot = null,
  itemRefPatch = null,
  note = null,
} = {}) {
  if (!entry?.itemRef) {
    return { changed: false, reason: "entry-item-ref-not-found", entry };
  }

  const mutable = ensureMutableLifecycle(entry);
  if (!mutable.green) {
    return { changed: false, reason: mutable.reason, entry };
  }

  if (
    (!snapshot || typeof snapshot !== "object") &&
    (!itemRefPatch || typeof itemRefPatch !== "object")
  ) {
    return { changed: false, reason: "modification-payload-required", entry };
  }

  const previous = clone(entry.itemRef);

  if (snapshot && typeof snapshot === "object") {
    entry.itemRef.snapshot = clone(snapshot);
  }

  if (itemRefPatch && typeof itemRefPatch === "object") {
    for (const key of ["uuid", "sourceId", "name", "type", "img"]) {
      if (Object.prototype.hasOwnProperty.call(itemRefPatch, key)) {
        entry.itemRef[key] = clone(itemRefPatch[key]);
      }
    }
  }

  entry.itemRef.lifecycle ??= createActiveItemLifecycle();
  entry.itemRef.lifecycle.version = EXPEDITION_ITEM_LIFECYCLE_VERSION;
  entry.itemRef.lifecycle.state = "modified";
  entry.itemRef.lifecycle.revision = nextLifecycleRevision(entry);
  if (nonEmpty(note)) entry.itemRef.lifecycle.note = note;

  appendLifecycleHistory(entry, {
    kind: "modified",
    fromState: normalizeExpeditionItemState(previous),
    toState: "modified",
    ...(nonEmpty(note) ? { note } : {}),
  });

  return {
    changed: true,
    previousItemRef: previous,
    current: expeditionItemLifecycleStatus(entry),
    entry,
  };
}

export function deleteExpeditionItem(entry, { note = null } = {}) {
  if (!entry?.itemRef) {
    return { changed: false, reason: "entry-item-ref-not-found", entry };
  }

  const mutable = ensureMutableLifecycle(entry);
  if (!mutable.green) {
    return { changed: false, reason: mutable.reason, entry };
  }

  const previousQuantity = Math.max(0, Number(entry.quantity) || 0);
  const previousState = normalizeExpeditionItemState(entry.itemRef);

  entry.quantity = 0;
  entry.slotId = null;
  entry.itemRef.lifecycle ??= createActiveItemLifecycle();
  entry.itemRef.lifecycle.version = EXPEDITION_ITEM_LIFECYCLE_VERSION;
  entry.itemRef.lifecycle.state = "deleted";
  entry.itemRef.lifecycle.revision = nextLifecycleRevision(entry);
  if (nonEmpty(note)) entry.itemRef.lifecycle.note = note;

  appendLifecycleHistory(entry, {
    kind: "deleted",
    fromQuantity: previousQuantity,
    toQuantity: 0,
    fromState: previousState,
    toState: "deleted",
    ...(nonEmpty(note) ? { note } : {}),
  });

  return {
    changed: true,
    previousQuantity,
    current: expeditionItemLifecycleStatus(entry),
    entry,
  };
}
