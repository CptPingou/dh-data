import fs from "node:fs";
import assert from "node:assert/strict";
import { validateRecipeCatalog } from "../scripts/crafting-schema.mjs";
import { allocateExactResourceRecipe } from "../scripts/crafting-recipe-engine.mjs";

const recipes = JSON.parse(fs.readFileSync(new URL("../data/crafting/recipes.json", import.meta.url), "utf8"));
const motherboard = JSON.parse(fs.readFileSync(new URL("../data/weapon-augments/motherboard.json", import.meta.url), "utf8"));
const loot = JSON.parse(fs.readFileSync(new URL("../data/homebrew/monster-hunter/dh-loot.json", import.meta.url), "utf8"));

assert.equal(validateRecipeCatalog(recipes).green, true, "recipe catalog must validate");
assert.equal(motherboard.augments.length, 18, "Motherboard catalog must still expose 18 augments");
assert.equal(recipes.recipes.length, 18, "every Motherboard augment must have one canonical recipe");

const lootResources = new Map();
for (const item of loot) {
  const crafting = item.flags?.["daggerheart-campaign-toolkit"]?.crafting;
  if (!crafting?.resourceId) continue;
  const canonical = crafting.resourceId.startsWith("mh.crafting.")
    ? crafting.resourceId
    : `mh.crafting.${crafting.resourceId}`;
  assert.equal(lootResources.has(canonical), false, `duplicate canonical resource ${canonical}`);
  lootResources.set(canonical, item);
}

const recipeByOutput = new Map(recipes.recipes.map((recipe) => [recipe.output?.id, recipe]));
const legacyResourceIds = [];

for (const augment of motherboard.augments) {
  const recipe = recipeByOutput.get(augment.id);
  assert.ok(recipe, `missing canonical recipe for ${augment.id}`);
  assert.equal(recipe.output?.type, "weaponAugment");
  assert.equal(recipe.id, `craft.weapon-augment.${augment.id.split(".").at(-1)}.components`);
  assert.equal(recipe.requirements.length, augment.recipe.length, `ingredient count drift for ${augment.id}`);

  const inventory = [];
  for (let index = 0; index < recipe.requirements.length; index += 1) {
    const requirement = recipe.requirements[index];
    const canonical = requirement.match?.resourceId;
    assert.match(canonical ?? "", /^mh\.crafting\.[a-z0-9-]+$/, `non-canonical resource in ${recipe.id}`);
    assert.ok(lootResources.has(canonical), `missing dh-loot item for ${canonical}`);
    assert.equal(Number.isInteger(requirement.units) && requirement.units > 0, true, `invalid quantity in ${recipe.id}`);
    legacyResourceIds.push(...Object.keys(requirement.match ?? {}).filter((key) => key === "resource"));
    inventory.push({ resourceId: canonical, quantity: requirement.units });

    const sourceIngredient = augment.recipe[index];
    assert.equal(requirement.units, sourceIngredient.quantity, `quantity drift for ${augment.id} ingredient ${index}`);
  }

  const allocation = allocateExactResourceRecipe(recipe, inventory);
  assert.equal(allocation.green, true, `${augment.id} canonical recipe must allocate from exact stock`);
}

assert.deepEqual(legacyResourceIds, [], "canonical recipes must not use legacy match.resource");

const force = recipeByOutput.get("motherboard.force");
assert.deepEqual(
  force.requirements.map((r) => [r.match.resourceId, r.units]),
  [
    ["mh.crafting.gears", 3],
    ["mh.crafting.lenses", 2],
    ["mh.crafting.aluminum", 4],
    ["mh.crafting.capacitor", 1],
  ],
  "Force must migrate from biological pilot to its standard component recipe",
);

const guard = recipeByOutput.get("motherboard.guard");
assert.deepEqual(
  guard.requirements.map((r) => [r.match.resourceId, r.units]),
  [
    ["mh.crafting.wires", 3],
    ["mh.crafting.silver", 2],
    ["mh.crafting.platinum", 2],
    ["mh.crafting.fuses", 3],
  ],
  "Guard validated pilot recipe must remain unchanged",
);

console.log("P2.12i.3 TESTS GREEN: all 18 Motherboard recipes use canonical mh.crafting.* Items with preserved quantities; Force migrated; Guard pilot preserved.");
