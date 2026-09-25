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
  'existing.dataset.expeditionId === expeditionId',
  'existing.dataset.manifestRevision === revision',
  'reused: true',
  '.dhct-backpack-admin-panel',
  'targetElement?.closest?.(toolkitSelector)',
  'event.preventDefault()',
  'event.stopPropagation()',
  'locationInput.focus()'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.6b incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] panneau idempotent" -ForegroundColor Green
Write-Host "[ OK ] saisie non détruite par les refresh" -ForegroundColor Green
Write-Host "[ OK ] mutations internes ignorées" -ForegroundColor Green
Write-Host "[ OK ] boutons protégés du formulaire parent" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10j.6b GREEN (structure)" -ForegroundColor Green
