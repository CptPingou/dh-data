# P2.9c.2 — Monster Parts génériques

Le Tetsucabra valide maintenant un contrat de partie réutilisable :
`partie → FT → état Broken → conséquence → lootRefs`.

Le Toolkit ne détecte ni n'automatise la fracture. Colossus affiche la partie et son état ; le MJ décide du passage à Broken. L'API sert à valider la déclaration et, si souhaité, à appliquer l'effet déjà défini au principal.

## Contrat

Chaque Actor de partie déclare dans `flags.daggerheart-campaign-toolkit.hunting` :
- `partSchemaVersion: 1`
- `partId`
- `parentSourceId`
- `fractureThreshold`
- `brokenEffect.id/name/rule/application`
- `lootRefs` (tableau, éventuellement vide)

## Test

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.monsterParts.status();

const part = canvas.tokens.controlled[0].actor;
await api.monsterParts.status(part);
```

Sur une partie Tetsucabra importée, cible : `green: true`.

Application manuelle assistée après avoir marqué la partie Broken dans Colossus :

```js
await api.monsterParts.applyBrokenEffect(part, principal);
```
