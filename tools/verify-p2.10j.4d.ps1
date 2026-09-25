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
  'dialog.dataset.dhctBaseHeight',
  'baseHeight * 1.10',
  'window.innerHeight * 0.94',
  'dhct-expedition-layout__window-content',
  'dhct-expedition-layout__form',
  'margin-top: auto',
  '.dct-expedition-grid {',
  'grid-auto-rows: 128px',
  'row-gap: .85rem',
  '.dct-expedition-grid-slot {',
  'min-height: 128px',
  '.dct-expedition-item-name {'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.4d incomplet : '$needle' absent"
  }
}

if ($text -match 'height: min\(92vh, 990px\)') {
  Fail "ancienne hauteur fixe 92vh encore présente"
}

Pass "hauteur native +10% présente"
Pass "chaîne flex complète jusqu'au footer"
Pass "Fermer poussé en bas"
Pass "rangées de slots agrandies"
Pass "nom d'objet autorisé sur plusieurs lignes"

Write-Host ""
Write-Host "P2.10j.4d GREEN (structure)" -ForegroundColor Green
