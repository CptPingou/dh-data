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
  'Hooks.on("daggerheart.preDamageAction"',
  'config.extraFormula = appendExtraFormula',
  'Decisive Strike damage appended',
  'system.bonuses.roll.attack.bonus'
)) {
  if ($r -notmatch [regex]::Escape($needle)) { Fail "runtime incomplet: $needle" }
}

foreach ($forbidden in @(
  'system.bonuses.damage.physical.dice',
  'system.bonuses.damage.magical.dice'
)) {
  if ($r -match [regex]::Escape($forbidden)) {
    Fail "ancienne injection de bonus de degats encore presente: $forbidden"
  }
}

foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.6c"',
  '"next-damage-plus-2d6-per-cob-preDamageAction"'
)) {
  if ($p -notmatch [regex]::Escape($needle)) { Fail "pilot incomplet: $needle" }
}

Write-Host "[ OK ] bonus attaque reste porte par ActiveEffect" -ForegroundColor Green
Write-Host "[ OK ] bonus degats passe par preDamageAction.extraFormula" -ForegroundColor Green
Write-Host "[ OK ] plus de bonus Actor damage.dice pour Frappe decisive" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.6c GREEN (source)" -ForegroundColor Green
