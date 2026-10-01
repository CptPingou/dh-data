# P2.12i.1 — Standard crafting component compendium

Extends the existing `Campaign Toolkit — Loot` compendium (`dh-loot`) with 19 standardized workshop components used by the Motherboard augment recipe corpus.

## Design

- Reuses `dh-loot`, already designated as the Monster Hunter persistent item extension point.
- Keeps existing Monster Hunter loot/material items unchanged.
- Adds 19 stackable `loot` templates with stable `flags.daggerheart-campaign-toolkit.crafting.resourceId` identifiers.
- Normalizes legacy singular/plural recipe aliases:
  - `capacitor` / `capacitors` -> Condensateurs
  - `crystal` / `crystals` -> Cristaux
  - `relic` / `relics` -> Relique
- Does not yet consume these Item documents during crafting. P2.12i.1 establishes the canonical inventory models first.

## Counts

- Monster Hunter loot before: 2
- Standard crafting components added: 19
- `dh-loot` Monster Hunter source: 21
- Autonomous total: 1137

## Test

```powershell
node tools/test-p2.12i.1.mjs
node tools/build-source-index.mjs
```

Expected test:

`P2.12i.1 TESTS GREEN: 19 standard crafting components cover every Motherboard recipe resource alias; dh-loot=21; autonomous total=1137.`
