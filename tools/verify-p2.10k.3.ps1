param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$SourceRoot = (Resolve-Path $SourceRoot).Path
$mapper = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$tetsu = Join-Path $SourceRoot "data\homebrew\monster-hunter\adversaries\tetsucabra.json"

if (-not (Test-Path $mapper)) { Fail "pilot-import.mjs absent" }
if (-not (Test-Path $tetsu)) { Fail "tetsucabra.json absent" }

$m = Get-Content $mapper -Raw -Encoding UTF8
$t = Get-Content $tetsu -Raw -Encoding UTF8 | ConvertFrom-Json

foreach ($needle in @(
  'P2.10k.3-mh-adversary-repair',
  'Composants / Récolte',
  'dedupeCanonicalAdversaries',
  'canonicalAdversaryImportLocks',
  'importMonsterHunterAdversaries',
  'queen-vespoid.json',
  'vespoid-minion.json'
)) {
  if ($m -notmatch [regex]::Escape($needle)) {
    Fail "P2.10k.3 incomplet : '$needle' absent"
  }
}

if ($t.hunting.loot.Count -ne 2) {
  Fail "Tetsucabra : 2 composants attendus dans hunting.loot"
}

Write-Host "[ OK ] Tetsucabra : 2 composants source" -ForegroundColor Green
Write-Host "[ OK ] rendu Notes : Composants / Récolte" -ForegroundColor Green
Write-Host "[ OK ] import MH dédié" -ForegroundColor Green
Write-Host "[ OK ] verrou anti-course par sourceId" -ForegroundColor Green
Write-Host "[ OK ] déduplication dh-adversaries par sourceId" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10k.3 GREEN (structure)" -ForegroundColor Green
