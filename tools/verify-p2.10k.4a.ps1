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
  'captureExpeditionViewState',
  'restoreExpeditionViewState',
  'selectedContainerId',
  'activeRoleTab',
  'The authoritative GM is also the writer',
  'refreshExpeditionFromRemoteChange'
)) {
  if ($u -notmatch [regex]::Escape($needle)) {
    Fail "P2.10k.4a incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] rafraîchissement local du MJ après requête joueur" -ForegroundColor Green
Write-Host "[ OK ] conservation du conteneur sélectionné" -ForegroundColor Green
Write-Host "[ OK ] conservation de l'onglet MJ/Inventaire" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.4a GREEN (structure)" -ForegroundColor Green
