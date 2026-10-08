import assert from "node:assert/strict";
import { test } from "node:test";
import { createCraftingRuntimeApi } from "./crafting-runtime.mjs";

const AUGMENT = "motherboard.scope";

function fixture({ crafted = [AUGMENT], isGM = true } = {}) {
  const calls = {
    load: 0,
    save: 0,
    consume: 0,
    validate: 0,
    craft: 0,
    get: 0,
  };

  globalThis.game = {
    user: { isGM },
  };

  const api = createCraftingRuntimeApi({
    materialsApi: {
      list: async () => [],
      get: async () => null,
    },
    knowledgeApi: {
      effective: () => ({ properties: [] }),
      discover: async () => ({}),
    },
    manifestApi: {
      consume: () => {
        calls.consume++;
        throw new Error("UNEXPECTED CONSUMPTION");
      },
      validate: () => {
        calls.validate++;
        return { green: true };
      },
    },
    persistenceApi: {
      load: async () => {
        calls.load++;
        throw new Error("UNEXPECTED MANIFEST LOAD");
      },
      save: async () => {
        calls.save++;
        throw new Error("UNEXPECTED MANIFEST SAVE");
      },
    },
    weaponAugmentStateApi: {
      get: () => {
        calls.get++;
        return {
          green: true,
          initialized: true,
          state: {
            schemaVersion: 1,
            crafted: [...crafted],
            installed: [],
            slots: 2,
          },
        };
      },
      craft: async () => {
        calls.craft++;
        throw new Error("UNEXPECTED WEAPON MUTATION");
      },
    },
  });

  const request = {
    crafter: {
      uuid: "Actor.TESTCRAFT",
      documentName: "Actor",
    },
    weapon: {
      uuid: "Actor.TESTCRAFT.Item.TESTWEAPON",
      documentName: "Item",
      type: "weapon",
    },
    augmentId: AUGMENT,
    expeditionId: "test-expedition",
  };

  return { api, calls, request };
}

test("R4.4e.4b / augment deja fabrique : aucun effet", async () => {
  const { api, calls, request } = fixture();

  const result = await api.craftWeaponAugment(request);

  assert.equal(result.green, false);
  assert.equal(result.reason, "craft-augment-already-crafted");
  assert.equal(result.augmentId, AUGMENT);

  assert.equal(calls.get, 1);
  assert.equal(calls.load, 0);
  assert.equal(calls.save, 0);
  assert.equal(calls.consume, 0);
  assert.equal(calls.validate, 0);
  assert.equal(calls.craft, 0);
});

test("R4.4e.4b / refus joueur avant toute mutation", async () => {
  const { api, calls, request } = fixture({ isGM: false });

  await assert.rejects(
    () => api.craftWeaponAugment(request),
    /GM-only/
  );

  assert.equal(calls.get, 0);
  assert.equal(calls.load, 0);
  assert.equal(calls.save, 0);
  assert.equal(calls.consume, 0);
  assert.equal(calls.craft, 0);
});

test("R4.4e.4b / API etat indisponible : refus ferme", async () => {
  const { calls, request } = fixture();

  const api = createCraftingRuntimeApi({
    materialsApi: {
      list: async () => [],
      get: async () => null,
    },
    knowledgeApi: {
      effective: () => ({ properties: [] }),
      discover: async () => ({}),
    },
    manifestApi: {
      consume: () => { calls.consume++; },
      validate: () => ({ green: true }),
    },
    persistenceApi: {
      load: async () => { calls.load++; },
      save: async () => { calls.save++; },
    },
    weaponAugmentStateApi: {
      craft: async () => { calls.craft++; },
    },
  });

  const result = await api.craftWeaponAugment(request);

  assert.equal(result.green, false);
  assert.equal(
    result.reason,
    "craft-augment-state-api-unavailable"
  );
  assert.equal(calls.load, 0);
  assert.equal(calls.save, 0);
  assert.equal(calls.consume, 0);
  assert.equal(calls.craft, 0);
});