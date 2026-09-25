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

if ($text -match '(?m)^async\s*$') {
  Fail "async orphelin encore présent"
}

foreach ($needle in @(
  'function getNativeObjectActionContext',
  '.dct-expedition-item-panel .dct-expedition-item-actions',
  'button[data-expedition-action="return-to-actor"]',
  'injectNativeObjectActions'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3h.1 incomplet : '$needle' absent"
  }
}

Pass "async orphelin supprimé"
Pass "ciblage DOM exact conservé"

Write-Host ""
Write-Host "P2.10j.3h.1 GREEN (structure)" -ForegroundColor Green
