const MODULE_ID =
  "daggerheart-campaign-toolkit";

const SETTING_KEY =
  "craftingResearchQueue";

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

function normalizeContributors(
  contributors,
  legacyActorUuid = ""
) {
  const normalized = [];
  const seen = new Set();

  const add =
    (
      type,
      uuid
    ) => {
      type =
        String(
          type ?? "actor"
        ).trim() || "actor";

      uuid =
        String(
          uuid ?? ""
        ).trim();

      if (
        type !== "actor" ||
        !uuid ||
        seen.has(uuid)
      ) {
        return;
      }

      seen.add(uuid);

      normalized.push({
        type: "actor",
        uuid,
      });
    };

  if (Array.isArray(contributors)) {
    for (
      const contributor of
      contributors
    ) {
      if (
        typeof contributor ===
        "string"
      ) {
        add(
          "actor",
          contributor
        );
      } else {
        add(
          contributor?.type,
          contributor?.uuid
        );
      }
    }
  }

  /*
   * Soft migration from the R2 schema:
   * actorUuid becomes the first contributor.
   */
  if (
    !Array.isArray(contributors) &&
    normalized.length === 0 &&
    legacyActorUuid
  ) {
    add(
      "actor",
      legacyActorUuid
    );
  }

  return normalized;
}


function normalizeEntry(entry) {
  const turnsRequired =
    Number.isSafeInteger(
      Number(entry?.turnsRequired)
    ) &&
    Number(entry.turnsRequired) > 0
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

    contributors:
      normalizeContributors(
        entry?.contributors,
        String(
          entry?.actorUuid ?? ""
        ).trim()
      ),

    materialId:
      String(
        entry?.materialId ?? ""
      ).trim(),

    propertyId:
      String(
        entry?.propertyId ?? ""
      ).trim(),

    expeditionId:
      String(
        entry?.expeditionId ?? ""
      ).trim(),

    containerId:
      String(
        entry?.containerId ?? "fob"
      ).trim() || "fob",

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
              entry.materialId &&
              entry.propertyId &&
              entry.expeditionId
          )
      : [];

  return {
    schemaVersion:
      SCHEMA_VERSION,

    revision:
      Number.isSafeInteger(
        source.revision
      ) &&
      source.revision >= 0
        ? source.revision
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
      "Crafting research queue setting is not registered."
    );
  }
}

