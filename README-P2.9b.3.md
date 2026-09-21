# P2.9b.3 — Tetsucabra multipart / Colossus

Périmètre minimal : Foundry gère le combat, Colossus affiche les parties, le MJ arbitre la fracture et le loot.

## Modèle

- Principal : `Tetsucabra`.
- Parties Colossus :
  - `Tetsucabra — Tête / Crocs` — FT 8 ;
  - `Tetsucabra — Pattes avant` — FT 8 ;
  - `Tetsucabra — Pattes arrière` — FT 8.
- Chaque partie est un Actor `adversary` indépendant afin d'être accepté nativement par Colossus.
- Les Actors de partie ont 1 HP uniquement comme support d'affichage Colossus. La fracture est arbitrée sur **un même impact** atteignant FT 8 puis marquée `Broken` manuellement ; ce n'est pas une jauge cumulative de dégâts.
- Le Stress reste sur le principal. Les parties ont 0 Stress.
- Le loot reste dans les notes Hunting du principal. Seuls les Crocs sont reliés au `Croc de Tetsucabra`; le Cuir reste un loot de carcasse et ne devient pas une partie Colossus.
- Aucun couplage à l'API interne de Colossus : le module Colossus documente un assemblage par glisser-déposer, donc le Toolkit fournit simplement les quatre Actors prêts à assembler.

## Import / contrôle

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.importTetsucabra();
await api.tetsucabraStatus();
```

Cible : `green: true`, `count: 4`, trois parties présentes avec `fractureThreshold: 8`.

Dans Colossus : créer un Colossus, glisser `Tetsucabra` dans Principal puis les trois Actors `Tetsucabra — ...` dans Parts.
