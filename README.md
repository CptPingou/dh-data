# P3.4 — Kit de transfert Foundry / base de travail Web

**Installation :** extraire à la racine du dépôt `E:\Dev\DH Data` (dossiers `tools/`, `schemas/`, `web/`, `docs/`, `examples/`). Aucune modification du runtime Foundry. Les scripts Foundry sont les versions déjà éprouvées en P3.4b / P3.4c.2.

## Export depuis Foundry (MJ)
1. Ouvrir le monde, console F12, exécuter le contenu de `tools/p34b-export-foundry.js`.
2. Sauvegarder le JSON téléchargé dans `examples/`.
3. `python .\tools\validate_transfer.py ".\examples\<nom-export>.json"`

## Préparer les données pour une interface web (local, hors serveur)
- `node .\tools\web-transfer-cli.mjs inspect ".\examples\P3.4b-transfer-test-drag-drop-r18.json"`
- `node .\tools\web-transfer-cli.mjs stage ".\examples\P3.4b-transfer-test-drag-drop-r18.json" ".\web-state"`
- `node .\tools\web-transfer-cli.mjs checkout ".\web-state\test-drag-drop.json" ".\examples\web-ready.json"`
- `python .\tools\validate_transfer.py ".\examples\web-ready.json"`

`web/expedition-transfer.mjs` fournit `toWebView`, `inventoryRows` et `editCandidate` pour bâtir les composants UI. **Les fonctions ne valident pas le schéma complet** : toujours passer le validateur avant import ou persistance serveur. Le CLI local n'est pas une API web.

## Import vers Foundry (MJ, copie de monde d'abord)
1. Valider le fichier JSON avec Python.
2. Ouvrir la console F12 et exécuter `tools/p34c2-import-foundry.js`.
3. Choisir le JSON, lire le préflight, télécharger la sauvegarde, confirmer explicitement l'éventuelle remise à zéro FOB.
4. Vérifier la révision, réexporter et comparer les données. Refuser tout préflight inattendu.

## Limites
- Pas de synchronisation automatique, backend NAS, API HTTP, authentification, transaction atomique ni verrou distribué.
- Pas de bascule automatique de l'autorité entre Foundry et Web.
- L'importeur n'a été validé en situation que sur le scénario de référence `test-drag-drop` ; tester les autres expéditions sur une copie de monde.
- Le JSON `r18` fourni est un **jeu de données de test** et non un modèle à réimporter dans un monde différent.

Lire `docs/WEB-DATA-MAPPING.md` et `schemas/expedition-transfer-v1.schema.json` avant de construire l'interface.
