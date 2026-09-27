param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path
$r = Get-Content (Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs") -Raw -Encoding UTF8
$p = Get-Content (Join-Path $SourceRoot "scripts\pilot-import.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'postDecisiveStrikeDamageChat(actor, pendingStrike.spent)',
  'Ajoutez manuellement <strong>+${dice}d6 dégâts</strong>',
  'system.bonuses.roll.attack.bonus',
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.6e"',
  '"next-damage-plus-2d6-per-cob-manual-chat"'
)) {
  if (($r + "`n" + $p) -notmatch [regex]::Escape($needle)) { Fail "absent: $needle" }
}

foreach ($forbidden in @(
  'daggerheart.preDamageAction',
  'config.extraFormula',
  'decisiveStrikeDamageMutations',
  'system.bonuses.damage.physical.dice',
  'system.bonuses.damage.magical.dice'
)) {
  if ($r -match [regex]::Escape($forbidden)) { Fail "ancienne automatisation presente: $forbidden" }
}

Write-Host "[ OK ] bonus attaque automatique conserve" -ForegroundColor Green
Write-Host "[ OK ] depense Cob automatique conservee" -ForegroundColor Green
Write-Host "[ OK ] automatisation des degats retiree" -ForegroundColor Green
Write-Host "[ OK ] rappel chat +2d6 par Cob actif" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.6e GREEN (source)" -ForegroundColor Green
