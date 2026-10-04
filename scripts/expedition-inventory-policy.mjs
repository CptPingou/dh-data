import {
  containerUsedSlots,
  resolveEntryStorageProfile,
} from "./expedition-storage.mjs";
import {
  characterCanViewZone,
  characterCanTransferZone,
} from "./expedition-access.mjs";

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

export function containerAccessZone(
  manifest,
  container
) {
  if (
    !container ||
    container.type === "backpack"
  ) {
    return null;
  }

  const containerId =
    String(
      container?.containerId ??
      ""
    ).trim();

  if (
    isCaravanStorageContainer(
      manifest,
      container
    )
  ) {
    return "caravan";
  }

  if (
    containerId &&
    containerId ===
      String(
        manifest?.fob
          ?.storageContainerId ??
        ""
      ).trim()
  ) {
    return "fob";
  }

  if (containerId === "ground") {
    return "ground";
  }

  const legacyRole =
    inferredSharedRole(
      container
    );

  if (
    legacyRole === "fob" ||
    legacyRole === "ground"
  ) {
    return legacyRole;
  }

  return null;
}

export function userCharacterId(
  user,
  manifest
) {
  if (!user) {
    return null;
  }

  const actorId =
    user?.character?.id ??
    null;

  if (actorId) {
    const character =
      (
        manifest?.characters ??
        []
      ).find(
        (candidate) =>
          candidate?.foundryActorUuid ===
            "Actor." + actorId ||
          candidate?.actorUuid ===
            "Actor." + actorId ||
          candidate?.characterId ===
            actorId
      );

    if (character?.characterId) {
      return character.characterId;
    }
  }

  const ownedBackpack =
    (
      manifest?.containers ??
      []
    ).find(
      (container) =>
        container?.type ===
          "backpack" &&
        container?.holderRef
          ?.kind ===
          "character" &&
        userOwnsBackpack(
          user,
          container
        )
    );

  const holderCharacterId =
    String(
      ownedBackpack?.holderRef
        ?.id ??
      ""
    ).trim();

  if (holderCharacterId) {
    return holderCharacterId;
  }

  return actorId;
}

export function userCanViewZone(
  user,
  manifest,
  zone
) {
  if (!user) {
    return false;
  }

  if (user.isGM) {
    return true;
  }

  const characterId =
    userCharacterId(
      user,
      manifest
    );

  if (!characterId) {
    return false;
  }

  return characterCanViewZone(
    manifest,
    characterId,
    zone
  );
}

export function userCanTransferZone(
  user,
  manifest,
  zone
) {
  if (!user) {
    return false;
  }

  if (user.isGM) {
    return true;
  }

  const characterId =
    userCharacterId(
      user,
      manifest
    );

  if (!characterId) {
    return false;
  }

  return characterCanTransferZone(
    manifest,
    characterId,
    zone
  );
}

export function userCanAccessContainer(
  user,
  container,
  manifest = null
) {
  if (!container || !user) {
    return false;
  }

  if (user.isGM) {
    return true;
  }

  if (
    container.type ===
    "backpack"
  ) {
    return (
      userOwnsBackpack(
        user,
        container
      ) &&
      backpackAccessState(
        container
      ) !== "stored"
    );
  }

  const zone =
    containerAccessZone(
      manifest,
      container
    );

  if (!zone) {
    return false;
  }

  return userCanViewZone(
    user,
    manifest,
    zone
  );
}

export function userCanTransferBetweenContainers({
  user,
  manifest = null,
  source,
  destination,
} = {}) {
  if (
    !user ||
    !source ||
    !destination
  ) {
    return false;
  }

  const sourceId =
    String(
      source?.containerId ??
      source?.id ??
      ""
    );

  const destinationId =
    String(
      destination?.containerId ??
      destination?.id ??
      ""
    );

  if (
    sourceId &&
    destinationId &&
    sourceId ===
      destinationId
  ) {
    return false;
  }

  if (user.isGM) {
    return true;
  }

  if (
    !userCanAccessContainer(
      user,
      source,
      manifest
    ) ||
    !userCanAccessContainer(
      user,
      destination,
      manifest
    )
  ) {
    return false;
  }

  const sourceZone =
    containerAccessZone(
      manifest,
      source
    );

  const destinationZone =
    containerAccessZone(
      manifest,
      destination
    );

  const zones =
    [
      sourceZone,
      destinationZone,
    ].filter(Boolean);

  if (!zones.length) {
    return (
      source.type === "backpack" &&
      destination.type === "backpack"
    );
  }

  return zones.every(
    (zone) =>
      userCanTransferZone(
        user,
        manifest,
        zone
      )
  );
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
