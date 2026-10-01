# P2.12g.3.1 — Research actor filtering

Hotfix for the Foundry research station actor selector.

## Rules

A research candidate must:
- be a Foundry `Actor` document;
- have `actor.type === "character"`;
- be owned (`OWNER`) by the requesting user.

This excludes adversaries (for example Tetsucabra) and party actors from the researcher selector.
The same character-type guard is enforced by the GM authority bridge so a forged socket request cannot use a non-character actor.

## Regression tests

```powershell
node tools/test-p2.12g.1.mjs
node tools/test-p2.12g.2.mjs
node tools/test-p2.12g.3.mjs
```

Expected: all three GREEN; g.3 explicitly tests character/adversary/party filtering.
