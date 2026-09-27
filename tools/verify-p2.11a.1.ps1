param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$importer = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$card = Join-Path $SourceRoot "data\homebrew\monster-hunter\domains\hunt\lecture-de-la-proie.json"

if (-not (Test-Path $importer)) { Fail "pilot-import.mjs absent" }
if (-not (Test-Path $card)) { Fail "carte pilote Chasse absente" }

$i = Get-Content $importer -Raw -Encoding UTF8
foreach ($needle in @(
  'HUNT_DOMAIN_ID = "hunt"',
  'ensureHuntDomain',
  'importCanonicalDomainCard',
  'importHuntPilot',
  'current.domains[HUNT_DOMAIN_ID]',
  'dh-domain-cards'
)) {
  if ($i -notmatch [regex]::Escape($needle)) {
    Fail "P2.11a.1 incomplet : '$needle' absent"
  }
}

$c = Get-Content $card -Raw -Encoding UTF8 | ConvertFrom-Json
if ($c.kind -ne "domain_card") { Fail "kind attendu: domain_card" }
if ($c.domain -ne "hunt") { Fail "domain attendu: hunt" }
if ($c.level -ne 1) { Fail "level attendu: 1" }
if ($c.card_type -ne "ability") { Fail "card_type attendu: ability" }
if (-not $c.id.StartsWith("homebrew.monster-hunter.domain-card.hunt.")) {
  Fail "sourceId Chasse invalide"
}

Write-Host "[ OK ] domaine homebrew hunt/Chasse enregistré via Foundryborne Homebrew" -ForegroundColor Green
Write-Host "[ OK ] carte pilote canonique Lecture de la proie" -ForegroundColor Green
Write-Host "[ OK ] import ciblé dans dh-domain-cards" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.1 GREEN (structure)" -ForegroundColor Green
