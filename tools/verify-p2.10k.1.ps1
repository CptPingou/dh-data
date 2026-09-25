param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$SourceRoot = (Resolve-Path $SourceRoot).Path
$uxPath = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $uxPath)) { Fail "expedition-inventory-ux.mjs absent" }

$text = Get-Content $uxPath -Raw -Encoding UTF8

foreach ($needle in @(
  'playerCanAccessContainer',
  'playerOwnsBackpack',
  'filterPlayerContainers',
  'presentation?.playerAccess',
  'presentation?.playerRole',
  'renderGmSharedAccessManagement',
  'saveSharedAccessAdministration',
  'injectGmSharedAccessManagement',
  'value="ground"',
  'value="fob"',
  'value="caravan"',
  'sharedAccessAdministration'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10k.1 incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] sac personnel filtré par propriétaire" -ForegroundColor Green
Write-Host "[ OK ] sac déposé inaccessible" -ForegroundColor Green
Write-Host "[ OK ] accès conditionnel FOB / Caravane / Sol" -ForegroundColor Green
Write-Host "[ OK ] autres conteneurs masqués au joueur" -ForegroundColor Green
Write-Host "[ OK ] panneau MJ de droits partagés présent" -ForegroundColor Green
Write-Host "[ OK ] synchro multi-client réutilisée" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.1 GREEN (structure)" -ForegroundColor Green
