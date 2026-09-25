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
  'partialBackpackUnloadPatched',
  'chooseBackpackReturnQuantity',
  'patchPartialBackpackUnload',
  'expeditionItems.unloadToActor = async function',
  'entry.quantity = quantity',
  'savedEntry.quantity = remainder',
  'result.partial = true',
  'partialUnloadPatched'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.2 incomplet : '$needle' absent"
  }
}

Pass "interception unloadToActor présente"
Pass "quantité partielle backpack -> Actor présente"
Pass "reliquat backpack restauré"
Pass "patch idempotent présent"

Write-Host ""
Write-Host "P2.10h.2 GREEN (structure)" -ForegroundColor Green
