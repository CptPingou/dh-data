# P2.10c.6 — Opérations atomiques d'inventaire

Ajoute trois opérations de domaine :
- `acquire()` : ajoute réellement l'entrée au conteneur puis journalise `acquired`;
- `consume()` : décrémente/supprime réellement l'entrée puis journalise `consumed`;
- `lose()` : décrémente/supprime réellement l'entrée puis journalise `lost`.

`transfer()` continue de journaliser `transferred`.

Principes :
- une opération refusée ne modifie ni inventaire, ni révision, ni ledger ;
- `acquire()` respecte capacité/layout/règles via le même preflight que les transferts ;
- `consume()` et `lose()` acceptent une quantité partielle d'une pile ;
- si toute la pile est retirée, l'entrée disparaît et le slot redevient libre ;
- la sauvegarde World reste explicite pour ces appels API (`await save(manifest)`).
- aucun lien aux vrais Items Foundry n'est encore ajouté.

## Test
```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
const m = await api.expeditionManifest.load("test-drag-drop");

api.expeditionManifest.acquire(m, {
  containerId: "sac-pj-1",
  itemRef: { sourceId: "test-herbe", name: "Herbe" },
  quantity: 2
});

const herbe = m.containers.find(c => c.containerId === "sac-pj-1").contents.find(e => e.itemRef?.sourceId === "test-herbe");

api.expeditionManifest.consume(m, {
  containerId: "sac-pj-1",
  entryId: herbe.entryId,
  quantity: 1
});

api.expeditionManifest.lose(m, {
  containerId: "sac-pj-1",
  entryId: herbe.entryId,
  quantity: 1
});

await api.expeditionManifest.save(m);
console.table(m.ledger);
```
