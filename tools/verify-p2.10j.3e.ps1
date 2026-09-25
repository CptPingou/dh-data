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
  'selectedInventoryEntry',
  'injectRightPanelInventoryActions',
  'findRightPanelReturnControl',
  'Gestion du paquetage',
  'Consommer',
  'Marquer modifié',
  'Supprimer',
  'dhct-right-item-actions',
  'dataset.dhctContainerId',
  'dataset.dhctEntryId'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3e incomplet : '$needle' absent"
  }
}

if ($text -match 'popovertarget') {
  Fail "ancien menu popover encore présent"
}

Pass "sélection de l’entrée depuis la carte présente"
Pass "containerId / entryId mémorisés via dataset"
Pass "injection sous Rendre au personnage présente"
Pass "actions métier conservées"
Pass "ancien menu ⋮ supprimé"

Write-Host ""
Write-Host "P2.10j.3e GREEN (structure)" -ForegroundColor Green
