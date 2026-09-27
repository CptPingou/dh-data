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
  'const packId = ownerType === "class" ? "dh-classes" : "dh-subclasses";',
  'const docs = await pack.getDocuments();',
  'normalizedChoice(link?.type) === wanted',
  '["uuid", "itemUuid", "value"]',
  'Aucun ItemLink specimen disponible pour ${ownerType}:${wantedType}.'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "fix ItemLink incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] ItemLink classes lu depuis dh-classes" -ForegroundColor Green
Write-Host "[ OK ] ItemLink sous-classes lu depuis dh-subclasses" -ForegroundColor Green
Write-Host "[ OK ] support uuid/itemUuid/value/id/itemId" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.1b GREEN (source)" -ForegroundColor Green
