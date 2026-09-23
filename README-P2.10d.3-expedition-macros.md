# P2.10d.3 — Macros d'expédition

Ajoute deux façades hotbar au compendium existant `toolkit-macros` :

- **Expédition — Ouvrir** : ouvre l'unique manifeste disponible, ou l'unique manifeste `in_session` lorsqu'il y en a plusieurs.
- **Expédition — Paquetage** : utilise le token contrôlé (ou le personnage assigné à l'utilisateur), résout son `foundryActorUuid` et ouvre directement son conteneur personnel.

Aucune logique métier d'inventaire n'est dupliquée dans les macros : elles appellent `api.expeditionCommands`.

Les macros sont créées automatiquement au `ready` pour le MJ si elles sont absentes. Le pack `toolkit-macros` existe déjà : aucun changement de `module.json` ni rebuild des données.
