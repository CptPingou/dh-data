const MODULE_ID = "daggerheart-campaign-toolkit";
const DEFAULT_BACKPACK_SLOTS = 8;

function api() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "world";
}

function activeManifestCandidate(rows = []) {
  return [...rows]
    .sort((a, b) => {
      const score = (row) => {
        if (row?.phase === "in_session") return 30;
        if (row?.phase === "prepared") return 20;
        if (row?.phase === "returned") return 10;
        return 0;
      };
      return score(b) - score(a);
    })[0] ?? null;
}

function characterIdFor(actor) {
  return `foundry-character-${actor.id}`;
}

function backpackIdFor(actor) {
  return `foundry-backpack-${actor.id}`;
}

function findCharacter(manifest, actor) {
  return (manifest.characters ?? []).find((character) =>
    character?.foundryActorUuid === actor.uuid ||
    character?.characterId === characterIdFor(actor)
  ) ?? null;
}

function findBackpack(manifest, actor, characterId = null) {
  return (manifest.containers ?? []).find((container) =>
    container?.type === "backpack" &&
    container?.scope === "personal" &&
    (
      container?.holderRef?.foundryActorUuid === actor.uuid ||
      (characterId && container?.holderRef?.id === characterId)
    )
  ) ?? null;
}

function ensureCharacter(manifest, actor) {
  manifest.characters ??= [];

  let character = findCharacter(manifest, actor);
  if (character) {
    let changed = false;

    if (character.name !== actor.name) {
      character.name = actor.name;
      changed = true;
    }

    if (character.foundryActorUuid !== actor.uuid) {
      character.foundryActorUuid = actor.uuid;
      changed = true;
    }

    return { character, created: false, changed };
  }

  character = {
    characterId: characterIdFor(actor),
    name: actor.name,
    foundryActorUuid: actor.uuid,
  };

  manifest.characters.push(character);
  return { character, created: true, changed: true };
}

function ensureBackpack(manifest, actor, character) {
  manifest.containers ??= [];

  let container = findBackpack(manifest, actor, character.characterId);
  if (container) {
    let changed = false;

    container.holderRef ??= {};

    const expectedHolder = {
      kind: "character",
      id: character.characterId,
      foundryActorUuid: actor.uuid,
    };

    for (const [key, value] of Object.entries(expectedHolder)) {
      if (container.holderRef[key] !== value) {
        container.holderRef[key] = value;
        changed = true;
      }
    }

    if (container.scope !== "personal") {
      container.scope = "personal";
      changed = true;
    }

    if (container.type !== "backpack") {
      container.type = "backpack";
      changed = true;
    }

    if (!container.name) {
      container.name = `Sac à dos — ${actor.name}`;
      changed = true;
    }

    container.capacity ??= { slots: DEFAULT_BACKPACK_SLOTS };
    if (!Number.isInteger(container.capacity.slots) || container.capacity.slots < 0) {
      container.capacity.slots = DEFAULT_BACKPACK_SLOTS;
      changed = true;
    }

    // Migrate legacy physical inventory fields to abstract capacity.
    if (Object.prototype.hasOwnProperty.call(container, "layout")) {
      delete container.layout;
      changed = true;
    }

    for (const entry of container.contents ?? []) {
      if (Object.prototype.hasOwnProperty.call(entry, "slotId")) {
        delete entry.slotId;
        changed = true;
      }
    }

    const backpackStorageProfile = {
      accepts: [],
      mergeStacks: true,
    };

    if (
      JSON.stringify(
        container.storageProfile ?? null
      ) !==
      JSON.stringify(
        backpackStorageProfile
      )
    ) {
      container.storageProfile =
        structuredClone(
          backpackStorageProfile
        );

      changed = true;
    }

    const backpackMaterialStorage = { accepts: [], stackLimit: 1, mergeStacks: false };
    if (JSON.stringify(container.materialStorage ?? null) !== JSON.stringify(backpackMaterialStorage)) {
      container.materialStorage = backpackMaterialStorage;
      changed = true;
    }

    if (!Array.isArray(container.rules)) {
      container.rules = [];
      changed = true;
    }

    if (!Array.isArray(container.contents)) {
      container.contents = [];
      changed = true;
    }

    return { container, created: false, changed };
  }

  const containerId = backpackIdFor(actor);
  container = {
    containerId,
    type: "backpack",
    name: `Sac à dos — ${actor.name}`,
    scope: "personal",
    holderRef: {
      kind: "character",
      id: character.characterId,
      foundryActorUuid: actor.uuid,
    },
    capacity: {
      slots: DEFAULT_BACKPACK_SLOTS,
    },
    storageProfile: {
      accepts: [],
      mergeStacks: true,
    },
    materialStorage: {
      accepts: [],
      stackLimit: 1,
      mergeStacks: false,
    },
    rules: [],
    contents: [],
  };

  manifest.containers.push(container);
  return { container, created: true, changed: true };
}

