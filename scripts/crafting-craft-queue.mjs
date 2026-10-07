const MODULE_ID =
  "daggerheart-campaign-toolkit";

const SETTING_KEY =
  "craftingCraftQueue";

const SCHEMA_VERSION = 1;

function clone(value) {
  return value == null
    ? value
    : structuredClone(value);
}

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    queue: [],
  };
}

function normalizeEntry(entry) {
  const turnsRequired =
    Number.isSafeInteger(
      Number(entry?.turnsRequired)
    ) &&
    Number(entry?.turnsRequired) > 0
      ? Number(entry.turnsRequired)
      : 1;

  const progress =
    Math.max(
      0,
      Math.min(
        turnsRequired,
        Number.isSafeInteger(
          Number(entry?.progress)
        )
          ? Number(entry.progress)
          : 0
      )
    );

  return {
    id:
      String(entry?.id ?? "").trim(),

    actorUuid:
      String(
        entry?.actorUuid ?? ""
      ).trim(),

    weaponUuid:
      String(
        entry?.weaponUuid ?? ""
      ).trim(),

    augmentId:
      String(
        entry?.augmentId ?? ""
      ).trim(),

    expeditionId:
      String(
        entry?.expeditionId ?? ""
      ).trim(),

    turnsRequired,
    progress,

    queuedAt:
      Number(entry?.queuedAt) || 0,
  };
}

function normalizeState(raw) {
  const source =
    raw &&
    typeof raw === "object"
      ? raw
      : emptyState();

  const queue =
    Array.isArray(source.queue)
      ? source.queue
          .map(normalizeEntry)
          .filter(
            entry =>
              entry.id &&
              entry.actorUuid &&
              entry.weaponUuid &&
              entry.augmentId &&
              entry.expeditionId
          )
      : [];

  return {
    schemaVersion:
      SCHEMA_VERSION,

    revision:
      Number.isSafeInteger(
        Number(source.revision)
      ) &&
      Number(source.revision) >= 0
        ? Number(source.revision)
        : 0,

    queue,
  };
}

function assertRegistered() {
  if (
    !game.settings.settings.has(
      `${MODULE_ID}.${SETTING_KEY}`
    )
  ) {
    throw new Error(
      "Crafting craft queue setting is not registered."
    );
  }
}

function assertGm() {
  if (!game.user?.isGM) {
    throw new Error(
      "Crafting craft queue mutation is GM-only."
    );
  }
}

function readState() {
  assertRegistered();

  return normalizeState(
    game.settings.get(
      MODULE_ID,
      SETTING_KEY
    )
  );
}

async function writeState(state) {
  assertGm();

  const normalized =
    normalizeState(state);

  normalized.revision += 1;

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    normalized
  );

  return normalized;
}

