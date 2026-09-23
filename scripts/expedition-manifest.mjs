export const EXPEDITION_MANIFEST_SCHEMA = "daggerheart-campaign-toolkit/expedition-manifest@2";
export const EXPEDITION_MANIFEST_SCHEMA_V1 = "daggerheart-campaign-toolkit/expedition-manifest@1";

const PHASES = new Set(["prepared", "in_session", "returned"]);
const AUTHORITIES = new Set(["web", "foundry"]);
// P2.10c.1: the container primitive is generic, but only these concrete types are defined/tested for now.
const CONTAINER_TYPES = new Set(["backpack", "caravan"]);
const SCOPES = new Set(["personal", "party", "expedition"]);
const HOLDER_KINDS = new Set(["character", "party", "expedition"]);
const LEDGER_KINDS = new Set(["consumed", "acquired", "transferred", "lost"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function duplicates(values) {
  const seen = new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function migrateExpeditionManifestV1(manifest) {
  if (manifest?.schema !== EXPEDITION_MANIFEST_SCHEMA_V1) return clone(manifest);
  const migrated = clone(manifest);
  migrated.schema = EXPEDITION_MANIFEST_SCHEMA;
  migrated.characters = (migrated.characters ?? []).map(({ containerIds: _legacyContainerIds, ...character }) => character);
  migrated.containers = (migrated.containers ?? []).map((container) => {
    const { ownerCharacterId, ...rest } = container;
    if (container.scope === "character") {
      return {
        ...rest,
        scope: "personal",
        holderRef: { kind: "character", id: ownerCharacterId },
      };
    }
    return {
      ...rest,
      scope: container.scope === "party" ? "party" : container.scope,
      holderRef: container.scope === "party" ? { kind: "party", id: "party" } : null,
    };
  });
  migrated.metadata = { ...(migrated.metadata ?? {}), migratedFrom: EXPEDITION_MANIFEST_SCHEMA_V1 };
  return migrated;
}

export function normalizeExpeditionManifest(manifest) {
  if (manifest?.schema === EXPEDITION_MANIFEST_SCHEMA_V1) return migrateExpeditionManifestV1(manifest);
  return clone(manifest);
}

export function validateExpeditionManifest(input) {
  const migrated = input?.schema === EXPEDITION_MANIFEST_SCHEMA_V1;
  const manifest = normalizeExpeditionManifest(input);
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { green: false, migrated, errors: ["manifest must be an object"] };
  }

  if (manifest.schema !== EXPEDITION_MANIFEST_SCHEMA) errors.push(`schema must be ${EXPEDITION_MANIFEST_SCHEMA}`);
  if (!nonEmpty(manifest.expeditionId)) errors.push("expeditionId is required");
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) errors.push("revision must be an integer >= 1");
  if (!PHASES.has(manifest.phase)) errors.push("phase must be prepared, in_session or returned");
  if (!AUTHORITIES.has(manifest.authority)) errors.push("authority must be web or foundry");
  if (!Array.isArray(manifest.characters)) errors.push("characters must be an array");
  if (!Array.isArray(manifest.containers)) errors.push("containers must be an array");
  if (!Array.isArray(manifest.ledger)) errors.push("ledger must be an array");
  if (errors.length) return { green: false, migrated, errors };

  const characterIds = manifest.characters.map((c) => c?.characterId).filter(nonEmpty);
  const containerIds = manifest.containers.map((c) => c?.containerId).filter(nonEmpty);
  const duplicateCharacters = [...new Set(duplicates(characterIds))];
  const duplicateContainers = [...new Set(duplicates(containerIds))];
  if (duplicateCharacters.length) errors.push(`duplicate characterId: ${duplicateCharacters.join(", ")}`);
  if (duplicateContainers.length) errors.push(`duplicate containerId: ${duplicateContainers.join(", ")}`);

  const characterSet = new Set(characterIds);
  const containerSet = new Set(containerIds);

  for (const character of manifest.characters) {
    if (!nonEmpty(character?.characterId)) errors.push("character.characterId is required");
    if (!nonEmpty(character?.name)) errors.push(`character ${character?.characterId ?? "?"}: name is required`);
  }

  for (const container of manifest.containers) {
    const id = container?.containerId ?? "?";
    if (!nonEmpty(container?.containerId)) errors.push("container.containerId is required");
    if (!CONTAINER_TYPES.has(container?.type)) errors.push(`container ${id}: invalid type`);
    if (!nonEmpty(container?.name)) errors.push(`container ${id}: name is required`);
    if (!SCOPES.has(container?.scope)) errors.push(`container ${id}: invalid scope`);
    if (!container?.holderRef || !HOLDER_KINDS.has(container.holderRef.kind) || !nonEmpty(container.holderRef.id)) {
      errors.push(`container ${id}: holderRef requires a valid kind and id`);
    } else {
      if (container.scope === "personal" && container.holderRef.kind !== "character") errors.push(`container ${id}: personal scope requires character holderRef`);
      if (container.scope === "party" && container.holderRef.kind !== "party") errors.push(`container ${id}: party scope requires party holderRef`);
      if (container.scope === "expedition" && container.holderRef.kind !== "expedition") errors.push(`container ${id}: expedition scope requires expedition holderRef`);
      if (container.holderRef.kind === "character" && !characterSet.has(container.holderRef.id)) errors.push(`container ${id}: unknown character holder ${container.holderRef.id}`);
      if (container.holderRef.kind === "expedition" && container.holderRef.id !== manifest.expeditionId) errors.push(`container ${id}: expedition holder must reference ${manifest.expeditionId}`);
    }
    if (!Number.isInteger(container?.capacity?.slots) || container.capacity.slots < 0) errors.push(`container ${id}: capacity.slots must be >= 0`);
    if (!Array.isArray(container?.layout?.slots)) errors.push(`container ${id}: layout.slots must be an array`);
    if (!Array.isArray(container?.rules)) errors.push(`container ${id}: rules must be an array`);
    if (!Array.isArray(container?.contents)) errors.push(`container ${id}: contents must be an array`);
    if (container?.presentation != null) {
      if (!container.presentation || typeof container.presentation !== "object" || Array.isArray(container.presentation)) {
        errors.push(`container ${id}: presentation must be an object`);
      } else {
        for (const key of ["icon", "background", "frame", "slotBackground"]) {
          if (container.presentation[key] != null && !nonEmpty(container.presentation[key])) {
            errors.push(`container ${id}: presentation.${key} must be a non-empty string`);
          }
        }
      }
    }

    const slotIds = (container?.layout?.slots ?? []).map((slot) => slot?.slotId).filter(nonEmpty);
    const slotSet = new Set(slotIds);
    const duplicateSlots = [...new Set(duplicates(slotIds))];
    if (duplicateSlots.length) errors.push(`container ${id}: duplicate slotId ${duplicateSlots.join(", ")}`);
    if (slotIds.length > (container?.capacity?.slots ?? 0)) errors.push(`container ${id}: layout defines more slots than capacity`);

    for (const entry of container?.contents ?? []) {
      if (!nonEmpty(entry?.entryId)) errors.push(`container ${id}: entryId is required`);
      if (!nonEmpty(entry?.itemRef?.sourceId)) errors.push(`container ${id}/${entry?.entryId ?? "?"}: itemRef.sourceId is required`);
      if (!nonEmpty(entry?.itemRef?.name)) errors.push(`container ${id}/${entry?.entryId ?? "?"}: itemRef.name is required`);
      if (!Number.isInteger(entry?.quantity) || entry.quantity < 1) errors.push(`container ${id}/${entry?.entryId ?? "?"}: quantity must be >= 1`);
      if (entry?.slotId != null && !slotSet.has(entry.slotId)) errors.push(`container ${id}/${entry?.entryId ?? "?"}: unknown slot ${entry.slotId}`);
    }
  }

  for (const event of manifest.ledger) {
    if (!nonEmpty(event?.eventId)) errors.push("ledger eventId is required");
    if (!LEDGER_KINDS.has(event?.kind)) errors.push(`ledger ${event?.eventId ?? "?"}: invalid kind`);
    if (!nonEmpty(event?.itemRef?.sourceId)) errors.push(`ledger ${event?.eventId ?? "?"}: itemRef.sourceId is required`);
    if (!Number.isInteger(event?.quantity) || event.quantity < 1) errors.push(`ledger ${event?.eventId ?? "?"}: quantity must be >= 1`);
    for (const key of ["fromContainerId", "toContainerId"]) {
      if (event?.[key] != null && !containerSet.has(event[key])) errors.push(`ledger ${event.eventId}: unknown ${key} ${event[key]}`);
    }
  }

  return {
    green: errors.length === 0,
    migrated,
    schema: manifest.schema,
    expeditionId: manifest.expeditionId,
    revision: manifest.revision,
    phase: manifest.phase,
    authority: manifest.authority,
    characters: manifest.characters.length,
    containers: manifest.containers.length,
    personalContainers: manifest.containers.filter((c) => c.scope === "personal").length,
    partyContainers: manifest.containers.filter((c) => c.scope === "party").length,
    expeditionContainers: manifest.containers.filter((c) => c.scope === "expedition").length,
    backpacks: manifest.containers.filter((c) => c.type === "backpack").length,
    caravans: manifest.containers.filter((c) => c.type === "caravan").length,
    entries: manifest.containers.reduce((sum, c) => sum + (c.contents?.length ?? 0), 0),
    ledgerEntries: manifest.ledger.length,
    errors,
  };
}

function occupiedSlots(container) {
  return new Set((container?.contents ?? []).map((entry) => entry?.slotId).filter(nonEmpty));
}

function usedSlotsForTransfer(container) {
  const occupied = occupiedSlots(container);
  const unslotted = (container?.contents ?? []).filter((entry) => !nonEmpty(entry?.slotId)).length;
  return occupied.size + unslotted;
}

function firstFreeSlot(container) {
  const occupied = occupiedSlots(container);
  for (const slot of container?.layout?.slots ?? []) {
    if (nonEmpty(slot?.slotId) && !occupied.has(slot.slotId)) return slot.slotId;
  }
  return null;
}

function transferRuleResult(container, entry) {
  for (const rule of container?.rules ?? []) {
    if (!rule || rule.enabled === false) continue;
    if (rule.ruleId === "deny-source" && nonEmpty(rule.sourceId) && rule.sourceId === entry?.itemRef?.sourceId) {
      return { green: false, reason: rule.message ?? `Objet refusé par ${container.name}` };
    }
    if (rule.ruleId === "allow-source-prefix" && nonEmpty(rule.prefix) && !String(entry?.itemRef?.sourceId ?? "").startsWith(rule.prefix)) {
      return { green: false, reason: rule.message ?? `Objet incompatible avec ${container.name}` };
    }
  }
  return { green: true };
}

export function canTransferExpeditionEntry(manifest, {
  entryId,
  fromContainerId,
  toContainerId,
  toSlotId = null,
} = {}) {
  if (!manifest || typeof manifest !== "object") return { green: false, reason: "manifest is required" };
  if (!nonEmpty(entryId) || !nonEmpty(fromContainerId) || !nonEmpty(toContainerId)) {
    return { green: false, reason: "entryId, fromContainerId and toContainerId are required" };
  }

  const from = manifest.containers?.find((container) => container.containerId === fromContainerId);
  const to = manifest.containers?.find((container) => container.containerId === toContainerId);
  if (!from) return { green: false, reason: `unknown source container ${fromContainerId}` };
  if (!to) return { green: false, reason: `unknown destination container ${toContainerId}` };

  const entry = (from.contents ?? []).find((candidate) => candidate.entryId === entryId);
  if (!entry) return { green: false, reason: `unknown entry ${entryId} in ${fromContainerId}` };

  const sameContainer = fromContainerId === toContainerId;
  const layoutSlots = to.layout?.slots ?? [];
  let slotId = nonEmpty(toSlotId) ? toSlotId : null;

  if (slotId && layoutSlots.length && !layoutSlots.some((slot) => slot.slotId === slotId)) {
    return { green: false, reason: `unknown slot ${slotId} in ${toContainerId}` };
  }

  if (slotId) {
    const occupant = (to.contents ?? []).find((candidate) => candidate.slotId === slotId && candidate.entryId !== entryId);
    if (occupant) return { green: false, reason: `L’emplacement ${slotId} est déjà occupé` };
  }

  if (sameContainer) {
    if (!layoutSlots.length) return { green: false, reason: "same-container" };
    slotId ??= firstFreeSlot(to);
    if (!slotId) return { green: false, reason: `${to.name} n’a aucun emplacement libre` };
    if (entry.slotId === slotId) return { green: false, reason: "same-slot" };
    return { green: true, entry, from, to, slotId, reposition: true };
  }

  const rule = transferRuleResult(to, entry);
  if (!rule.green) return rule;

  const capacity = to.capacity?.slots ?? 0;
  if (usedSlotsForTransfer(to) >= capacity) {
    return { green: false, reason: `${to.name} est plein (${usedSlotsForTransfer(to)}/${capacity} slots)` };
  }

  slotId ??= layoutSlots.length ? firstFreeSlot(to) : null;
  if (layoutSlots.length && !slotId) {
    return { green: false, reason: `${to.name} n’a aucun emplacement libre` };
  }
  return { green: true, entry, from, to, slotId, reposition: false };
}

export function transferExpeditionEntry(manifest, {
  entryId,
  fromContainerId,
  toContainerId,
  toSlotId = null,
} = {}) {
  const check = canTransferExpeditionEntry(manifest, { entryId, fromContainerId, toContainerId, toSlotId });
  if (!check.green) return { moved: false, reason: check.reason, manifest };

  const { entry, from, to, slotId, reposition } = check;

  if (reposition) {
    entry.slotId = slotId;
  } else {
    const index = from.contents.findIndex((candidate) => candidate.entryId === entryId);
    from.contents.splice(index, 1);
    entry.slotId = slotId;
    to.contents ??= [];
    to.contents.push(entry);
  }

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  let ledgerEvent = null;
  if (!reposition && fromContainerId !== toContainerId) {
    ledgerEvent = appendExpeditionLedgerEvent(manifest, {
      kind: "transferred",
      entryId: entry.entryId,
      itemRef: entry.itemRef,
      quantity: entry.quantity ?? 1,
      fromContainerId,
      toContainerId,
    });
  }

  return { moved: true, reposition, entryId, fromContainerId, toContainerId, slotId, ledgerEvent, manifest };
}

export function appendExpeditionLedgerEvent(manifest, {
  kind,
  entryId = null,
  itemRef = null,
  quantity = 1,
  fromContainerId = null,
  toContainerId = null,
  fromRef = null,
  toRef = null,
  note = null,
} = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest is required");
  if (!LEDGER_KINDS.has(kind)) throw new Error(`unsupported ledger kind ${kind}`);

  manifest.ledger ??= [];
  const event = {
    eventId: globalThis.crypto?.randomUUID?.() ?? `ledger-${Date.now()}-${manifest.ledger.length + 1}`,
    kind,
    entryId: nonEmpty(entryId) ? entryId : null,
    itemRef: itemRef && typeof itemRef === "object" ? clone(itemRef) : null,
    quantity: Math.max(1, Number(quantity) || 1),
    fromContainerId: nonEmpty(fromContainerId) ? fromContainerId : null,
    toContainerId: nonEmpty(toContainerId) ? toContainerId : null,
    fromRef: fromRef && typeof fromRef === "object" ? clone(fromRef) : null,
    toRef: toRef && typeof toRef === "object" ? clone(toRef) : null,
    note: nonEmpty(note) ? note : null,
    at: new Date().toISOString(),
  };
  manifest.ledger.push(event);
  return event;
}

export function expeditionLedgerSummary(manifest) {
  const events = manifest?.ledger ?? [];
  const byKind = Object.fromEntries(LEDGER_KINDS.map((kind) => [kind, 0]));
  for (const event of events) {
    if (event && LEDGER_KINDS.has(event.kind)) byKind[event.kind] += 1;
  }
  return { total: events.length, byKind };
}


function findContainerOrThrow(manifest, containerId) {
  const container = (manifest?.containers ?? []).find((candidate) => candidate.containerId === containerId);
  if (!container) throw new Error(`unknown container ${containerId}`);
  return container;
}

function findEntryOrThrow(container, entryId) {
  const index = (container?.contents ?? []).findIndex((candidate) => candidate.entryId === entryId);
  if (index < 0) throw new Error(`unknown entry ${entryId} in ${container?.containerId ?? "container"}`);
  return { entry: container.contents[index], index };
}

function nextEntryId(manifest, itemRef) {
  const base = String(itemRef?.sourceId ?? itemRef?.name ?? "entry")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "entry";
  const used = new Set((manifest?.containers ?? []).flatMap((c) => (c.contents ?? []).map((e) => e.entryId)));
  let i = 1;
  let candidate = `${base}-${i}`;
  while (used.has(candidate)) candidate = `${base}-${++i}`;
  return candidate;
}

export function acquireExpeditionEntry(manifest, {
  containerId,
  itemRef,
  quantity = 1,
  entryId = null,
  note = null,
} = {}) {
  const container = findContainerOrThrow(manifest, containerId);
  const qty = Math.max(1, Number(quantity) || 1);
  const candidate = {
    entryId: nonEmpty(entryId) ? entryId : nextEntryId(manifest, itemRef),
    itemRef: itemRef && typeof itemRef === "object" ? clone(itemRef) : {},
    quantity: qty,
    slotId: null,
  };

  // Reuse the same capacity/rule preflight as transfers by staging a temporary source.
  const tempId = "__expedition-acquire__";
  const stagedCandidate = clone(candidate);
  const temp = { containerId: tempId, type: "virtual", scope: "expedition", capacity: { slots: 1 }, layout: {}, rules: [], contents: [stagedCandidate] };
  manifest.containers.push(temp);
  let preflight;
  try {
    preflight = canTransferExpeditionEntry(manifest, {
      entryId: candidate.entryId,
      fromContainerId: tempId,
      toContainerId: containerId,
    });
  } finally {
    manifest.containers.pop();
  }
  if (!preflight.green) return { acquired: false, reason: preflight.reason, manifest };

  candidate.quantity = qty;
  candidate.slotId = preflight.slotId ?? null;
  container.contents ??= [];
  container.contents.push(candidate);
  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
  const ledgerEvent = appendExpeditionLedgerEvent(manifest, {
    kind: "acquired",
    entryId: candidate.entryId,
    itemRef: candidate.itemRef,
    quantity: qty,
    toContainerId: containerId,
    note,
  });
  return { acquired: true, entry: candidate, ledgerEvent, manifest };
}

function removeExpeditionQuantity(manifest, {
  kind,
  containerId,
  entryId,
  quantity = 1,
  note = null,
} = {}) {
  const container = findContainerOrThrow(manifest, containerId);
  const { entry, index } = findEntryOrThrow(container, entryId);
  const available = Math.max(1, Number(entry.quantity) || 1);
  const qty = Math.max(1, Number(quantity) || 1);
  if (qty > available) {
    return { changed: false, reason: `quantity ${qty} exceeds available ${available}`, manifest };
  }

  const itemRef = clone(entry.itemRef ?? {});
  if (qty === available) container.contents.splice(index, 1);
  else entry.quantity = available - qty;

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
  const ledgerEvent = appendExpeditionLedgerEvent(manifest, {
    kind,
    entryId,
    itemRef,
    quantity: qty,
    fromContainerId: containerId,
    note,
  });
  return { changed: true, removedEntry: qty === available, remaining: available - qty, ledgerEvent, manifest };
}

export function consumeExpeditionEntry(manifest, options = {}) {
  return removeExpeditionQuantity(manifest, { ...options, kind: "consumed" });
}

export function loseExpeditionEntry(manifest, options = {}) {
  return removeExpeditionQuantity(manifest, { ...options, kind: "lost" });
}


export function createEmptyExpeditionManifest({ expeditionId = "new-expedition" } = {}) {
  return {
    schema: EXPEDITION_MANIFEST_SCHEMA,
    expeditionId,
    revision: 1,
    phase: "prepared",
    authority: "web",
    characters: [],
    containers: [],
    ledger: [],
    metadata: {},
  };
}

export function extractExpeditionEntry(manifest, { containerId, entryId, quantity = 1 } = {}) {
  const container = (manifest?.containers ?? []).find(c => c.containerId === containerId);
  if (!container) return { changed: false, reason: "container-not-found", manifest };
  const index = (container.contents ?? []).findIndex(e => e.entryId === entryId);
  if (index < 0) return { changed: false, reason: "entry-not-found", manifest };
  const entry = container.contents[index];
  const available = Math.max(1, Number(entry.quantity) || 1);
  const qty = Math.max(1, Number(quantity) || 1);
  if (qty > available) return { changed: false, reason: "quantity-exceeds-entry", manifest };
  const snapshot = clone(entry);
  const remaining = available - qty;
  if (remaining) entry.quantity = remaining; else container.contents.splice(index, 1);
  manifest.revision = Math.max(0, Number(manifest.revision) || 0) + 1;
  return { changed: true, manifest, entry: snapshot, quantity: qty, remaining, removedEntry: remaining === 0 };
}

export const expeditionManifestApi = Object.freeze({
  version: 2,
  schema: EXPEDITION_MANIFEST_SCHEMA,
  previousSchema: EXPEDITION_MANIFEST_SCHEMA_V1,
  validate: validateExpeditionManifest,
  normalize: normalizeExpeditionManifest,
  migrateV1: migrateExpeditionManifestV1,
  createEmpty: createEmptyExpeditionManifest,
  canTransfer: canTransferExpeditionEntry,
  transfer: transferExpeditionEntry,
  appendLedger: appendExpeditionLedgerEvent,
  ledgerSummary: expeditionLedgerSummary,
  acquire: acquireExpeditionEntry,
  extract: extractExpeditionEntry,
  consume: consumeExpeditionEntry,
  lose: loseExpeditionEntry,
});
