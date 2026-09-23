# P2.10c.2a — Rafraîchissement local

Correctif UX de P2.10c.2.

- le `DialogV2` reste ouvert et conserve sa position/taille ;
- clic sur un conteneur : seuls la liste et le panneau de détail sont rerendus ;
- drag & drop : même comportement, sans fermer/réouvrir la fenêtre ;
- le manifeste en mémoire reste la même référence et `revision` continue d'être incrémentée ;
- aucune modification du contrat ExpeditionManifest.

Patch : `scripts/expedition-window.mjs` uniquement.
