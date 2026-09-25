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
  'let refreshTimer = null',
  'retries: 12',
  'characterData: true',
  'renderApplicationV2',
  'target?.closest?.("dialog.application.dialog")'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "retry UX incomplet : '$needle' absent"
  }
}

Pass "retry temporisé présent"
Pass "mutations internes du dialog surveillées"
Pass "hook renderApplicationV2 présent"

Write-Host ""
Write-Host "P2.10j.1b GREEN (structure)" -ForegroundColor Green
