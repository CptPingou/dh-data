# P2.10c.4c — Initial Grid Render

Correctif de cycle de rendu DialogV2.

Symptôme corrigé :
- les compteurs étaient corrects dès l'ouverture ;
- la grille n'apparaissait qu'après une première interaction.

Le patch force une reconstruction locale de la liste et du panneau sélectionné
juste après le montage de DialogV2, puis rebinde les interactions.

Aucun changement :
- au manifeste ;
- à la capacité ;
- au drag & drop ;
- à la persistance World ;
- aux assets graphiques.
