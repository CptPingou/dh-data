# P2.6.3e1 — correction Vespoid features

Le test `buildActor()` a révélé :
- Tetsucabra : 3 embeddedItems
- Reine Vespoid : 0
- Vespoid Minion : 0

Cause : les deux JSON Vespoid précédents avaient `features_text` mais pas le tableau
normalisé `features`, alors que `buildActor()` matérialise les features embarquées depuis
ce tableau.

Corrections :
- ajout de `features` à la Reine (4 entrées)
- ajout de `features` au Vespoid Minion (3 entrées)
- ajout de l'attaque standard du Vespoid Minion : ATK -2, Piqûre, Melee, 2 phy

Après copie dans DH Data, relancer `export_foundry_full.py`, puis redémarrer Foundry
avant de refaire le test de mapping.
