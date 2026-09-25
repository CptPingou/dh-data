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
  '.dct-expedition-item-panel .dct-expedition-item-actions',
  'button[data-expedition-action="return-to-actor"]',
  'returnButton.dataset.containerId',
  'returnButton.dataset.entryId',
  'loadFreshNativeEntry',
  'injectNativeObjectActions',
  'actionsHost.append(button)',
  'label: "Consommer"',
  'label: "Modifier"',
  'label: "Supprimer"'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3h incomplet : '$needle' absent"
  }
}

foreach ($obsolete in @(
  'findRightPanelObjectColumn',
  'findRightPanelActionRow',
  'row.append(actions)',
  'popovertarget'
)) {
  if ($text -match [regex]::Escape($obsolete)) {
    Fail "ancien ciblage encore présent : '$obsolete'"
  }
}

Pass "ciblage DOM exact de la colonne Objet"
Pass "containerId/entryId lus depuis le bouton natif"
Pass "boutons injectés dans dct-expedition-item-actions"
Pass "manifest frais rechargé au clic"
Pass "anciens ciblages supprimés"

Write-Host ""
Write-Host "P2.10j.3h GREEN (structure)" -ForegroundColor Green
