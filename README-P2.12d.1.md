# P2.12d.1 — Material multi-slot load + real Actor debit

Fixes the real-world backpack test uncovered while validating P2.12f.

- `mergeStacks:false` material acquisitions now split quantities across physical stacks/slots, respecting `stackLimit`.
- Split acquisition is atomic: if all chunks cannot fit, the manifest is restored.
- `expeditionItems.loadFromActor()` is now an actual Actor → expedition transfer: it debits/deletes the owned Item only after manifest acquisition succeeds.
- Actor quantity paths supported: `system.quantity`, `system.quantity.value`, `system.amount`, `system.amount.value`.
- If the Actor mutation fails, the in-memory manifest is restored.
- Caravan merging behavior is unchanged.

Runtime note: callers must now `await expeditionItems.loadFromActor(...)`.
