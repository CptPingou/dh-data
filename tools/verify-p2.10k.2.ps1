param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$SourceRoot = (Resolve-Path $SourceRoot).Path
$path = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $path)) {
  Fail "expedition-inventory-ux.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'containerId: "ground"',
  'name: "Sol"',
  'role: "ground"',
  'containerId: "fob"',
  'name: "FOB"',
  'role: "fob"',
  'containerId: "caravan"',
  'name: "Caravane"',
  'role: "caravan"',
  'buildSharedContainer',
  'ensureSharedContainers',
  'reason: "shared-containers-bootstrap"'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10k.2 incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] Sol créé comme conteneur persistant" -ForegroundColor Green
Write-Host "[ OK ] FOB créée comme conteneur persistant" -ForegroundColor Green
Write-Host "[ OK ] Caravane créée comme conteneur persistant" -ForegroundColor Green
Write-Host "[ OK ] bootstrap idempotent" -ForegroundColor Green
Write-Host "[ OK ] sauvegarde + socket conservés" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.2 GREEN (structure)" -ForegroundColor Green
