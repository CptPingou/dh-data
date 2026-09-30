# P2.12f — Craft biologique transactionnel

Pilote `motherboard.force` : la recette biologique est planifiée à partir du stock consolidé d'un conteneur d'expédition (par défaut `caravan`), mais seules les propriétés effectivement connues de l'artisan sont utilisables.

Le craft valide toute l'allocation avant mutation, consomme les unités dans le manifeste avec des événements `consumed`, sauvegarde le stock, puis appelle le runtime Motherboard. Si la fabrication Motherboard échoue, le manifeste original est restauré.

Cette tranche expose `api.crafting.planWeaponAugment()` et `api.crafting.craftWeaponAugment()`. Elle ne remplace pas encore le bouton Fabriquer de l'atelier : le branchement joueur/socket sera la tranche suivante, afin de ne pas mélanger transaction de stock et autorité cross-player.
