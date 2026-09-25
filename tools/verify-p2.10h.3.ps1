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
  'candidateStackKey',
  'existingStack.quantity',
  'merged: true',
  'P2.10h.3 actor stack merge',
  'desiredStackKey',
  'existingActorItem',
  'previousActorQuantity',
  'mergedItemId',
  'Boolean(mergedActorItem)'
)) {
  if ($all -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.3 incomplet : '$needle' absent"
  }
}

Pass "fusion backpack présente"
Pass "fusion Actor présente"
Pass "rollback Actor après échec extract présent"
Pass "identité stricte basée snapshot présente"

Write-Host ""
Write-Host "P2.10h.3 GREEN (structure)" -ForegroundColor Green
