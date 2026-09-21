# P2.9a.5b — Consumables FR autonomes

## Contenu
- Nouveau compendium `dh-consumables` (Item / `consumable`).
- 120 consommables FR (60 Core + 60 Hope & Fear).
- IDs Item et Action déterministes ; chaque coût `quantity` pointe vers l'ID Toolkit de son consommable.
- Action générique `Utiliser`, `quantity: 1`, `consumeOnUse: true`.
- Intégration à `source-index@2`, au loader autonome et à l'ownership Toolkit.
- Correction supplémentaire de l'extraction `Featherstep Potion` (suppression du paragraphe GOLD absorbé par le dernier consommable).

## Cible
- Core : 934
- Playtest : 43
- Homebrew : 17
- Total autonome : **994**
- `dh-consumables` : **120/120**

## Build / déploiement
```powershell
cd "E:\Dev\DH Data"
node tools/build-source-index.mjs

robocopy "E:\Dev\DH Data\data" "E:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit\data" /E /XO
robocopy "E:\Dev\DH Data\scripts" "E:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit\scripts" /E /XO
copy /Y "E:\Dev\DH Data\module.json" "E:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit\module.json"
```

Redémarrer Foundry (le nouveau pack est déclaré dans `module.json`), puis dans le monde :

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.syncAutonomousSources();
await api.autonomousSourceStatus();
```

Attendu : `expected: 994`, `actual: 994`, `dh-consumables: 120/120`, `green: true`.
