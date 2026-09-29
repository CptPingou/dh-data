param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path
$runtime = Join-Path $SourceRoot 'scripts\artificer-infusion-runtime.mjs'
$main = Join-Path $SourceRoot 'scripts\main.mjs'
if (-not (Test-Path $main)) { $main = Join-Path $SourceRoot 'main.mjs' }
if (-not (Test-Path $runtime) -or -not (Test-Path $main)) { throw 'Fichiers runtime/main absents' }
$r = Get-Content $runtime -Raw -Encoding UTF8
$m = Get-Content $main -Raw -Encoding UTF8
foreach ($part in @('registerWorldInfusionsSetting', 'scope: "world"', 'addWorld(', 'migrateLegacyInfusions', 'resolveCriticalDamage', 'targetActorUuid', 'creatorKey')) {
  if (-not $r.Contains($part)) { throw "Contrat manquant : $part" }
}
if (-not $m.Contains('registerWorldInfusionsSetting();')) { throw 'Enregistrement init manquant dans main.mjs' }
Write-Host '[ OK ] registre mondial declare a init' -ForegroundColor Green
Write-Host '[ OK ] creation sans Actor Artificier et migration explicite' -ForegroundColor Green
Write-Host '[ OK ] incidents sur Actor porteur, registre world' -ForegroundColor Green
Write-Host 'P2.11d.3d GREEN (source)' -ForegroundColor Green
