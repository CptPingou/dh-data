import {
  buildExpeditionRestitutionPlan,
  restitutionPlanStatus,
} from "./expedition-item-restitution.mjs";
import {
  archiveTerminalExpeditionItems,
  listArchivedExpeditionItems,
  purgeArchivedExpeditionItems,
} from "./expedition-item-archive.mjs";
import {
  consumeExpeditionItem,
  createActiveItemLifecycle,
  deleteExpeditionItem,
  expeditionItemLifecycleStatus,
  migrateLegacyExpeditionItem,
  modifyExpeditionItem,
  scanExpeditionItemLifecycle,
  setExpeditionItemLifecycle,
} from "./expedition-item-lifecycle.mjs";
import { withExpeditionUserMessage } from "./expedition-errors.mjs";
const REF_KIND = "foundry-item";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function restoreManifestSnapshot(manifest, snapshot) {
  if (!manifest || !snapshot) return;

  for (const key of Object.keys(manifest)) delete manifest[key];
  Object.assign(manifest, clone(snapshot));
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
    lifecycle: createActiveItemLifecycle(),
  };
}

export async function resolveFoundryItemRef(itemRef) {
  if (!itemRef || itemRef.kind !== REF_KIND || !nonEmpty(itemRef.uuid)) return null;
  const document = await fromUuid(itemRef.uuid);
  return document?.documentName === "Item" ? document : null;
}

export async function foundryItemRefStatus(itemRef) {
  const document = await resolveFoundryItemRef(itemRef);
  const lifecycle = expeditionItemLifecycleStatus({ itemRef });

  return {
    green: lifecycle.usable && Boolean(document || itemRef?.snapshot),
    kind: itemRef?.kind ?? null,
    uuid: itemRef?.uuid ?? null,
    sourceId: itemRef?.sourceId ?? null,
    storedName: itemRef?.name ?? null,
    resolvedName: document?.name ?? null,
    type: document?.type ?? itemRef?.type ?? null,
    snapshotAvailable: Boolean(
      itemRef?.snapshot && typeof itemRef.snapshot === "object"
    ),
    lifecycle,
  };
}

function actorFromContainer(container) {
  const ref = container?.holderRef;
  if (!ref || ref.kind !== "character" || !nonEmpty(ref.foundryActorUuid)) return null;
  const uuid = ref.foundryActorUuid;
  if (uuid.startsWith("Actor.")) return game.actors?.get(uuid.slice(6)) ?? null;
  return game.actors?.get(uuid) ?? null;
}

