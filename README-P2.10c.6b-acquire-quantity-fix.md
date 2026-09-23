# P2.10c.6b — Acquire quantity consistency

Correctif ciblé de `acquire()`.

Le preflight de capacité/layout utilisait directement l'entrée candidate temporaire.
Cette entrée pouvait être normalisée/mutée pendant le contrôle, ce qui expliquait :
- ledger `acquired ×2` correct ;
- entrée retournée affichant `quantity: 1`.

Le preflight travaille désormais sur un clone et `candidate.quantity = qty` est
réaffirmé avant insertion.

Aucun changement au contrat, au ledger, à la persistance ou à l'UI.
