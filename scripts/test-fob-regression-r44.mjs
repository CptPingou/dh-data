import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

const MODULE_ID = "daggerheart-campaign-toolkit";
const storage = new Map();
const registrations = new Map();

globalThis.game = {
  user: {
    id: "gm-test",
    isGM: true
  },
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
    }
  }
};

const {
  registerFobActivityLedgerSetting,
  createFobActivityLedgerApi
} = await import("./fob-activity-ledger.mjs");

registerFobActivityLedgerSetting();

const ledger = createFobActivityLedgerApi();

const actorUuid = "Actor.R44TEST00000001";

async function claim(turn, activityType, activityId) {
  return ledger.claim({
    actorUuid,
    turn,
    activityType,
    activityId
  });
}

beforeEach(() => {
  storage.clear();
  game.user.isGM = true;
});

test("R4.4 / deux recherches au même tour", async () => {
  const first = await claim(1, "research", "research-A");
  const second = await claim(1, "research", "research-B");

  assert.equal(first.green, true);
  assert.equal(second.green, true);
  assert.equal(ledger.status().claims.length, 2);
});

test("R4.4 / recherche et craft au même tour", async () => {
  const research = await claim(2, "research", "research-A");
  const craft = await claim(2, "craft", "craft-A");

  assert.equal(research.green, true);
  assert.equal(craft.green, true);
  assert.equal(ledger.status().claims.length, 2);
});

test("R4.4 / deux crafts concurrents sont refusés", async () => {
  const first = await claim(3, "craft", "craft-A");
  const second = await claim(3, "craft", "craft-B");

  assert.equal(first.green, true);
  assert.equal(second.green, false);
  assert.equal(
    second.reason,
    "fob-activity-already-claimed"
  );
  assert.equal(ledger.status().claims.length, 1);
});

test("R4.4 / même activité revendiquée deux fois", async () => {
  const first = await claim(4, "research", "research-A");
  const replay = await claim(4, "research", "research-A");

  assert.equal(first.green, true);
  assert.equal(replay.green, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.reused, true);
  assert.equal(ledger.status().claims.length, 1);
});

test("R4.4 / lecture exacte de la revendication", async () => {
  await claim(5, "research", "research-A");

  const found = ledger.claimFor({
    actorUuid,
    turn: 5,
    activityType: "research",
    activityId: "research-A"
  });

  const absent = ledger.claimFor({
    actorUuid,
    turn: 5,
    activityType: "research",
    activityId: "research-B"
  });

  assert.equal(found?.activityId, "research-A");
  assert.equal(absent, null);
});

test("R4.4 / joueur sans autorité", async () => {
  game.user.isGM = false;

  await assert.rejects(
    () => claim(6, "research", "research-A")
  );

  assert.equal(ledger.status().claims.length, 0);
});

test("R4.4 / tour invalide", async () => {
  const result = await claim(-1, "research", "research-A");

  assert.equal(result.green, false);
  assert.equal(ledger.status().claims.length, 0);
});

console.log("R4.4 LEDGER REGRESSION TESTS");


// R4.4c.7 DISPATCHER TESTS

const { fobActivityDispatcherApi } =
  await import("./fob-activity-dispatcher.mjs");

function createDispatcherFixture({
  researches = [],
  crafts = [],
  failResearch = false
} = {}) {
  const calls = {
    research: [],
    craft: []
  };

  const researchQueue = structuredClone(researches);
  const craftQueue = structuredClone(crafts);

  const api = {
    fobActivity: ledger,

    craftingResearchQueue: {
      status: () => ({
        green: true,
        queue: structuredClone(researchQueue)
      }),

      async progress(id) {
        calls.research.push(id);

        if (failResearch) {
          return {
            green: false,
            reason: "simulated-research-failure"
          };
        }

        const entry = researchQueue.find(e => e.id === id);
        entry.progress += 1;

        return {
          green: true,
          changed: true,
          completed: false,
          entry: structuredClone(entry)
        };
      },

      async remove() {
        throw new Error("Unexpected research removal");
      }
    },

    craftingCraftQueue: {
      status: () => ({
        green: true,
        queue: structuredClone(craftQueue)
      }),

      async progress(id) {
        calls.craft.push(id);

        const entry = craftQueue.find(e => e.id === id);
        entry.progress += 1;

        return {
          green: true,
          changed: true,
          completed: false,
          entry: structuredClone(entry)
        };
      }
    },

    craftingKnowledge: {
      propertyStatus: () => "unknown",
      async setPropertyStatus() {
        throw new Error("Unexpected knowledge mutation");
      }
    }
  };

  globalThis.game.modules = {
    get: id => id === MODULE_ID ? { api } : null
  };

  return { calls, api };
}

