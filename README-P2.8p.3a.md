# P2.8p.3a — Source Index Builder BOM tolerance

Correctif minimal de `tools/build-source-index.mjs`.

Le builder accepte désormais les fichiers JSON UTF-8 commençant par un BOM
(U+FEFF), notamment ceux réécrits par Windows PowerShell 5.1.

Le BOM est retiré uniquement du texte transmis à `JSON.parse()`.
Le SHA-256 continue d'être calculé sur les octets réels du fichier, afin que
l'index décrive exactement le fichier chargé.

Usage :

    node .\tools\build-source-index.mjs

Aucune donnée de jeu ni aucun manifeste n'est inclus dans ce patch.
