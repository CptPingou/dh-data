# P2.9a.5a — Consumables source cleanup

Scope: canonical SRD 2.0 consumable extraction only. No Foundry pack/runtime change yet.

- Repairs deterministic PDF table splits in `data/srd-2.0/equipment/consumables.json`.
- Makes the repairs persistent in `tools/extract_srd2_equipment.py` so regeneration does not reintroduce them.
- Preserves all 120 source IDs, rolls, subsets and mechanics.
- Corpus remains 60 Core + 60 Hope & Fear.

Important: `items.json` is the separate Loot/Items table; it is not the consumables corpus.

Next step: inspect one native Foundryborne consumable document to materialize the autonomous `dh-consumables` Item schema without guessing it, then add the FR locale and runtime pack.
