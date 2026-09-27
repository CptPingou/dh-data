param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$p = Get-Content (Join-Path $SourceRoot "scripts\pilot-import.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'function serializeItemLinkSpecimen(value)',
  'value?.toObject?.()',
  'value?._source',
  'if ("item" in link) delete link.item;',
  'link.uuid = doc.uuid;',
  'if ("uuid" in link && link.uuid !== doc.uuid)',
  'ItemLink ${wantedType} mal remappé'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "correctif ItemLink absent: $needle"
  }
}

Write-Host "[ OK ] specimen ItemLink serialise avant remapping" -ForegroundColor Green
Write-Host "[ OK ] reference runtime item supprimee" -ForegroundColor Green
Write-Host "[ OK ] uuid cible remplace par doc.uuid" -ForegroundColor Green
Write-Host "[ OK ] garde-fou contre un UUID Blood Hunter residuel" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11d.2a GREEN (source)" -ForegroundColor Green
