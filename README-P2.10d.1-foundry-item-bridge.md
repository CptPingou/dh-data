# P2.10d.1 — Pont Expedition ↔ Foundry Item

Le manifeste ne copie pas la fiche Foundry. Une entrée garde seulement une référence stable et un petit snapshot d'affichage :

```js
itemRef: {
  kind: "foundry-item",
  uuid: "Compendium....Item....",
  sourceId: "...",
  name: "Ration",
  type: "consumable",
  img: "..."
}
```

API publique :

```js
api.expeditionItems.ref(item)
await api.expeditionItems.resolve(itemRef)
await api.expeditionItems.status(itemRef)
api.expeditionItems.acquire(manifest, { containerId, item, quantity })
await api.expeditionItems.resolveEntry(entry)
```

`expeditionItems.acquire()` réutilise l'opération atomique `expeditionManifest.acquire()` :
capacité, slot, révision et ledger restent donc dans une seule logique de domaine.

Aucune création/suppression d'Item Foundry n'est faite à cette étape.
Le document Foundry reste la source de vérité mécanique ; le manifeste transporte sa référence.
