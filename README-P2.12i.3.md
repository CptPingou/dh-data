# P2.12i.3 — Migration canonique des recettes Motherboard

## Objectif
Migrer les 18 recettes d'augmentations Motherboard vers les composants standards du compendium `dh-loot`, référencés exclusivement par `mh.crafting.*`.

## Résultat
- 18 recettes / 18 augmentations couvertes.
- Toutes les quantités historiques du catalogue `data/weapon-augments/motherboard.json` sont conservées.
- Garde conserve exactement la recette pilote validée en P2.12i.2.
- Force quitte le pilote biologique et utilise désormais sa recette standard :
  - Engrenages x3
  - Lentilles x2
  - Aluminium x4
  - Condensateurs x1
- Les alias `crystal/crystals`, `capacitor/capacitors` et `relic/relics` sont résolus vers un seul `resourceId` canonique.
- Le moteur biologique reste disponible pour de futures recettes Monster Hunter, mais aucune augmentation Motherboard ne dépend désormais de ce rail.

## Fichiers
- `data/crafting/recipes.json`
- `tools/test-p2.12i.3.mjs`

## Test
```powershell
node tools/test-p2.12i.3.mjs
```

Attendu :
`P2.12i.3 TESTS GREEN: all 18 Motherboard recipes use canonical mh.crafting.* Items with preserved quantities; Force migrated; Guard pilot preserved.`

Aucun rebuild du source-index n'est requis : `data/crafting/recipes.json` n'est pas un corpus de compendium autonome.
