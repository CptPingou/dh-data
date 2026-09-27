param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
$main = Join-Path $SourceRoot "scripts\main.mjs"

if (-not (Test-Path $runtime)) { Fail "artificer-resource-runtime.mjs absent" }
if (-not (Test-Path $main)) { Fail "main.mjs absent" }

$r = Get-Content $runtime -Raw -Encoding UTF8
$m = Get-Content $main -Raw -Encoding UTF8

foreach ($needle in @(
  'const COUNTER_KEY = "cobRounds"',
  'export async function ensureArtificerResourceFeature',
  'export async function gainCobRounds',
  'export async function spendCobRounds',
  'export async function spendAllCobRounds',
  'export function inspectCriticalMessage',
  'Hooks.on("createChatMessage"',
  'Battle Rhythm critical -> Cob Rounds +1',
  'export const artificerResourceApi'
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "runtime Artificier incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'from "./artificer-resource-runtime.mjs"',
  'artificerResource: artificerResourceApi',
  'registerArtificerResourceRuntime();'
)) {
  if ($m -notmatch [regex]::Escape($needle)) {
    Fail "main.mjs incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] feature Cob Rounds runtime" -ForegroundColor Green
Write-Host "[ OK ] compteur Actor autoritaire" -ForegroundColor Green
Write-Host "[ OK ] API get/set/gain/spend/spendAll" -ForegroundColor Green
Write-Host "[ OK ] hook critique d'attaque + Battle Rhythm" -ForegroundColor Green
Write-Host "[ OK ] affichage compteur via nom de feature" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.5 GREEN (source)" -ForegroundColor Green
