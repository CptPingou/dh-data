# P2.12h.1b — ActionField valueAlt normalization hotfix

Targeted fix for autonomous source verification. Foundryborne hydrates domain-card action paths `system.actions.*.damage.resources.*.valueAlt` from an authoritative object to `null`. The comparator now treats only that path-specific object→null normalization as equivalent; other action divergences remain strict.

Run:

```powershell
node tools/test-p2.12h.1b-actionfield-normalization.mjs
```
