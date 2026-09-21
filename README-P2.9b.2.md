# P2.9b.2 — Tetsucabra Foundry ciblé

- Import ciblé du Tetsucabra vers `dh-adversaries`.
- Aucun `importFullMapped()` et aucune reconstruction des packs Items autonomes.
- Fiche Actor construite depuis le template natif Foundryborne existant.
- Stats, attaque standard, expériences et trois features embarquées depuis DH-DATA.
- `system.notes` présente la section Hunting, la matrice Engagement et les liens UUID vers Cuir/Croc.
- `flags.daggerheart-campaign-toolkit.hunting` conserve la donnée Hunting canonique.

## Validation Foundry

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.importTetsucabra();
await api.tetsucabraStatus();
```

Cible : `green: true`, `count: 1`, `embeddedFeatures: 3`, 2 liens loot.
