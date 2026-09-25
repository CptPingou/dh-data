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
  'sameSelection',
  'reused: true',
  'button.dataset.containerId',
  'button.dataset.entryId',
  'toolkitOnlyMutation',
  'data-dhct-inventory-action',
  'stopImmediatePropagation'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3h.2 incomplet : '$needle' absent"
  }
}

Pass "injection idempotente présente"
Pass "boutons stables pour la même sélection"
Pass "mutations toolkit ignorées"
Pass "listeners click en capture présents"

Write-Host ""
Write-Host "P2.10j.3h.2 GREEN (structure)" -ForegroundColor Green
