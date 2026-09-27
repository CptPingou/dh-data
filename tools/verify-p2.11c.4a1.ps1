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
  'data.system.actions = Object.values(actionMap);',
  'actions?.contents',
  'actions instanceof Map',
  'actionNames: actionRows.map'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "fix actions incomplet : '$needle' absent"
  }
}

if ($p -match [regex]::Escape('data.system.actions = actionMap;')) {
  Fail "ancienne affectation objet encore présente"
}

Write-Host "[ OK ] ActionField alimenté par un tableau source" -ForegroundColor Green
Write-Host "[ OK ] status supporte Array / Collection / Map / Object" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.4a1 GREEN (source)" -ForegroundColor Green
