const ARCHIVE_KEY = "expeditionItemArchive";
export const EXPEDITION_ITEM_ARCHIVE_VERSION = 1;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function archiveStore(manifest) {
  manifest.metadata ??= {};
  manifest.metadata[ARCHIVE_KEY] ??= {
    version: EXPEDITION_ITEM_ARCHIVE_VERSION,
    entries: [],
  };

  const archive = manifest.metadata[ARCHIVE_KEY];

  if (!Array.isArray(archive.entries)) {
    archive.entries = [];
  }

  archive.version = EXPEDITION_ITEM_ARCHIVE_VERSION;
  return archive;
}

function entryState(entry) {
  return entry?.itemRef?.lifecycle?.state ?? "legacy";
}

function isTerminalEntry(entry) {
  const state = entryState(entry);
  return state === "consumed" || state === "deleted";
}

export function listArchivedExpeditionItems(manifest) {
  const archive = manifest?.metadata?.[ARCHIVE_KEY];

  if (!archive || !Array.isArray(archive.entries)) {
    return {
      green: true,
      version: EXPEDITION_ITEM_ARCHIVE_VERSION,
      entries: [],
      counts: {
        consumed: 0,
        deleted: 0,
      },
    };
  }

  const entries = clone(archive.entries);
  const counts = {
    consumed: 0,
    deleted: 0,
  };

  for (const archived of entries) {
    const state = archived?.entry?.itemRef?.lifecycle?.state ?? "legacy";
    if (state === "consumed" || state === "deleted") {
      counts[state] += 1;
    }
  }

  return {
    green: true,
    version: archive.version ?? EXPEDITION_ITEM_ARCHIVE_VERSION,
    entries,
    counts,
  };
}

export function archiveTerminalExpeditionItems(manifest, {
  containerId = null,
  entryIds = null,
  note = null,
} = {}) {
  if (!manifest || typeof manifest !== "object") {
    return {
      changed: false,
      reason: "manifest-required",
      manifest,
    };
  }

  const requestedIds =
    Array.isArray(entryIds) && entryIds.length
      ? new Set(entryIds.filter(nonEmpty))
      : null;

  const archive = archiveStore(manifest);
  const archived = [];

  for (const container of manifest.containers ?? []) {
    if (containerId && container.containerId !== containerId) continue;

    const keep = [];

    for (const entry of container.contents ?? []) {
      const selected =
        !requestedIds || requestedIds.has(entry?.entryId);

      if (!selected || !isTerminalEntry(entry)) {
        keep.push(entry);
        continue;
      }

      const archivedEntry = {
        archiveId: `archive-${entry.entryId}-${Date.now()}-${archived.length + 1}`,
        archivedAt: new Date().toISOString(),
        fromContainerId: container.containerId ?? null,
        fromContainerName: container.name ?? null,
        state: entryState(entry),
        ...(nonEmpty(note) ? { note } : {}),
        entry: clone(entry),
      };

      archive.entries.push(archivedEntry);
      archived.push(archivedEntry);
    }

    container.contents = keep;
  }

  if (!archived.length) {
    return {
      changed: false,
      reason: "no-terminal-entries-selected",
      archived: [],
      manifest,
    };
  }

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  return {
    changed: true,
    archivedCount: archived.length,
    archived,
    manifest,
  };
}

export function purgeArchivedExpeditionItems(manifest, {
  archiveIds = null,
  states = null,
  note = null,
} = {}) {
  if (!manifest || typeof manifest !== "object") {
    return {
      changed: false,
      reason: "manifest-required",
      manifest,
    };
  }

  const archive = archiveStore(manifest);

  const requestedIds =
    Array.isArray(archiveIds) && archiveIds.length
      ? new Set(archiveIds.filter(nonEmpty))
      : null;

  const requestedStates =
    Array.isArray(states) && states.length
      ? new Set(states)
      : null;

  const purged = [];
  const keep = [];

  for (const archived of archive.entries) {
    const selectedById =
      !requestedIds || requestedIds.has(archived?.archiveId);

    const state =
      archived?.entry?.itemRef?.lifecycle?.state ??
      archived?.state ??
      "legacy";

    const selectedByState =
      !requestedStates || requestedStates.has(state);

    if (selectedById && selectedByState) {
      purged.push({
        archiveId: archived.archiveId ?? null,
        entryId: archived?.entry?.entryId ?? null,
        itemName: archived?.entry?.itemRef?.name ?? null,
        state,
      });
      continue;
    }

    keep.push(archived);
  }

  if (!purged.length) {
    return {
      changed: false,
      reason: "no-archive-entries-selected",
      purged: [],
      manifest,
    };
  }

  archive.entries = keep;
  archive.lastPurge = {
    at: new Date().toISOString(),
    count: purged.length,
    ...(nonEmpty(note) ? { note } : {}),
  };

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  return {
    changed: true,
    purgedCount: purged.length,
    purged,
    manifest,
  };
}
