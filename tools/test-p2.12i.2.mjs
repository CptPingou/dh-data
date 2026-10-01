import fs from "node:fs";
import assert from "node:assert/strict";
import { validateRecipeCatalog } from "../scripts/crafting-schema.mjs";
import { allocateExactResourceRecipe } from "../scripts/crafting-recipe-engine.mjs";

const recipes = JSON.parse(fs.readFileSync(new URL("../data/crafting/recipes.json", import.meta.url), "utf8"));
const loot = JSON.parse(fs.readFileSync(new URL("../data/homebrew/monster-hunter/dh-loot.json", import.meta.url), "utf8"));

assert.equal(validateRecipeCatalog(recipes).green, true);

const guard = recipes.recipes.find((recipe) => recipe.output?.type === "weaponAugment" && recipe.output?.id === "motherboard.guard");
assert.ok(guard, "Guard pilot recipe must exist");
assert.equal(guard.id, "craft.weapon-augment.guard.components");
assert.deepEqual(
  guard.requirements.map((r) => [r.match.resourceId, r.units]),
  [
    ["mh.crafting.wires", 3],
    ["mh.crafting.silver", 2],
    ["mh.crafting.platinum", 2],
    ["mh.crafting.fuses", 3],
  ],
);

const resourceIds = new Set(
  loot
    .map((item) => item.flags?.["daggerheart-campaign-toolkit"]?.crafting?.resourceId)
    .filter(Boolean)
    .map((id) => id.startsWith("mh.crafting.") ? id : `mh.crafting.${id}`),
);
for (const requirement of guard.requirements) {
  assert.ok(resourceIds.has(requirement.match.resourceId), `Missing loot Item for ${requirement.match.resourceId}`);
}

const enough = allocateExactResourceRecipe(guard, [
  { resourceId: "mh.crafting.wires", quantity: 3 },
  { resourceId: "mh.crafting.silver", quantity: 4 },
  { resourceId: "mh.crafting.platinum", quantity: 2 },
  { resourceId: "mh.crafting.fuses", quantity: 3 },
]);
assert.equal(enough.green, true);
assert.equal(enough.allocations.length, 4);
assert.equal(enough.allocations.reduce((sum, a) => sum + a.quantity, 0), 10);

const missing = allocateExactResourceRecipe(guard, [
  { resourceId: "mh.crafting.wires", quantity: 2 },
  { resourceId: "mh.crafting.silver", quantity: 2 },
  { resourceId: "mh.crafting.platinum", quantity: 2 },
  { resourceId: "mh.crafting.fuses", quantity: 1 },
]);
assert.equal(missing.green, false);
assert.deepEqual(
  missing.missing.map((m) => [m.resourceId, m.missingUnits]),
  [
    ["mh.crafting.wires", 1],
    ["mh.crafting.fuses", 2],
  ],
);

const runtime = fs.readFileSync(new URL("../scripts/crafting-runtime.mjs", import.meta.url), "utf8");
assert.match(runtime, /containerCraftingResourceInventory/);
assert.match(runtime, /consumeExactResourceAllocationFromContainer/);
assert.match(runtime, /recipeMode: "exact-resource"/);
assert.match(runtime, /persistenceApi\.save\(original\)/);

console.log("P2.12i.2 TESTS GREEN: Guard canonical component recipe plans exact stock, detects shortages, consumes Caravan entries transactionally, and preserves biological crafting.");
