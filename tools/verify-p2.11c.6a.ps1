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
  'DECISIVE_STRIKE_SOURCE_ID',
  'armDecisiveStrike',
  'decisiveStrikeEffectData',
  'system.bonuses.roll.attack.bonus',
  'system.bonuses.damage.physical.dice',
  'system.bonuses.damage.magical.dice',
  'spendAllCobRounds(actor)',
  'Decisive Strike consumed on attack',
  'clearDecisiveStrikeState'
)) {
  if ($r -notmatch [regex]::Escape($needle)) { Fail "runtime incomplet: $needle" }
}

foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.6a"',
  '.decisive-strike',
  'name: "Armer Frappe décisive"',
  'recovery: "longRest"',
  '"spend-all-cob-rounds-runtime"',
  '"next-attack-bonus-plus-one-per-cob-runtime-effect"',
  '"next-damage-plus-2d6-per-cob-runtime-effect"',
  '"successful-target-cannot-react-until-start-of-next-action"'
)) {
  if ($p -notmatch [regex]::Escape($needle)) { Fail "pilot incomplet: $needle" }
}

Write-Host "[ OK ] Frappe decisive 1/repos long" -ForegroundColor Green
Write-Host "[ OK ] depense tous les Cob Rounds" -ForegroundColor Green
Write-Host "[ OK ] +1 attaque par Cob Round" -ForegroundColor Green
Write-Host "[ OK ] +2d6 degats par Cob Round" -ForegroundColor Green
Write-Host "[ OK ] effet retire apres la prochaine attaque" -ForegroundColor Green
Write-Host "[WARN] interdiction de Reaction cible reste manuelle (success/duration non valides)" -ForegroundColor Yellow
Write-Host ""
Write-Host "P2.11c.6a GREEN (source)" -ForegroundColor Green
