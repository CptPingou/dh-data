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

$tx = Get-Content (Join-Path $SourceRoot "scripts\expedition-transaction.mjs") -Raw -Encoding UTF8
$menu = Get-Content (Join-Path $SourceRoot "scripts\item-backpack-menu.mjs") -Raw -Encoding UTF8
$item = Get-Content (Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'captureManifestState',
  'captureActorInventory',
  'restoreManifestState',
  'restoreActorInventory',
  'rollbackExpeditionTransfer'
)) {
  if ($tx -notmatch [regex]::Escape($needle)) {
    Fail "helper incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'P2.10h.5 transaction actor-to-backpack',
  '__txManifestSnapshot',
  '__txActorInventorySnapshot',
  'await rollbackExpeditionTransfer'
)) {
  if ($menu -notmatch [regex]::Escape($needle)) {
    Fail "Actor -> Backpack incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'P2.10h.5 transaction backpack-to-actor',
  'await rollbackExpeditionTransfer',
  'throw __txError'
)) {
  if ($item -notmatch [regex]::Escape($needle)) {
    Fail "Backpack -> Actor incomplet : '$needle' absent"
  }
}

Pass "helper transactionnel présent"
Pass "Actor -> Backpack protégé"
Pass "Backpack -> Actor protégé"
Pass "rollback manifest + Actor présent"

Write-Host ""
Write-Host "P2.10h.5b GREEN (structure)" -ForegroundColor Green
