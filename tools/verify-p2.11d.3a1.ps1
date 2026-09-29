param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$p = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
if (-not (Test-Path $p)) { throw "Runtime Cob introuvable" }
$s = Get-Content $p -Raw -Encoding UTF8
foreach ($needle in @(
  'async function simpleResourceSpecimen(actor)',
  'const featurePack = game.packs.get(`${MODULE_ID}.dh-features`);',
  'const featureDocs = await featurePack.getDocuments();',
  'const resourceSpecimen = await simpleResourceSpecimen(actor);',
  'await simpleResourceSpecimen(actor),',
  'type: "simple",',
  'recovery: null,'
)) { if (-not $s.Contains($needle)) { throw "Absent: $needle" } }
if ($s.Contains('Ajoutez/ouvrez un personnage possédant')) { throw 'Ancienne dépendance Seaborne encore présente' }
Write-Host '[ OK ] Cob: recherche dans le compendium dh-features' -ForegroundColor Green
Write-Host '[ OK ] Cob: seed simple sans dépendance à un personnage existant' -ForegroundColor Green
Write-Host 'P2.11d.3a1 GREEN (source)' -ForegroundColor Green
