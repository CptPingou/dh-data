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

$runtime = Join-Path $SourceRoot "scripts\native-item-artwork.mjs"
$owner = Join-Path $SourceRoot "scripts\item-browser-source-ownership.mjs"
$apply = Join-Path $SourceRoot "tools\apply_native_item_artwork.py"

foreach ($path in @($runtime, $owner, $apply)) {
  if (-not (Test-Path $path)) {
    Fail "fichier absent : $path"
  }
}

$runtimeText = Get-Content $runtime -Raw -Encoding UTF8
$ownerText = Get-Content $owner -Raw -Encoding UTF8
$applyText = Get-Content $apply -Raw -Encoding UTF8

if ($ownerText -notmatch [regex]::Escape('import "./native-item-artwork.mjs";')) {
  Fail "native-item-artwork.mjs non chargé"
}
Pass "mapper artwork chargé au démarrage"

foreach ($needle in @(
  "daggerheart.weapons",
  "daggerheart.armors",
  "daggerheart.consumables",
  "daggerheart.loot",
  "nativeItemArtwork.export",
  "saveDataToFile"
)) {
  if ($runtimeText -notmatch [regex]::Escape($needle)) {
    Fail "runtime incomplet : $needle absent"
  }
}
Pass "export des artwork natifs présent"

foreach ($needle in @(
  "dh-weapons.json",
  "dh-armor.json",
  "dh-consumables.json",
  "dh-loot.json",
  "artworkSource",
  "mechanicsReconstruction",
  '"img"'
)) {
  if ($applyText -notmatch [regex]::Escape($needle)) {
    Fail "outil Python incomplet : $needle absent"
  }
}
Pass "application source-first présente"

Write-Host ""
Write-Host "P2.10g.3 GREEN" -ForegroundColor Green
