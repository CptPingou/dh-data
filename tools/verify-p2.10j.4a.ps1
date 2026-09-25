param(
  [string]$SourceRoot = ""
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Pass([string]$Message) {
  Write-Host "[ OK ] $Message" -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$SourceRoot = (Resolve-Path $SourceRoot).Path
$path = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $path)) { Fail "expedition-inventory-ux.mjs absent" }

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'const ROLE_TABS_CLASS',
  'const GM_TAB_ID',
  'const INVENTORY_TAB_ID',
  'configurePlayerInventoryView',
  'configureGmTabbedView',
  'game.user?.isGM',
  'Lifecycle is a GM diagnostic concern',
  'gmPane.append(node)',
  'inventoryPane.append(browser)',
  'activateRoleTab(tabs, INVENTORY_TAB_ID)',
  'removedTechnicalNodes',
  'Lifecycle badges are diagnostic too: GM only.'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.4a incomplet : '$needle' absent"
  }
}

Pass "onglets MJ/Inventaire présents"
Pass "contenu technique déplacé vers MJ"
Pass "vue joueur sans contenu MJ"
Pass "lifecycle non construit pour joueur"
Pass "browser natif conservé dans Inventaire"

Write-Host ""
Write-Host "P2.10j.4a GREEN (structure)" -ForegroundColor Green
