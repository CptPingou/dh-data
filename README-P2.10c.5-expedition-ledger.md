# P2.10c.5 — Ledger d'expédition

Le ledger décrit les changements de session ; il ne remplace jamais l'état courant des conteneurs.

Kinds v1 :
- `transferred`
- `acquired`
- `consumed`
- `lost`

## Automatique
Un transfert entre deux conteneurs ajoute un événement `transferred`.
Un déplacement entre deux cases du même conteneur n'ajoute aucun événement.

## API
```js
api.expeditionManifest.appendLedger(manifest, {
  kind: "acquired",
  itemRef: { sourceId: "mh.tetsucabra.fang", name: "Croc de Tetsucabra" },
  quantity: 1,
  toContainerId: "sac-pj-1"
});

api.expeditionManifest.ledgerSummary(manifest);
await api.expeditionManifest.save(manifest);
```

Les opérations `acquired`, `consumed` et `lost` sont volontairement explicites à ce stade :
le ledger n'automatise pas encore l'ajout/retrait d'objets. Cela évite de mélanger historique
et mutation d'inventaire avant la future couche Foundry Items/Web.
