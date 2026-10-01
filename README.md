# Artificer subclass link fix

But
---
Le lien `system.linkedClass` des sous-classes Artificier est déjà correctement résolu
vers l'UUID de la classe Artificier. Le problème restant est uniquement que
`mappingGaps` conserve deux marqueurs devenus obsolètes :
- `system.linkedClass`
- `system.features`

Ce patch retire ces deux gaps après résolution effective des liens.

Installation
------------
Depuis PowerShell, à la racine où tu as extrait ce dossier :

    powershell -ExecutionPolicy Bypass -File .\apply-artificer-link-fix.ps1 -RepoRoot C:\dev\dh-data

Puis vérifie :

    powershell -ExecutionPolicy Bypass -File .\verify-artificer-link-fix.ps1 -RepoRoot C:\dev\dh-data

Ensuite :
1. `git diff -- scripts/pilot-import.mjs`
2. déploie le repo vers le module Foundry avec ton robocopy habituel
3. F5 dans Foundry
4. relance :

    const p = await import(
      `/modules/daggerheart-campaign-toolkit/scripts/pilot-import.mjs?v=${Date.now()}`
    );
    await p.importArtificerArtillery();

Contrôle final
--------------
    const subPack = game.packs.get("daggerheart-campaign-toolkit.dh-subclasses");
    const subs = await subPack.getDocuments();

    for (const s of subs.filter(s =>
      /artific/i.test(JSON.stringify(s.toObject()))
    )) {
      console.log(
        s.name,
        s.system?.linkedClass,
        s.flags?.["daggerheart-campaign-toolkit"]?.mappingGaps
      );
    }

Attendu : Armurier et Forgeron de bataille avec un UUID `linkedClass` vers
`dh-classes` et `mappingGaps: []`.
