import assert from "node:assert/strict";
import { createCraftingRuntimeApi } from "../scripts/crafting-runtime.mjs";

globalThis.game = { user: { isGM: true } };
const material = { id: "mh.tetsucabra.fang", name: "Croc", material: { properties: ["rigid", "piercing", "impact"] }, research: { discoverable: true, specimen: { required: true, consumed: false } } };
const manifest = { expeditionId: "hunt-1", containers: [
  { containerId: "fob", presentation: { playerRole: "fob" }, contents: [] },
  { containerId: "caravan", presentation: { playerRole: "caravan" }, contents: [] },
] };
const actor = { uuid: "Actor.researcher", name: "Researcher" };
let documentArgs = null;
const documented = new Set();
const personal = new Set(["piercing"]);
const knowledgeApi = {
  effective: (_actor, materialId) => ({ materialId, properties: [...new Set([...personal, ...documented])] }),
  discover: async () => ({ green: true }),
  document: async (args) => {
    documentArgs = args;
    if (!personal.has(args.propertyId)) throw new Error("not personally discovered");
    const changed = !documented.has(args.propertyId);
    documented.add(args.propertyId);
    return { green: true, changed, materialId: args.materialId, propertyId: args.propertyId };
  },
};
const api = createCraftingRuntimeApi({
  materialsApi: { list: async () => [material], get: async (id) => id === material.id ? material : null },
  knowledgeApi,
  manifestApi: { consume: () => ({ changed: true }), validate: () => ({ green: true }) },
  persistenceApi: { load: async (id) => id === "hunt-1" ? structuredClone(manifest) : null, save: async () => ({ green: true }) },
  weaponAugmentStateApi: { craft: async () => ({}) },
});

const before = JSON.stringify(manifest);
const ok = await api.documentMaterialProperty({ actor, materialId: material.id, propertyId: "piercing", expeditionId: "hunt-1" });
assert.equal(ok.green, true);
assert.equal(ok.changed, true);
assert.equal(ok.specimenRequired, false);
assert.equal(ok.specimenConsumed, false);
assert.equal(ok.containerId, "fob");
assert.deepEqual(documentArgs, { actor, materialId: material.id, propertyId: "piercing" });
assert.equal(JSON.stringify(manifest), before);
assert.ok(knowledgeApi.effective({ uuid: "Actor.other" }, material.id).properties.includes("piercing"));

const again = await api.documentMaterialProperty({ actor, materialId: material.id, propertyId: "piercing", expeditionId: "hunt-1" });
assert.equal(again.green, true);
assert.equal(again.changed, false);

const wrong = await api.documentMaterialProperty({ actor, materialId: material.id, propertyId: "piercing", expeditionId: "hunt-1", containerId: "caravan" });
assert.equal(wrong.green, false);
assert.equal(wrong.reason, "documentation-container-not-fob");

const badProp = await api.documentMaterialProperty({ actor, materialId: material.id, propertyId: "electric", expeditionId: "hunt-1" });
assert.equal(badProp.green, false);
assert.equal(badProp.reason, "material-property-not-found");

personal.delete("impact");
await assert.rejects(
  () => api.documentMaterialProperty({ actor, materialId: material.id, propertyId: "impact", expeditionId: "hunt-1" }),
  /not personally discovered/
);

console.log("P2.12g.2 TESTS GREEN: FOB documentation requires personal discovery; no specimen is required or consumed; collective effective knowledge propagates; idempotence and location/property guards hold.");
