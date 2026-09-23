# P2.10f.1 — Conteneurs : UI + crochets graphiques

Objectif : transformer le prototype technique des conteneurs en composant réutilisable pour les sacs et la future caravane, sans dépendre encore d'assets définitifs.

## UI
- cartes de conteneurs plus lisibles dans la colonne de gauche ;
- compteur et jauge de capacité ;
- en-tête de conteneur avec propriétaire/type/scope ;
- grille conservée à 82×82 ;
- les `itemRef.img` Foundry sont affichés dans les cases quand ils existent ;
- la caravane utilise déjà le même composant (`type: "caravan"`) avec une classe dédiée, sans logique spéciale.

## Crochet graphique optionnel

Un conteneur peut désormais porter, sans rendre ces champs obligatoires :

```json
"presentation": {
  "icon": "modules/.../container-icon.webp",
  "background": "modules/.../container-background.webp",
  "frame": "modules/.../container-frame.webp",
  "slotBackground": "modules/.../slot.webp"
}
```

Ces chemins sont purement de présentation :
- `icon` : vignette du conteneur ;
- `background` : fond derrière la grille ;
- `frame` : calque décoratif au-dessus de la fenêtre du conteneur ;
- `slotBackground` : visuel des cases vides.

Sans asset, l'UI reste entièrement fonctionnelle avec des fallbacks neutres/Font Awesome.

Le contrat métier (`capacity`, `layout`, `rules`, `contents`) reste inchangé.