function requestId() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ??
    `dhct-craft-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}

export function registerCraftingCraftQueueSetting() {
  if (
    game.settings.settings.has(
      `${MODULE_ID}.${SETTING_KEY}`
    )
  ) {
    return;
  }

  game.settings.register(
    MODULE_ID,
    SETTING_KEY,
    {
      name:
        "File de fabrication de l'atelier",

      hint:
        "Fabrications d'armes de chasse en attente ou en progression au FOB.",

      scope: "world",
      config: false,
      type: Object,
      default: emptyState(),
    }
  );
}

export function createCraftingCraftQueueApi({
  craftingApi,
} = {}) {
  if (
    !craftingApi
      ?.planWeaponAugment
  ) {
    throw new Error(
      "crafting API is required."
    );
  }

  function status({
    actorUuid = null,
  } = {}) {
    const state =
      readState();

    let queue =
      state.queue;

    if (actorUuid != null) {
      const resolved =
        String(
          actorUuid ?? ""
        ).trim();

      queue =
        queue.filter(
          entry =>
            entry.actorUuid ===
            resolved
        );
    }

    return {
      green: true,
      schemaVersion:
        state.schemaVersion,
      revision:
        state.revision,
      queue:
        clone(queue),
      count:
        queue.length,
    };
  }

  async function enqueue({
    actor,
    actorUuid = null,
    weapon,
    weaponUuid = null,
    augmentId,
    expeditionId,
    turnsRequired = 1,
  } = {}) {
    assertGm();

    const resolvedActorUuid =
      String(
        actor?.uuid ??
        actorUuid ??
        ""
      ).trim();

    const resolvedWeaponUuid =
      String(
        weapon?.uuid ??
        weaponUuid ??
        ""
      ).trim();

    augmentId =
      String(
        augmentId ?? ""
      ).trim();

    expeditionId =
      String(
        expeditionId ?? ""
      ).trim();

    turnsRequired =
      Number(turnsRequired);

    if (!resolvedActorUuid) {
      return {
        green: false,
        reason:
          "craft-actor-required",
      };
    }

    if (!resolvedWeaponUuid) {
      return {
        green: false,
        reason:
          "craft-weapon-required",
      };
    }

    if (!augmentId) {
      return {
        green: false,
        reason:
          "craft-augment-required",
      };
    }

    if (!expeditionId) {
      return {
        green: false,
        reason:
          "expedition-id-required",
      };
    }

    if (
      !Number.isSafeInteger(
        turnsRequired
      ) ||
      turnsRequired < 1
    ) {
      return {
        green: false,
        reason:
          "craft-turns-invalid",
      };
    }

    const resolvedActor =
      actor?.uuid
        ? actor
        : await fromUuid(
            resolvedActorUuid
          );

    if (
      !resolvedActor ||
      resolvedActor.documentName !==
        "Actor"
    ) {
      return {
        green: false,
        reason:
          "craft-actor-not-found",
      };
    }

    const resolvedWeapon =
      weapon?.uuid
        ? weapon
        : await fromUuid(
            resolvedWeaponUuid
          );

    if (
      !resolvedWeapon ||
      resolvedWeapon.documentName !==
        "Item"
    ) {
      return {
        green: false,
        reason:
          "craft-weapon-not-found",
      };
    }

    const state =
      readState();

    const duplicate =
      state.queue.find(
        entry =>
          entry.actorUuid ===
            resolvedActorUuid &&
          entry.weaponUuid ===
            resolvedWeaponUuid &&
          entry.augmentId ===
            augmentId
      );

    if (duplicate) {
      return {
        green: false,
        reason:
          "craft-already-queued",
        entry:
          clone(duplicate),
      };
    }

    const plan =
      await craftingApi
        .planWeaponAugment({
          crafter:
            resolvedActor,
          augmentId,
          expeditionId,
        });

    if (!plan?.green) {
      return {
        ...clone(plan),
        green: false,
        reason:
          plan?.reason ??
          "craft-plan-unavailable",
      };
    }

    const entry = {
      id:
        requestId(),

      actorUuid:
        resolvedActorUuid,

      weaponUuid:
        resolvedWeaponUuid,

      augmentId,
      expeditionId,

      turnsRequired,
      progress: 0,

      queuedAt:
        Date.now(),
    };

    state.queue.push(entry);

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      entry:
        clone(entry),

      position:
        saved.queue.findIndex(
          candidate =>
            candidate.id ===
            entry.id
        ),

      count:
        saved.queue.length,

      plan: {
        recipeId:
          plan.recipeId ?? null,
        containerId:
          plan.containerId ?? null,
        allocations:
          clone(
            plan.allocations ?? []
          ),
      },
    };
  }

  async function progress(id) {
    assertGm();

    id =
      String(
        id ?? ""
      ).trim();

    const state =
      readState();

    const index =
      state.queue.findIndex(
        entry =>
          entry.id === id
      );

    if (index < 0) {
      return {
        green: false,
        reason:
          "craft-entry-not-found",
        id,
      };
    }

    const entry =
      state.queue[index];

    if (
      entry.progress >=
      entry.turnsRequired
    ) {
      return {
        green: true,
        changed: false,
        completed: true,
        entry:
          clone(entry),
      };
    }

    entry.progress =
      Math.min(
        entry.turnsRequired,
        entry.progress + 1
      );

    const saved =
      await writeState(state);

    const savedEntry =
      saved.queue.find(
        candidate =>
          candidate.id === id
      );

    return {
      green: true,
      changed: true,
      completed:
        savedEntry.progress >=
        savedEntry.turnsRequired,
      entry:
        clone(savedEntry),
    };
  }

  async function remove(id) {
    assertGm();

    id =
      String(
        id ?? ""
      ).trim();

    const state =
      readState();

    const index =
      state.queue.findIndex(
        entry =>
          entry.id === id
      );

    if (index < 0) {
      return {
        green: false,
        reason:
          "craft-entry-not-found",
        id,
      };
    }

    const [removed] =
      state.queue.splice(
        index,
        1
      );

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      removed:
        clone(removed),
      count:
        saved.queue.length,
    };
  }

  async function move(
    id,
    targetIndex
  ) {
    assertGm();

    id =
      String(
        id ?? ""
      ).trim();

    targetIndex =
      Number(targetIndex);

    const state =
      readState();

    const sourceIndex =
      state.queue.findIndex(
        entry =>
          entry.id === id
      );

    if (sourceIndex < 0) {
      return {
        green: false,
        reason:
          "craft-entry-not-found",
      };
    }

    if (
      !Number.isSafeInteger(
        targetIndex
      ) ||
      targetIndex < 0 ||
      targetIndex >=
        state.queue.length
    ) {
      return {
        green: false,
        reason:
          "craft-target-index-invalid",
      };
    }

    if (
      sourceIndex === targetIndex
    ) {
      return {
        green: true,
        changed: false,
        queue:
          clone(state.queue),
      };
    }

    const [entry] =
      state.queue.splice(
        sourceIndex,
        1
      );

    state.queue.splice(
      targetIndex,
      0,
      entry
    );

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      queue:
        clone(saved.queue),
    };
  }

  async function clear() {
    assertGm();

    const state =
      readState();

    if (
      state.queue.length === 0
    ) {
      return {
        green: true,
        changed: false,
        count: 0,
      };
    }

    const removed =
      state.queue.length;

    state.queue = [];

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      removed,
      count:
        saved.queue.length,
    };
  }

  return Object.freeze({
    status,
    enqueue,
    progress,
    remove,
    move,
    clear,
  });
}
