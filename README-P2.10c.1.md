# P2.10c.1 — ExpeditionContainer générique

## But

Découpler le nombre de PJ du nombre et du type de conteneurs. Foundry ne suppose plus « un PJ = un sac » ni « une seule caravane ».

## Contrat v2

Chaque conteneur porte désormais :

- `containerId` stable ;
- `type` : actuellement `backpack` ou `caravan` seulement ;
- `scope` : `personal`, `party` ou `expedition` ;
- `holderRef` : référence explicite vers un `character`, le `party` ou l'expédition ;
- `capacity`, `layout`, `rules`, `contents`.

Les personnages ne maintiennent plus un `containerIds[]` inverse : la relation est portée par le conteneur, ce qui autorise 0, 1 ou plusieurs conteneurs par PJ.

## Compatibilité

`expeditionManifest.normalize()` migre un manifeste `@1` en mémoire vers `@2` :

- `scope: character` → `scope: personal` ;
- `ownerCharacterId` → `holderRef: { kind: "character", id: ... }` ;
- `scope: party` → `holderRef: { kind: "party", id: "party" }` ;
- suppression de `character.containerIds`.

Aucune mutation du fichier Web source n'est faite automatiquement.

## UI Foundry

La fenêtre P2.10c.1 liste dynamiquement tous les `containers[]` par scope et affiche un conteneur de détail. Aucun nombre de PJ, sacs ou caravanes n'est codé en dur. Le drag & drop reste hors scope de cette étape.