async function loadOrCreateManifest(expeditionApi) {
  const listed = await expeditionApi.list();
  const summaries = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.manifests)
      ? listed.manifests
      : [];

  const candidate = activeManifestCandidate(summaries);
  if (candidate?.expeditionId) {
    return {
      manifest: await expeditionApi.load(candidate.expeditionId),
      created: false,
    };
  }

  const expeditionId = `world-${slug(game.world?.id ?? game.world?.title ?? "world")}`;
  return {
    manifest: expeditionApi.createEmpty({ expeditionId }),
    created: true,
  };
}

async function bootstrapWorldExpedition({ notify = false } = {}) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "gm-required",
    };
  }

  const toolkitApi = api();
  const expeditionApi = toolkitApi?.expeditionManifest;

  if (
    !expeditionApi?.list ||
    !expeditionApi?.load ||
    !expeditionApi?.save ||
    !expeditionApi?.createEmpty ||
    !expeditionApi?.validate
  ) {
    return {
      green: false,
      reason: "expedition-api-unavailable",
    };
  }

  const { manifest, created: manifestCreated } = await loadOrCreateManifest(expeditionApi);

  manifest.characters ??= [];
  manifest.containers ??= [];
  manifest.ledger ??= [];
  manifest.metadata ??= {};

  const actors = game.actors
    .filter((actor) => actor.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));

  let changed = manifestCreated;
  let charactersCreated = 0;
  let backpacksCreated = 0;
  let bindingsUpdated = 0;

  for (const actor of actors) {
    const charResult = ensureCharacter(manifest, actor);
    const backpackResult = ensureBackpack(manifest, actor, charResult.character);

    if (charResult.created) charactersCreated += 1;
    if (backpackResult.created) backpacksCreated += 1;
    if (!backpackResult.created && backpackResult.changed) bindingsUpdated += 1;

    changed ||= charResult.changed || backpackResult.changed;
  }

  const validation = expeditionApi.validate(manifest);
  if (!validation?.green) {
    console.error(`${MODULE_ID} | world expedition bootstrap validation failed`, validation);
    if (notify) {
      ui.notifications?.error(
        `Expédition : bootstrap invalide (${validation?.errors?.join("; ") ?? "erreur inconnue"}).`
      );
    }

    return {
      green: false,
      reason: "manifest-invalid",
      validation,
      expeditionId: manifest.expeditionId,
    };
  }

  if (changed) {
    manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
    await expeditionApi.save(manifest);
  }

  const report = {
    green: true,
    changed,
    expeditionId: manifest.expeditionId,
    phase: manifest.phase,
    actors: actors.length,
    characters: manifest.characters.length,
    backpacks: manifest.containers.filter((container) =>
      container?.type === "backpack" && container?.scope === "personal"
    ).length,
    charactersCreated,
    backpacksCreated,
    bindingsUpdated,
    validation: expeditionApi.validate(manifest),
  };

  console.log(`${MODULE_ID} | world expedition bootstrap`, report);

  if (notify && changed) {
    ui.notifications?.info(
      `Expédition : ${report.characters} personnage(s), ${report.backpacks} sac(s) synchronisé(s).`
    );
  }

  return report;
}

