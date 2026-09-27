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
  'async function upsertCanonicalItem(raw, sourcePath, packId, finalizeData = null)',
  'await finalizeData(data);',
  'data.system.features = links;',
  'data.system.linkedClass = linkedClass;'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "fix create-first incomplet : '$needle' absent"
  }
}

if ($p -match [regex]::Escape('await classDoc.update({')) {
  Fail "classDoc.update(system.features) est encore présent"
}
if ($p -match [regex]::Escape('await subclassDoc.update({')) {
  Fail "subclassDoc.update(system.features) est encore présent"
}

Write-Host "[ OK ] liens de classe injectés avant création" -ForegroundColor Green
Write-Host "[ OK ] linkedClass + features injectés avant création de sous-classe" -ForegroundColor Green
Write-Host "[ OK ] aucun update de DHClass/DHSubclass pour le linkage initial" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.1c GREEN (source)" -ForegroundColor Green
