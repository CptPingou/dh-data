# P2.9a.2 — Domain Card presentation FR

Patch repo-side volontairement conservateur.

Il travaille sur le `data/core/fr/dh-domain-cards.json` actuellement présent dans
le repo, et ne modifie que les champs de présentation suivants :

- `system.actions.*.name`
- `system.actions.*.description`
- `effects.*.name`
- `effects.*.description`
- `effects.*.system.changes.*.value` uniquement lorsqu'il s'agit d'un libellé humain

Les traductions sont à correspondance exacte. Si une chaîne anglaise inconnue est
rencontrée, le script s'arrête AVANT écriture et l'affiche : aucune traduction
automatique approximative n'est faite.

Les descriptions vides restent vides. IDs, coûts, usages, jets, dégâts, cibles,
formules, clés d'effets et structure mécanique sont préservés.

## Exécution

Depuis `C:\dev\dh-data` :

    node .\tools\p2.9a.2-localize-domain-card-presentation.mjs

Si le script signale des chaînes inconnues, envoyer la table : compléter la table
de traduction avant toute écriture.

S'il termine GREEN :

    node .\tools\build-source-index.mjs
    git diff --check
    git diff --stat

Puis déployer `data/core/fr/dh-domain-cards.json` et `data/source-index.json`,
F5 Foundry, et :

    const api = game.modules.get("daggerheart-campaign-toolkit").api;
    await api.syncAutonomousSources();
    await api.autonomousSourceStatus();

