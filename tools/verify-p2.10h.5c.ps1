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
$menuPath = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"
$itemPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

foreach ($path in @($txPath, $menuPath, $itemPath)) {
  if (-not (Test-Path $path)) {
    Fail "fichier absent : $path"
  }
}

$tx = Get-Content $txPath -Raw -Encoding UTF8
$menu = Get-Content $menuPath -Raw -Encoding UTF8
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
  '__txManifestSnapshot',
  '__txActorInventorySnapshot',
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
Write-Host "P2.10h.5c GREEN (structure)" -ForegroundColor Green
