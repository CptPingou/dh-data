# P2.12h.1 — Artificier hunt-weapon workshop launcher

Adds a persistent `Atelier d’armes de chasse` launcher to rendered Artificier character sheets.

Rules:
- character Actor only;
- must own the Toolkit Artificier class (`homebrew.artificer.class.artificer`);
- current user must own the Actor, except GM override;
- UI delegates directly to `api.weaponAugmentWorkshop.open(actor)`;
- no crafting, permission, or weapon state logic is duplicated in the sheet bridge.

API version: `0.5.62`.

## Node smoke

```powershell
node tools/test-p2.12h.1.mjs
```

Expected:

```text
P2.12h.1 TESTS GREEN: launcher is restricted to owned Artificier character sheets; GM override remains available.
```
