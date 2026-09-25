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
  '.dct-expedition-browser > * {',
  '.dct-expedition-browser > *:nth-child(1)',
  '.dct-expedition-browser > *:nth-child(2)',
  '.dct-expedition-browser > *:nth-child(3)',
  '.dct-expedition-grid-slot.is-empty',
  '.dct-expedition-grid-slot.is-occupied',
  '.dct-expedition-grid-slot:hover'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.5a incomplet : '$needle' absent"
  }
}

Pass "cadres des trois colonnes présents"
Pass "fonds différenciés par colonne présents"
Pass "slot vide stylé"
Pass "slot occupé stylé"
Pass "hover des slots présent"

Write-Host ""
Write-Host "P2.10j.5a GREEN (structure)" -ForegroundColor Green
