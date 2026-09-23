# P2.10c.3 — Persistance World

- stockage des manifests dans un setting Foundry `world` non configurable ;
- API `save`, `load`, `list`, `remove` ;
- validation avant sauvegarde ;
- autosave après chaque drag & drop réussi ;
- l'état survit à F5, fermeture de Foundry et reprise de la partie dans le même World ;
- aucune dépendance à un Actor/Journal artificiel.

## Test
1. Créer le manifeste de test P2.10c.2.
2. `await api.expeditionManifest.save(manifest)`.
3. Ouvrir et transférer la ration : l'autosave doit suivre.
4. F5.
5. Recréer `api`, puis `const restored = await api.expeditionManifest.load("test-drag-drop")`.
6. Vérifier `restored.revision === 2` et la ration dans le sac 2.
