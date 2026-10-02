# Material / dh-loot convergence patch

Files:
- data/crafting/materials.json
- scripts/crafting-material-runtime.mjs
- data/homebrew/monster-hunter/dh-loot.json

Changes:
1. Adds verified Foundry icon paths to the four v2 pilot material definitions.
2. materialItemData() now uses the canonical material image.
3. Migrates the existing Croc/Cuir de Tetsucabra dh-loot rows to canonical material IDs and flags.
4. Preserves their existing _id values so existing Compendium UUID links remain stable.
5. Preserves the old source IDs as flags.daggerheart-campaign-toolkit.legacySourceId.

No changes are made to full-import.mjs or pilot-import.mjs.

After deploying/rebuilding dh-loot, verify:
- Croc sourceId = mh.tetsucabra.fang
- Cuir sourceId = mh.tetsucabra.hide
- flags.daggerheart-campaign-toolkit.material.materialId is present
- both icon URLs return HTTP 200
- station de recherche sees Croc in FOB
