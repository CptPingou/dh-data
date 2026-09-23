# P2.10d.2 — Actor ↔ conteneur personnel

- `actorStatus()` résout le `holderRef`.
- `loadFromActor()` ajoute au manifeste une référence vers un Item possédé par l’Actor.
- `unloadToActor()` crée un embedded Item sur l’Actor puis retire la quantité du manifeste.

Sécurité : `loadFromActor()` ne supprime pas encore l’Item de l’Actor. On valide d’abord le pont sans opération destructive.
