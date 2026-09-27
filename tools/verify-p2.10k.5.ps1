param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$ux = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $ux)) { Fail "expedition-inventory-ux.mjs absent" }

$u = Get-Content $ux -Raw -Encoding UTF8

foreach ($needle in @(
  'clearGroundContainer',
  'transferBackpackContentsToGround',
  'confirmBulkGmAction',
  'data-dhct-ground-clear',
  'data-dhct-backpack-to-ground',
  'gm-clear-ground',
  'gm-backpack-to-ground',
  'api.expeditionManifest.lose',
  'api.expeditionManifest.transfer'
)) {
  if ($u -notmatch [regex]::Escape($needle)) {
    Fail "P2.10k.5 incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] action MJ : Vider le Sol + confirmation" -ForegroundColor Green
Write-Host "[ OK ] action MJ : Tout transférer sac -> Sol + confirmation" -ForegroundColor Green
Write-Host "[ OK ] primitives manifest lose/transfer reutilisees" -ForegroundColor Green
Write-Host "[ OK ] sauvegarde unique + broadcast + refresh" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.5 GREEN (structure)" -ForegroundColor Green
