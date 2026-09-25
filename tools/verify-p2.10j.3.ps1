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
  'buildInventoryItemActions',
  'handleInventoryItemAction',
  'chooseActionQuantity',
  'confirmInventoryAction',
  'commitInventoryAction',
  'reopenExpeditionDialog',
  'Consommer',
  'Marquer modifié',
  'Supprimer',
  'archiveTerminal',
  'dhct-item-actions__menu'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "UX j.3 incomplète : '$needle' absent"
  }
}

Pass "menu contextuel présent"
Pass "consommation avec quantité présente"
Pass "marquage modified présent"
Pass "suppression + archivage présent"
Pass "rafraîchissement du dialogue présent"

Write-Host ""
Write-Host "P2.10j.3 GREEN (structure)" -ForegroundColor Green
