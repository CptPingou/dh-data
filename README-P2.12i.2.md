# P2.12i.2 — Canonical component recipe pilot

Pilot recipe: `motherboard.guard`.

## Goal

Validate the standard-component crafting rail before migrating all 18 Motherboard recipes.

## Guard recipe

- `mh.crafting.wires` ×3
- `mh.crafting.silver` ×2
- `mh.crafting.platinum` ×2
- `mh.crafting.fuses` ×3

The runtime reads real Item snapshots stored in the expedition Caravan. Existing i.1 component `resourceId` values are normalized to the canonical `mh.crafting.*` namespace at runtime, so no item migration is required.

## Transaction

1. Plan exact-resource allocation from Caravan contents.
2. Reject without mutation if stock is insufficient.
3. Consume the exact Caravan entries using `expeditionManifest.consume()`.
4. Persist the changed manifest.
5. Mark the augment crafted on the selected weapon.
6. If augment-state mutation fails, restore the original manifest.

Biological material recipes remain supported unchanged.

## Test

```powershell
node tools/test-p2.12i.2.mjs
```

Expected:

```text
P2.12i.2 TESTS GREEN: Guard canonical component recipe plans exact stock, detects shortages, consumes Caravan entries transactionally, and preserves biological crafting.
```

## Foundry smoke

Put in the expedition Caravan:

- Fils conducteurs ×3
- Argent ×2
- Platine ×2
- Fusibles ×3

Open `Atelier d’armes de chasse`, select a weapon where Garde is not already crafted, select the expedition, then click `Fabriquer` on Garde.

Expected:

- the four component stacks lose exactly 3/2/2/3 units;
- Garde becomes `Fabriqué`;
- the next button becomes `Installer`;
- closing and reopening the workshop preserves both states.
