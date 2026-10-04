import {
  containerUsedSlots,
  resolveEntryStorageProfile,
} from "./expedition-storage.mjs";
import {
  logisticsDirectionAllowed,
  normalizeContainerRole,
} from "./expedition-logistics-phase.mjs";

export function backpackAccessState(container) {
  return container?.presentation?.accessState === "stored"
    ? "stored"
    : "available";
}

export function backpackStoredAt(container) {
  return String(container?.presentation?.storedAt ?? "").trim();
}

function normalizeAccessToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function inferredSharedRole(container) {
  const explicit = normalizeAccessToken(
    container?.presentation?.playerRole
  );

  if (["fob", "caravan", "ground"].includes(explicit)) {
    return explicit;
  }

  const type = normalizeAccessToken(container?.type);
  const name = normalizeAccessToken(container?.name);

  if (type === "caravan" || name.includes("caravane") || name.includes("caravan")) {
    return "caravan";
  }

  if (
    ["fob", "camp", "forward-base", "forward_base", "forwardbase"].includes(type) ||
    name === "fob" ||
    name.includes("camp avance") ||
    name.includes("forward operating base")
  ) {
    return "fob";
  }

  if (
    ["ground", "floor", "sol"].includes(type) ||
    name === "sol" ||
    name.includes("zone au sol") ||
    name.includes("ground")
  ) {
    return "ground";
  }

  return null;
}

export function sharedPlayerAccessEnabled(container) {
  return container?.presentation?.playerAccess === true;
}

function actorFromHolderRef(holderRef) {
  const uuid =
    holderRef?.foundryActorUuid ??
    holderRef?.actorUuid ??
    holderRef?.uuid ??
    null;

  if (!uuid) return null;

  try {
    if (typeof fromUuidSync === "function") {
      const doc = fromUuidSync(uuid);
      if (doc?.documentName === "Actor") return doc;
    }
  } catch (_error) {
    // Fall through to direct Actor lookup.
  }

  if (String(uuid).startsWith("Actor.")) {
    return game.actors?.get(String(uuid).slice(6)) ?? null;
  }

  return game.actors?.get(String(uuid)) ?? null;
}

export function userOwnsBackpack(user, container) {
  if (container?.type !== "backpack") return false;

  const actor = actorFromHolderRef(container?.holderRef);
  if (!actor || !user) return false;

  const assignedCharacter = user.character ?? null;

  if (assignedCharacter) {
    return actor.id === assignedCharacter.id;
  }

  if (typeof actor.testUserPermission === "function") {
    return actor.testUserPermission(user, "OWNER");
  }

  return user.id === game.user?.id ? Boolean(actor.isOwner) : false;
}

export function userCanAccessContainer(user, container) {
  if (!container || !user) return false;
  if (user.isGM) return true;

  if (container.type === "backpack") {
    return (
      userOwnsBackpack(user, container) &&
      backpackAccessState(container) !== "stored"
    );
  }

  const role = inferredSharedRole(container);

  return Boolean(
    role &&
    ["fob", "caravan", "ground"].includes(role) &&
    sharedPlayerAccessEnabled(container)
  );
}

/**
 * Resolve the logistics role used by directional transfer policy.
 *
 * Backpack is an intrinsic container type.
 * Shared roles remain resolved through inferredSharedRole().
 */
export function caravanStorageContainerIds(
  manifest
) {
  return new Set(
    (
      manifest?.caravan
        ?.components ?? []
    )
      .map(
        (component) =>
          typeof component?.containerId ===
            "string"
            ? component.containerId.trim()
            : ""
      )
      .filter(Boolean)
  );
}

export function isCaravanStorageContainer(
  manifest,
  container
) {
  const containerId =
    typeof container?.containerId ===
      "string"
      ? container.containerId.trim()
      : "";

  if (!containerId) {
    return false;
  }

  return caravanStorageContainerIds(
    manifest
  ).has(containerId);
}

/**
 * Resolve the logistics role used by directional transfer policy.
 *
 * Backpack is intrinsic.
 * Caravan storage is structural: a container is caravan storage only when
 * referenced by manifest.caravan.components[].containerId.
 * Ground and FOB still use the shared-role resolver until the cleanup pass.
 */
export function containerLogisticsRole(
  manifest,
  container
) {
  if (!container) {
    return null;
  }

  if (
    container.type ===
    "backpack"
  ) {
    return "backpack";
  }

  if (
    isCaravanStorageContainer(
      manifest,
      container
    )
  ) {
    return "caravan-storage";
  }

  const sharedRole =
    inferredSharedRole(
      container
    );

  return normalizeContainerRole(
    sharedRole,
    null
  );
}

export function userCanTransferBetweenContainers({
  user,
  manifest = null,
  source,
  destination,
  phase,
} = {}) {
  if (
    !user ||
    !source ||
    !destination
  ) {
    return false;
  }

  if (
    source.id != null &&
    destination.id != null &&
    String(source.id) ===
      String(destination.id)
  ) {
    return false;
  }

  if (
    !userCanAccessContainer(user, source) ||
    !userCanAccessContainer(user, destination)
  ) {
    return false;
  }

  const sourceRole =
    containerLogisticsRole(
      manifest,
      source
    );

  const destinationRole =
    containerLogisticsRole(
      manifest,
      destination
    );

  if (
    !sourceRole ||
    !destinationRole
  ) {
    return false;
  }

  return logisticsDirectionAllowed({
    phase,
    sourceRole,
    destinationRole,
  });
}

export function normalizeBackpackSlots(container, slotCount) {
  const count = Math.max(
    0,
    Math.floor(Number(slotCount) || 0)
  );

  const used = containerUsedSlots(container, {
    resolveStorage: resolveEntryStorageProfile,
  });

  if (used > count) {
    return {
      green: false,
      reason:
        `Impossible de r?duire ? ${count} slots : ${used} slot(s) sont encore utilis?s.`,
    };
  }

  container.capacity ??= {};
  container.capacity.slots = count;

  return {
    green: true,
    slots: count,
    used,
    free: Math.max(0, count - used),
  };
}
