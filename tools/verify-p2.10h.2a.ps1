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

foreach ($forbidden in @(
  'partialBackpackUnloadPatched',
  'patchPartialBackpackUnload',
  'expeditionItems.unloadToActor = async function'
)) {
  if ($text -match [regex]::Escape($forbidden)) {
    Fail "wrapper runtime h.2 encore présent : '$forbidden'"
  }
}

foreach ($required in @(
  'Mettre dans le sac à dos',
  'refreshOpenExpeditionFromTransfer',
  'expeditionDialog.remove()'
)) {
  if ($text -notmatch [regex]::Escape($required)) {
    Fail "fonctionnalité h.1f absente : '$required'"
  }
}

Pass "wrapper runtime h.2 supprimé"
Pass "menu Actor -> Backpack restauré"
Pass "refresh dialog h.1f conservé"

Write-Host ""
Write-Host "P2.10h.2a HOTFIX GREEN" -ForegroundColor Green
