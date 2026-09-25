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
  'closeOpenInventoryMenus',
  'positionInventoryMenu',
  'document.body.append(menu)',
  'position: fixed',
  'z-index: 100000',
  'stopImmediatePropagation',
  'pointerdown'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3b incomplet : '$needle' absent"
  }
}

Pass "menu portal présent"
Pass "positionnement écran présent"
Pass "interception click/pointerdown présente"
Pass "fermeture globale centralisée présente"

Write-Host ""
Write-Host "P2.10j.3b GREEN (structure)" -ForegroundColor Green
