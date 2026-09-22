# P2.9c.3 — Template d’adversaire Monster Hunter

Le Tetsucabra devient le premier consommateur d’un contrat d’adversaire MH réutilisable.

Le template ne crée pas un second système de combat. Il décrit et valide la composition :
`adversaire Daggerheart → hunting tags → loot links → parties Colossus → Monster Parts → Hunting Effects`.

L’API `monsterHunterAdversary` permet :
- `definition(actor)` : lecture normalisée ;
- `validate(actor)` : validation du principal ;
- `status(actor)` : validation du principal et de toutes ses parties déclarées ;
- `import({ principalPath, partPaths })` : import générique d’un nouveau monstre depuis ses sources versionnées.

Aucune fracture, attribution de loot ou décision de combat n’est automatisée.

## Validation Tetsucabra

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
const tetsu = canvas.tokens.controlled[0].actor;
await api.monsterHunterAdversary.status(tetsu);
```

Cible : `green: true`, 3 parties vertes, 2 liens de loot.