function findManifestEntry(manifest, containerId, entryId) {
  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === containerId
  );
  const entry = (container?.contents ?? []).find(
    (candidate) => candidate.entryId === entryId
  );

  return { container, entry };
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
    version: 9,
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

    lifecycleStatus(manifest, { containerId, entryId } = {}) {
      const container = (manifest?.containers ?? []).find(
        (candidate) => candidate.containerId === containerId
      );
      const entry = (container?.contents ?? []).find(
        (candidate) => candidate.entryId === entryId
      );

      if (!entry) {
        return {
          green: false,
          reason: "entry-not-found",
          containerId,
          entryId,
        };
      }

      return {
        green: true,
        containerId,
        entryId,
        itemName: entry.itemRef?.name ?? null,
        quantity: entry.quantity ?? null,
        ...expeditionItemLifecycleStatus(entry),
      };
    },

    setLifecycle(manifest, {
      containerId,
      entryId,
      state,
      note = null,
    } = {}) {
      const container = (manifest?.containers ?? []).find(
        (candidate) => candidate.containerId === containerId
      );
      const entry = (container?.contents ?? []).find(
        (candidate) => candidate.entryId === entryId
      );

      if (!entry) {
        return {
          changed: false,
          reason: "entry-not-found",
          manifest,
        };
      }

      const result = setExpeditionItemLifecycle(entry, state, { note });

      if (result.changed) {
        manifest.revision = Math.max(
          1,
          Number(manifest.revision) || 1
        ) + 1;
      }

      return {
        ...result,
        containerId,
        entryId,
        manifest,
      };
    },

    migrateLegacy(manifest, {
      containerId,
      entryId,
      note = null,
    } = {}) {
      const container = (manifest?.containers ?? []).find(
        (candidate) => candidate.containerId === containerId
      );
      const entry = (container?.contents ?? []).find(
        (candidate) => candidate.entryId === entryId
      );

      if (!entry) {
        return {
          changed: false,
          reason: "entry-not-found",
          manifest,
        };
      }

      const result = migrateLegacyExpeditionItem(entry, {
        ...(note ? { note } : {}),
      });

      if (result.changed) {
        manifest.revision = Math.max(
          1,
          Number(manifest.revision) || 1
        ) + 1;
      }

      return {
        ...result,
        containerId,
        entryId,
        manifest,
      };
    },

    scanLifecycle(manifest) {
      const active = scanExpeditionItemLifecycle(manifest);
      const archive = listArchivedExpeditionItems(manifest);

      return {
        ...active,
        archive: {
          entries: archive.entries.length,
          counts: archive.counts,
        },
      };
    },

    listArchive(manifest) {
      return listArchivedExpeditionItems(manifest);
    },

    archiveTerminal(manifest, options = {}) {
      return archiveTerminalExpeditionItems(manifest, options);
    },

    purgeArchive(manifest, options = {}) {
      return purgeArchivedExpeditionItems(manifest, options);
    },

    restitutionPlan(manifest) {
      return buildExpeditionRestitutionPlan(manifest);
    },

    restitutionStatus(manifest) {
      return restitutionPlanStatus(
        buildExpeditionRestitutionPlan(manifest)
      );
    },


    consume(manifest, { containerId, entryId, quantity = 1, note = null } = {}) {
      const { entry } = findManifestEntry(manifest, containerId, entryId);

      if (!entry) return { changed: false, reason: "entry-not-found", manifest };

      const result = consumeExpeditionItem(entry, { quantity, note });

      if (result.changed) {
        manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
      }

      return { ...result, containerId, entryId, manifest };
    },

    modify(manifest, {
      containerId,
      entryId,
      item = null,
      snapshot = null,
      itemRefPatch = null,
      note = null,
    } = {}) {
      const { entry } = findManifestEntry(manifest, containerId, entryId);

      if (!entry) return { changed: false, reason: "entry-not-found", manifest };

      const patch = item
        ? {
            uuid: item.uuid,
            sourceId: sourceIdOf(item),
            name: item.name ?? entry.itemRef?.name ?? "Item",
            type: item.type ?? entry.itemRef?.type ?? null,
            img: item.img ?? entry.itemRef?.img ?? null,
          }
        : itemRefPatch;

      const nextSnapshot = item ? clone(item.toObject()) : snapshot;

      const result = modifyExpeditionItem(entry, {
        snapshot: nextSnapshot,
        itemRefPatch: patch,
        note,
      });

      if (result.changed) {
        manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
      }

      return { ...result, containerId, entryId, manifest };
    },

    delete(manifest, { containerId, entryId, note = null } = {}) {
      const { entry } = findManifestEntry(manifest, containerId, entryId);

      if (!entry) return { changed: false, reason: "entry-not-found", manifest };

      const result = deleteExpeditionItem(entry, { note });

      if (result.changed) {
        manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
      }

      return { ...result, containerId, entryId, manifest };
    },

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
      if (!actor) return withExpeditionUserMessage({ unloaded: false, reason: "container-holder-actor-not-found", manifest }, { containerName: container?.name ?? "le sac à dos" });
      const entry = (container?.contents ?? []).find((e) => e.entryId === entryId);
      if (!entry) return withExpeditionUserMessage({ unloaded: false, reason: "entry-not-found", manifest }, { containerName: container?.name ?? "le sac à dos" });

      const lifecycle = expeditionItemLifecycleStatus(entry);

      if (!lifecycle.usable) {
        return {
          unloaded: false,
          reason:
            lifecycle.state === "consumed"
              ? "entry-consumed"
              : "entry-deleted",
          userMessage:
            lifecycle.state === "consumed"
              ? `${entry.itemRef?.name ?? "Cet objet"} a déjà été consommé.`
              : `${entry.itemRef?.name ?? "Cet objet"} a été supprimé du sac à dos.`,
          lifecycle,
          manifest,
        };
      }

      const source = await resolveFoundryItemRef(entry.itemRef);
      const available = Math.max(1, Number(entry.quantity) || 1);
      let requestedQuantity = quantity;

      if (available > 1 && (requestedQuantity == null || Number(requestedQuantity) >= available)) {
        const itemName = entry.itemRef?.name ?? "Objet";
        const DialogV2 = foundry?.applications?.api?.DialogV2;

        if (DialogV2?.prompt) {
          requestedQuantity = await DialogV2.prompt({
            window: {
              title: `Retour au personnage — ${itemName}`,
            },
            content: `
              <div class="form-group">
                <label>Quantité</label>
                <div class="form-fields">
                  <input
                    type="number"
                    name="quantity"
                    value="${available}"
                    min="1"
                    max="${available}"
                    step="1"
                    autofocus
                  />
                </div>
                <p class="hint">Disponible dans le sac à dos : ${available}</p>
              </div>
            `,
            ok: {
              label: "Rendre",
              callback: (_event, _button, dialog) => {
                const form = dialog?.element?.querySelector?.("form");
                const input =
                  form?.elements?.quantity ??
                  dialog?.element?.querySelector?.('[name="quantity"]');
                return Number(input?.value ?? available);
              },
            },
            rejectClose: false,
          });
        } else {
          const raw = window.prompt(
            `Quantité de "${itemName}" à rendre au personnage (1-${available}) :`,
            String(available)
          );
          requestedQuantity = raw == null ? null : Number(raw);
        }

        if (requestedQuantity == null) {
          return { unloaded: false, cancelled: true, reason: "cancelled", manifest };
        }

        const parsedQuantity = Math.floor(Number(requestedQuantity));

        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          ui.notifications?.warn("La quantité à rendre doit être supérieure à 0.");
          return { unloaded: false, cancelled: true, reason: "invalid-quantity", manifest };
        }

        requestedQuantity = Math.min(available, parsedQuantity);
      }
      const qty =
        requestedQuantity == null
          ? available
          : Math.max(1, Number(requestedQuantity) || 1);
      if (qty > available) return withExpeditionUserMessage({ unloaded: false, reason: "quantity-exceeds-entry", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });
      let data = null;
      if (source) {
        data = source.toObject();
      } else if (entry.itemRef?.snapshot && typeof entry.itemRef.snapshot === "object") {
        data = clone(entry.itemRef.snapshot);
      } else {
        return withExpeditionUserMessage({ unloaded: false, reason: "foundry-item-not-resolved", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });
      }

      delete data._id;
      if (data.system && Object.prototype.hasOwnProperty.call(data.system, "quantity")) data.system.quantity = qty;
      else if (data.system && Object.prototype.hasOwnProperty.call(data.system, "amount")) data.system.amount = qty;
      // P2.10h.3 actor stack merge
      const actorStackKey = (itemData) => {
        if (!itemData || typeof itemData !== "object") return null;

        const normalized = clone(itemData);
        delete normalized._id;
        delete normalized._stats;
        delete normalized.sort;
        delete normalized.folder;

        if (normalized.system && typeof normalized.system === "object") {
          if (Object.prototype.hasOwnProperty.call(normalized.system, "quantity")) {
            delete normalized.system.quantity;
          }
          if (Object.prototype.hasOwnProperty.call(normalized.system, "amount")) {
            delete normalized.system.amount;
          }
        }

        return JSON.stringify(normalized);
      };

      const desiredStackKey = actorStackKey(data);
      const existingActorItem =
        desiredStackKey == null
          ? null
          : actor.items?.find?.((candidate) => {
              const candidateData = candidate?.toObject?.();
              return actorStackKey(candidateData) === desiredStackKey;
            }) ?? null;

      const transactionManifestSnapshot = clone(manifest);
      let created = null;
      let mergedActorItem = null;
      let previousActorQuantity = null;
      let actorQuantityPath = null;

      try {
        if (existingActorItem) {
          const system = existingActorItem.system ?? {};

          if (Object.prototype.hasOwnProperty.call(system, "quantity")) {
            actorQuantityPath = "system.quantity";
            previousActorQuantity = Math.max(1, Number(system.quantity) || 1);
          } else if (Object.prototype.hasOwnProperty.call(system, "amount")) {
            actorQuantityPath = "system.amount";
            previousActorQuantity = Math.max(1, Number(system.amount) || 1);
          }

          if (actorQuantityPath) {
            // Set the reference before update so rollback still knows which
            // Item to restore if Foundry commits then throws.
            mergedActorItem = existingActorItem;
            await existingActorItem.update({
              [actorQuantityPath]: previousActorQuantity + qty,
            });
          }
        }

        if (!mergedActorItem) {
          [created] = await actor.createEmbeddedDocuments("Item", [data]);
          if (!created) {
            return withExpeditionUserMessage(
              { unloaded: false, reason: "actor-item-create-failed", manifest },
              {
                itemName: entry?.itemRef?.name ?? "cet objet",
                containerName: container?.name ?? "le sac à dos",
                actorName: actor?.name ?? "le personnage",
              }
            );
          }
        }

        const removal = expeditionManifestApi.extract(manifest, {
          containerId,
          entryId,
          quantity: qty,
        });

        if (!removal.changed) {
          if (created) {
            await created.delete();
          } else if (
            mergedActorItem &&
            actorQuantityPath &&
            previousActorQuantity != null
          ) {
            await mergedActorItem.update({
              [actorQuantityPath]: previousActorQuantity,
            });
          }

          return withExpeditionUserMessage(
            {
              unloaded: false,
              reason: removal.reason ?? "manifest-remove-failed",
              manifest,
            },
            {
              itemName: entry?.itemRef?.name ?? "cet objet",
              containerName: container?.name ?? "le sac à dos",
              actorName: actor?.name ?? "le personnage",
            }
          );
        }

        const ledgerEvent = expeditionManifestApi.appendLedger(manifest, {
          kind: "transferred",
          entryId,
          itemRef: entry.itemRef,
          quantity: qty,
          fromContainerId: containerId,
          toContainerId: null,
          toRef: { kind: "foundry-actor", uuid: actor.uuid, name: actor.name },
          note: note ?? `Déchargé vers ${actor.name}`,
        });

        return {
          unloaded: true,
          actorId: actor.id,
          createdItemId: created?.id ?? null,
          mergedItemId: mergedActorItem?.id ?? null,
          merged: Boolean(mergedActorItem),
          removal,
          ledgerEvent,
          manifest,
        };
      } catch (error) {
        restoreManifestSnapshot(manifest, transactionManifestSnapshot);

        try {
          if (created && actor.items?.get(created.id)) {
            await created.delete();
          } else if (
            mergedActorItem &&
            actorQuantityPath &&
            previousActorQuantity != null &&
            actor.items?.get(mergedActorItem.id)
          ) {
            await mergedActorItem.update({
              [actorQuantityPath]: previousActorQuantity,
            });
          }
        } catch (rollbackError) {
          console.error(
            "daggerheart-campaign-toolkit | Backpack → Actor rollback failed",
            rollbackError
          );
        }

        throw error;
      }
    },

    async resolveEntry(entry) {
      const document = await resolveFoundryItemRef(entry?.itemRef);
      return {
        green: Boolean(document),
        entryId: entry?.entryId ?? null,
        quantity: entry?.quantity ?? 1,
        slotId: entry?.slotId ?? null,
        itemRef: clone(entry?.itemRef ?? null),
        lifecycle: expeditionItemLifecycleStatus(entry),
        document,
      };
    },
  });
}





