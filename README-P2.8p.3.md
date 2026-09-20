# P2.8p.3 — Source Index Builder

Ajoute `tools/build-source-index.mjs`.

Usage depuis la racine du repo :

    node .\tools\build-source-index.mjs

Le script utilise `data/source-index.json` comme manifeste de structure et :
- lit chaque fichier JSON déclaré ;
- exige un tableau JSON ;
- vérifie que chaque entrée possède un `_id` non vide ;
- refuse les `_id` dupliqués dans un même fichier ;
- recalcule `count` et le SHA-256 du fichier brut ;
- recalcule les totaux Core, Playtest, chaque namespace Homebrew, Homebrew et global ;
- n'écrit `data/source-index.json` qu'après validation complète.

Aucun `package.json` n'est requis.
