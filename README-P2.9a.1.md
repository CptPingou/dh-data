# P2.9a.1 — Domain Card action labels FR

Patch limité aux libellés `system.actions.*.name` du corpus core FR.

- Cartes conservées : 210
- Actions inspectées : 284
- Libellés modifiés : 282
- Libellés anglais résiduels détectés par l’audit ciblé : 17
- IDs / coûts / formules / effets / automatisations : inchangés
- Encodage : UTF-8 sans BOM

Cette sous-passe corrige les boutons/actions visibles sans toucher aux descriptions longues ni aux Active Effects. La passe P2.9a.2 pourra traduire ces textes sans mélanger présentation et mécanique.

Après copie dans `C:\dev\dh-data`, reconstruire le source-index, déployer le JSON + source-index dans le module Foundry, puis lancer la synchro autonome du World.
