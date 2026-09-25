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

$sourceFile = Join-Path $SourceRoot "scripts\item-browser-source-ownership.mjs"
$entryFile = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $sourceFile)) { Fail "item-browser-source-ownership.mjs absent" }
if (-not (Test-Path $entryFile)) { Fail "item-backpack-menu.mjs absent" }

$source = Get-Content $sourceFile -Raw -Encoding UTF8
$entry = Get-Content $entryFile -Raw -Encoding UTF8

if ($entry -notmatch [regex]::Escape('import "./item-browser-source-ownership.mjs";')) {
  Fail "source ownership non chargé au démarrage"
}
Pass "source ownership chargé au démarrage"

foreach ($needle in @(
  "daggerheart.consumables",
  "daggerheart-campaign-toolkit.dh-consumables",
  "isEntryExcluded",
  "itemBrowserSources.status"
)) {
  if ($source -notmatch [regex]::Escape($needle)) {
    Fail "source ownership incomplet : $needle absent"
  }
}

Pass "filtre natif/toolkit présent"
Write-Host ""
Write-Host "P2.10g.1 GREEN" -ForegroundColor Green
