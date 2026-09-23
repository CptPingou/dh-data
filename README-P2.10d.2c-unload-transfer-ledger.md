# P2.10d.2c

`unloadToActor()` retire désormais l'entrée sans `lost`, puis journalise un `transferred` du sac vers `actor:<uuid>`. `lost` reste réservé aux pertes réelles.
