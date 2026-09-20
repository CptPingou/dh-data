# P2.9a.1a — Armor nativeTemplate migration fix

Correctif minimal pour Daggerheart 2.9.4.

`nativeTemplate("Item", "armor")` initialise désormais le conteneur legacy
`system.armor` requis par `DHArmor.migrateDocumentData()` lors de la construction
du specimen neutre. Les valeurs métier restent entièrement remplies ensuite par
`buildItem()`.

Test après déploiement/F5 :

```js
await game.modules.get("daggerheart-campaign-toolkit").api.importFullMapped()
```
