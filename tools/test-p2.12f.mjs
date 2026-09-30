import assert from "node:assert/strict";
import fs from "node:fs/promises";

const recipes = JSON.parse(await fs.readFile(new URL("../data/crafting/recipes.json", import.meta.url), "utf8"));
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(recipes) });
globalThis.game = { user: { isGM: true } };

const { createCraftingRuntimeApi } = await import("../scripts/crafting-runtime.mjs");
const { expeditionManifestApi } = await import("../scripts/expedition-manifest.mjs");
const materialsCatalog = JSON.parse(await fs.readFile(new URL("../data/crafting/materials.json", import.meta.url), "utf8"));
const materialsApi = { list: async () => structuredClone(materialsCatalog.materials) };
const known = new Map([
  ["mh.tetsucabra.fang", ["rigid", "impact"]],
  ["mh.tetsucabra.hide", ["flexible"]],
]);
const knowledgeApi = { effective: (_actor, materialId) => ({ properties: known.get(materialId) ?? [] }) };
const snapshot = (materialId, quantity) => {
  const material = materialsCatalog.materials.find((entry) => entry.id === materialId);
  return { entryId: `${materialId}-${Math.random()}`, quantity, slotId: null, itemRef: { sourceId: materialId, name: material.name, snapshot: { flags: { "daggerheart-campaign-toolkit": { material: { materialId, containerClass: material.inventory.containerClass, stackable: true } } } } } };
};
const manifest = {
  schema: "daggerheart-campaign-toolkit/expedition-manifest@2", expeditionId: "westmarch-1", revision: 1, phase: "returned", authority: "foundry", characters: [], ledger: [], metadata: {},
  containers: [{ containerId: "caravan", name: "Charrette", type: "caravan", scope: "party", holderRef: { kind: "party", id: "party" }, capacity: { slots: 8 }, layout: { slots: [] }, rules: [], materialStorage: { accepts: ["hard-material", "soft-material"], stackLimit: 30, mergeStacks: true }, contents: [snapshot("mh.tetsucabra.fang", 4), snapshot("mh.tetsucabra.hide", 1)] }],
};
let stored = structuredClone(manifest);
let craftFails = false;
const persistenceApi = { load: async () => structuredClone(stored), save: async (value) => { stored = structuredClone(value); return { green: true }; } };
const weaponAugmentStateApi = { craft: async () => { if (craftFails) throw new Error("synthetic craft failure"); return { craftedCount: 1 }; } };
const api = createCraftingRuntimeApi({ materialsApi, knowledgeApi, manifestApi: expeditionManifestApi, persistenceApi, weaponAugmentStateApi });
const crafter = { uuid: "Actor.artificer" };
const weapon = { uuid: "Actor.target.Item.weapon" };

const plan = await api.planWeaponAugment({ crafter, augmentId: "motherboard.force", expeditionId: "westmarch-1" });
assert.equal(plan.green, true);
assert.equal(plan.allocations.reduce((sum, entry) => sum + entry.quantity, 0), 5);
const crafted = await api.craftWeaponAugment({ crafter, weapon, augmentId: "motherboard.force", expeditionId: "westmarch-1" });
assert.equal(crafted.green, true);
assert.equal(stored.containers[0].contents.length, 0);
assert.equal(stored.ledger.filter((entry) => entry.kind === "consumed").reduce((sum, entry) => sum + entry.quantity, 0), 5);

stored = structuredClone(manifest);
known.set("mh.tetsucabra.fang", ["rigid"]);
const unknownPlan = await api.planWeaponAugment({ crafter, augmentId: "motherboard.force", expeditionId: "westmarch-1" });
assert.equal(unknownPlan.green, false);
assert.equal(stored.containers[0].contents.reduce((sum, entry) => sum + entry.quantity, 0), 5);

known.set("mh.tetsucabra.fang", ["rigid", "impact"]);
craftFails = true;
await assert.rejects(() => api.craftWeaponAugment({ crafter, weapon, augmentId: "motherboard.force", expeditionId: "westmarch-1" }), /synthetic craft failure/);
assert.equal(stored.containers[0].contents.reduce((sum, entry) => sum + entry.quantity, 0), 5);
assert.equal(stored.ledger.length, 0);

console.log("P2.12f TESTS GREEN: knowledge-gated biological allocation, caravan consumption, consumed ledger, transactional rollback.");
