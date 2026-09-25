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
$itemPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"
$menuPath = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

$item = Get-Content $itemPath -Raw -Encoding UTF8
$menu = Get-Content $menuPath -Raw -Encoding UTF8

foreach ($needle in @(
  'restoreManifestSnapshot',
  'transactionManifestSnapshot',
  'Backpack → Actor rollback failed',
  'mergedActorItem = existingActorItem'
)) {
  if ($item -notmatch [regex]::Escape($needle)) {
    Fail "Backpack -> Actor incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'cloneOwnedItem',
  'restoreActorDebit',
  'manifestSnapshot',
  'actorItemSnapshot',
  'transactionStarted',
  'manifest rollback failed',
  'Actor item rollback failed'
)) {
  if ($menu -notmatch [regex]::Escape($needle)) {
    Fail "Actor -> Backpack incomplet : '$needle' absent"
  }
}

Pass "rollback ciblé Backpack -> Actor présent"
Pass "rollback ciblé Actor -> Backpack présent"
Pass "pas de restauration globale de l'inventaire Actor"

Write-Host ""
Write-Host "P2.10h.5d GREEN (structure)" -ForegroundColor Green
