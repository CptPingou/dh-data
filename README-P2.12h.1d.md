# P2.12h.1d — Artisant: bouton carte + loadout gratuit

- ajoute l’accès `Atelier d’armes de chasse` directement sur la fiche de la carte Artisant embarquée sur un personnage ;
- conserve le raccourci de fiche personnage ;
- `Artisant` passe à `system.loadoutIgnore = true` ;
- ajoute un ActiveEffect transféré `system.bonuses.maxLoadout +1`, ce qui compense son propre emplacement et la rend gratuite vis-à-vis du loadout natif ;
- ne modifie pas la limite Toolkit de 2 cartes Chasse.

Après application, exécuter `node tools/build-source-index.mjs` avant le déploiement/sync.
