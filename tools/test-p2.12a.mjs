import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { validateContainerCatalog, validateMaterialCatalog, validateMaterialKnowledge, validateRecipeCatalog } from "../scripts/crafting-schema.mjs";
import { allocateRecipe } from "../scripts/crafting-recipe-engine.mjs";

const read = async (name) => JSON.parse(await fs.readFile(new URL(`../data/crafting/${name}`, import.meta.url), "utf8"));
const materials = await read("materials.json");
const recipes = await read("recipes.json");
const containers = await read("containers.json");
const knowledge = await read("knowledge.json");

assert.deepEqual(validateMaterialCatalog(materials), { green: true, catalogId: "mh.materials.pilot", materials: 4 });
assert.deepEqual(validateRecipeCatalog(recipes), { green: true, catalogId: "mh.recipes.pilot", recipes: 1 });
assert.deepEqual(validateContainerCatalog(containers), { green: true, catalogId: "mh.containers.pilot", containers: 3 });
assert.equal(validateMaterialKnowledge(knowledge).green, true);

const force = recipes.recipes.find((r) => r.id === "craft.weapon-augment.force");
const green = allocateRecipe(force, [
  { materialId: "mh.tetsucabra.fang", quantity: 4 },
  { materialId: "mh.tetsucabra.hide", quantity: 1 }
], materials.materials);
assert.equal(green.green, true);
assert.deepEqual(green.missing, []);
assert.equal(green.allocations.filter((a) => a.materialId === "mh.tetsucabra.fang").reduce((n, a) => n + a.quantity, 0), 4);

const red = allocateRecipe(force, [
  { materialId: "mh.tetsucabra.fang", quantity: 2 },
  { materialId: "mh.tetsucabra.hide", quantity: 1 }
], materials.materials);
assert.equal(red.green, false);
assert.equal(red.missing.length > 0, true);

const conflictRecipe = {
  id: "craft.test.constraint-order", name: "Constraint order", output: { type: "test", id: "test" }, requirements: [
    { id: "generic", units: 1, match: { property: "conductive" } },
    { id: "specific", units: 1, match: { family: "organ", property: "electric" } }
  ]
};
const synthetic = structuredClone(materials.materials);
synthetic.push({
  id: "mh.test.mineral", name: "Minerai test",
  material: { family: "mineral", quality: 1, properties: ["conductive"] },
  inventory: { stackable: true, containerClass: "hard-material" },
  research: { discoverable: true, specimen: { required: true, consumed: false } },
  source: { type: "test" }
});
const conflict = allocateRecipe(conflictRecipe, [
  { materialId: "mh.vespoid.gland", quantity: 1 },
  { materialId: "mh.test.mineral", quantity: 1 }
], synthetic);
assert.equal(conflict.green, true);
assert.equal(conflict.allocations.find((a) => a.requirementId === "specific").materialId, "mh.vespoid.gland");

console.log("P2.12a TESTS GREEN: schemas v1, biological fixtures, recipe matching, strict non-double-allocation.");
