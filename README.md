# Patch Domain Assets — Daggerheart Campaign Toolkit

But exact du patch :

- `assets/icons/<domain>.svg` = **icône de domaine de l'en-tête personnage**, à droite de HOPE.
- `assets/icons/domain-card/<domain>.png` = **image des cartes de domaine + icônes d'actions**.

## Contenu

- `scripts/pilot-import.mjs` : version corrigée à copier dans le repo.
- `apply-supporting-fixes.ps1` : corrige uniquement les anciennes déclarations de registre connues dans `hunting-domain-card-bridge.mjs` et `main.mjs`, avec backup automatique.
- `verify-domain-assets.ps1` : vérifie assets, chemins et syntaxe JS.

## Installation depuis `C:\dev\dh-data`

1. Sauvegarder/committer le repo.
2. Copier `scripts\pilot-import.mjs` du ZIP vers `C:\dev\dh-data\scripts\pilot-import.mjs`.
3. Exécuter :

```powershell
powershell -ExecutionPolicy Bypass -File .\apply-supporting-fixes.ps1 -RepoRoot C:\dev\dh-data
powershell -ExecutionPolicy Bypass -File .\verify-domain-assets.ps1 -RepoRoot C:\dev\dh-data
```

4. Si `DOMAIN ASSETS PATCH GREEN`, faire le robocopy habituel vers Foundry puis F5.

## Résultat attendu

```text
CONFIG.DH.DOMAIN.domains.artillery.src
→ modules/daggerheart-campaign-toolkit/assets/icons/artillery.svg

Artillery domainCard.img
→ modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png

Artillery action.img (valeur par défaut domaine)
→ modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png
```

Les domaines natifs conservent leur `raw.img` canonique pour les cartes ; ils ne sont plus transformés en `assets/icons/domains/<slug>.png` Toolkit.
