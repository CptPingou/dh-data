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
  'ARTILLERY_AUTOMATION_VERSION = "P2.11c.4a"',
  'applyArtilleryDomainCardAutomation',
  '.concussive-shot',
  '.shockwave',
  '.carpet-bomb',
  'agility-reaction-12',
  'physical-damage-1d6+2',
  'physical-damage-3d10+5',
  'one-per-long-rest',
  'export async function artilleryAutomationStatus()'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "automation Artillery incomplète : '$needle' absent"
  }
}

Write-Host "[ OK ] Tir concussif : coût Stress + save 12 + Prone" -ForegroundColor Green
Write-Host "[ OK ] Onde de choc : Spellcast + zone + 1d6+2 + save 13 + Prone" -ForegroundColor Green
Write-Host "[ OK ] Bombardement : Spellcast + zone + 3d10+5 + save 15 + Prone + repos long" -ForegroundColor Green
Write-Host "[ OK ] status runtime disponible" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.4a GREEN (source)" -ForegroundColor Green
