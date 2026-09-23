# P2.10b — Fenêtre Foundry « Préparer l’expédition »

Première matérialisation Foundry du contrat `Expedition Manifest v1`.

## But

Rendre explicite le passage de témoin entre le Web (persistance hors session) et Foundry (état de session), et présenter les deux objets de domaine validés : sacs à dos et caravane.

## API

```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
const manifest = api.expeditionManifest.createEmpty({ expeditionId: "test-expedition-001" });
await api.expeditionManifest.open(manifest);
```

Pour tester avec des conteneurs, charger/coller l'exemple `examples/expedition-manifest.example.json` dans un objet JS puis appeler `open(manifest)`.

## Portée

- fenêtre Foundry native `DialogV2` ;
- bandeau Web ↔ Foundry et autorité courante ;
- phase/révision/validité du contrat ;
- colonnes Sacs à dos / Caravane ;
- capacité, propriétaire, règles et contenu de chaque conteneur ;
- lecture seule à ce stade.

Les transferts, l'équipement et le ledger restent hors P2.10b : ils seront ajoutés après validation de cette surface UI afin de ne pas coupler la mutation d'inventaire à une fenêtre encore non validée.
