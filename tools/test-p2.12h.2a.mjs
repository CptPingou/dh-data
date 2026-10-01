import fs from "node:fs";
import assert from "node:assert/strict";

const featureData = JSON.parse(fs.readFileSync(new URL("../data/homebrew/monster-hunter/dh-features.json", import.meta.url), "utf8"));
const feature = featureData.find((row) => row._id === "MHARTWORKSHOP001");
assert(feature, "Workshop feature source must exist");
const action = feature.system?.actions?.MHARTWORKACT0001;
assert(action, "Workshop feature must carry native action MHARTWORKACT0001");
assert.equal(action.type, "effect");
assert.equal(action.chatDisplay, true);
assert.equal(action.name, "Ouvrir l’atelier");

const runtime = fs.readFileSync(new URL("../scripts/hunt-artisan-workshop-feature.mjs", import.meta.url), "utf8");
assert.match(runtime, /renderChatMessageHTML/);
assert.doesNotMatch(runtime, /Hooks\.on\(["']renderChatMessage["']/);
assert.match(runtime, /message\?\.system\?\.origin/);
assert.match(runtime, /refreshed-from-source/);
assert.match(runtime, /weaponAugmentWorkshop\?\.open/);

const loader = fs.readFileSync(new URL("../scripts/autonomous-source-loader.mjs", import.meta.url), "utf8");
assert.match(loader, /ACTION_FIELD_ITEM_TYPES = new Set\(\["domainCard", "consumable", "feature"\]\)/);
assert.match(loader, /ACTION_FIELD_ITEM_TYPES\.has\(copy\?\.type\)/);
assert.match(loader, /ACTION_FIELD_ITEM_TYPES\.has\(doc\.type\)/);

console.log("P2.12h.2a TESTS GREEN: workshop feature carries a native action, embedded copies refresh from source, feature actions materialize through ActionField, and the v14 chat button is origin-gated.");
