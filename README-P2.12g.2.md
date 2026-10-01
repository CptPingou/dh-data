# P2.12g.2 — FOB material documentation

Adds `api.crafting.documentMaterialProperty(...)` as the base/FOB business primitive for publishing a personally discovered material property into collective party knowledge.

Contract:

```js
await api.crafting.documentMaterialProperty({
  actor,
  materialId: "mh.tetsucabra.fang",
  propertyId: "piercing",
  expeditionId: "mh-home-test",
  containerId: "fob",
  source: "fob",
});
```

Rules:
- mutation is GM-authoritative;
- expedition and FOB must exist;
- property must belong to the material;
- the actor must already have personally discovered the property (enforced by `craftingKnowledge.document`);
- no specimen is required or consumed;
- no manifest or inventory mutation;
- documentation is idempotent;
- other actors receive the documented property through `craftingKnowledge.effective()` without gaining it in `personal()`.

Node test:

```powershell
node tools/test-p2.12g.2.mjs
```

Expected:

```text
P2.12g.2 TESTS GREEN: FOB documentation requires personal discovery; no specimen is required or consumed; collective effective knowledge propagates; idempotence and location/property guards hold.
```
