# P2.9a.6a — Loot autonomous foundation

## Scope
- Declares Toolkit compendium `dh-loot` (`Item`, native type `loot`).
- Adds `dh-loot` to autonomous ownership/export/bootstrap plumbing.
- Adds empty core and Monster Hunter source extension points.
- Cleans the canonical SRD 2.0 item extraction (120 rows) without importing English content into the FR corpus.
- Excludes the native stray `Brooch` duplicate: canonical SRD source remains 120 items.

## Homebrew contract
Monster Hunter persistent objects target `dh-loot` and keep Foundry type `loot`.
Toolkit metadata carries semantics instead of introducing custom Foundry item types.
Planned `lootCategory` values: `material`, `component`, `augment`, `recipe`, `relic`, `equipment`.
Monster parts may additionally carry tier, monster/source, anatomical part and preservation/crafting metadata.

## Expected status after 6a
- autonomous total remains 994 (the new pack is intentionally empty in this foundation step)
- `dh-loot`: expected 0 / actual 0
- owned SRD families: 9

P2.9a.6b will materialize the 120 cleaned SRD items in French and move the autonomous total to 1114.
