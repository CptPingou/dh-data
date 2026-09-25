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
  'height: min(92vh, 990px)',
  'max-height: 92vh',
  'display: flex',
  'flex-direction: column',
  'overflow: hidden',
  'overflow: auto',
  'margin-top: auto',
  'flex: 0 0 auto',
  'padding-top: 1rem'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.4c incomplet : '$needle' absent"
  }
}

Pass "fenêtre agrandie verticalement"
Pass "contenu central contraint et scrollable"
Pass "footer Fermer repoussé au bas de la fenêtre"
Pass "séparation verticale protégée"

Write-Host ""
Write-Host "P2.10j.4c GREEN (structure)" -ForegroundColor Green
