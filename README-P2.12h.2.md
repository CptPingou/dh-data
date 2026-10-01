# P2.12h.2 — Artisant grants Workshop Feature

## But

Remplacer les launchers fragiles de fiche/chat par une vraie feature embarquée sur le PJ :

- carte Chasse `Artisant` = autorisation métier ;
- feature `Atelier d’armes de chasse` = point d’entrée UI ;
- menu `⋯` de la feature -> `Atelier d’armes de chasse` ;
- menu ContextMenu Foundry v14 : `label/visible` (plus `name/condition`) ;
- ancien launcher fiche/chat non enregistré ;
- les 18 cartes Chasse conservent `loadoutIgnore=true` + `+1 maxLoadout`.

## Données

Nouvelle source :

- pack : `dh-features`
- `_id` : `MHARTWORKSHOP001`
- source ID : `monster-hunter.hunt.feature.weapon-workshop`
- parent : `monster-hunter.hunt.MHARTISANT000001`

## Installation / tests

```powershell
cd C:\dev\dh-data
node tools/test-p2.12h.2.mjs
node tools/prepare-p2.12h.2-source-index.mjs
node tools/build-source-index.mjs
```

Le rebuild du source-index doit finir à `total: 1118`.

Déployer ensuite par le robocopy habituel et redémarrer Foundry.

Puis en GM :

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.syncAutonomousSources();
await api.huntArtisanWorkshopFeature.reconcileAll();
```

## Smoke Foundry

Sur un PJ possédant `Artisant` :

1. vérifier la présence de la feature `Atelier d’armes de chasse` ;
2. ouvrir `⋯` sur cette feature ;
3. cliquer `Atelier d’armes de chasse` ;
4. le workshop doit s’ouvrir ;
5. retirer Artisant, puis appeler `reconcileAll()` : la feature doit disparaître ;
6. remettre Artisant, puis `reconcileAll()` : une seule feature doit être recréée.

La feature n’accorde aucun droit par elle-même : `weaponAugmentWorkshop.open(actor)` vérifie toujours la possession d’Artisant.
