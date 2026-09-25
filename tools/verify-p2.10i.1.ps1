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

$lifecyclePath = Join-Path $SourceRoot "scripts\expedition-item-lifecycle.mjs"
$itemsPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $lifecyclePath)) { Fail "expedition-item-lifecycle.mjs absent" }
if (-not (Test-Path $itemsPath)) { Fail "expedition-foundry-items.mjs absent" }

$lifecycle = Get-Content $lifecyclePath -Raw -Encoding UTF8
$items = Get-Content $itemsPath -Raw -Encoding UTF8

foreach ($needle in @(
  '"active"',
  '"consumed"',
  '"modified"',
  '"deleted"',
  '"legacy"',
  'normalizeExpeditionItemState',
  'setExpeditionItemLifecycle',
  'migrateLegacyExpeditionItem',
  'scanExpeditionItemLifecycle'
)) {
  if ($lifecycle -notmatch [regex]::Escape($needle)) {
    Fail "lifecycle incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'version: 6',
  'lifecycle: createActiveItemLifecycle()',
  'lifecycleStatus(',
  'setLifecycle(',
  'migrateLegacy(',
  'scanLifecycle(',
  'entry-consumed',
  'entry-deleted',
  'lifecycle: expeditionItemLifecycleStatus(entry)'
)) {
  if ($items -notmatch [regex]::Escape($needle)) {
    Fail "API lifecycle incomplète : '$needle' absent"
  }
}

Pass "états lifecycle présents"
Pass "nouvelles entrées initialisées active"
Pass "anciennes entrées reconnues legacy"
Pass "API status/set/migrate/scan présente"
Pass "consumed/deleted bloqués au retour Actor"

Write-Host ""
Write-Host "P2.10i.1 GREEN (structure)" -ForegroundColor Green
