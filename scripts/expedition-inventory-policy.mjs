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

export function normalizeBackpackSlots(container, slotCount) {
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  const contents = Array.isArray(container?.contents) ? container.contents : [];

  if (contents.length > count) {
    return {
      green: false,
      reason: `Impossible de réduire à ${count} slots : ${contents.length} objet(s) sont encore présents.`,
    };
  }

  const oldSlots = Array.isArray(container?.layout?.slots)
    ? container.layout.slots
    : [];

  const oldById = new Map(
    oldSlots
      .filter((slot) => slot?.slotId)
      .map((slot) => [slot.slotId, slot])
  );

  const slots = Array.from({ length: count }, (_, index) => {
    const slotId = `slot-${index + 1}`;
    return {
      ...(oldById.get(slotId) ?? {}),
      slotId,
    };
  });

  container.capacity ??= {};
  container.capacity.slots = count;
  container.layout ??= {};
  container.layout.slots = slots;

  // Compact contents deterministically so every entry still points to
  // an existing unique slot after a capacity edit.
  contents.forEach((entry, index) => {
    entry.slotId = slots[index]?.slotId ?? null;
  });

  return { green: true, slots: count };
}
