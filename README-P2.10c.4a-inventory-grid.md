# P2.10c.4a — Inventory Grid UI

- remplace la liste d'objets du conteneur par une grille type casier/Diablo-lite ;
- une `entry`/pile occupe une case, `quantity` s'affiche en badge (`×2`) ;
- `slotId` reste technique et n'est plus affiché dans le nom ;
- `layout.columns` contrôle le nombre de colonnes (défaut 4) ;
- les slots manquants sont générés visuellement jusqu'à `capacity.slots` ;
- drag & drop sur une case vide ;
- repositionnement d'un objet entre cases du même conteneur ;
- drag vers un autre conteneur via la liste latérale reste disponible ;
- capacité, rules et autosave World P2.10c.3 restent actifs.

Ce n'est volontairement pas encore un inventaire spatial multi-case : pas de largeur/hauteur/rotation des objets.
