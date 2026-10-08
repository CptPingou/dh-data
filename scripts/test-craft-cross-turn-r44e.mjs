import assert from "node:assert/strict";
import { test } from "node:test";

import {
  registerFobActivityLedgerSetting,
  createFobActivityLedgerApi,
} from "./fob-activity-ledger.mjs";

import {
  fobActivityDispatcherApi,
} from "./fob-activity-dispatcher.mjs";

const MODULE = "daggerheart-campaign-toolkit";
const storage = new Map();
const registrations = new Map();

const ACTOR = "Actor.R44ECRAFT";
const WEAPON = "Actor.R44ECRAFT.Item.WEAPON";
const AUGMENT = "motherboard.scope";

const actor = {
  uuid: ACTOR,
  documentName: "Actor",
};

const weapon = {
  uuid: WEAPON,
  documentName: "Item",
  type: "weapon",
};

globalThis.game = {
  user: { id: "gm-test", isGM: true },
  modules: new Map(),
  settings: {
    settings: registrations,
    register(moduleId, key, config) {
      registrations.set(`${moduleId}.${key}`, config);
    },
    get(moduleId, key) {
      return structuredClone(
        storage.get(`${moduleId}.${key}`) ?? null
      );
    },
    async set(moduleId, key, value) {
      storage.set(
        `${moduleId}.${key}`,
        structuredClone(value)
      );
      return value;
    },
  },
};

globalThis.fromUuid = async uuid => {
  if (uuid === ACTOR) return actor;
  if (uuid === WEAPON) return weapon;
  return null;
};

registerFobActivityLedgerSetting();

const ledger = createFobActivityLedgerApi();

function fixture({
  alreadyCrafted = false,
  failCleanup = true,
  stateAvailable = true,
} = {}) {
  storage.clear();

  const calls = {
    craft: 0,
    remove: 0,
    progress: 0,
  };

  const crafted = new Set(
    alreadyCrafted ? [AUGMENT] : []
  );

  const entry = {
    id: "craft-r44e-test",
    actorUuid: ACTOR,
    weaponUuid: WEAPON,
    augmentId: AUGMENT,
    expeditionId: "expedition-test",
    progress: 10,
    turnsRequired: 10,
    queuedAt: 0,
    contributors: [{
      type: "actor",
      uuid: ACTOR,
    }],
  };

  let queue = [entry];

  const api = {
    fobActivity: ledger,

    // R4.4e.5c JOURNAL FIXTURE
    craftingOperationJournal: {
      get: () => null,
      async begin() {
        return { green: true, changed: true };
      },
      async mark() {
        return { green: true, changed: true };
      },
    },

    craftingResearchQueue: {
      status: () => ({
        green: true,
        queue: [],
      }),
      async progress() {
        throw new Error("Unexpected research");
      },
      async remove() {
        throw new Error("Unexpected research");
      },
    },

    craftingKnowledge: {
      propertyStatus: () => "unknown",
      async setPropertyStatus() {
        throw new Error("Unexpected discovery");
      },
    },

    craftingCraftQueue: {
      status: () => ({
        green: true,
        queue: structuredClone(queue),
      }),

      async progress() {
        calls.progress++;
        throw new Error("Unexpected progress");
      },

      async remove(id) {
        calls.remove++;

        if (failCleanup) {
          return {
            green: false,
            reason: "simulated-cleanup-failure",
          };
        }

        queue = queue.filter(e => e.id !== id);

        return {
          green: true,
          changed: true,
        };
      },
    },

    weaponAugmentState: {
      get: stateAvailable
        ? () => ({
            green: true,
            initialized: true,
            state: {
              schemaVersion: 1,
              slots: 2,
              crafted: [...crafted],
              installed: [],
            },
          })
        : undefined,
    },

    crafting: {
      async craftWeaponAugment() {
        calls.craft++;

        if (crafted.has(AUGMENT)) {
          throw new Error("DOUBLE CRAFT");
        }

        crafted.add(AUGMENT);

        return {
          green: true,
          operation: "craft",
        };
      },
    },
  };

  game.modules.set(MODULE, { api });

  return { calls, crafted, getQueue: () => queue };
}

test(
  "R4.4e.4c / craft applique puis nettoyage echoue",
  async () => {
    const f = fixture();

    const first =
      await fobActivityDispatcherApi.dispatchTurn({
        turn: 30,
      });

    assert.equal(first.green, false);
    assert.equal(f.calls.craft, 1);
    assert.equal(f.calls.remove, 1);
    assert.equal(f.crafted.has(AUGMENT), true);
    assert.equal(f.getQueue().length, 1);

    const firstClaim =
      ledger.status().claims[0];

    assert.equal(
      firstClaim.executionStatus,
      "blocked"
    );

    const second =
      await fobActivityDispatcherApi.dispatchTurn({
        turn: 31,
      });

    assert.equal(second.results.length, 1);
    assert.equal(second.results[0].blocked, true);

    assert.equal(
      second.results[0].reason,
      "craft-augment-already-applied"
    );

    assert.equal(
      second.results[0].requiresGmReview,
      true
    );

    assert.equal(f.calls.craft, 1);
    assert.equal(f.calls.remove, 1);
    assert.equal(f.calls.progress, 0);
    assert.equal(f.getQueue().length, 1);

    const claims = ledger.status().claims;

    assert.equal(claims.length, 2);
    assert.equal(
      claims[1].executionStatus,
      "blocked"
    );
  }
);

test(
  "R4.4e.4c / augmentation preexistante",
  async () => {
    const f = fixture({
      alreadyCrafted: true,
    });

    const result =
      await fobActivityDispatcherApi.dispatchTurn({
        turn: 40,
      });

    assert.equal(result.green, true);
    assert.equal(result.results[0].blocked, true);
    assert.equal(f.calls.craft, 0);
    assert.equal(f.calls.remove, 0);

    assert.equal(
      ledger.status().claims[0].executionStatus,
      "blocked"
    );
  }
);

test(
  "R4.4e.4c / absence API etat : refus ferme",
  async () => {
    const f = fixture({
      stateAvailable: false,
    });

    const result =
      await fobActivityDispatcherApi.dispatchTurn({
        turn: 50,
      });

    assert.equal(result.green, true);
    assert.equal(result.results[0].blocked, true);
    assert.equal(
      result.results[0].reason,
      "craft-weapon-state-unavailable"
    );

    assert.equal(f.calls.craft, 0);
    assert.equal(f.calls.remove, 0);
    assert.equal(
      ledger.status().claims[0].executionStatus,
      "blocked"
    );
  }
);