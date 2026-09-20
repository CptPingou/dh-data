# P2.9a.2b — audit FR corrigé des Domain Cards

Cette étape remplace le détecteur trop agressif de P2.9a.2.

Elle ne modifie **aucune donnée source**. Elle exclut notamment :
- `Stress` / `Espoir` apparaissant dans une phrase française ;
- les références/formules comme `@system.resources.stress.value` ;
- les libellés français contenant un terme technique anglais conservé.

Elle produit :
`tmp/p2.9a.2b-domain-card-english.json`

Ce fichier contient les vraies chaînes anglaises candidates, avec :
- carte et `_id`;
- `canonicalSourceId`;
- chemin exact;
- texte complet non tronqué.

## Lancer

Depuis `C:\dev\dh-data` :

    node .\tools\p2.9a.2b-audit-domain-card-english.mjs

Puis envoyer `tmp\p2.9a.2b-domain-card-english.json`.

Ne pas lancer le builder : cette passe ne modifie pas `data/`.
