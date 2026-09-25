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
  'templateButton = null',
  'templateButton.className',
  'data-dhct-inventory-action',
  'returnButton.parentElement',
  'insertAdjacentElement("afterend", button)',
  'placement: "object-column-native-actions"',
  'loadFreshSelectedEntry'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3g incomplet : '$needle' absent"
  }
}

if ($text -match 'row.append\(actions\)') {
  Fail "ancien conteneur transversal encore présent"
}

Pass "boutons injectés dans le parent natif de Rendre au personnage"
Pass "classes du bouton natif recopiées"
Pass "aucun wrapper transversal"
Pass "actions sur manifest frais conservées"

Write-Host ""
Write-Host "P2.10j.3g GREEN (structure)" -ForegroundColor Green
