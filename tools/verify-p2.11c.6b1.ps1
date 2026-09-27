param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$runtime = Join-Path $SourceRoot "scripts\artificer-resource-runtime.mjs"
if (-not (Test-Path $runtime)) { Fail "runtime absent" }

$r = Get-Content $runtime -Raw -Encoding UTF8

if ($r -match [regex]::Escape("findCounterFeature(")) {
  Fail "appel fantome findCounterFeature encore present"
}

foreach ($needle in @(
  "const feature = counterFeature(actor);",
  "counterFeature: feature?.name ?? null"
)) {
  if ($r -notmatch [regex]::Escape($needle)) {
    Fail "hotfix incomplet: $needle"
  }
}

Write-Host "[ OK ] decisiveStrikeStatus utilise counterFeature() existant" -ForegroundColor Green
Write-Host "[ OK ] aucun appel findCounterFeature() fantome" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.6b1 GREEN (source)" -ForegroundColor Green
