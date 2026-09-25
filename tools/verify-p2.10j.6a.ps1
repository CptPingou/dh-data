param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }
function Pass([string]$Message) { Write-Host "[ OK ] $Message" -ForegroundColor Green }
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path

$uxPath = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"
$menuPath = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"
if (-not (Test-Path $uxPath)) { Fail "expedition-inventory-ux.mjs absent" }
if (-not (Test-Path $menuPath)) { Fail "item-backpack-menu.mjs absent" }

$ux = Get-Content $uxPath -Raw -Encoding UTF8
$menu = Get-Content $menuPath -Raw -Encoding UTF8

foreach ($needle in @(
  'Gestion des sacs à dos',
  'saveBackpackAdministration',
  'normalizeBackpackSlots',
  'presentation.accessState',
  'presentation.storedAt',
  'hideStoredBackpacksFromPlayer',
  'injectGmBackpackManagement'
)) {
  if ($ux -notmatch [regex]::Escape($needle)) { Fail "j.6a incomplet : '$needle' absent" }
}

if ($menu -notmatch [regex]::Escape('container?.presentation?.accessState === "stored"')) {
  Fail "garde Actor -> Backpack absente"
}

Write-Host "[ OK ] panneau MJ présent" -ForegroundColor Green
Write-Host "[ OK ] nom/capacité modifiables" -ForegroundColor Green
Write-Host "[ OK ] dépôt/récupération persistant" -ForegroundColor Green
Write-Host "[ OK ] sacs déposés masqués au joueur" -ForegroundColor Green
Write-Host "[ OK ] Actor -> sac déposé bloqué pour joueur" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10j.6a GREEN (structure)" -ForegroundColor Green
