import assert from "node:assert/strict";
import { expeditionManifestApi } from "../scripts/expedition-manifest.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";

function materialSnapshot({ id, name, containerClass, quantity = 1 }) {
  return {
    name,
    type: "loot",
    system: { quantity },
    flags: {
      [MODULE_ID]: {
        sourceId: id,
        kind: "material",
        material: { materialId: id, containerClass, stackable: true },
      },
    },
  };
}

function itemRef({ id, name, containerClass, quantity = 1 }) {
  return { sourceId: id, name, snapshot: materialSnapshot({ id, name, containerClass, quantity }) };
}

function manifest() {
  return {
    schema: expeditionManifestApi.schema,
    expeditionId: "p2-12c",
    revision: 1,
    phase: "prepared",
    authority: "foundry",
    characters: [],
    containers: [
      {
        containerId: "hard-case",
        type: "caravan",
        name: "Boîte renforcée",
        scope: "expedition",
        holderRef: { kind: "expedition", id: "p2-12c" },
        capacity: { slots: 3 },
        layout: { slots: [1, 2, 3].map((n) => ({ slotId: `hard-${n}` })) },
        rules: [], contents: [],
        materialStorage: { accepts: ["hard-material"], stackLimit: 5 },
      },
      {
        containerId: "legacy",
        type: "caravan",
        name: "Conteneur legacy",
        scope: "expedition",
        holderRef: { kind: "expedition", id: "p2-12c" },
        capacity: { slots: 2 }, layout: { slots: [] }, rules: [], contents: [],
      },
    ], ledger: [], metadata: {},
  };
}

const fang = itemRef({ id: "mh.tetsucabra.fang", name: "Croc de Tetsucabra", containerClass: "hard-material" });
const gland = itemRef({ id: "mh.vespoid.gland", name: "Glande de Vespoid", containerClass: "organ" });

{
  const m = manifest();
  assert.equal(expeditionManifestApi.validate(m).green, true);
  const first = expeditionManifestApi.acquire(m, { containerId: "hard-case", itemRef: fang, quantity: 4 });
  assert.equal(first.acquired, true);
  const overflow = expeditionManifestApi.acquire(m, { containerId: "hard-case", itemRef: fang, quantity: 2 });
  assert.equal(overflow.acquired, false);
  assert.equal(overflow.code, "material-stack-limit-exceeded");
  assert.equal(m.containers[0].contents[0].quantity, 4, "overflow must not mutate the existing stack");
}

{
  const m = manifest();
  const rejected = expeditionManifestApi.acquire(m, { containerId: "hard-case", itemRef: gland, quantity: 1 });
  assert.equal(rejected.acquired, false);
  assert.equal(rejected.code, "material-container-class-rejected");
  assert.equal(m.containers[0].contents.length, 0);
}

{
  const m = manifest();
  const exact = expeditionManifestApi.acquire(m, { containerId: "hard-case", itemRef: fang, quantity: 5 });
  assert.equal(exact.acquired, true);
  assert.equal(m.containers[0].contents[0].quantity, 5);
}

{
  const m = manifest();
  const legacy = expeditionManifestApi.acquire(m, { containerId: "legacy", itemRef: fang, quantity: 20 });
  assert.equal(legacy.acquired, true, "containers without materialStorage remain backward compatible");
}

console.log("P2.12c TESTS GREEN: optional material storage policy, class acceptance, stack limit, no overflow mutation, legacy compatibility.");
