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
  'available > 1 && (requestedQuantity == null || Number(requestedQuantity) >= available)',
  'Retour au personnage —',
  'requestedQuantity = Math.min(available, parsedQuantity)',
  'invalid-quantity'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.2d incomplet : '$needle' absent"
  }
}

Pass "prompt sur quantité absente présent"
Pass "prompt sur quantité totale explicite présent"
Pass "appel partiel explicite préservé"

Write-Host ""
Write-Host "P2.10h.2d GREEN (structure)" -ForegroundColor Green
