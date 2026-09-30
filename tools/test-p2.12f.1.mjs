import fs from "node:fs/promises";
import assert from "node:assert/strict";

const authority = await fs.readFile(new URL("../scripts/weapon-augment-authority.mjs", import.meta.url), "utf8");
const workshop = await fs.readFile(new URL("../scripts/weapon-augment-workshop.mjs", import.meta.url), "utf8");
const main = await fs.readFile(new URL("../scripts/main.mjs", import.meta.url), "utf8");

assert.match(authority, /craftWeaponAugment\(\{/);
assert.match(authority, /expedition-id-required/);
assert.match(authority, /expeditionId: expeditionId \?\? null/);
assert.match(authority, /allocations: message\.allocations \?\? null/);
assert.match(authority, /consumed: message\.consumed \?\? null/);
assert.doesNotMatch(authority, /case "craft":\s*\n\s*state = await api\.craft/);

assert.match(workshop, /data-dct-crafting-expedition/);
assert.match(workshop, /recipeForOutput\?\.\("weaponAugment", augment\.id\)/);
assert.match(workshop, /label = "Recette à migrer"/);
assert.match(workshop, /expeditionId,/);
assert.match(workshop, /containerId: "caravan"/);

assert.match(main, /version: "0\.5\.60"/);

console.log("P2.12f.1 TESTS GREEN: workshop biological craft routes through GM authority with expedition context; legacy free craft is blocked.");
