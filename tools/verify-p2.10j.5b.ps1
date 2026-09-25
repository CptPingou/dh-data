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
  'if (game.user?.isGM)',
  'action: "modify"',
  'applyPlayerObjectDetailVisibility',
  'dataset.dhctTechnicalRef',
  'node.hidden = !game.user?.isGM',
  'data-dhct-technical-ref'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.5b incomplet : '$needle' absent"
  }
}

Pass "Modifier réservé au MJ"
Pass "références techniques masquées au joueur"
Pass "références conservées pour le MJ"

Write-Host ""
Write-Host "P2.10j.5b GREEN (structure)" -ForegroundColor Green