async function assignExpeditionParticipants({ expeditionId, actorUuids = [] } = {}) {
  if (!game.user?.isGM) {
    return { green: false, reason: "gm-required" };
  }

  const expeditionApi = api()?.expeditionManifest;
  if (!expeditionApi?.list || !expeditionApi?.load ||
      !expeditionApi?.save || !expeditionApi?.validate) {
    return { green: false, reason: "expedition-api-unavailable" };
  }

  if (typeof expeditionId !== "string" || !expeditionId.trim()) {
    return { green: false, reason: "expedition-id-required" };
  }

  if (!Array.isArray(actorUuids) || !actorUuids.length) {
    return { green: false, reason: "actors-required" };
  }

  const manifest = await expeditionApi.load(expeditionId);
  if (!manifest) {
    return { green: false, reason: "manifest-not-found" };
  }

  if (manifest.phase === "in_session") {
    return { green: false, reason: "session-active" };
  }

  const uuids = [...new Set(actorUuids)];
  const actors = [];

  for (const uuid of uuids) {
    const actor = await fromUuid(uuid);

    if (!actor || actor.documentName !== "Actor" ||
        actor.pack || actor.parent) {
      return { green: false, reason: "invalid-world-actor", uuid };
    }

    actors.push(actor);
  }

  const listed = await expeditionApi.list();
  const summaries = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.manifests)
      ? listed.manifests
      : [];

  for (const summary of summaries) {
    if (summary.expeditionId === expeditionId) continue;

    const other = await expeditionApi.load(summary.expeditionId);
    if (!other) {
      return {
        green: false,
        reason: "other-manifest-unavailable",
        expeditionId: summary.expeditionId,
      };
    }

    for (const actor of actors) {
      const assigned = (other.characters ?? []).some((character) =>
        character?.foundryActorUuid === actor.uuid ||
        character?.characterId === characterIdFor(actor)
      );

      if (assigned) {
        return {
          green: false,
          reason: "actor-already-assigned",
          actor: actor.name,
          otherExpeditionId: other.expeditionId,
        };
      }
    }
  }

  const working = structuredClone(manifest);
  working.characters ??= [];
  working.containers ??= [];

  let changed = false;
  let charactersCreated = 0;
  let backpacksCreated = 0;

  for (const actor of actors) {
    const characterResult = ensureCharacter(working, actor);
    const backpackResult = ensureBackpack(
      working,
      actor,
      characterResult.character
    );

    if (characterResult.created) charactersCreated++;
    if (backpackResult.created) backpacksCreated++;

    changed ||= characterResult.changed || backpackResult.changed;
  }

  const validation = expeditionApi.validate(working);
  if (!validation?.green) {
    return {
      green: false,
      reason: "manifest-invalid",
      errors: validation?.errors ?? [],
    };
  }

  if (changed) {
    working.revision = Math.max(1, Number(working.revision) || 1) + 1;
    await expeditionApi.save(working);
  }

  return {
    green: true,
    changed,
    expeditionId,
    actors: actors.length,
    charactersCreated,
    backpacksCreated,
    revision: working.revision,
  };
}
async function worldExpeditionStatus() {
  const toolkitApi = api();
  const expeditionApi = toolkitApi?.expeditionManifest;

  if (!expeditionApi?.list || !expeditionApi?.load) {
    return { green: false, reason: "expedition-api-unavailable" };
  }

  const listed = await expeditionApi.list();
  const summaries = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.manifests)
      ? listed.manifests
      : [];

  const candidate = activeManifestCandidate(summaries);
  if (!candidate?.expeditionId) {
    return {
      green: false,
      reason: "manifest-not-found",
      actors: game.actors.filter((actor) => actor.type === "character").length,
    };
  }

  const manifest = await expeditionApi.load(candidate.expeditionId);
  const actors = game.actors.filter((actor) => actor.type === "character");

  const rows = actors.map((actor) => {
    const character = findCharacter(manifest, actor);
    const backpack = findBackpack(manifest, actor, character?.characterId ?? null);

    return {
      actor: actor.name,
      actorUuid: actor.uuid,
      characterId: character?.characterId ?? null,
      containerId: backpack?.containerId ?? null,
      green: Boolean(character && backpack),
    };
  });

  return {
    green: rows.every((row) => row.green),
    expeditionId: manifest.expeditionId,
    phase: manifest.phase,
    actors: actors.length,
    characters: manifest.characters?.length ?? 0,
    backpacks: manifest.containers?.filter((container) =>
      container?.type === "backpack" && container?.scope === "personal"
    ).length ?? 0,
    rows,
  };
}

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;

  const toolkitApi = api();
  if (!toolkitApi) return;

  toolkitApi.expeditionWorld ??= {};
  toolkitApi.expeditionWorld.bootstrap = bootstrapWorldExpedition;
  toolkitApi.expeditionWorld.assign = assignExpeditionParticipants;
  toolkitApi.expeditionWorld.status = worldExpeditionStatus;
  // P3.2a: affectation explicite des participants.
  // Ne plus lancer le bootstrap automatiquement au démarrage.
});
