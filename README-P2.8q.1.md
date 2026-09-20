# P2.8q.1 — Hunt effect runtime completion

Patch minimal sur le runtime Engagement actuel.

## Ouverture précise
`effects.opener` est maintenant interprété après résolution de l'Opener.
Un effet dont le timing correspond au résultat (`opener-success-hope`, etc.)
est placé dans `pendingEffects`. Le bonus `next-finisher-attack` existant est
ensuite affiché et consommé par le Finisher.

## Diversion
Lorsqu'une réaction du monstre est requise, les effets en attente avec
`timing: "next-monster-reaction"` sont affichés dans le message de réaction,
puis marqués `consumed`. L'attaque du monstre reste entièrement manuelle.

## Couverture
Ajout de `engagementState.consumeEffect(instanceId)` pour permettre au MJ de
consommer explicitement une occurrence différée (par exemple
`monster-attack-against-finisher`) au moment où l'attaque appropriée est
résolue. Aucune attaque ni aucun modificateur de jet n'est automatisé.

## Hors périmètre
Le budget « 1 Action MH/PJ/combat » reste séparé : ce patch ne modifie pas
encore la remise à zéro de `participants` à l'ouverture d'un Engagement.
