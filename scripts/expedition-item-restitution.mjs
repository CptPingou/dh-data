import { expeditionItemLifecycleStatus } from "./expedition-item-lifecycle.mjs";
import { listArchivedExpeditionItems } from "./expedition-item-archive.mjs";

export const EXPEDITION_RESTITUTION_PLAN_VERSION = 1;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containerActorRef(container) {
  const holder = container?.holderRef ?? {};
  return (
    holder.foundryActorUuid ??
    holder.actorUuid ??
    holder.uuid ??
    null
  );
}

function returnableState(state) {
  return state === "active" || state === "modified" || state === "legacy";
}

function entryReadiness(entry) {
  const lifecycle = expeditionItemLifecycleStatus(entry);
  const snapshotAvailable = Boolean(
    entry?.itemRef?.snapshot &&
    typeof entry.itemRef.snapshot === "object"
  );

  const sourceResolvableHint = nonEmpty(entry?.itemRef?.uuid);

  if (!returnableState(lifecycle.state)) {
    return {
      ready: false,
      reason: "terminal-entry",
      lifecycle,
      snapshotAvailable,
      sourceResolvableHint,
    };
  }

  if (!Number.isInteger(entry?.quantity) || entry.quantity < 1) {
    return {
      ready: false,
      reason: "invalid-return-quantity",
      lifecycle,
      snapshotAvailable,
      sourceResolvableHint,
    };
  }

  if (!snapshotAvailable && !sourceResolvableHint) {
    return {
      ready: false,
      reason: "item-source-unavailable",
      lifecycle,
      snapshotAvailable,
      sourceResolvableHint,
    };
  }

  return {
    ready: true,
    reason: null,
    lifecycle,
    snapshotAvailable,
    sourceResolvableHint,
  };
}

export function buildExpeditionRestitutionPlan(manifest) {
  const returnItems = [];
  const blockedItems = [];

  for (const container of manifest?.containers ?? []) {
    const actorRef = containerActorRef(container);

    for (const entry of container?.contents ?? []) {
      const readiness = entryReadiness(entry);

      const row = {
        containerId: container.containerId ?? null,
        containerName: container.name ?? null,
        containerType: container.type ?? null,
        holderRef: clone(container.holderRef ?? null),
        actorRef,
        entryId: entry.entryId ?? null,
        itemName: entry.itemRef?.name ?? null,
        itemType: entry.itemRef?.type ?? null,
        sourceId: entry.itemRef?.sourceId ?? null,
        quantity: entry.quantity ?? null,
        slotId: entry.slotId ?? null,
        lifecycle: readiness.lifecycle,
        snapshotAvailable: readiness.snapshotAvailable,
        sourceResolvableHint: readiness.sourceResolvableHint,
      };

      if (!actorRef) {
        blockedItems.push({
          ...row,
          ready: false,
          reason: "container-holder-actor-not-found",
        });
        continue;
      }

      if (!readiness.ready) {
        blockedItems.push({
          ...row,
          ready: false,
          reason: readiness.reason,
        });
        continue;
      }

      returnItems.push({
        ...row,
        ready: true,
        reason: null,
      });
    }
  }

  const archive = listArchivedExpeditionItems(manifest);

  const archiveAudit = archive.entries.map((archived) => ({
    archiveId: archived.archiveId ?? null,
    archivedAt: archived.archivedAt ?? null,
    fromContainerId: archived.fromContainerId ?? null,
    fromContainerName: archived.fromContainerName ?? null,
    state:
      archived?.entry?.itemRef?.lifecycle?.state ??
      archived?.state ??
      "legacy",
    entryId: archived?.entry?.entryId ?? null,
    itemName: archived?.entry?.itemRef?.name ?? null,
    quantity: archived?.entry?.quantity ?? null,
    lifecycle: clone(archived?.entry?.itemRef?.lifecycle ?? null),
  }));

  const perActor = {};

  for (const item of returnItems) {
    perActor[item.actorRef] ??= {
      actorRef: item.actorRef,
      items: 0,
      quantity: 0,
    };

    perActor[item.actorRef].items += 1;
    perActor[item.actorRef].quantity += Math.max(
      0,
      Number(item.quantity) || 0
    );
  }

  return {
    green: blockedItems.length === 0,
    version: EXPEDITION_RESTITUTION_PLAN_VERSION,
    expeditionId: manifest?.expeditionId ?? null,
    revision: manifest?.revision ?? null,
    returnItems,
    blockedItems,
    archiveAudit,
    summary: {
      returnItems: returnItems.length,
      returnQuantity: returnItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.quantity) || 0),
        0
      ),
      blockedItems: blockedItems.length,
      archivedItems: archiveAudit.length,
      actors: Object.values(perActor),
    },
  };
}

export function restitutionPlanStatus(plan) {
  return {
    green: Boolean(plan?.green),
    version: plan?.version ?? null,
    expeditionId: plan?.expeditionId ?? null,
    revision: plan?.revision ?? null,
    returnItems: plan?.summary?.returnItems ?? 0,
    returnQuantity: plan?.summary?.returnQuantity ?? 0,
    blockedItems: plan?.summary?.blockedItems ?? 0,
    archivedItems: plan?.summary?.archivedItems ?? 0,
    actors: clone(plan?.summary?.actors ?? []),
  };
}
