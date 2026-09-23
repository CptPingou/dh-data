# P2.10c.2 — Source ↔ Destination

- sélection dynamique d'un `ExpeditionContainer`;
- entrées du conteneur sélectionné draggables;
- tous les conteneurs de la liste sont des destinations;
- transfert en mémoire dans le manifeste et incrément de `revision`;
- `slotId` remis à `null` à l'arrivée (placement/règles en P2.10c.3);
- aucun nombre de PJ/conteneurs codé en dur;
- aucun ledger encore (P2.10c.4);
- aucun Item Actor créé/supprimé.

Smoke test: ouvrir un manifeste contenant au moins deux conteneurs et une entrée, glisser l'entrée vers un autre conteneur, vérifier la réouverture sur la destination et `validate(manifest).green === true`.
