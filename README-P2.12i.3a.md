# P2.12i.3a — diagnostics de craft insuffisant

Ce patch ne modifie aucune recette ni donnée de craft.

Il corrige uniquement le diagnostic quand une recette ne peut pas être fabriquée faute de composants :

- `crafting-recipe-engine.mjs` renvoie désormais `reason: "insufficient-components"` (ou `insufficient-materials` pour le rail biologique) ;
- `weapon-augment-authority.mjs` conserve `missing[]` et `recipeId` dans la réponse joueur -> MJ -> joueur ;
- `weapon-augment-workshop.mjs` affiche un message explicite du type :
  `Modification impossible : Composants insuffisants : coils 2/4, crystal 1/2`.

Régressions vérifiées :

- P2.12i.1 GREEN
- P2.12i.2 GREEN
- P2.12i.3 GREEN

Le patch ne traite pas encore les 404 d'icônes, le bug `setDragImage` du navigateur Daggerheart ni la course `DialogV2._updatePosition`; ils restent dans le backlog UI/assets.
