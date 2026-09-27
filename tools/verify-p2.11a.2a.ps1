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
if (-not (Test-Path $migrator)) { Fail "migrateur source absent" }

$i = Get-Content $importer -Raw -Encoding UTF8
$m = Get-Content $migrator -Raw -Encoding UTF8

foreach ($needle in @(
  'isMonsterHunterLegacyCard',
  'data/homebrew/monster-hunter/',
  'homebrew.monster-hunter.'
)) {
  if ($i -notmatch [regex]::Escape($needle)) {
    Fail "runtime migration non désambiguïsée : '$needle' absent"
  }
}

foreach ($needle in @(
  'root / "data" / "homebrew" / "monster-hunter"',
  'if name and domain_path and norm(name) in TARGET_KEYS'
)) {
  if ($m -notmatch [regex]::Escape($needle)) {
    Fail "source migrator non désambiguïsé : '$needle' absent"
  }
}

Write-Host "[ OK ] actions embarquées ignorées comme faux doublons" -ForegroundColor Green
Write-Host "[ OK ] Tacticien core/bone exclu de la migration" -ForegroundColor Green
Write-Host "[ OK ] migration limitée à data/homebrew/monster-hunter" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.2a GREEN (structure)" -ForegroundColor Green
