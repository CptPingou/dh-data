import assert from "node:assert/strict";

const definitions = new Map();
const storage = new Map();

const key = "daggerheart-campaign-toolkit.researchKnowledge";
let writes = 0;

globalThis.game = {
  user: { isGM: true },
  settings: {
    settings: definitions,

    register(moduleId, settingId, definition) {
      const id = `${moduleId}.${settingId}`;
      definitions.set(id, definition);
      storage.set(id, structuredClone(definition.default));
    },

    get(moduleId, settingId) {
      return structuredClone(
        storage.get(`${moduleId}.${settingId}`)
      );
    },

    async set(moduleId, settingId, value) {
      assert.equal(game.user.isGM, true);
      storage.set(
        `${moduleId}.${settingId}`,
        structuredClone(value)
      );
      writes++;
    }
  }
};

const registry = await import(
  "./research-knowledge-registry.mjs"
);

const {
  registerResearchKnowledgeSetting,
  readResearchKnowledge,
  revealResearchKnowledge,
  shareResearchKnowledge,
  projectPartyKnowledge
} = registry;

registerResearchKnowledgeSetting();

assert.equal(readResearchKnowledge().schemaVersion, 3);

const sample = {
  id: "revelation.test.dhakaani",
  researchId: "research.test.dhakaani",
  title: "Inscription dhakaani",
  grantedTags: ["langue:dhakaani"],
  unlocks: [
    { type: "location", ref: "location.dhakaani" }
  ],
  export: { enabled: false, target: "none" }
};

// Migration V2 vers V3 sans perte.
storage.set(key, {
  schemaVersion: 2,
  revision: 2,
  revelations: [
    {
      ...sample,
      id: "revelation.test.old",
      status: "revealed",
      visibility: "party"
    }
  ]
});

const migrated = readResearchKnowledge();

assert.equal(migrated.schemaVersion, 3);
assert.equal(migrated.revision, 2);
assert.equal(migrated.revelations[0].status, "shared");
assert.deepEqual(
  migrated.revelations[0].sharedWith,
  ["party"]
);
assert.deepEqual(
  migrated.revelations[0].grantedTags,
  ["langue:dhakaani"]
);

// Creation d'une decouverte individuelle.
const discovered = await revealResearchKnowledge({
  revelation: sample,
  status: "discovered",
  discoveredBy: ["Actor.moth"]
});

assert.equal(discovered.status, "discovered");
assert.deepEqual(discovered.discoveredBy, ["Actor.moth"]);
assert.deepEqual(discovered.sharedWith, []);

let state = readResearchKnowledge();

assert.equal(state.schemaVersion, 3);
assert.equal(state.revision, 3);
assert.equal(state.revelations.length, 2);

// Partage MJ.
const shared = await shareResearchKnowledge(sample.id);

assert.equal(shared.changed, true);
assert.equal(shared.revelation.status, "shared");
assert.deepEqual(
  shared.revelation.discoveredBy,
  ["Actor.moth"]
);
assert.deepEqual(
  shared.revelation.sharedWith,
  ["party"]
);

state = readResearchKnowledge();

assert.equal(state.revision, 4);

const writeCount = writes;

// Partage idempotent.
const repeated = await shareResearchKnowledge(sample.id);
assert.equal(repeated.changed, false);
assert.equal(writes, writeCount);

// Refus d'une revelation privee.
await assert.rejects(
  () => revealResearchKnowledge({
    revelation: {
      ...sample,
      id: "revelation.test.secret"
    },
    visibility: "gm"
  }),
  /Private revelations/
);

assert.equal(writes, writeCount);

// Lecture joueur, mutation interdite.
game.user = { isGM: false };

assert.equal(readResearchKnowledge().revelations.length, 2);

await assert.rejects(
  () => shareResearchKnowledge(sample.id),
  /requires GM/
);

await assert.rejects(
  () => revealResearchKnowledge({
    revelation: {
      ...sample,
      id: "revelation.test.player"
    }
  }),
  /requires GM/
);

assert.equal(writes, writeCount);

// Copie defensive.
const projection = projectPartyKnowledge(
  readResearchKnowledge()
);

projection.revelations[0].title = "MODIFIED";

assert.notEqual(
  readResearchKnowledge().revelations[0].title,
  "MODIFIED"
);

// Aucun champ MJ additionnel.
game.user = { isGM: true };

const sanitized = await revealResearchKnowledge({
  revelation: {
    ...sample,
    id: "revelation.test.whitelist",
    gmNotes: "SECRET",
    unlocks: [{
      type: "location",
      ref: "location.safe",
      hiddenCondition: "SECRET"
    }]
  }
});

assert.equal(
  Object.hasOwn(sanitized, "gmNotes"),
  false
);
assert.equal(
  Object.hasOwn(sanitized.unlocks[0], "hiddenCondition"),
  false
);

const { archiveResearchKnowledge } = registry;

game.user = { isGM: true };

const archiveId = "revelation.test.dhakaani";
const beforeArchive = readResearchKnowledge();
const originalEntry = beforeArchive.revelations.find(
  entry => entry.id === archiveId
);

assert.ok(originalEntry);
assert.equal(originalEntry.archived, false);

const archivedResult = await archiveResearchKnowledge(
  archiveId, true
);

assert.equal(archivedResult.changed, true);
assert.equal(archivedResult.revelation.archived, true);

const afterArchive = readResearchKnowledge();
const archivedEntry = afterArchive.revelations.find(
  entry => entry.id === archiveId
);

assert.equal(
  afterArchive.revision,
  beforeArchive.revision + 1
);

assert.deepEqual(
  archivedEntry.grantedTags,
  originalEntry.grantedTags
);

assert.deepEqual(
  archivedEntry.unlocks,
  originalEntry.unlocks
);

assert.equal(
  archivedEntry.status,
  originalEntry.status
);

assert.deepEqual(
  archivedEntry.discoveredBy,
  originalEntry.discoveredBy
);

assert.deepEqual(
  archivedEntry.sharedWith,
  originalEntry.sharedWith
);

assert.equal(
  afterArchive.revelations.length,
  beforeArchive.revelations.length
);

const writesAfterArchive = writes;

const repeatedArchive = await archiveResearchKnowledge(
  archiveId, true
);

assert.equal(repeatedArchive.changed, false);
assert.equal(writes, writesAfterArchive);

const restoredResult = await archiveResearchKnowledge(
  archiveId, false
);

assert.equal(restoredResult.changed, true);
assert.equal(restoredResult.revelation.archived, false);

const afterRestore = readResearchKnowledge();

assert.equal(
  afterRestore.revision,
  afterArchive.revision + 1
);

const writesAfterRestore = writes;

const repeatedRestore = await archiveResearchKnowledge(
  archiveId, false
);

assert.equal(repeatedRestore.changed, false);
assert.equal(writes, writesAfterRestore);

game.user = { isGM: false };

await assert.rejects(
  () => archiveResearchKnowledge(archiveId, true),
  /requires GM/
);

assert.equal(writes, writesAfterRestore);

game.user = { isGM: true };

await assert.rejects(
  () => archiveResearchKnowledge(
    archiveId, "yes"
  ),
  /Invalid research archive flag/
);

await assert.rejects(
  () => archiveResearchKnowledge(
    "revelation.not-found", true
  ),
  /not found/
);

assert.equal(writes, writesAfterRestore);

console.log("R4.3c.6a ARCHIVE TESTS GREEN");
console.log("R4.3c.4a REGISTRY V3 TESTS GREEN");