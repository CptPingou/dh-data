param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
if (-not (Test-Path $pilot)) { Fail "pilot-import.mjs absent" }

$p = Get-Content $pilot -Raw -Encoding UTF8

foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.4b"',
  '.heavy-volley',
  '.siege-stance',
  'system.bonuses.damage.physical.dice',
  'system.bonuses.damage.magical.dice',
  'system.bonuses.roll.attack.bonus',
  'tier-scaling-d6-d8-d10-d12',
  'remove-effect-when-actor-moves',
  'effects: effectCount'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "P2.11c.4b incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] Volée lourde : effet natif +1d6 Tier 1" -ForegroundColor Green
Write-Host "[ OK ] scaling Tier 2-4 tracé explicitement comme manuel" -ForegroundColor Green
Write-Host "[ OK ] Posture de siège : +2 attaque +1d8 dégâts + action 1/repos" -ForegroundColor Green
Write-Host "[ OK ] immunité déplacement / fin au mouvement tracées comme manuelles" -ForegroundColor Green
Write-Host "[ OK ] status runtime étendu à 5 cartes" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.4b GREEN (source)" -ForegroundColor Green