const r44Actor = "Actor.R44TEST00000001";

function r44Entry(id, actorUuid = r44Actor) {
  return {
    id,
    actorUuid,
    progress: 0,
    turnsRequired: 10,
    queuedAt: 0,
    contributors: [{ type: "actor", uuid: actorUuid }]
  };
}

test("R4.4 / dispatcher : recherches parallèles", async () => {
  const fixture = createDispatcherFixture({
    researches: [
      r44Entry("research-A"),
      r44Entry("research-B")
    ]
  });

  const result =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 10 });

  assert.equal(result.green, true);
  assert.equal(result.selectedCount, 2);
  assert.deepEqual(
    fixture.calls.research.sort(),
    ["research-A", "research-B"]
  );
  assert.equal(ledger.status().claims.length, 2);
});

test("R4.4 / dispatcher : recherche et craft", async () => {
  const fixture = createDispatcherFixture({
    researches: [r44Entry("research-A")],
    crafts: [r44Entry("craft-A")]
  });

  const result =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 11 });

  assert.equal(result.green, true);
  assert.equal(result.selectedCount, 2);
  assert.deepEqual(fixture.calls.research, ["research-A"]);
  assert.deepEqual(fixture.calls.craft, ["craft-A"]);
  assert.equal(ledger.status().claims.length, 2);
});

test("R4.4 / dispatcher : rejeu sans double progression", async () => {
  const fixture = createDispatcherFixture({
    researches: [r44Entry("research-A")]
  });

  const first =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 12 });

  const replay =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 12 });

  assert.equal(first.green, true);
  assert.equal(replay.green, true);
  assert.equal(fixture.calls.research.length, 1);
  assert.equal(ledger.status().claims.length, 1);
  assert.equal(replay.results[0].skipped, true);
});

test("R4.4 / dispatcher : échec après revendication", async () => {
  const fixture = createDispatcherFixture({
    researches: [r44Entry("research-A")],
    failResearch: true
  });

  const first =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 13 });

  const replay =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 13 });

  assert.equal(first.green, false);

  // Observation du comportement actuel, non validation souhaitée.
  assert.equal(fixture.calls.research.length, 1);
  assert.equal(ledger.status().claims.length, 1);
  assert.equal(replay.results[0].skipped, true);
  assert.equal(
    replay.results[0].reason,
    "fob-turn-already-claimed"
  );
});


// R4.4d.3a LEDGER V2 TESTS

test("R4.4 V2 / migration V1 sans écriture", () => {
  const key = `${MODULE_ID}.fobActivityLedger`;

  storage.set(key, {
    schemaVersion: 1,
    revision: 9,
    claims: [{
      turn: 5,
      actorUuid,
      activityType: "research",
      activityId: "legacy-research",
      claimedAt: 12345
    }]
  });

  const state = ledger.status();

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.revision, 9);
  assert.equal(state.claims.length, 1);
  assert.equal(
    state.claims[0].executionStatus,
    "claimed"
  );

  // La lecture ne modifie pas le stockage d'origine.
  assert.equal(
    storage.get(key).schemaVersion,
    1
  );

  const existing = ledger.claimFor({
    actorUuid,
    turn: 5,
    activityType: "research",
    activityId: "legacy-research"
  });

  assert.ok(existing);
});

test("R4.4 V2 / résolution terminée idempotente", async () => {
  await claim(6, "research", "research-A");

  const args = {
    actorUuid,
    turn: 6,
    activityType: "research",
    activityId: "research-A",
    executionStatus: "completed"
  };

  const first = await ledger.recordResolution(args);
  const revision = ledger.status().revision;
  const replay = await ledger.recordResolution(args);

  assert.equal(first.green, true);
  assert.equal(first.changed, true);
  assert.equal(replay.green, true);
  assert.equal(replay.changed, false);
  assert.equal(ledger.status().revision, revision);

  assert.equal(
    ledger.claimFor(args).executionStatus,
    "completed"
  );

  const downgrade = await ledger.recordResolution({
    ...args,
    executionStatus: "blocked",
    resolutionReason: "retry"
  });

  assert.equal(downgrade.green, false);
  assert.equal(
    downgrade.reason,
    "fob-resolution-already-completed"
  );
});

