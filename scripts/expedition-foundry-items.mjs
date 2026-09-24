const REF_KIND = "foundry-item";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sourceIdOf(item) {
  return item?.flags?.core?.sourceId
    ?? item?._stats?.compendiumSource
    ?? item?.flags?.["daggerheart-campaign-toolkit"]?.sourceId
    ?? null;
}

export function foundryItemRef(item) {
  if (!item || item.documentName !== "Item") {
    throw new Error("A Foundry Item document is required");
  }

  return {
    kind: REF_KIND,
    uuid: item.uuid,
    sourceId: sourceIdOf(item),
    name: item.name ?? "Item",
    type: item.type ?? null,
    img: item.img ?? null,
    snapshot: clone(item.toObject()),
  };
}

export async function resolveFoundryItemRef(itemRef) {
  if (!itemRef || itemRef.kind !== REF_KIND || !nonEmpty(itemRef.uuid)) return null;
  const document = await fromUuid(itemRef.uuid);
  return document?.documentName === "Item" ? document : null;
}

export async function foundryItemRefStatus(itemRef) {
  const document = await resolveFoundryItemRef(itemRef);
  return {
    green: Boolean(document),
    kind: itemRef?.kind ?? null,
    uuid: itemRef?.uuid ?? null,
    sourceId: itemRef?.sourceId ?? null,
    storedName: itemRef?.name ?? null,
    resolvedName: document?.name ?? null,
    type: document?.type ?? itemRef?.type ?? null,
  };
}

function actorFromContainer(container) {
  const ref = container?.holderRef;
  if (!ref || ref.kind !== "character" || !nonEmpty(ref.foundryActorUuid)) return null;
  const uuid = ref.foundryActorUuid;
  if (uuid.startsWith("Actor.")) return game.actors?.get(uuid.slice(6)) ?? null;
  return game.actors?.get(uuid) ?? null;
}

export function expeditionActorStatus(manifest, containerId) {
  const container = (manifest?.containers ?? []).find((c) => c.containerId === containerId);
  const actor = actorFromContainer(container);
  return {
    green: Boolean(container && actor),
    containerId: container?.containerId ?? null,
    holderRef: clone(container?.holderRef ?? null),
    characterId: container?.holderRef?.id ?? null,
    foundryActorUuid: container?.holderRef?.foundryActorUuid ?? null,
    actorId: actor?.id ?? null,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? null,
  };
}

export function createExpeditionFoundryItemsApi({ expeditionManifestApi } = {}) {
  if (!expeditionManifestApi?.acquire) {
    throw new Error("expeditionManifestApi.acquire is required");
  }

  return Object.freeze({
    version: 5,
    ref: foundryItemRef,
    resolve: resolveFoundryItemRef,
    status: foundryItemRefStatus,

    acquire(manifest, {
      containerId,
      item,
      quantity = 1,
      entryId = null,
      note = null,
    } = {}) {
      return expeditionManifestApi.acquire(manifest, {
        containerId,
        itemRef: foundryItemRef(item),
        quantity,
        entryId,
        note,
      });
    },

    actorStatus: expeditionActorStatus,

    loadFromActor(manifest, { containerId, item, quantity = 1, entryId = null, note = null } = {}) {
      const container = (manifest?.containers ?? []).find((c) => c.containerId === containerId);
      const actor = actorFromContainer(container);
      if (!actor) return { loaded: false, reason: "container-holder-actor-not-found", manifest };
      if (!item || item.documentName !== "Item" || item.parent?.id !== actor.id) return { loaded: false, reason: "item-not-owned-by-container-holder", manifest };
      const result = expeditionManifestApi.acquire(manifest, { containerId, itemRef: foundryItemRef(item), quantity, entryId, note: note ?? `Chargé depuis ${actor.name}` });
      return { loaded: Boolean(result.acquired), actorId: actor.id, itemId: item.id, ...result };
    },

    async unloadToActor(manifest, { containerId, entryId, quantity = null, note = null } = {}) {
      const container = (manifest?.containers ?? []).find((c) => c.containerId === containerId);
      const actor = actorFromContainer(container);
      if (!actor) return { unloaded: false, reason: "container-holder-actor-not-found", manifest };
      const entry = (container?.contents ?? []).find((e) => e.entryId === entryId);
      if (!entry) return { unloaded: false, reason: "entry-not-found", manifest };
      const source = await resolveFoundryItemRef(entry.itemRef);
      const available = Math.max(1, Number(entry.quantity) || 1);
      const qty = quantity == null ? available : Math.max(1, Number(quantity) || 1);
      if (qty > available) return { unloaded: false, reason: "quantity-exceeds-entry", manifest };
      let data = null;
      if (source) {
        data = source.toObject();
      } else if (entry.itemRef?.snapshot && typeof entry.itemRef.snapshot === "object") {
        data = clone(entry.itemRef.snapshot);
      } else {
        return { unloaded: false, reason: "foundry-item-not-resolved", manifest };
      }

      delete data._id;
      if (data.system && Object.prototype.hasOwnProperty.call(data.system, "quantity")) data.system.quantity = qty;
      else if (data.system && Object.prototype.hasOwnProperty.call(data.system, "amount")) data.system.amount = qty;
      const [created] = await actor.createEmbeddedDocuments("Item", [data]);
      if (!created) return { unloaded: false, reason: "actor-item-create-failed", manifest };
      const removal = expeditionManifestApi.extract(manifest, { containerId, entryId, quantity: qty });
      if (!removal.changed) {
        await created.delete();
        return { unloaded: false, reason: removal.reason ?? "manifest-remove-failed", manifest };
      }
      const ledgerEvent = expeditionManifestApi.appendLedger(manifest, {
        kind: "transferred", entryId, itemRef: entry.itemRef, quantity: qty,
        fromContainerId: containerId,
        toContainerId: null,
        toRef: { kind: "foundry-actor", uuid: actor.uuid, name: actor.name },
        note: note ?? `Déchargé vers ${actor.name}`,
      });
      return { unloaded: true, actorId: actor.id, createdItemId: created.id, removal, ledgerEvent, manifest };
    },

    async resolveEntry(entry) {
      const document = await resolveFoundryItemRef(entry?.itemRef);
      return {
        green: Boolean(document),
        entryId: entry?.entryId ?? null,
        quantity: entry?.quantity ?? 1,
        slotId: entry?.slotId ?? null,
        itemRef: clone(entry?.itemRef ?? null),
        document,
      };
    },
  });
}

