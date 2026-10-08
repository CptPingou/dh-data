import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import {
  createCraftingRuntimeApi,
} from "./crafting-runtime.mjs";

import {
  registerCraftingOperationJournal,
  createCraftingOperationJournalApi,
} from "./crafting-operation-journal.mjs";

const MODULE = "daggerheart-campaign-toolkit";
const AUGMENT = "motherboard.force";
const EXPEDITION = "test-expedition";
const OPERATION = "test-craft-operation";

const storage = new Map();
const registrations = new Map();

globalThis.game = {
  user: { id: "gm-test", isGM: true },
  settings: {
    settings: registrations,
    register(module, key, config) {
      registrations.set(`${module}.${key}`, config);
    },
    get(module, key) {
      return structuredClone(
        storage.get(`${module}.${key}`) ?? null
      );
    },
    async set(module, key, value) {
      storage.set(
        `${module}.${key}`,
        structuredClone(value)
      );
    },
  },
};

// Charger les vrais fichiers de recettes,
// sans navigateur ni accès réseau.
globalThis.fetch = async url => {
  const base =
    "modules/daggerheart-campaign-toolkit/";

  if (!String(url).startsWith(base)) {
    throw new Error(`Unexpected fetch: ${url}`);
  }

  const localPath =
    new URL(
      "../" + String(url).slice(base.length),
      import.meta.url
    );

  const content = JSON.parse(
    readFileSync(localPath, "utf8")
  );

  return {
    ok: true,
    status: 200,
    async json() {
      return structuredClone(content);
    },
  };
};

registerCraftingOperationJournal();
const realJournal = createCraftingOperationJournalApi();

function fixture({ failJournalAfterSave = false } = {}) {
  const counts = {
    save: 0,
    craft: 0,
    consume: 0,
  };

  const crafted = new Set();

  let manifest = {
    expeditionId: EXPEDITION,
    revision: 1,
    fob: {
      storageContainerId: "fob-storage",
    },
    containers: [{
      containerId: "fob-storage",
      contents: [],
    }],
  };

  const journal = {
    get: realJournal.get,
    begin: realJournal.begin,
    status: realJournal.status,

    async mark(id, phase) {
      if (
        failJournalAfterSave &&
        phase === "materials-saved"
      ) {
        throw new Error(
          "simulated-interruption-after-manifest-save"
        );
      }

      return realJournal.mark(id, phase);
    },
  };

  const runtime = createCraftingRuntimeApi({
    materialsApi: {
      list: async () => [],
      get: async () => null,
    },

    knowledgeApi: {
      effective: () => ({ properties: [] }),
      discover: async () => ({ green: true }),
    },

    manifestApi: {
      consume() {
        counts.consume++;
        throw new Error("Unexpected material consumption");
      },
      validate: () => ({
        green: true,
        errors: [],
      }),
    },

    persistenceApi: {
      load: async () => structuredClone(manifest),

      async save(value) {
        counts.save++;
        manifest = structuredClone(value);

        return {
          green: true,
          saved: true,
        };
      },
    },

    weaponAugmentStateApi: {
      get() {
        return {
          green: true,
          initialized: true,
          state: {
            schemaVersion: 1,
            slots: 2,
            crafted: [...crafted],
            installed: [],
          },
        };
      },

      async craft(weapon, augmentId) {
        counts.craft++;

        if (crafted.has(augmentId)) {
          throw new Error("DOUBLE APPLICATION");
        }

        crafted.add(augmentId);

        return {
          green: true,
          state: {
            crafted: [...crafted],
          },
        };
      },
    },

    operationJournalApi: journal,
  });

  const request = {
    crafter: {
      uuid: "Actor.TEST",
      documentName: "Actor",
    },

    weapon: {
      uuid: "Actor.TEST.Item.WEAPON",
      documentName: "Item",
      type: "weapon",
    },

    augmentId: AUGMENT,
    expeditionId: EXPEDITION,
    operationId: OPERATION,
  };

  return {
    runtime,
    request,
    counts,
    crafted,
    journal,
  };
}

beforeEach(() => {
  storage.clear();
  game.user.isGM = true;
});

test("R4.4e.5d / fabrication journalisée", async () => {
  const f = fixture();

  const result =
    await f.runtime.craftWeaponAugment(f.request);

  assert.equal(result.green, true);
  assert.equal(result.operationId, OPERATION);
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.craft, 1);
  assert.equal(f.crafted.has(AUGMENT), true);

  assert.equal(
    f.journal.get(OPERATION).phase,
    "weapon-applied"
  );
});

test("R4.4e.5d / interruption après sauvegarde", async () => {
  const f = fixture({
    failJournalAfterSave: true,
  });

  const first =
    await f.runtime.craftWeaponAugment(f.request);

  assert.equal(first.green, false);
  assert.equal(
    first.reason,
    "craft-operation-requires-review"
  );

  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.craft, 0);

  assert.equal(
    f.journal.get(OPERATION).phase,
    "requires-review"
  );

  const second =
    await f.runtime.craftWeaponAugment(f.request);

  assert.equal(second.green, false);
  assert.equal(
    second.reason,
    "craft-operation-already-recorded"
  );

  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.craft, 0);
});

test("R4.4e.5d / second appel sans double effet", async () => {
  const f = fixture();

  const first =
    await f.runtime.craftWeaponAugment(f.request);

  assert.equal(first.green, true);

  const second =
    await f.runtime.craftWeaponAugment(f.request);

  assert.equal(second.green, false);
  assert.ok([
    "craft-augment-already-crafted",
    "craft-operation-already-recorded",
  ].includes(second.reason));

  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.craft, 1);
  assert.equal(f.crafted.size, 1);
});