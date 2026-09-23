# P2.10f.1b — Jauge de capacité robuste

Le thème Foundry utilisé ne rendait pas correctement la barre CSS de capacité.

Correctif :
- remplacement de la barre CSS maison par l'élément HTML natif `<meter>`;
- jauge visible dans la liste des conteneurs et dans le détail;
- aucun changement de logique métier, capacité ou drag/drop.

Versions :
- Toolkit `0.5.57`
- Expedition Window `12`
