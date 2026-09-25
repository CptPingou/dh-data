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

$planPath = Join-Path $SourceRoot "scripts\expedition-item-restitution.mjs"
$itemsPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $planPath)) { Fail "expedition-item-restitution.mjs absent" }
if (-not (Test-Path $itemsPath)) { Fail "expedition-foundry-items.mjs absent" }

$plan = Get-Content $planPath -Raw -Encoding UTF8
$items = Get-Content $itemsPath -Raw -Encoding UTF8

foreach ($needle in @(
  'buildExpeditionRestitutionPlan',
  'restitutionPlanStatus',
  'returnItems',
  'blockedItems',
  'archiveAudit',
  'container-holder-actor-not-found',
  'item-source-unavailable'
)) {
  if ($plan -notmatch [regex]::Escape($needle)) {
    Fail "plan restitution incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'version: 9',
  'restitutionPlan(manifest)',
  'restitutionStatus(manifest)'
)) {
  if ($items -notmatch [regex]::Escape($needle)) {
    Fail "API restitution incomplète : '$needle' absent"
  }
}

Pass "plan de restitution présent"
Pass "blocage des entrées non restituables présent"
Pass "audit archive présent"
Pass "API expeditionItems v9 présente"

Write-Host ""
Write-Host "P2.10i.4 GREEN (structure)" -ForegroundColor Green
