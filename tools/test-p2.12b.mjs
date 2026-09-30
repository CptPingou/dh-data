import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  materialItemData,
  isMaterialItem,
  materialIdOf,
  materialQuantityOf,
  listActorMaterials,
  actorMaterialQuantity,
  grantMaterial,
} from "../scripts/crafting-material-runtime.mjs";

const catalog = JSON.parse(await fs.readFile(new URL("../data/crafting/materials.json", import.meta.url), "utf8"));
const byId = new Map(catalog.materials.map((m) => [m.id, m]));
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(catalog) });

const fang = byId.get("mh.tetsucabra.fang");
const data = materialItemData(fang, { quantity: 2 });
assert.equal(data.type, "loot");
assert.equal(data.system.quantity, 2);
assert.equal(data.flags["daggerheart-campaign-toolkit"].material.materialId, fang.id);
assert.equal(data.flags["daggerheart-campaign-toolkit"].material.containerClass, "hard-material");

function mockItem(source, id = "item-1") {
  const item = structuredClone(source);
  item.id = id;
  item.documentName = "Item";
  item.update = async (patch) => { if (patch["system.quantity"] !== undefined) item.system.quantity = patch["system.quantity"]; };
  return item;
}
const actor = {
  uuid: "Actor.test",
  items: [mockItem(data)],
  async createEmbeddedDocuments(_type, docs) {
    const created = docs.map((doc, i) => mockItem(doc, `created-${i}`));
    this.items.push(...created);
    return created;
  },
};
assert.equal(isMaterialItem(actor.items[0]), true);
assert.equal(materialIdOf(actor.items[0]), fang.id);
assert.equal(materialQuantityOf(actor.items[0]), 2);
assert.equal(listActorMaterials(actor)[0].containerClass, "hard-material");
assert.equal(actorMaterialQuantity(actor, fang.id), 2);

const stacked = await grantMaterial(actor, fang.id, 3);
assert.equal(stacked.operation, "stack");
assert.equal(stacked.total, 5);
assert.equal(actorMaterialQuantity(actor, fang.id), 5);

const created = await grantMaterial(actor, "mh.vespoid.gland", 2);
assert.equal(created.operation, "create");
assert.equal(created.item.type, "loot");
assert.equal(actorMaterialQuantity(actor, "mh.vespoid.gland"), 2);
assert.equal(listActorMaterials(actor).length, 2);

console.log("P2.12b TESTS GREEN: Foundry loot material data, canonical flags, actor listing, quantities, stack grant.");
