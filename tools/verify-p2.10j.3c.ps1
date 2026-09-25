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
  'document.createElement("div")',
  'setAttribute("role", "button")',
  '"pointerup"',
  '"keydown"',
  'touch-action: manipulation',
  'stopImmediatePropagation'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3c incomplet : '$needle' absent"
  }
}

if ($text -match 'pointerdown", \(event\) => \{\s*event\.preventDefault') {
  Fail "preventDefault pointerdown encore présent"
}

Pass "trigger non-button présent"
Pass "ouverture sur pointerup présente"
Pass "fallback clavier présent"
Pass "preventDefault pointerdown supprimé"

Write-Host ""
Write-Host "P2.10j.3c GREEN (structure)" -ForegroundColor Green
