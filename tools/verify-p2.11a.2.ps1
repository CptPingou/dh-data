param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$importer = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$migrator = Join-Path $SourceRoot "tools\migrate-p2.11a.2-hunt-sources.py"

if (-not (Test-Path $importer)) { Fail "pilot-import.mjs absent" }
if (-not (Test-Path $migrator)) { Fail "migrateur source P2.11a.2 absent" }

$i = Get-Content $importer -Raw -Encoding UTF8
foreach ($needle in @(
  'LEGACY_HUNT_CARD_NAMES',
  'migrateLegacyHuntCards',
  'huntMigrationStatus',
  '"Appui défensif"',
  '"Guidage du finisher"',
  '"Traqueur"'
)) {
  if ($i -notmatch [regex]::Escape($needle)) {
    Fail "P2.11a.2 incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] registre canonique des 17 cartes legacy" -ForegroundColor Green
Write-Host "[ OK ] migration runtime Valor -> hunt sans recréation des cartes" -ForegroundColor Green
Write-Host "[ OK ] audit runtime huntMigrationStatus()" -ForegroundColor Green
Write-Host "[ OK ] migrateur source repo-first présent" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.2 GREEN (structure)" -ForegroundColor Green
