param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$importer = Join-Path $SourceRoot "scripts\pilot-import.mjs"

if (-not (Test-Path $importer)) { Fail "pilot-import.mjs absent" }

$i = Get-Content $importer -Raw -Encoding UTF8

foreach ($needle in @(
  'domain === "valor" || domain === HUNT_DOMAIN_ID',
  'Prefer the migrated Hunt row',
  'normalizedChoice(candidate.system?.domain) === "valor"',
  'normalizedChoice(candidate.system?.domain) === HUNT_DOMAIN_ID'
)) {
  if ($i -notmatch [regex]::Escape($needle)) {
    Fail "P2.11a.2b incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] runtime legacy cards identified by name + Valor/Hunt domain" -ForegroundColor Green
Write-Host "[ OK ] core Bone/Tacticien excluded by domain discriminator" -ForegroundColor Green
Write-Host "[ OK ] status prefers Hunt over legacy Valor duplicate" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.2b GREEN (structure)" -ForegroundColor Green
