# P3.4a.1 — Mapping et décisions

Checkpoint source : `7724d1e` (`pre-p3.4a.1`). Aucun fichier `scripts/` du Toolkit n'est modifié par ce lot.

## Sources effectivement examinées
- `test-drag-drop-P3.4-inventory.json` : manifeste `expedition-manifest@2`, révision 15, 4 personnages, 7 conteneurs.
- `00arti-P3.4-knowledge-2.json` : `materialKnowledge` v1 et `researchKnowledge` v3, 1 révélation pour 00arti.
- **Attention** : deux extractions indépendantes, pas un snapshot atomique. Les trois autres PJ n'ont PAS d'audit de connaissances. L'exemple est pédagogique, `metadata.exampleOnly=true`, impropre à l'import en production.

## Mapping
| Source Foundry | Transfert | Règle |
|---|---|---|
| manifest.expeditionId / revision / authority / phase | champs racine | reprise des valeurs |
| manifest.characters[] | characters[] | conserver `characterId`, `foundryActorUuid` (indice de résolution seulement) |
| manifest.containers[type=backpack] | characters[].backpack | associer via `holderRef.id`, pas l'ordre des conteneurs |
| `contents[].itemRef.sourceId` | `contents[].sourceId` | identifiant métier obligatoire, non UUID |
| `contents[].quantity` | `contents[].quantity` | **ne pas lire `itemRef.snapshot.system.quantity`** |
| `contents[].itemRef.uuid` | `foundryItemUuid` | aide au réimport, non identifiant canonique |
| `contents[].itemRef.name/img/type` | `display` | affichage seulement ; non source de vérité |
| manifest.caravan | caravan.structure | structure complète, composants, PV, layout, slots |
| caravan.components[].containerId | caravan.containers[] | **seule** liste autorisée de conteneurs cargo |
| manifest.containers[id=ground] | — | exclu (hypothèse à confirmer) |
| manifest.containers[id=fob] | — | exclu ; stock FOB à remettre à zéro à l'import |
| manifest.fob | — | installations FOB conservées localement dans Foundry |
| manifest.ledger | — | exclu (historique redondant) |
| materialKnowledge.actorKnowledge[actorUuid] | characters[].materialKnowledge | arbre propre à chaque PJ |
| materialKnowledge.partyKnowledge | research.partyMaterialKnowledge | partage séparé de l'individuel |
| researchKnowledge.revelations[] | research.revelations[] | IDs conservés, `discoveredBy`/`sharedWith` résolus vers `characterId` quand possible |
| researchKnowledge.revelations[].export | research.revelations[].export | préserve le contrôle de publication CampaignRepo |
| sujets narratifs en cours | — | exclusivement web ; hors contrat |
| fiches PJ, infusions, augmentations armes, files de craft, tours FOB | — | hors contrat |

## Visibilité et recherche
- Une connaissance **absente** est invisible par défaut. Ne pas sérialiser artificiellement une liste exhaustive de recherches `hidden`.
- Les propriétés matérielles effectivement découvertes sont dans `discoveredProperties`; `propertyStatuses` est conservé tel quel (observé vide dans l'audit).
- Une révélation narrative `discovered`/`shared` n'est **pas** un sujet narratif `visible` en cours. Ne pas fabriquer cet état dans Foundry.
- Une révélation dont `sharedWith` est vide ne doit pas être exposée à d'autres PJ au seul motif qu'elle existe dans le registre global.
- Les tags et unlocks suivent la révélation, et ne sont pas automatiquement accordés à tous les personnages.

## Transfert d'autorité (phase future P3.4d)
- Contrôle strict de `expeditionId`, `revision` et `authority` avant écriture ; pas de remplacement aveugle.
- Web fait autorité entre sessions, Foundry pendant la session. Les transitions sont des opérations explicites, atomiques et journalisées.
- `fobStock: reset-on-import` est **une instruction de politique**, pas une opération exécutée par ce lot. L'import futur devra demander confirmation au MJ avant de vider les stocks FOB, puis ne pas modifier les installations FOB.
- La résolution des items par `sourceId` nécessite le registre local et des erreurs explicites si introuvables ; aucun remplacement silencieux.

## Limites à résoudre avant un import réel
1. **Connaissances des 4 PJ** : exporter tous les `actorKnowledge` associés à l'expédition dans un snapshot cohérent.
2. **Statut `visible`** : l'audit ne montre pas de représentation persistée d'une recherche non découverte ; la visibilité devra être déduite du catalogue et des données réellement présentes, sans inventer un statut.
3. **Identifiants** : les `foundry-character-*` actuels sont dérivés d'Actor UUID ; prévoir une stratégie de remapping en cas de migration de monde.
4. **Conteneur `ground`** : exclusion proposée, à confirmer avec le MJ.
5. **Stacks** : seul `quantity=1` observé ; tests quantités >1 et fusion/scission requis.
6. **Schéma caravane** : `structure` conserve l'objet original ; vérifier la compatibilité version à l'import.
7. **Sécurité de publication** : l'API web doit filtrer les révélations par personnage côté serveur.
8. **Exemple** : n'utilise pas comme état de référence pour un vrai import.
