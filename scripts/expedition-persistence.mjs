const MODULE_ID = "daggerheart-campaign-toolkit";
const SETTING_KEY = "expeditionManifests";

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function registerExpeditionManifestPersistence() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Expedition manifests",
    hint: "Persistent World storage for Monster Hunter expedition manifests.",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
}

export function createExpeditionPersistenceApi({ validate, normalize } = {}) {
  function store() {
    return game.settings.get(MODULE_ID, SETTING_KEY) ?? {};
  }

  async function save(inputManifest) {
    const manifest = typeof normalize === "function" ? normalize(inputManifest) : clone(inputManifest);
    const status = typeof validate === "function" ? validate(manifest) : { green: true, errors: [] };
    if (!status.green) {
      throw new Error(`invalid expedition manifest: ${(status.errors ?? []).join("; ")}`);
    }

    const manifests = clone(store());
    manifests[manifest.expeditionId] = clone(manifest);
    await game.settings.set(MODULE_ID, SETTING_KEY, manifests);
    return {
      green: true,
      expeditionId: manifest.expeditionId,
      revision: manifest.revision,
      saved: true,
    };
  }

  async function load(expeditionId) {
    const manifest = store()?.[expeditionId];
    if (!manifest) return null;
    return typeof normalize === "function" ? normalize(manifest) : clone(manifest);
  }

  function list() {
    return Object.values(store()).map((manifest) => ({
      expeditionId: manifest.expeditionId,
      revision: manifest.revision,
      phase: manifest.phase,
      authority: manifest.authority,
      containers: manifest.containers?.length ?? 0,
      entries: (manifest.containers ?? []).reduce((sum, container) => sum + (container.contents?.length ?? 0), 0),
    }));
  }

  async function remove(expeditionId) {
    const manifests = clone(store());
    const existed = Object.hasOwn(manifests, expeditionId);
    if (existed) {
      delete manifests[expeditionId];
      await game.settings.set(MODULE_ID, SETTING_KEY, manifests);
    }
    return { expeditionId, removed: existed };
  }

  return Object.freeze({ version: 1, save, load, list, remove });
}
