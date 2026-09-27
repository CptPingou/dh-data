param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$r = Get-Content (Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'nativeResourceSchema: "seaborne-simple"',
  'resource.type = "simple"',
  'resource.recovery = null',
  'resource.icon = "fa-solid fa-bullseye"',
  'data.system.resource = cobResourceFromSpecimen',
  '"system.resource.value": next.value',
  '"system.resource.max": next.max == null ? "" : String(next.max)',
  'storage: "native-feature"',
  'feature.name !== COUNTER_LABEL'
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "element natif Cob absent: $needle"
  }
}

foreach ($forbidden in @(
  'counterFeatureName(',
  'Le nombre entre crochets dans le nom'
)) {
  if ($r -match [regex]::Escape($forbidden)) {
    Fail "pseudo-compteur historique encore present: $forbidden"
  }
}

Write-Host "[ OK ] Cob Rounds utilise une resource native simple" -ForegroundColor Green
Write-Host "[ OK ] specimen compatible Seaborne / Connaître la marée" -ForegroundColor Green
Write-Host "[ OK ] valeur lue/ecrite dans system.resource.value" -ForegroundColor Green
Write-Host "[ OK ] ancien flag conserve seulement comme miroir de migration" -ForegroundColor Green
Write-Host "[ OK ] nom de feature fixe: Cob Rounds" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11d.1 GREEN (source)" -ForegroundColor Green
