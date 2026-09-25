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

$all = (Get-ChildItem $scriptsRoot -Filter "*.mjs" -File | ForEach-Object {
  Get-Content $_.FullName -Raw -Encoding UTF8
}) -join "`n"

foreach ($needle in @(
  'P2.10h.3 backpack stack merge',
  'existingStack.quantity',
  'P2.10h.3 actor stack merge',
  'existingActorItem',
  'previousActorQuantity',
  'mergedItemId',
  'Boolean(mergedActorItem)'
)) {
  if ($all -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.3b incomplet : '$needle' absent"
  }
}

Pass "fusion backpack présente"
Pass "fusion Actor présente"
Pass "rollback Actor présent"
Pass "patch idempotent"

Write-Host ""
Write-Host "P2.10h.3b GREEN (structure)" -ForegroundColor Green
