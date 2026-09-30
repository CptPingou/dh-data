# P2.12f.1 — authoritative biological craft workshop bridge

- Routes workshop `craft` through the lead-GM authority bridge into `api.crafting.craftWeaponAugment()`.
- Carries `expeditionId` and `containerId` over the socket request/result.
- Keeps install/uninstall on the existing authoritative Weapon Augment path.
- Adds expedition selection to the hunt-weapon workshop; v1 crafting stock is `caravan`.
- Disables uncrafted augments without a migrated biological recipe instead of falling back to free legacy craft.
- Bumps toolkit API version to 0.5.60.

## Runtime smoke
1. Open the hunt weapon workshop as an Artificier owner while a GM is active.
2. Select an initialized weapon (including another actor's weapon).
3. Select an expedition containing the required caravan stock.
4. Force should show `Fabriquer`; non-migrated uncrafted augments show `Recette à migrer` disabled.
5. Craft Force and verify material consumption + consumed ledger + crafted state.
6. Install and uninstall Force to verify the existing authority path remains green.
