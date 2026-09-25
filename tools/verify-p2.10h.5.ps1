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
$txPath = Join-Path $SourceRoot "scripts\expedition-transaction.mjs"
$itemPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $txPath)) { Fail "expedition-transaction.mjs absent" }
if (-not (Test-Path $itemPath)) { Fail "expedition-foundry-items.mjs absent" }

$tx = Get-Content $txPath -Raw -Encoding UTF8
$item = Get-Content $itemPath -Raw -Encoding UTF8

foreach ($needle in @(
  'captureManifestState',
  'captureActorInventory',
  'restoreManifestState',
  'restoreActorInventory',
  'rollbackExpeditionTransfer'
)) {
  if ($tx -notmatch [regex]::Escape($needle)) {
    Fail "helper transaction incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'P2.10h.5 transaction loadFromActor',
  'P2.10h.5 transaction unloadToActor',
  '__txManifestSnapshot',
  '__txActorInventorySnapshot',
  'await rollbackExpeditionTransfer',
  'throw __txError'
)) {
  if ($item -notmatch [regex]::Escape($needle)) {
    Fail "instrumentation transactionnelle incomplète : '$needle' absent"
  }
}

Pass "snapshot manifest présent"
Pass "snapshot inventaire Actor présent"
Pass "rollback Actor + manifest présent"
Pass "loadFromActor protégé"
Pass "unloadToActor protégé"

Write-Host ""
Write-Host "P2.10h.5 GREEN (structure)" -ForegroundColor Green
