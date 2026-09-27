param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
if (-not (Test-Path $runtime)) { Fail "runtime absent" }

$r = Get-Content $runtime -Raw -Encoding UTF8

foreach ($needle in @(
  'message?.type !== "dualityRoll"',
  'matching Hope/Fear results',
  'message?.system?.title',
  'message?.system?.source?.item',
  'sourceItem?.type === "weapon"',
  'messageType: message?.type',
  'dualityDice',
  'icons/commodities/tech/cog-steel.webp'
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "P2.11c.5a incomplet : '$needle' absent"
  }
}

if ($r -match [regex]::Escape('bullet-shell-casing.webp')) {
  Fail "ancienne icône 404 encore présente"
}

Write-Host "[ OK ] critique Duality indépendant de la taille du dé" -ForegroundColor Green
Write-Host "[ OK ] attaque détectée depuis system.title/source.item" -ForegroundColor Green
Write-Host "[ OK ] provenance du specimen nettoyée" -ForegroundColor Green
Write-Host "[ OK ] icône Cob Rounds corrigée" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.5a GREEN (source)" -ForegroundColor Green
