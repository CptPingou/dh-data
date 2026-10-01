import assert from "node:assert/strict";
import fs from "node:fs";
import {
  artificerWorkshopLauncherEligibility,
  huntArtisanCardLauncherEligibility,
} from "../scripts/artificer-workshop-launcher.mjs";
import {
  HUNT_ARTISAN_CARD_SOURCE_ID,
  hasHuntArtisanCard,
  isHuntArtisanCard,
} from "../scripts/weapon-augment-workshop.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";

function actor({ type = "character", owned = true, artisan = false, artificer = false } = {}) {
  const items = [];

  if (artisan) {
    items.push({
      id: "MHARTISANT000001",
      type: "domainCard",
      flags: {
        [MODULE_ID]: {
          canonicalSourceId: HUNT_ARTISAN_CARD_SOURCE_ID,
        },
      },
    });
  }

  if (artificer) {
    items.push({
      type: "class",
      flags: {
        [MODULE_ID]: { sourceId: "homebrew.artificer.class.artificer" },
      },
    });
  }

  return {
    documentName: "Actor",
    type,
    isOwner: owned,
    items,
  };
}

assert.equal(hasHuntArtisanCard(actor({ artisan: true })), true);
assert.equal(hasHuntArtisanCard(actor({ artificer: true })), false);

assert.deepEqual(
  artificerWorkshopLauncherEligibility(actor({ artisan: true }), { isGM: false }),
  { green: true, reason: "ok" },
);

assert.equal(
  artificerWorkshopLauncherEligibility(actor({ artificer: true }), { isGM: false }).reason,
  "actor-missing-hunt-artisan-card",
);

assert.equal(
  artificerWorkshopLauncherEligibility(actor({ type: "adversary", artisan: true }), { isGM: false }).reason,
  "actor-not-character",
);

assert.equal(
  artificerWorkshopLauncherEligibility(actor({ artisan: true, owned: false }), { isGM: false }).reason,
  "actor-not-owned",
);

assert.deepEqual(
  artificerWorkshopLauncherEligibility(actor({ artisan: true, owned: false }), { isGM: true }),
  { green: true, reason: "ok" },
);


const artisanItem = {
  documentName: "Item",
  id: "MHARTISANT000001",
  type: "domainCard",
  flags: {
    [MODULE_ID]: { canonicalSourceId: HUNT_ARTISAN_CARD_SOURCE_ID },
  },
};
const artisanActor = actor({ artisan: true });
artisanItem.parent = artisanActor;
assert.equal(isHuntArtisanCard(artisanItem), true);
assert.equal(huntArtisanCardLauncherEligibility(artisanItem, { isGM: false }).green, true);
assert.equal(
  huntArtisanCardLauncherEligibility({ ...artisanItem, parent: null }, { isGM: false }).reason,
  "artisan-card-not-embedded-on-character",
);

const cards = JSON.parse(
  fs.readFileSync(new URL("../data/homebrew/monster-hunter/dh-domain-cards.json", import.meta.url), "utf8"),
);
const artisanSource = cards.find((row) => row._id === "MHARTISANT000001");
assert.ok(artisanSource, "Artisant source card must exist");
assert.equal(artisanSource.system.loadoutIgnore, true);
const loadoutEffect = artisanSource.effects.find((effect) =>
  effect.system?.changes?.some?.((change) =>
    change.key === "system.bonuses.maxLoadout" &&
    change.type === "add" &&
    Number(change.value) === 1
  )
);
assert.ok(loadoutEffect, "Artisant must carry a transferable +1 maxLoadout effect");
assert.equal(loadoutEffect.transfer, true);

console.log("P2.12h.1 TESTS GREEN: Artisant gates the workshop, exposes card-sheet eligibility, and carries free-loadout compensation (+1 maxLoadout + loadoutIgnore).");
