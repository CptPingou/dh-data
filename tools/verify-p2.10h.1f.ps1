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
  'expeditionDialog.close()',
  'expeditionDialog.remove()',
  'requestAnimationFrame',
  'await api.expeditionManifest.open(freshManifest)'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1f incomplet : '$needle' absent"
  }
}

Pass "ancien dialog fermé"
Pass "ancien nœud DOM supprimé"
Pass "réouverture après un frame"

Write-Host ""
Write-Host "P2.10h.1f GREEN" -ForegroundColor Green
