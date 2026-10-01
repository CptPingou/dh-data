#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(resolve(root, p), "utf8");


const huntCards = JSON.parse(await read("data/homebrew/monster-hunter/dh-domain-cards.json"))
  .filter((card) => String(card?.system?.domain ?? "").toLowerCase() === "hunt");
assert.equal(huntCards.length, 18);
for (const card of huntCards) {
  assert.equal(card.system.loadoutIgnore, true, `${card.name}: loadoutIgnore`);
  const compensates = (card.effects ?? []).some((effect) =>
    (effect?.system?.changes ?? []).some((change) =>
      change?.key === "system.bonuses.maxLoadout" && Number(change?.value) === 1
    )
  );
  assert.equal(compensates, true, `${card.name}: +1 maxLoadout`);
}

const features = JSON.parse(await read("data/homebrew/monster-hunter/dh-features.json"));
assert.equal(features.length, 1);
const feature = features[0];
assert.equal(feature._id, "MHARTWORKSHOP001");
assert.equal(feature.type, "feature");
assert.equal(feature.flags["daggerheart-campaign-toolkit"].canonicalSourceId, "monster-hunter.hunt.feature.weapon-workshop");
assert.equal(feature.flags["daggerheart-campaign-toolkit"].parentSourceId, "monster-hunter.hunt.MHARTISANT000001");

const runtime = await read("scripts/hunt-artisan-workshop-feature.mjs");
assert.match(runtime, /createEmbeddedDocuments\("Item", \[source\]\)/);
assert.match(runtime, /deleteEmbeddedDocuments/);
assert.match(runtime, /hasHuntArtisanCard/);
assert.match(runtime, /Hooks\.on\("createItem"/);
assert.match(runtime, /Hooks\.on\("deleteItem"/);

const menu = await read("scripts/item-backpack-menu.mjs");
assert.match(menu, /label: "Atelier d’armes de chasse"/);
assert.match(menu, /visible: \(target\) =>/);
assert.doesNotMatch(menu, /\bcondition:\s*\(target\)/);
assert.doesNotMatch(menu, /\bname:\s*"Mettre dans le sac à dos"/);
assert.match(menu, /weaponAugmentWorkshop\?\.open/);

const main = await read("scripts/main.mjs");
assert.match(main, /registerHuntArtisanWorkshopFeatureRuntime/);
assert.match(main, /huntArtisanWorkshopFeature:/);
assert.doesNotMatch(main, /registerArtificerWorkshopLauncher/);
assert.doesNotMatch(main, /artificerWorkshopLauncher:/);

console.log("P2.12h.2 TESTS GREEN: Artisant grants a managed workshop feature; v14 context menu opens the workshop; legacy sheet/chat launcher is no longer registered.");
