param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$pilotPath = Join-Path $SourceRoot "scripts\pilot-import.mjs"
if (-not (Test-Path $pilotPath)) { Fail "pilot-import.mjs absent" }
$p = Get-Content $pilotPath -Raw -Encoding UTF8

foreach ($needle in @(
  'export async function syncOwnedArtilleryCards',
  'preserveOwnedActionUseValues',
  'replaceOwnedCardEffects',
  'const ownedCards = await syncOwnedArtilleryCards({ cards });',
  'green: status.green && folders.green && ownedCards.green',
  'ownedCards,',
  'source-card-missing',
  'Campaign Toolkit : ${cardsUpdated} carte(s) Artillery possédée(s) synchronisée(s).'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "element P2.11c.8 absent: $needle"
  }
}

foreach ($needle in @(
  '"inVault"',
  '"loadout"',
  '"equipped"',
  'sourceSystem.resource.value = ownedSystem.resource.value',
  'action.uses.value = previous.uses.value'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "preservation etat Actor absente: $needle"
  }
}

Write-Host "[ OK ] sync compendium -> cartes Artillery possedees" -ForegroundColor Green
Write-Host "[ OK ] compteurs d'usages preserves" -ForegroundColor Green
Write-Host "[ OK ] etat de placement/loadout preserve" -ForegroundColor Green
Write-Host "[ OK ] ActiveEffects remplaces par la version source" -ForegroundColor Green
Write-Host "[ OK ] importArtificerArtillery lance la sync automatiquement" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.8 GREEN (source)" -ForegroundColor Green
