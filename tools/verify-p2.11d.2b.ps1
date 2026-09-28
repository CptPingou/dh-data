param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$p = Get-Content (Join-Path $SourceRoot "scripts\pilot-import.mjs") -Raw -Encoding UTF8

foreach ($needle in @(
  'function cloneItemLinkRuntime(value)',
  'Object.getOwnPropertyNames(value)',
  'link.item = doc;',
  'link.uuid = doc.uuid;',
  'if (link.item !== doc || link.uuid !== doc.uuid)',
  'Foundryborne 2.10.5 runtime contract observed directly'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "correctif ItemLink runtime absent: $needle"
  }
}

foreach ($forbidden in @(
  'if ("item" in link) delete link.item;',
  'value?.toObject?.()',
  'value?._source'
)) {
  if ($p -match [regex]::Escape($forbidden)) {
    Fail "ancienne strategie 2a encore presente: $forbidden"
  }
}

Write-Host "[ OK ] ItemLink traite comme objet runtime Foundryborne" -ForegroundColor Green
Write-Host "[ OK ] item remappe vers le vrai DhItem cible" -ForegroundColor Green
Write-Host "[ OK ] uuid remappe vers doc.uuid" -ForegroundColor Green
Write-Host "[ OK ] strategie 2a qui supprimait item retiree" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11d.2b GREEN (source)" -ForegroundColor Green
