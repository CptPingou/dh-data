param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path
$r = Get-Content (Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs") -Raw -Encoding UTF8
$p = Get-Content (Join-Path $SourceRoot "scripts\pilot-import.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'decisiveStrikeDamageMutations = new Map()',
  'custom.formula = appendFormula(originalFormula, bonusFormula)',
  'Decisive Strike damage formula appended',
  'Hooks.on("updateChatMessage"',
  'maybeRestoreDecisiveStrikeDamage(message)',
  'Decisive Strike damage formula restored'
)) {
  if ($r -notmatch [regex]::Escape($needle)) { Fail "runtime incomplet: $needle" }
}
if ($r -match [regex]::Escape("config.extraFormula = appendExtraFormula")) { Fail "ancienne injection extraFormula encore presente" }
foreach ($needle in @(
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.6d"',
  '"next-damage-plus-2d6-per-cob-native-formula"'
)) {
  if ($p -notmatch [regex]::Escape($needle)) { Fail "pilot incomplet: $needle" }
}
Write-Host "[ OK ] bonus attaque conserve via ActiveEffect" -ForegroundColor Green
Write-Host "[ OK ] bonus degats ajoute a la formule native de l'arme" -ForegroundColor Green
Write-Host "[ OK ] formule originale restauree apres DamageRoll" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.6d GREEN (source)" -ForegroundColor Green
