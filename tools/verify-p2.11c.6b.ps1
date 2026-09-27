param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
$r = Get-Content $runtime -Raw -Encoding UTF8

foreach ($needle in @(
  'message?.type === "abilityUse"',
  'sourceIdOf(sourceItem) !== DECISIVE_STRIKE_SOURCE_ID',
  'counterFeature: counterFeature?.name ?? null'
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "runtime incomplet: $needle"
  }
}

Write-Host "[ OK ] abilityUse de Frappe decisive reconnu par source Item" -ForegroundColor Green
Write-Host "[ OK ] status expose le nom visible du compteur" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.6b GREEN (source)" -ForegroundColor Green
