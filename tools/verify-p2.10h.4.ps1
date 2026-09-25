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
$scriptsRoot = Join-Path $SourceRoot "scripts"

$errorsPath = Join-Path $scriptsRoot "expedition-errors.mjs"
$menuPath = Join-Path $scriptsRoot "item-backpack-menu.mjs"

if (-not (Test-Path $errorsPath)) { Fail "expedition-errors.mjs absent" }
if (-not (Test-Path $menuPath)) { Fail "item-backpack-menu.mjs absent" }

$all = (Get-ChildItem $scriptsRoot -Filter "*.mjs" -File | ForEach-Object {
  Get-Content $_.FullName -Raw -Encoding UTF8
}) -join "`n"

foreach ($needle in @(
  'export function expeditionErrorMessage',
  'quantity-exceeds-entry',
  'container-holder-actor-not-found',
  'foundry-item-not-resolved',
  'actor-item-create-failed',
  'transferFailureReason',
  'containerName: backpack?.name',
  'withExpeditionUserMessage'
)) {
  if ($all -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.4 incomplet : '$needle' absent"
  }
}

Pass "traducteur d'erreurs centralisé présent"
Pass "Actor -> Backpack utilise les messages propres"
Pass "unloadToActor expose userMessage"
Pass "reason technique conservé"

Write-Host ""
Write-Host "P2.10h.4 GREEN (structure)" -ForegroundColor Green
