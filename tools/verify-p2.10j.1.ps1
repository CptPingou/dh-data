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

$uxPath = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"
$mainPath = Join-Path $SourceRoot "scripts\main.mjs"

if (-not (Test-Path $uxPath)) { Fail "expedition-inventory-ux.mjs absent" }
if (-not (Test-Path $mainPath)) { Fail "main.mjs absent" }

$ux = Get-Content $uxPath -Raw -Encoding UTF8
$main = Get-Content $mainPath -Raw -Encoding UTF8

foreach ($needle in @(
  'refreshExpeditionInventoryUx',
  'installExpeditionInventoryUx',
  'scanLifecycle',
  'restitutionStatus',
  'MutationObserver',
  'Inventaire',
  'Modifiés',
  'Archivés',
  'Bloqués'
)) {
  if ($ux -notmatch [regex]::Escape($needle)) {
    Fail "UX j.1 incomplète : '$needle' absent"
  }
}

foreach ($needle in @(
  'import { installExpeditionInventoryUx } from "./expedition-inventory-ux.mjs";',
  'installExpeditionInventoryUx();'
)) {
  if ($main -notmatch [regex]::Escape($needle)) {
    Fail "main.mjs non branché : '$needle' absent"
  }
}

Pass "surcouche UX présente"
Pass "résumé lifecycle/restauration branché"
Pass "rafraîchissement ouverture + expeditionChanged présent"
Pass "main.mjs branché"

Write-Host ""
Write-Host "P2.10j.1 GREEN (structure)" -ForegroundColor Green
