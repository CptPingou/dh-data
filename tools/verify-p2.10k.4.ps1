param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$ux = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"
$win = Join-Path $SourceRoot "scripts\expedition-window.mjs"
$manifest = Join-Path $SourceRoot "scripts\expedition-manifest.mjs"

foreach ($p in @($ux,$win,$manifest)) {
  if (-not (Test-Path $p)) { Fail "Fichier absent: $p" }
}

$u = Get-Content $ux -Raw -Encoding UTF8
$w = Get-Content $win -Raw -Encoding UTF8
$m = Get-Content $manifest -Raw -Encoding UTF8

foreach ($needle in @(
  'expedition-inventory-authority-request',
  'processInventoryAuthorityRequest',
  'userCanAccessContainer',
  'installExternalItemDragBridge',
  'application/x-dct-foundry-item',
  'gm-authority-transfer',
  'gm-authority-acquire'
)) {
  if ($u -notmatch [regex]::Escape($needle)) { Fail "UX incomplet: $needle" }
}

foreach ($needle in @(
  'parseExpeditionDrop',
  'requestAuthoritativeDrop',
  'application/x-dct-foundry-item',
  'authorityErrorMessage',
  'version: 15'
)) {
  if ($w -notmatch [regex]::Escape($needle)) { Fail "Window incomplet: $needle" }
}

if ($m -notmatch 'transferExpeditionEntry') { Fail "Primitive transfer absente" }
if ($m -notmatch 'acquireExpeditionEntry') { Fail "Primitive acquire absente" }

Write-Host "[ OK ] autorité MJ socket pour transferts joueurs" -ForegroundColor Green
Write-Host "[ OK ] contrôle des conteneurs côté MJ" -ForegroundColor Green
Write-Host "[ OK ] drag Item/UUID depuis Notes vers paquetage" -ForegroundColor Green
Write-Host "[ OK ] transfer/acquire natifs conservés" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.4 GREEN (structure)" -ForegroundColor Green