test("R4.4 V2 / activité bloquée et protégée", async () => {
  await claim(7, "craft", "craft-A");

  const result = await ledger.recordResolution({
    actorUuid,
    turn: 7,
    activityType: "craft",
    activityId: "craft-A",
    executionStatus: "blocked",
    resolutionReason: "craft-validation-failed"
  });

  assert.equal(result.green, true);
  assert.equal(result.changed, true);
  assert.equal(
    result.claim.executionStatus,
    "blocked"
  );
  assert.equal(
    result.claim.resolutionReason,
    "craft-validation-failed"
  );

  const replay = await claim(7, "craft", "craft-A");

  assert.equal(replay.green, true);
  assert.equal(replay.reused, true);
  assert.equal(ledger.status().claims.length, 1);
});

test("R4.4 V2 / autorité MJ", async () => {
  await claim(8, "research", "research-A");

  game.user.isGM = false;

  await assert.rejects(
    () => ledger.recordResolution({
      actorUuid,
      turn: 8,
      activityType: "research",
      activityId: "research-A",
      executionStatus: "completed"
    })
  );

  assert.equal(
    ledger.claimFor({
      actorUuid,
      turn: 8,
      activityType: "research",
      activityId: "research-A"
    }).executionStatus,
    "claimed"
  );
});

test("R4.4 V2 / identité et statut invalides", async () => {
  const missing = await ledger.recordResolution({
    actorUuid,
    turn: 9,
    activityType: "research",
    activityId: "absent",
    executionStatus: "completed"
  });

  assert.equal(missing.green, false);
  assert.equal(
    missing.reason,
    "fob-resolution-claim-not-found"
  );

  await claim(9, "research", "research-A");

  const invalid = await ledger.recordResolution({
    actorUuid,
    turn: 9,
    activityType: "research",
    activityId: "research-A",
    executionStatus: "running"
  });

  assert.equal(invalid.green, false);
  assert.equal(
    invalid.reason,
    "fob-resolution-invalid-status"
  );

  assert.equal(
    ledger.status().claims[0].executionStatus,
    "claimed"
  );
});

// R4.4d.3b DISPATCHER RESOLUTION TESTS

test("R4.4d.3b / succes marque completed", async () => {
  createDispatcherFixture({
    researches: [r44Entry("research-A")]
  });

  const result =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 20 });

  assert.equal(result.green, true);
  assert.equal(result.results[0].resolution.green, true);

  assert.equal(
    ledger.status().claims[0].executionStatus,
    "completed"
  );
});

test("R4.4d.3b / echec marque blocked", async () => {
  const fixture = createDispatcherFixture({
    researches: [r44Entry("research-A")],
    failResearch: true
  });

  const first =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 21 });

  assert.equal(first.green, false);

  const claim = ledger.status().claims[0];

  assert.equal(claim.executionStatus, "blocked");
  assert.equal(
    claim.resolutionReason,
    "simulated-research-failure"
  );

  const replay =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 21 });

  assert.equal(replay.results[0].skipped, true);
  assert.deepEqual(
    fixture.calls.research,
    ["research-A"]
  );
});

test("R4.4d.3b / exception isolee", async () => {
  const fixture = createDispatcherFixture({
    researches: [
      r44Entry("research-A"),
      r44Entry("research-B")
    ]
  });

  const original =
    fixture.api.craftingResearchQueue.progress;

  fixture.api.craftingResearchQueue.progress =
    async id => {
      if (id === "research-A") {
        throw new Error("simulated-crash");
      }

      return original(id);
    };

  const result =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 22 });

  assert.equal(result.green, false);

  const claims = ledger.status().claims;

  assert.equal(
    claims.find(c =>
      c.activityId === "research-A"
    ).executionStatus,
    "blocked"
  );

  assert.equal(
    claims.find(c =>
      c.activityId === "research-B"
    ).executionStatus,
    "completed"
  );
});

test("R4.4d.3b / erreur inscription sans rejeu", async () => {
  const fixture = createDispatcherFixture({
    researches: [r44Entry("research-A")]
  });

  fixture.api.fobActivity = {
    ...ledger,

    recordResolution: async () => ({
      green: false,
      reason: "simulated-write-failure"
    })
  };

  const first =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 23 });

  assert.equal(first.green, false);
  assert.equal(
    first.results[0].reason,
    "fob-resolution-record-failed"
  );

  assert.equal(
    ledger.status().claims[0].executionStatus,
    "claimed"
  );

  const replay =
    await fobActivityDispatcherApi.dispatchTurn({ turn: 23 });

  assert.equal(replay.results[0].skipped, true);
});