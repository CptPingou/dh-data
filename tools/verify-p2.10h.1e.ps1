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
  'document.querySelectorAll("dialog.application.dialog")',
  'préparer l',
  'expeditionDialog.close()',
  'await api.expeditionManifest.open(freshManifest)',
  'could not reload expedition manifest after transfer'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1e incomplet : '$needle' absent"
  }
}

Pass "dialog expédition ciblé"
Pass "fermeture/réouverture automatique présente"
Pass "open() reçoit le manifest complet"

Write-Host ""
Write-Host "P2.10h.1e GREEN" -ForegroundColor Green
