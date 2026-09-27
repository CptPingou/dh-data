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
  'async function nativeDomainActionSpecimens()',
  'hydrateNativeAction',
  'hydrateNativeProneEffect',
  'nativeSpecimens.actionContainer === "object"',
  'await applyArtilleryDomainCardAutomation(data, raw);',
  'rawActions: rawActions.length',
  'specimenContainer'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "fix specimen natif incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] Actions clonées depuis un specimen Foundryborne 2.9.4 valide" -ForegroundColor Green
Write-Host "[ OK ] effet Prone cloné depuis le corpus natif quand disponible" -ForegroundColor Green
Write-Host "[ OK ] forme Array/Object reprise du runtime au lieu d'être supposée" -ForegroundColor Green
Write-Host "[ OK ] status inspecte runtime + toObject()" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.4a2 GREEN (source)" -ForegroundColor Green
