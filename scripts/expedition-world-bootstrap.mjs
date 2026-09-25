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

function makeSlots(containerId, count = DEFAULT_BACKPACK_SLOTS) {
  return Array.from({ length: count }, (_, index) => ({
    slotId: `${containerId}-slot-${index + 1}`,
  }));
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

    container.layout ??= {};
    if (!Array.isArray(container.layout.slots)) {
      container.layout.slots = makeSlots(container.containerId, container.capacity.slots);
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
    layout: {
      slots: makeSlots(containerId, DEFAULT_BACKPACK_SLOTS),
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
  toolkitApi.expeditionWorld.status = worldExpeditionStatus;

  try {
    const report = await bootstrapWorldExpedition({ notify: false });

    if (!report.green) {
      console.warn(`${MODULE_ID} | world expedition bootstrap unavailable`, report);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | world expedition bootstrap failed`, error);
  }
});
