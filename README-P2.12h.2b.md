# P2.12h.2b — Workshop feature native action + chat button

- Adds native `effect` action `MHARTWORKACT0001` (16-character Foundry/Daggerheart ID) / **Ouvrir l’atelier** to the managed feature.
- Generalizes autonomous ActionField hydration/materialization to `feature` items.
- Refreshes already-embedded managed workshop features when their source changes.
- Adds a Foundry v14 `renderChatMessageHTML` button gated by the feature message `system.origin`.
- The click still validates actor ownership and possession of Artisant before opening the workshop.
- Does not register deprecated `renderChatMessage`.

Run:

```powershell
node tools/test-p2.12h.2a.mjs
node tools/build-source-index.mjs
```

After deploy/restart (GM):

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.syncAutonomousSources();
await api.huntArtisanWorkshopFeature.reconcileAll();
```

Then send **Atelier d’armes de chasse** (the feature, not Artisant) to chat. The message footer must contain **Atelier d’armes de chasse**.
