# P2.8q.1b — Réparation UTF-8 du corpus Monster Hunter

Réparation contrôlée du mojibaké présent dans `data/homebrew/monster-hunter/dh-domain-cards.json`.

- 17 cartes conservées.
- `_id` conservés et validés (16 caractères alphanumériques, uniques).
- Structure JSON conservée.
- Conversion des chaînes issues d'un UTF-8 interprété comme Windows-1252.
- Marqueurs résiduels de mojibaké détectés : aucun.

Le contenu change : le SHA du fichier doit être recalculé par le builder.

Après application dans `C:\dev\dh-data` :

```powershell
node .\tools\build-source-index.mjs
```

Puis déployer vers le module Foundry :
- `data/homebrew/monster-hunter/dh-domain-cards.json`
- `data/source-index.json`

Enfin relancer Foundry et :

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.syncAutonomousSources({ force: true });
await api.autonomousSourceStatus();
```

Attendu : total 820, green true.
