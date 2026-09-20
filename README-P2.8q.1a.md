# P2.8q.1a — Opener trigger / lifecycle timing fix

Correction ciblée de P2.8q.1.

`effects.opener.timing` reste le déclencheur déclaratif de la carte
(ex. `opener-success-hope`). Après activation, un effet visant
`finisher-attack-roll` est mis en attente avec le timing runtime
`next-finisher-attack`.

Cela permet à `Ouverture précise` d'être trouvée, affichée et consommée par
le Finisher existant.

Le traitement `next-monster-reaction` de Diversion introduit par P2.8q.1 est
conservé.

Aucune donnée de compendium n'est modifiée par ce patch.
