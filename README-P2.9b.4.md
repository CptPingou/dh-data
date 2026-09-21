# P2.9b.4 — Hunting Effects

Objectif : conserver une conséquence de fracture visible sur le monstre principal sans automatiser le combat.

## États ajoutés

- `mh-broken-fangs` — **Crocs brisés**
  - Mâchoire de pierre ne repousse plus la cible.
  - Le Croc de Tetsucabra est disponible au dépeçage.
- `mh-injured-forelegs` — **Pattes avant blessées**
  - Charge tectonique ne provoque plus son déplacement forcé.
  - La réaction conserve son attaque de base.
- `mh-injured-hindlegs` — **Pattes arrière blessées**
  - Percée souterraine fonctionne encore, mais sans repositionnement immédiat au contact.

## Philosophie

Colossus reste la source de vérité pour Healthy/Broken/Destroyed. Quand le MJ passe une partie à Broken, il applique l'état Hunting correspondant au Tetsucabra principal. Le Toolkit n'écoute pas Colossus et ne surveille pas les dégâts.

## API

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.huntingEffects.status();
```

Sur un Tetsucabra placé dans le monde :

```js
const tetsu = canvas.tokens.controlled[0]?.actor;
await api.huntingEffects.set(tetsu, "mh-broken-fangs", true);
await api.huntingEffects.set(tetsu, "mh-broken-fangs", false);
```

Ou bascule manuelle :

```js
await api.huntingEffects.toggle(tetsu, "mh-broken-fangs");
```

Les trois états sont aussi enregistrés dans `CONFIG.statusEffects`, donc ils doivent être disponibles comme états Foundry et rester visibles sur le token/Actor.

## Réimport Tetsucabra

Après déploiement :

```js
await api.importTetsucabra();
await api.tetsucabraStatus();
```

Les Notes de la fiche principale affichent maintenant pour chaque partie Colossus : FT, état Broken à appliquer et conséquence. Les Actors de partie portent également la règle dans leurs Notes.
