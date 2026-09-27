param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$asset = Join-Path $SourceRoot "assets\icons\domains\artillery.png"
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$bridge = Join-Path $SourceRoot "scripts\hunting-domain-card-bridge.mjs"

foreach ($path in @($asset,$pilot,$bridge)) {
  if (-not (Test-Path $path)) { Fail "fichier absent : $path" }
}

$runtime = "modules/daggerheart-campaign-toolkit/assets/icons/domains/artillery.png"
$p = Get-Content $pilot -Raw -Encoding UTF8
$b = Get-Content $bridge -Raw -Encoding UTF8

if ($p -notmatch [regex]::Escape($runtime)) {
  Fail "pilot-import.mjs n'utilise pas artillery.png"
}
if ($b -notmatch [regex]::Escape($runtime)) {
  Fail "hunting-domain-card-bridge.mjs n'utilise pas artillery.png"
}
if ($p -match [regex]::Escape('icons/svg/hazard.svg')) {
  Fail "placeholder hazard.svg encore présent dans pilot-import.mjs"
}
if ($b -match [regex]::Escape('icons/svg/hazard.svg')) {
  Fail "placeholder hazard.svg encore présent dans bridge"
}

Write-Host "[ OK ] artillery.png présent dans assets/icons/domains" -ForegroundColor Green
Write-Host "[ OK ] bootstrap runtime Artillery utilise l'icone custom" -ForegroundColor Green
Write-Host "[ OK ] import des cartes Artillery utilise l'icone custom" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.2 GREEN (source)" -ForegroundColor Green
