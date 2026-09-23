# P2.10c.2b — état de session conservé

Correctif : `normalize()` retournait un clone du manifeste. Le drag & drop modifiait donc la copie privée de la fenêtre et l'état était perdu à sa fermeture.

La fenêtre conserve désormais la référence du manifeste fourni par l'appelant et recopie la normalisation dans cet objet avant interaction.

Portée : fermeture/réouverture de la fenêtre avec le même manifeste JS. La persistance World/rechargement Foundry reste une étape distincte.
