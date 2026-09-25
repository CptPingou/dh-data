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
$path = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\item-backpack-menu.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'chooseTransferQuantity',
  'applyActorDebit',
  'system.quantity.value',
  'system.amount.value',
  'quantity,',
  'remaining'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1 incomplet : '$needle' absent"
  }
}

Pass "sélection de quantité présente"
Pass "débit partiel Actor présent"
Pass "support quantity/amount présent"

Write-Host ""
Write-Host "P2.10h.1 GREEN" -ForegroundColor Green
