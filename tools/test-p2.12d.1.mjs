import assert from "node:assert/strict";
import { acquireExpeditionEntry } from "../scripts/expedition-manifest.mjs";

const materialRef = {
  kind: "foundry-item",
  sourceId: "mh.tetsucabra.fang",
  name: "Croc de Tetsucabra",
  snapshot: {
    flags: {
      "daggerheart-campaign-toolkit": {
        material: {
          materialId: "mh.tetsucabra.fang",
          containerClass: "hard-material",
          stackable: true,
        },
      },
    },
  },
};

function backpack(slots) {
  return {
    schema: "daggerheart-campaign-toolkit/expedition-manifest@2",
    expeditionId: "split-test",
    revision: 1,
    phase: "prepared",
    authority: "web",
    characters: [{ characterId: "c1", name: "Tester" }],
    containers: [{
      containerId: "bag",
      type: "backpack",
      name: "Sac",
      scope: "personal",
      holderRef: { kind: "character", id: "c1" },
      capacity: { slots },
      layout: { slots: Array.from({ length: slots }, (_, i) => ({ slotId: `slot-${i + 1}` })) },
      materialStorage: { accepts: [], stackLimit: 1, mergeStacks: false },
      rules: [],
      contents: [],
    }],
    ledger: [],
  };
}

{
  const manifest = backpack(4);
  const result = acquireExpeditionEntry(manifest, { containerId: "bag", itemRef: materialRef, quantity: 2 });
  assert.equal(result.acquired, true);
  assert.equal(result.split, true);
  assert.deepEqual(manifest.containers[0].contents.map(e => e.quantity), [1, 1]);
  assert.equal(new Set(manifest.containers[0].contents.map(e => e.slotId)).size, 2);
  assert.equal(manifest.ledger.reduce((n, e) => n + e.quantity, 0), 2);
}

{
  const manifest = backpack(1);
  const before = structuredClone(manifest);
  const result = acquireExpeditionEntry(manifest, { containerId: "bag", itemRef: materialRef, quantity: 2 });
  assert.equal(result.acquired, false);
  assert.deepEqual(manifest, before);
}

console.log("P2.12d.1 TESTS GREEN: non-merging material quantities split across slots; insufficient capacity rolls back atomically.");
