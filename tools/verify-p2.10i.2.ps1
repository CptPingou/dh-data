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
$lifecycle = Get-Content (Join-Path $SourceRoot "scripts\expedition-item-lifecycle.mjs") -Raw -Encoding UTF8
$items = Get-Content (Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'consumeExpeditionItem',
  'modifyExpeditionItem',
  'deleteExpeditionItem',
  'appendLifecycleHistory',
  'entry.quantity = 0',
  'entry.slotId = null'
)) {
  if ($lifecycle -notmatch [regex]::Escape($needle)) {
    Fail "transitions lifecycle incomplètes : '$needle' absent"
  }
}

foreach ($needle in @(
  'version: 7',
  'consume(manifest,',
  'modify(manifest,',
  'delete(manifest,',
  'findManifestEntry'
)) {
  if ($items -notmatch [regex]::Escape($needle)) {
    Fail "API i.2 incomplète : '$needle' absent"
  }
}

$manifestSource = Get-ChildItem (Join-Path $SourceRoot "scripts") -Filter "*.mjs" -File |
  Where-Object {
    $t = Get-Content $_.FullName -Raw -Encoding UTF8
    $t -match 'terminalLifecycle' -and $t -match 'minimumQuantity'
  }

if (-not $manifestSource) {
  Fail "règle manifest terminale absente — lancer apply_p2_10i_2_manifest.py"
}

Pass "consume / modify / delete présents"
Pass "historique lifecycle présent"
Pass "quantity 0 terminale autorisée"
Pass "API expeditionItems v7 présente"

Write-Host ""
Write-Host "P2.10i.2 GREEN (structure)" -ForegroundColor Green
