param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$cardsPath = Join-Path $SourceRoot "data\homebrew\artificer\domains\artillery\domain-cards.json"

if (-not (Test-Path $pilot)) { Fail "pilot-import.mjs absent" }
if (-not (Test-Path $cardsPath)) { Fail "domain-cards.json absent" }

$p = Get-Content $pilot -Raw -Encoding UTF8
if ($p -notmatch [regex]::Escape('textValue(raw?.rules_text)')) {
  Fail "baseDescription ne lit pas raw.rules_text"
}

$cards = Get-Content $cardsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($cards).Count -ne 9) { Fail "9 cartes Artillery attendues" }

$empty = @($cards | Where-Object {
  [string]::IsNullOrWhiteSpace([string]$_.rules_text)
})
if ($empty.Count -gt 0) {
  Fail "cartes sans rules_text : $($empty.name -join ', ')"
}

Write-Host "[ OK ] baseDescription lit rules_text à la racine" -ForegroundColor Green
Write-Host "[ OK ] 9/9 cartes Artillery ont un rules_text" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.1d GREEN (source)" -ForegroundColor Green
