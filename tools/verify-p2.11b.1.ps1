param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$asset = Join-Path $SourceRoot "assets\icons\domains\hunt.png"
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$bridge = Join-Path $SourceRoot "scripts\hunting-domain-card-bridge.mjs"

if (-not (Test-Path $asset)) { Fail "asset absent : assets\icons\domains\hunt.png" }
if (-not (Test-Path $pilot)) { Fail "pilot-import.mjs absent" }
if (-not (Test-Path $bridge)) { Fail "hunting-domain-card-bridge.mjs absent" }

$p = Get-Content $pilot -Raw -Encoding UTF8
$b = Get-Content $bridge -Raw -Encoding UTF8
$icon = "modules/daggerheart-campaign-toolkit/assets/icons/domains/hunt.png"

foreach ($needle in @(
  '"hunt",',
  $icon,
  'normalizeHuntCardIcons',
  'huntIconStatus'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "pilot incomplet : '$needle' absent"
  }
}

if ($b -notmatch [regex]::Escape($icon)) {
  Fail "bootstrap Hunt ne référence pas hunt.png"
}

if ($p -match [regex]::Escape("icons/tools/navigation/map-chart-tan.webp") -or $b -match [regex]::Escape("icons/tools/navigation/map-chart-tan.webp")) {
  Fail "ancienne icône temporaire encore référencée"
}

Write-Host "[ OK ] assets\icons\domains\hunt.png présent" -ForegroundColor Green
Write-Host "[ OK ] domaine hunt -> hunt.png" -ForegroundColor Green
Write-Host "[ OK ] import des Domain Cards -> hunt.png" -ForegroundColor Green
Write-Host "[ OK ] normalisation compendium + cartes embarquées disponible" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11b.1 GREEN (source)" -ForegroundColor Green
