# P2.10c.4 — capacité / layout / rules

- `expeditionManifest.canTransfer(...)` effectue le préflight.
- Refus explicite si la destination est pleine.
- Si `layout.slots` existe, le premier slot libre est attribué automatiquement.
- Refus si le layout n'a plus de slot libre.
- Le panneau affiche les slots libres/occupés.
- Règles data-driven v1 : `deny-source` et `allow-source-prefix`.
- Un refus ne mute pas le manifeste, n'incrémente pas `revision` et ne déclenche pas l'autosave.
- Un transfert accepté conserve l'autosave World P2.10c.3.
