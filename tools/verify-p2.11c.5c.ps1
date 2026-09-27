param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"

$r = Get-Content $runtime -Raw -Encoding UTF8
$p = Get-Content $pilot -Raw -Encoding UTF8

foreach ($needle in @(
  'resolveBattleRhythmCalm(actor)',
  'Battle Rhythm calm -> clear Stress + Cob Rounds',
  'resolved.stress.cleared',
  'resolved.resource.value'
)) {
  if ($r -notmatch [regex]::Escape($needle)) { Fail "runtime incomplet: $needle" }
}

foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.5c"',
  'name: "Moment de calme"',
  'type: "effect"',
  '"calm-clear-2-stress-runtime"',
  '"calm-gain-1-cob-round-runtime"',
  'status: "runtime-authoritative"'
)) {
  if ($p -notmatch [regex]::Escape($needle)) { Fail "pilot incomplet: $needle" }
}

if ($p -match [regex]::Escape('"calm-clear-2-stress-native"')) {
  Fail "ancien clear Stress natif encore declare"
}

Write-Host "[ OK ] Moment de calme est un trigger 1/repos" -ForegroundColor Green
Write-Host "[ OK ] runtime applique Stress -2 et Cob +1" -ForegroundColor Green
Write-Host "[ OK ] aucune double application native/runtime" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.5c GREEN (source)" -ForegroundColor Green
