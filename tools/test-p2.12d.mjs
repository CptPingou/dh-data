import assert from "node:assert/strict";
import { expeditionManifestApi } from "../scripts/expedition-manifest.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";

function itemRef(id = "mh.tetsucabra.fang", name = "Croc de Tetsucabra") {
  return {
    sourceId: id,
    name,
    snapshot: {
      name,
      type: "loot",
      system: { quantity: 1 },
      flags: {
        [MODULE_ID]: {
          sourceId: id,
          kind: "material",
          material: { materialId: id, containerClass: "hard-material", stackable: true },
        },
      },
    },
  };
}

function container(containerId, { slots, stackLimit, mergeStacks }) {
  return {
    containerId,
    type: containerId.startsWith("bag") ? "backpack" : "caravan",
    name: containerId,
    scope: "expedition",
    holderRef: { kind: "expedition", id: "p2-12d" },
    capacity: { slots },
    layout: { slots: Array.from({ length: slots }, (_, i) => ({ slotId: `${containerId}-${i + 1}` })) },
    rules: [],
    contents: [],
    materialStorage: { accepts: [], stackLimit, mergeStacks },
  };
}

function manifest() {
  return {
    schema: expeditionManifestApi.schema,
    expeditionId: "p2-12d",
    revision: 1,
    phase: "prepared",
    authority: "foundry",
    characters: [],
    containers: [
      container("bag-a", { slots: 4, stackLimit: 1, mergeStacks: false }),
      container("bag-b", { slots: 4, stackLimit: 1, mergeStacks: false }),
      container("caravan", { slots: 40, stackLimit: 30, mergeStacks: true }),
    ],
    ledger: [], metadata: {},
  };
}

{
  const m = manifest();
  assert.equal(expeditionManifestApi.validate(m).green, true);
  const a = expeditionManifestApi.acquire(m, { containerId: "bag-a", itemRef: itemRef(), quantity: 1 });
  const b = expeditionManifestApi.acquire(m, { containerId: "bag-a", itemRef: itemRef(), quantity: 1 });
  assert.equal(a.acquired, true);
  assert.equal(b.acquired, true);
  assert.equal(b.merged, undefined);
  assert.equal(m.containers[0].contents.length, 2, "backpack keeps identical materials in separate physical slots");
  assert.deepEqual(m.containers[0].contents.map((e) => e.quantity), [1, 1]);
  const bulk = expeditionManifestApi.acquire(m, { containerId: "bag-a", itemRef: itemRef(), quantity: 2 });
  assert.equal(bulk.acquired, false, "backpack rejects quantity > 1 in one slot");
}

{
  const m = manifest();
  expeditionManifestApi.acquire(m, { containerId: "bag-a", itemRef: itemRef(), quantity: 1 });
  expeditionManifestApi.acquire(m, { containerId: "bag-b", itemRef: itemRef(), quantity: 1 });
  const [ea] = m.containers[0].contents;
  const [eb] = m.containers[1].contents;
  const first = expeditionManifestApi.transfer(m, { entryId: ea.entryId, fromContainerId: "bag-a", toContainerId: "caravan" });
  const second = expeditionManifestApi.transfer(m, { entryId: eb.entryId, fromContainerId: "bag-b", toContainerId: "caravan" });
  assert.equal(first.moved, true);
  assert.equal(first.merged, false);
  assert.equal(second.moved, true);
  assert.equal(second.merged, true, "second return-to-base transfer consolidates the caravan stack");
  assert.equal(m.containers[2].contents.length, 1);
  assert.equal(m.containers[2].contents[0].quantity, 2);
}

{
  const m = manifest();
  const cart = m.containers[2];
  const seed = expeditionManifestApi.acquire(m, { containerId: "caravan", itemRef: itemRef(), quantity: 30 });
  assert.equal(seed.acquired, true);
  expeditionManifestApi.acquire(m, { containerId: "bag-a", itemRef: itemRef(), quantity: 1 });
  const entry = m.containers[0].contents[0];
  const blocked = expeditionManifestApi.transfer(m, { entryId: entry.entryId, fromContainerId: "bag-a", toContainerId: "caravan" });
  assert.equal(blocked.moved, false);
  assert.equal(cart.contents[0].quantity, 30, "full caravan stack is not mutated on rejected consolidation");
  assert.equal(m.containers[0].contents.length, 1, "source backpack keeps the rejected material");
}

console.log("P2.12d TESTS GREEN: backpack one-item slots, no backpack merge, caravan x30 consolidation, overflow-safe return-to-base transfer.");
