# P2.12h.2c — ActionField originItem null/omitted normalization

Foundryborne omits `originItem.itemPath` and `originItem.actionIndex` from hydrated actions when their authored value is `null`.

The autonomous source comparator now treats an omitted runtime key as equivalent to authored `null` only for:

- `system.actions.*.originItem.itemPath`
- `system.actions.*.originItem.actionIndex`

All other action fields remain strict.

Validation:

```powershell
node tools/test-p2.12h.2c.mjs
```
