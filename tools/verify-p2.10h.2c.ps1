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
$path = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\expedition-foundry-items.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'Retour au personnage —',
  'Disponible dans le sac à dos',
  'requestedQuantity == null && available > 1',
  'requestedQuantity = Math.min(available, parsedQuantity)',
  'invalid-quantity',
  'const qty ='
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.2c incomplet : '$needle' absent"
  }
}

if ($text -match 'partialBackpackUnloadPatched') {
  Fail "ancien wrapper runtime détecté"
}

Pass "dialogue quantité présent"
Pass "0 / négatif refusé"
Pass "quantité bornée au stock"
Pass "aucun wrapper runtime"

Write-Host ""
Write-Host "P2.10h.2c GREEN (structure)" -ForegroundColor Green
