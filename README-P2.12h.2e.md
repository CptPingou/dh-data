# P2.12h.2e — Passive workshop feature / direct Toolkit launcher

- Removes the misleading native Daggerheart `effect` action from `Atelier d’armes de chasse`.
- Keeps the feature as a managed passive marker granted by Artisant.
- Keeps direct workshop launchers owned by the Toolkit:
  - actor item context menu `⋯ -> Atelier d’armes de chasse`;
  - custom button injected in the feature ChatMessage via `renderChatMessageHTML`.
- Existing embedded copies are refreshed by the reconciliation runtime and lose the old native action.
- `weaponAugmentWorkshop.open(actor)` remains the single UI entry point.
