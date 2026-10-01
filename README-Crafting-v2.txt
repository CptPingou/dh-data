CRAFTING V2 — CONTRAT TRANSITOIRE
=================================

But
---
Préparer le passage du craft Motherboard exact-resource vers des recettes par budget de propriétés,
sans casser le moteur de recherche/connaissance ni les recettes actuelles.

Fichiers à remplacer dans le dépôt dh-data :
- scripts/crafting-schema.mjs
- scripts/crafting-material-runtime.mjs
- scripts/crafting-recipe-engine.mjs
- scripts/crafting-knowledge-runtime.mjs
- scripts/crafting-research-station.mjs
- scripts/crafting-runtime.mjs

Nouveau fichier à ajouter :
- data/crafting/properties.json

Fichier de test facultatif :
- tools/test-crafting-v2.mjs

Ce patch NE modifie PAS encore :
- data/crafting/materials.json
- data/crafting/recipes.json
- data/homebrew/... composants industriels
- motherboard.json

Compatibilité
-------------
- materials.json schemaVersion 1 reste accepté : properties: ["rigid", ...]
- recipes.json schemaVersion 1 exact-resource reste accepté
- nouveau MATERIAL v2 accepté : properties: { "rigid": 4, "flexible": 2 }
- nouvelle recette v2 acceptée avec mode: "property-budget"

Exemple recette v2 :
{
  "id": "craft.weapon-augment.example",
  "name": "Exemple",
  "mode": "property-budget",
  "output": { "type": "weaponAugment", "id": "motherboard.force" },
  "requirements": [
    { "id": "rigidity", "value": 4, "match": { "property": "rigid" } },
    { "id": "flexibility", "value": 2, "match": { "property": "flexible" } }
  ]
}

Recherche
---------
- la connaissance existante reste inchangée : on mémorise les IDs de propriétés découvertes,
  jamais leur valeur ; la valeur reste dans materials.json.
- un spécimen reste requis quand research.specimen.required=true.
- le spécimen n'est pas consommé.
- la station accepte maintenant explicitement FOB OU Caravane.
- propriétés v2 numériques : la station parcourt leurs clés et masque toujours les propriétés inconnues.

Allocation v2
-------------
Une unité de matériau contribue à toutes ses propriétés connues avec leur valeur complète.
Le solveur property-budget cherche une allocation avec le moins d'unités consommées.
Les propriétés non découvertes/documentées sont masquées avant l'allocation, comme auparavant.

Validation effectuée
--------------------
- node --check sur les 6 modules modifiés : GREEN
- catalogues actuels schema v1 : GREEN
- dictionnaire properties.json : GREEN
- test moteur property-budget : GREEN

Commande de test locale :
node tools/test-crafting-v2.mjs

Étape suivante
--------------
Construire ensemble le vrai dictionnaire de propriétés + le catalogue Monster Hunter v2 avec valeurs,
puis migrer les 18 recettes Motherboard vers property-budget. Aucun score n'a été inventé dans ce patch.
