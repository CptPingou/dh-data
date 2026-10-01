# P2.12h.1e — Hunt loadout regression + Artisant chat launcher

- Restores the historical Hunt-card free-loadout contract on all 18 `domain: hunt` cards:
  - `system.loadoutIgnore = true`
  - one transferred ActiveEffect adding `system.bonuses.maxLoadout +1`
- Adds an `Atelier d’armes de chasse` button to ChatMessages whose `message.system.item` is the embedded Artisant card.
- Keeps actor-sheet/item-sheet launchers as secondary entry points.
- Chat launcher is strict: it requires Artisant, resolves the speaking character, verifies the character still owns Artisant, and enforces owner/GM access.

Test:

```powershell
node tools/test-p2.12h.1e.mjs
node tools/build-source-index.mjs
```