function assertGm() {
  if (!game.user?.isGM) {
    throw new Error(
      "Crafting research queue mutation is GM-only."
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


  Hooks.callAll(
    `${MODULE_ID}.fobActivitiesChanged`,
    {
      kind: "research",
      revision:
        normalized.revision,
    }
  );

  return normalized;
}

function requestId() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ??
    `dhct-research-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}

function materialData(entry) {
  return (
    entry?.itemRef
      ?.snapshot
      ?.flags
      ?.[MODULE_ID]
      ?.material ??
    null
  );
}

function materialHasProperty(
  material,
  propertyId
) {
  const properties =
    material?.material?.properties;

  if (Array.isArray(properties)) {
    return properties.includes(
      propertyId
    );
  }

  return Boolean(
    properties &&
    typeof properties === "object" &&
    Number(
      properties[propertyId]
    ) > 0
  );
}

function researchTurns(material) {
  const configured =
    Number(
      material?.research?.turns
    );

  return Number.isSafeInteger(
    configured
  ) &&
  configured > 0
    ? configured
    : 1;
}

function isFobContainer(container) {
  if (!container) return false;

  if (
    String(
      container.containerId ?? ""
    ) === "fob"
  ) {
    return true;
  }

  return (
    String(
      container.presentation
        ?.playerRole ?? ""
    )
      .trim()
      .toLowerCase() === "fob"
  );
}

export function registerCraftingResearchQueueSetting() {
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
        "File de recherche du Centre d'étude",

      hint:
        "Recherches de matériaux actives et en attente, progressées par les tours de FOB.",

      scope: "world",
      config: false,
      type: Object,
      default: emptyState(),
    }
  );
}

export function createCraftingResearchQueueApi({
  materialsApi,
  persistenceApi,
} = {}) {
  if (!materialsApi?.get) {
    throw new Error(
      "craftingMaterials API is required."
    );
  }

  if (!persistenceApi?.load) {
    throw new Error(
      "expedition persistence API is required."
    );
  }

  function status() {
    const state =
      readState();

    return {
      green: true,
      schemaVersion:
        state.schemaVersion,
      revision:
        state.revision,
      active:
        clone(
          state.queue[0] ?? null
        ),
      queue:
        clone(state.queue),
      count:
        state.queue.length,
    };
  }

  async function enqueue({
    actor,
    actorUuid = null,
    materialId,
    propertyId,
    expeditionId,
    containerId = "fob",
  } = {}) {
    assertGm();

    const resolvedActorUuid =
      String(
        actor?.uuid ??
        actorUuid ??
        ""
      ).trim();

    materialId =
      String(
        materialId ?? ""
      ).trim();

    propertyId =
      String(
        propertyId ?? ""
      ).trim();

    expeditionId =
      String(
        expeditionId ?? ""
      ).trim();

    containerId =
      String(
        containerId ?? "fob"
      ).trim() || "fob";

    if (!resolvedActorUuid) {
      return {
        green: false,
        reason:
          "research-actor-required",
      };
    }

    if (!materialId) {
      return {
        green: false,
        reason:
          "material-id-required",
      };
    }

    if (!propertyId) {
      return {
        green: false,
        reason:
          "property-id-required",
      };
    }

    if (!expeditionId) {
      return {
        green: false,
        reason:
          "expedition-id-required",
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
          "research-actor-not-found",
      };
    }

    const material =
      await materialsApi.get(
        materialId
      );

    if (!material) {
      return {
        green: false,
        reason:
          "material-not-found",
        materialId,
      };
    }

    if (
      !material.research
        ?.discoverable
    ) {
      return {
        green: false,
        reason:
          "material-not-research-discoverable",
        materialId,
      };
    }

    if (
      !materialHasProperty(
        material,
        propertyId
      )
    ) {
      return {
        green: false,
        reason:
          "material-property-not-found",
        materialId,
        propertyId,
      };
    }

    const manifest =
      await persistenceApi.load(
        expeditionId
      );

    if (!manifest) {
      return {
        green: false,
        reason:
          "expedition-not-found",
        expeditionId,
      };
    }

    const container =
      manifest.containers?.find(
        candidate =>
          candidate.containerId ===
          containerId
      );

    if (!container) {
      return {
        green: false,
        reason:
          "research-container-not-found",
        expeditionId,
        containerId,
      };
    }

    const fobContainerId =
      String(
        manifest?.fob
          ?.storageContainerId ??
        ""
      ).trim();

    if (
      !fobContainerId ||
      containerId !==
        fobContainerId
    ) {
      return {
        green: false,
        reason:
          "research-container-not-fob",
        expeditionId,
        containerId,
        expectedContainerId:
          fobContainerId || null,
      };
    }

    const specimenRequired =
      material.research?.specimen
        ?.required === true;

    if (specimenRequired) {
      const specimenQuantity =
        (
          container.contents ?? []
        )
          .filter(
            entry =>
              materialData(entry)
                ?.materialId ===
                materialId &&
              Number(
                entry?.quantity
              ) > 0 &&
              ![
                "consumed",
                "deleted",
              ].includes(
                entry?.itemRef
                  ?.lifecycle
                  ?.state
              )
          )
          .reduce(
            (sum, entry) =>
              sum +
              Math.max(
                0,
                Number(
                  entry.quantity
                ) || 0
              ),
            0
          );

      if (
        specimenQuantity < 1
      ) {
        return {
          green: false,
          reason:
            "research-specimen-required",
          materialId,
          expeditionId,
          containerId,
        };
      }
    }

    const state =
      readState();

    const duplicate =
      state.queue.find(
        entry =>
          entry.expeditionId ===
            expeditionId &&
          entry.materialId ===
            materialId &&
          entry.propertyId ===
            propertyId
      );

    if (duplicate) {
      const alreadyContributor =
        duplicate.contributors
          .some(
            contributor =>
              contributor.type ===
                "actor" &&
              contributor.uuid ===
                resolvedActorUuid
          );

      if (alreadyContributor) {
        return {
          green: true,
          changed: false,
          reason:
            "research-contributor-already-present",
          entry:
            clone(duplicate),
        };
      }

      duplicate.contributors.push({
        type: "actor",
        uuid:
          resolvedActorUuid,
      });

      const saved =
        await writeState(state);

      const savedEntry =
        saved.queue.find(
          candidate =>
            candidate.id ===
            duplicate.id
        ) ?? null;

      return {
        green: true,
        changed: true,
        reason:
          "research-contributor-added",
        entry:
          clone(savedEntry),
        contributor: {
          type: "actor",
          uuid:
            resolvedActorUuid,
        },
        count:
          saved.queue.length,
      };
    }

    const entry = {
      id: requestId(),
      actorUuid:
        resolvedActorUuid,

      contributors: [
        {
          type: "actor",
          uuid:
            resolvedActorUuid,
        },
      ],

      materialId,
      propertyId,
      expeditionId,
      containerId,

      turnsRequired:
        researchTurns(material),

      progress: 0,
      queuedAt: Date.now(),
    };

    state.queue.push(entry);

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      entry: clone(entry),
      position:
        saved.queue.findIndex(
          candidate =>
            candidate.id ===
            entry.id
        ),
      count:
        saved.queue.length,
    };
  }

  async function remove(id) {
    assertGm();

    id =
      String(id ?? "").trim();

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
          "research-entry-not-found",
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
      String(id ?? "").trim();

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
          "research-entry-not-found",
        id,
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
          "research-target-index-invalid",
      };
    }

    if (
      sourceIndex ===
      targetIndex
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


  async function addContributor(
    id,
    actorUuid
  ) {
    assertGm();

    id =
      String(
        id ?? ""
      ).trim();

    actorUuid =
      String(
        actorUuid ?? ""
      ).trim();

    if (!actorUuid) {
      return {
        green: false,
        reason:
          "research-contributor-required",
      };
    }

    const actor =
      await fromUuid(
        actorUuid
      );

    if (
      !actor ||
      actor.documentName !==
        "Actor"
    ) {
      return {
        green: false,
        reason:
          "research-contributor-not-found",
        actorUuid,
      };
    }

    const state =
      readState();

    const entry =
      state.queue.find(
        candidate =>
          candidate.id === id
      );

    if (!entry) {
      return {
        green: false,
        reason:
          "research-entry-not-found",
        id,
      };
    }

    const exists =
      entry.contributors.some(
        contributor =>
          contributor.type ===
            "actor" &&
          contributor.uuid ===
            actorUuid
      );

    if (exists) {
      return {
        green: true,
        changed: false,
        reason:
          "research-contributor-already-present",
        entry:
          clone(entry),
      };
    }

    entry.contributors.push({
      type: "actor",
      uuid:
        actorUuid,
    });

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      entry:
        clone(
          saved.queue.find(
            candidate =>
              candidate.id === id
          ) ?? null
        ),
    };
  }


  async function removeContributor(
    id,
    actorUuid
  ) {
    assertGm();

    id =
      String(
        id ?? ""
      ).trim();

    actorUuid =
      String(
        actorUuid ?? ""
      ).trim();

    const state =
      readState();

    const entry =
      state.queue.find(
        candidate =>
          candidate.id === id
      );

    if (!entry) {
      return {
        green: false,
        reason:
          "research-entry-not-found",
        id,
      };
    }

    const before =
      entry.contributors.length;

    entry.contributors =
      entry.contributors.filter(
        contributor =>
          !(
            contributor.type ===
              "actor" &&
            contributor.uuid ===
              actorUuid
          )
      );

    if (
      entry.contributors.length ===
      before
    ) {
      return {
        green: true,
        changed: false,
        reason:
          "research-contributor-not-present",
        entry:
          clone(entry),
      };
    }

    /*
     * actorUuid is deliberately retained as
     * the legacy owner/resolution actor for R3.
     * R4 will use contributors exclusively
     * for progression.
     */
    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      entry:
        clone(
          saved.queue.find(
            candidate =>
              candidate.id === id
          ) ?? null
        ),
    };
  }


  async function progress(id) {
    assertGm();

    id =
      String(id ?? "").trim();

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
          "research-entry-not-found",
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

        progressDelta: 0,

        contributorCount:
          new Set(
            (
              entry.contributors ??
              []
            )
              .filter(
                contributor =>
                  contributor?.type ===
                    "actor" &&
                  contributor?.uuid
              )
              .map(
                contributor =>
                  contributor.uuid
              )
          ).size,

        entry:
          clone(entry),

        count:
          state.queue.length,
      };
    }

    const contributorCount =
      new Set(
        (
          entry.contributors ??
          []
        )
          .filter(
            contributor =>
              contributor?.type ===
                "actor" &&
              contributor?.uuid
          )
          .map(
            contributor =>
              contributor.uuid
          )
      ).size;

    /*
     * Une recherche sans contributeur reste
     * programmée mais ne progresse pas.
     */
    if (contributorCount === 0) {
      return {
        green: true,
        changed: false,
        completed: false,

        progressDelta: 0,
        contributorCount: 0,

        entry:
          clone(entry),

        count:
          state.queue.length,
      };
    }

    const before =
      entry.progress;

    entry.progress =
      Math.min(
        entry.turnsRequired,
        entry.progress +
          contributorCount
      );

    const progressDelta =
      entry.progress -
      before;

    const saved =
      await writeState(state);

    const savedEntry =
      saved.queue.find(
        candidate =>
          candidate.id === id
      ) ?? null;

    return {
      green: true,

      changed:
        progressDelta > 0,

      progressDelta,
      contributorCount,

      completed:
        Boolean(
          savedEntry &&
          savedEntry.progress >=
            savedEntry.turnsRequired
        ),

      entry:
        clone(savedEntry),

      count:
        saved.queue.length,
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

    state.queue = [];

    await writeState(state);

    return {
      green: true,
      changed: true,
      count: 0,
    };
  }

  return Object.freeze({
    status,
    enqueue,
    remove,
    move,
    addContributor,
    removeContributor,

    progress,
    clear,
  });
}
