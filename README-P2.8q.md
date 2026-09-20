# P2.8q — First Hunt Card Wave

Patch-only. Basé sur le corpus Monster Hunter fourni (11 cartes).

Ajoute 6 cartes mécaniques sans modifier les 11 existantes :
- Opener : Ouverture précise, Provocation
- Finisher : Frappe mutilante, Frappe d’épuisement
- Support : Couverture, Diversion

Nouveau total Monster Hunter : 17 cartes.
Nouveau total mécanique : 12 cartes (6 existantes + 6 nouvelles).

Les effets sont déclaratifs et `automation: manual`. Les timings que le runtime ne consomme pas encore
automatiquement restent des contrats de carte : ce patch n’ajoute aucune automatisation implicite.

Après installation, mettre à jour `data/source-index.json` :
- homebrew.total : 8 -> 14 si votre index installé est encore à 811/8, ou recalculer depuis l’état courant.
- monster-hunter.total : doit correspondre à 17
- dh-domain-cards.count : doit correspondre à 17
- total global : ancien total + 6
- sha256 du fichier : recalculer avec votre pipeline habituel.

Puis lancer :
```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
await api.syncAutonomousSources({ force: true });
await api.autonomousSourceStatus();
api.monsterHunterHuntCard.corpusStatus();
```

IMPORTANT : le `source-index.json` n’est volontairement pas inclus, car le fichier fourni précédemment
était à 811/8 alors que le corpus courant fourni ici contient déjà 11 cartes. Il ne faut pas écraser
un index plus récent avec un index périmé.
