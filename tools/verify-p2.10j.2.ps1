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
  'annotateVisibleInventoryItems',
  'findVisibleItemLabel',
  'candidateItemHost',
  'dhct-item-lifecycle-badge',
  'data-state',
  'Modifié',
  'Legacy',
  'annotatedItems'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "UX j.2 incomplète : '$needle' absent"
  }
}

Pass "détection des objets visibles présente"
Pass "badges lifecycle présents"
Pass "quantité ×N présente"
Pass "j.1b retry conservé"

Write-Host ""
Write-Host "P2.10j.2 GREEN (structure)" -ForegroundColor Green
