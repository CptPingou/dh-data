import assert from "node:assert/strict";

const settings = new Map();
const registered = new Map();
globalThis.game = {
  user: { isGM: true },
  settings: {
    settings: { has: (key) => registered.has(key) },
    register: (scope, key, data) => { registered.set(`${scope}.${key}`, data); settings.set(`${scope}.${key}`, structuredClone(data.default)); },
    get: (scope, key) => structuredClone(settings.get(`${scope}.${key}`)),
    set: async (scope, key, value) => { settings.set(`${scope}.${key}`, structuredClone(value)); return value; },
  },
};

const { registerMaterialKnowledgeSetting, createCraftingKnowledgeApi } = await import("../scripts/crafting-knowledge-runtime.mjs");
registerMaterialKnowledgeSetting();

const definitions = {
  "mh.tetsucabra.fang": {
    id: "mh.tetsucabra.fang", name: "Croc de Tetsucabra",
    material: { properties: ["rigid", "piercing", "impact"] },
    research: { discoverable: true, specimen: { required: true, consumed: false } },
  },
};
const quantities = new Map();
const materialsApi = {
  get: async (id) => structuredClone(definitions[id] ?? null),
  actorQuantity: (actor, id) => quantities.get(`${actor.uuid}:${id}`) ?? 0,
};
const api = createCraftingKnowledgeApi(materialsApi, { now: (() => { let t = 1000; return () => ++t; })() });
const moth = { uuid: "Actor.moth", name: "Moth" };
const nera = { uuid: "Actor.nera", name: "Nera" };

await assert.rejects(() => api.discover({ actor: moth, materialId: "mh.tetsucabra.fang", propertyId: "rigid" }), /specimen/i);
quantities.set("Actor.moth:mh.tetsucabra.fang", 1);
await assert.rejects(() => api.discover({ actor: moth, materialId: "mh.tetsucabra.fang", propertyId: "electric" }), /not a property/i);
const discovery = await api.discover({ actor: moth, materialId: "mh.tetsucabra.fang", propertyId: "rigid", source: { type: "research-station" } });
assert.equal(discovery.changed, true);
assert.equal(discovery.specimenConsumed, false);
assert.equal(materialsApi.actorQuantity(moth, "mh.tetsucabra.fang"), 1);
assert.deepEqual(api.effective(moth, "mh.tetsucabra.fang").properties, ["rigid"]);
assert.deepEqual(api.effective(nera, "mh.tetsucabra.fang").properties, []);
await assert.rejects(() => api.document({ actor: nera, materialId: "mh.tetsucabra.fang", propertyId: "rigid" }), /not personally discovered/i);
const documentation = await api.document({ actor: moth, materialId: "mh.tetsucabra.fang", propertyId: "rigid" });
assert.equal(documentation.changed, true);
assert.deepEqual(api.effective(nera, "mh.tetsucabra.fang").properties, ["rigid"]);
assert.equal(api.documented("mh.tetsucabra.fang").rigid.documentedBy, "Actor.moth");
const duplicate = await api.discover({ actor: moth, materialId: "mh.tetsucabra.fang", propertyId: "rigid" });
assert.equal(duplicate.changed, false);
const status = api.status(moth);
assert.equal(status.personalProperties, 1);
assert.equal(status.documentedProperties, 1);
console.log("P2.12e TESTS GREEN: specimen-gated personal discovery, non-consuming research, party documentation, effective shared knowledge, idempotence.");
