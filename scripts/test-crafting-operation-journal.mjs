import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  registerCraftingOperationJournal,
  createCraftingOperationJournalApi,
} from "./crafting-operation-journal.mjs";

const memory = new Map();
const registered = new Map();

globalThis.game = {
  user: { isGM: true },
  settings: {
    settings: registered,
    register(module, key, config) {
      registered.set(`${module}.${key}`, config);
    },
    get(module, key) {
      return structuredClone(memory.get(`${module}.${key}`) ?? null);
    },
    async set(module, key, value) {
      memory.set(`${module}.${key}`, structuredClone(value));
    },
  },
};

registerCraftingOperationJournal();
const journal = createCraftingOperationJournalApi();

const input = {
  operationId: "craft-test-1",
  expeditionId: "expedition-test",
  weaponUuid: "Actor.TEST.Item.WEAPON",
  augmentId: "motherboard.scope",
};

beforeEach(() => {
  memory.clear();
  game.user.isGM = true;
});

test("journal / début persistant", async () => {
  const result = await journal.begin(input);
  assert.equal(result.green, true);
  assert.equal(journal.get(input.operationId).phase, "prepared");
});

test("journal / double début interdit", async () => {
  await journal.begin(input);
  const duplicate = await journal.begin(input);
  assert.equal(duplicate.green, false);
  assert.equal(duplicate.reason, "craft-journal-already-started");
});

test("journal / progression contrôlée", async () => {
  await journal.begin(input);
  await journal.mark(input.operationId, "materials-saved");
  await journal.mark(input.operationId, "weapon-applied");
  await journal.mark(input.operationId, "completed");
  assert.equal(journal.get(input.operationId).phase, "completed");
});

test("journal / saut d'étape interdit", async () => {
  await journal.begin(input);
  const result = await journal.mark(input.operationId, "completed");
  assert.equal(result.green, false);
  assert.equal(journal.get(input.operationId).phase, "prepared");
});

test("journal / interruption bloquée", async () => {
  await journal.begin(input);
  await journal.mark(input.operationId, "requires-review");
  const retry = await journal.begin(input);
  assert.equal(retry.green, false);
});

test("journal / autorité joueur", async () => {
  game.user.isGM = false;
  await assert.rejects(() => journal.begin(input));
  assert.equal(Object.keys(journal.status().operations).length, 0);
});