# P2.10a — Expedition Manifest v1

Contrat d'échange explicite entre le Web persistant et Foundry.

## Autorité

- `prepared` : le Web prépare l'expédition (`authority: web`).
- `in_session` : Foundry devient l'état de travail (`authority: foundry`).
- `returned` : Foundry exporte l'état final avant validation MJ.

Il n'y a pas de synchronisation bidirectionnelle temps réel.

## Conteneurs

`backpack` et `caravan` sont des objets de domaine configurables : capacité, agencement, règles et contenu. Les objets contenus sont référencés d'abord par `itemRef.sourceId`, stable entre Web et Foundry ; `foundryUuid` n'est qu'une résolution locale optionnelle.

## Journal

`ledger[]` décrit les changements de session (`consumed`, `acquired`, `transferred`, `lost`) afin que le retour d'expédition puisse être relu et validé avant de devenir le nouvel état persistant Web.

## API Foundry

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
const manifest = api.expeditionManifest.createEmpty({ expeditionId: "test-001" });
api.expeditionManifest.validate(manifest);
```

P2.10a ne crée aucune fenêtre Foundry et n'importe aucun inventaire. Il fixe uniquement le vocabulaire commun qui sera utilisé par P2.10b+.
