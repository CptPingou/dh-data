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
  'applyExpeditionDialogLayout',
  'dhct-expedition-layout',
  'width: min(96vw, 1200px)',
  'column-gap: 1.25rem',
  'row-gap: 1rem',
  'margin-top: .9rem',
  'padding-top: .75rem'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.4b incomplet : '$needle' absent"
  }
}

Pass "fenêtre élargie"
Pass "gouttières horizontales augmentées"
Pass "espacement vertical avant Fermer ajouté"

Write-Host ""
Write-Host "P2.10j.4b GREEN (structure)" -ForegroundColor Green
