# P2.10f.2 — Détail d'objet et actions contextuelles

Ajoute un vrai état de sélection dans les grilles d'expédition.

## Interaction
- clic sur une case occupée : sélection de l'objet ;
- panneau de détail : image, nom, type, quantité et référence source ;
- l'objet sélectionné reçoit un contour visuel ;
- clavier : Entrée/Espace sélectionnent aussi la case.

## Première action contextuelle
Pour un conteneur personnel lié à un Actor Foundry :
- **Rendre au personnage** appelle le pont déjà validé `expeditionItems.unloadToActor`;
- toute la pile sélectionnée est restituée ;
- le manifeste est sauvegardé après succès ;
- la création Item Actor et le ledger `transferred` restent gérés par le bridge existant.

Le drag/drop reste le geste principal. L'action contextuelle ne duplique aucune logique métier.

Versions :
- Toolkit `0.5.58`
- Expedition Window `13`
