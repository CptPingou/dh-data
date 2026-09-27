param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
if (-not (Test-Path $runtime)) { Fail "runtime absent" }
if (-not (Test-Path $pilot)) { Fail "pilot absent" }

$r = Get-Content $runtime -Raw -Encoding UTF8
$p = Get-Content $pilot -Raw -Encoding UTF8

foreach ($needle in @(
  'COUNTER_SOURCE_ID = "homebrew.artificer.runtime-resource.cob-rounds"',
  'assets/icons/domains/artillery.png',
  'clearArtificerStress',
  'resolveBattleRhythmCalm',
  'Battle Rhythm critical -> clear 1 Stress',
  'Battle Rhythm calm -> Cob Rounds +1'
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "runtime incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.5b"',
  'artilleryHealingAction',
  '.battle-rhythm',
  'name: "Moment de calme"',
  'stress: 2',
  'recovery: "shortRest"',
  'critical-attack-clear-1-stress-runtime',
  'calm-gain-1-cob-round-runtime',
  'native-plus-runtime'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "pilot incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] Cob Rounds utilise l'icone Artillery du module" -ForegroundColor Green
Write-Host "[ OK ] provenance Cob Rounds dediee" -ForegroundColor Green
Write-Host "[ OK ] critique d'attaque -> efface 1 Stress" -ForegroundColor Green
Write-Host "[ OK ] Moment de calme -> efface 2 Stress + 1 Cob Round" -ForegroundColor Green
Write-Host "[ OK ] Moment de calme limite a 1/repos" -ForegroundColor Green
Write-Host "[ OK ] status Artillery etendu a Rythme de bataille" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.5b GREEN (source)" -ForegroundColor Green
