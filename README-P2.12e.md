# P2.12e — Material knowledge runtime

Adds persistent world knowledge for biological crafting materials.

- Personal discovery is keyed by permanent Actor UUID.
- Discovery validates the material/property against the canonical material catalog.
- Required specimens must be present on the researching Actor.
- v1 specimens are not consumed.
- Party documentation requires prior personal discovery.
- Effective knowledge = personal discoveries + party documentation.
- Runtime persistence uses the hidden world setting `materialKnowledge`.
- Mutations are GM-authoritative in this tranche; player-facing authority/UI is deliberately deferred.

Test:

```powershell
node .\tools\test-p2.12a.mjs
node .\tools\test-p2.12b.mjs
node .\tools\test-p2.12c.mjs
node .\tools\test-p2.12d.mjs
node .\tools\test-p2.12e.mjs
```

Expected P2.12e output:

`P2.12e TESTS GREEN: specimen-gated personal discovery, non-consuming research, party documentation, effective shared knowledge, idempotence.`
