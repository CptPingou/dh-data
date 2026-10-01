# P2.12g.1 — Recherche de propriété matérielle à la FOB

Ajoute `api.crafting.researchMaterialProperty(...)`.

Contrat v1 :
- mutation GM-authoritative ;
- charge le manifest d'expédition ;
- recherche limitée à la FOB (`containerId: "fob"` ou rôle `fob`) ;
- vérifie le matériau et la propriété dans le catalogue ;
- exige un spécimen actif à la FOB lorsque le matériau l'exige ;
- le spécimen n'est ni déplacé ni consommé ;
- persiste la découverte personnelle via `craftingKnowledge.discover()` ;
- aucun changement de schéma du manifest.

Smoke Node :
`node tools/test-p2.12g.1.mjs`

Smoke Foundry (GM) :
```js
const api = game.modules.get("daggerheart-campaign-toolkit").api;
const actor = game.actors.get("gbn20XQraiubIAFG");
await api.crafting.researchMaterialProperty({
  actor,
  materialId: "mh.tetsucabra.fang",
  propertyId: "rigid",
  expeditionId: "mh-home-test",
});
```
Attendu : `green:true`, `containerId:"fob"`, `specimenConsumed:false` si un Croc est présent à la FOB.
