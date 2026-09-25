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
$path = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $path)) { Fail "expedition-inventory-ux.mjs absent" }

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'popovertarget',
  'popovertargetaction',
  'setAttribute("popover", "auto")',
  ':popover-open',
  'hidePopover',
  'removeInventoryPopovers',
  'menu.addEventListener("toggle"'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3d incomplet : '$needle' absent"
  }
}

if ($text -match 'pointerup') {
  Fail "ancien mécanisme pointerup encore présent"
}

Pass "Popover API native présente"
Pass "trigger popovertarget présent"
Pass "positionnement du popover présent"
Pass "ancien toggle pointerup supprimé"

Write-Host ""
Write-Host "P2.10j.3d GREEN (structure)" -ForegroundColor Green
