# P2.9a.6b — Loot FR autonome

## Contenu
- Matérialise les 120 loots canoniques SRD dans `data/core/fr/dh-loot.json`.
- Traduction FR des noms et descriptions ; aucune dépendance au pack natif `daggerheart.loot`.
- IDs Toolkit déterministes et uniques, liés au `sourceId` canonique.
- Schéma Foundry natif conservé : `type: loot`, `quantity: 1`, `actions: {}`.
- Le doublon natif `Brooch` reste exclu : 120 sources canoniques, pas 121.
- Métadonnée Toolkit `lootCategory` ajoutée pour préparer le homebrew : `equipment`, `augment`, `recipe`, `relic`.
- Le point d’extension Monster Hunter `data/homebrew/monster-hunter/dh-loot.json` reste vide et prêt à recevoir matériaux, composants, augments, recettes et reliques.

## Validation locale
- `dh-loot`: 120 sources, 120 IDs uniques, parité source 120/120.
- Catégories : equipment 96, augment 10, relic 10, recipe 4.
- Builder : GREEN.
- Core : 1054 ; Playtest : 43 ; Homebrew : 17 ; Total : **1114**.

## Validation Foundry attendue
Après build + déploiement des `data` puis `syncAutonomousSources()` :
- `expected: 1114`
- `actual: 1114`
- `dh-loot: 120/120`
- `green: true`
