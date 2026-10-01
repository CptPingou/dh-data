# P2.12g.3 — Station de recherche Foundry

Ajoute une UI Foundry accessible depuis le conteneur FOB de la fenêtre d'expédition.

- liste des matériaux réellement présents à la FOB ;
- propriétés collectives, personnelles et inconnues distinguées ;
- les propriétés inconnues sont affichées comme « Propriété inconnue N » ;
- recherche et documentation passent par un pont d'autorité vers le MJ actif ;
- le demandeur doit être OWNER du personnage chercheur ;
- la logique métier reste dans `api.crafting.researchMaterialProperty()` et `api.crafting.documentMaterialProperty()`.

Tests :

```powershell
node tools/test-p2.12g.1.mjs
node tools/test-p2.12g.2.mjs
node tools/test-p2.12g.3.mjs
```
