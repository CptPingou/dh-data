# Contrat de données — interface Web (P3.4)

Source : export Foundry réel `examples/P3.4b-transfer-test-drag-drop-r18.json`. **Le JSON complet est l'unité de transfert** : ne pas reconstruire un document incomplet depuis la vue UI.

| UI web | Chemin JSON | Identité stable |
|---|---|---|
| Sélecteur expédition | `expeditionId`, `revision`, `authority`, `phase` | `expeditionId` |
| Liste des PJ | `characters[]` | `characterId` |
| Sac du PJ | `characters[].backpack` | `containerId` |
| Ligne de stock | `*.contents[]` | `containerId` + `entryId` |
| Catalogue d'objets | `contents[].sourceId`, `foundryItemUuid`, `display` | `sourceId` (référence), `entryId` (ligne) |
| Quantité | `contents[].quantity` | Ne pas confondre quantité et capacité |
| Capacité | `capacity`, `storageProfile`, `materialStorage` | Profil du conteneur |
| Caravane | `caravan.structure` | `components[].id`, `cargoSlots[].id` |
| Coffres | `caravan.containers[]` | `containerId` relié à `components[].containerId` |
| Propriétés découvertes | `characters[].materialKnowledge.materials[materialId].discoveredProperties` | `materialId` + nom de propriété |
| Connaissances partagées | `research.partyMaterialKnowledge` | Portée `party` uniquement |
| Révélations | `research.revelations[]` | `id`; contributeurs via `characterId` |

## Sémantique d'échange

- `revision` est un verrou optimiste : l'import Foundry refuse une révision obsolète. **Ne jamais incrémenter à l'aveugle pour forcer un import**.
- `authority` est une indication du contrat, pas un verrou distribué effectif. L'ouverture/fermeture de session et le transfert d'autorité web/Foundry restent à implémenter.
- `transferPolicy.fobStock=reset-on-import` : les stocks FOB ne sont pas transférés et sont remis à zéro lors d'un import confirmé. Prévoir avertissement MJ explicite.
- Les recherches narratives en cours restent côté web (`narrativeTopics=web-only`). Ne pas les inventer dans l'export Foundry.
- Fiches de PJ, infusions, augmentations d'armes et inventaire au sol sont exclus du contrat actuel.
- Les connaissances globales Foundry non attribuées à l'expédition ne doivent pas être copiées dans `partyMaterialKnowledge`.
- Les identifiants `foundryActorUuid` sont propres au monde Foundry : garder le `characterId` portable comme clé métier.
- Pour le web multi-utilisateur : prévoir serveur, authentification, ACL par PJ, stockage transactionnel, sauvegardes, validation serveur, comparaison-and-swap et audit. Le kit ne les implémente pas.

## Flux cible (à développer)

1. **Fin de session Foundry** : export complet validé → dépôt web en révision N, après validation du transfert d'autorité.
2. **Entre sessions** : joueurs modifient le document web sous autorisation serveur, avec versionnement et historique.
3. **Début de session** : gel des éditions web → snapshot validé → dry-run/backup/confirmation MJ → import Foundry.
4. **Après import** : accusé de réception de la nouvelle révision, mise en lecture seule côté web tant que Foundry détient l'autorité.

Ne pas confondre ce flux cible avec le `stage` local fourni : celui-ci n'effectue aucun changement d'autorité.
