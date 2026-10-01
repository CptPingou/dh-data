CRAFTING V2 — DATA PILOT
========================

Contenu
-------
data/crafting/properties.json
data/crafting/materials.json
data/crafting/recipes.json

Objectif
--------
Premier lot de données pour tester le contrat Crafting v2 déjà installé.

Matériaux
---------
- Croc de Tetsucabra
- Cuir de Tetsucabra
- Glande de Vespoid
- Aile de Vespoid

Recettes converties en "property-budget"
----------------------------------------
- motherboard.force
- motherboard.guard
- motherboard.converge

IMPORTANT
---------
Ce recipes.json est volontairement un PILOTE : il ne contient que 3 recettes.
Si tu le poses à la place du recipes.json actuel, les autres augments Motherboard
n'auront temporairement plus de recette de craft dans ce catalogue.

Les IDs des matériaux existants ont été conservés afin que les spécimens déjà
présents dans les manifests/containers restent résolvables par le nouveau catalogue.

La recherche garde le contrat existant :
- spécimen requis ;
- spécimen non consommé ;
- découverte personnelle ;
- documentation de groupe.

Déploiement
-----------
Copier data/crafting/*.json vers le dépôt source C:\dev\dh-data,
puis déployer le module vers Foundry comme d'habitude.

Test conseillé
--------------
1. F5 et vérifier l'absence d'erreur rouge.
2. Ouvrir la station de recherche FOB/Caravane.
3. Vérifier que les propriétés sont masquées tant qu'elles ne sont pas connues.
4. Découvrir/documenter les propriétés nécessaires.
5. Tester un plan de craft sur Force, Guard puis Converge.
