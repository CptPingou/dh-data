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
$path = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\item-backpack-menu.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'quantity <= 0',
  'refreshExpeditionWindows',
  'expedition window refresh failed',
  'await refreshExpeditionWindows()'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1b incomplet : '$needle' absent"
  }
}

Pass "quantité 0 refusée"
Pass "refresh fenêtre expédition présent"

Write-Host ""
Write-Host "P2.10h.1b GREEN" -ForegroundColor Green
