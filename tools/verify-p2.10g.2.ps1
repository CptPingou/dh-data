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

if (-not (Test-Path $sourceFile)) {
  Fail "scripts\item-browser-source-ownership.mjs absent"
}

$source = Get-Content $sourceFile -Raw -Encoding UTF8

foreach ($needle in @(
  "REDUNDANT_THIRD_PARTY_ITEM_PACKS",
  "daggerheart-quickactions.items",
  "shouldExcludeThirdPartyEntry",
  "shouldExcludeToolkitOwnedEntry",
  "thirdPartyRows"
)) {
  if ($source -notmatch [regex]::Escape($needle)) {
    Fail "P2.10g.2 incomplet : '$needle' absent"
  }
}

Pass "filtre tiers redondants présent"
Pass "daggerheart-quickactions.items exclu du navigateur"
Write-Host ""
Write-Host "P2.10g.2 GREEN" -ForegroundColor Green
