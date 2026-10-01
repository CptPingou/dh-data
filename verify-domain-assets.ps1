param(
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$required = @(
  'assets\icons\artillery.svg',
  'assets\icons\hunt.svg',
  'assets\icons\blood.svg',
  'assets\icons\domain-card\artillery.png',
  'assets\icons\domain-card\hunt.png',
  'assets\icons\domain-card\blood.png'
)

$missing = @()
foreach ($rel in $required) {
  $p = Join-Path $RepoRoot $rel
  if (Test-Path $p) {
    Write-Host "[ OK ] $rel" -ForegroundColor Green
  } else {
    Write-Host "[MISS] $rel" -ForegroundColor Red
    $missing += $rel
  }
}

$pilot = Join-Path $RepoRoot 'scripts\pilot-import.mjs'
if (-not (Test-Path $pilot)) { throw 'scripts\pilot-import.mjs absent' }
$text = Get-Content $pilot -Raw -Encoding UTF8

$checks = @(
  @{ Label='Artillery domain SVG'; Pattern='src: ARTILLERY_DOMAIN_ICON' },
  @{ Label='Hunt domain SVG'; Pattern='src: HUNT_DOMAIN_ICON' },
  @{ Label='Artillery card PNG'; Pattern='data.img = ARTILLERY_CARD_ICON' },
  @{ Label='Hunt card PNG'; Pattern='data.img = HUNT_CARD_ICON' },
  @{ Label='Artillery actions PNG'; Pattern='img = ARTILLERY_CARD_ICON' }
)

$failed = @()
foreach ($c in $checks) {
  if ($text.Contains($c.Pattern)) {
    Write-Host "[ OK ] $($c.Label)" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $($c.Label)" -ForegroundColor Red
    $failed += $c.Label
  }
}

$bad = @(
  'assets/icons/domains/artillery.png',
  'assets/icons/domains/hunt.png',
  'img = ARTILLERY_DOMAIN_DEFINITION.src',
  'img: ARTILLERY_DOMAIN_DEFINITION.src'
)
foreach ($pattern in $bad) {
  $hits = Get-ChildItem $RepoRoot -Recurse -File -Include *.mjs,*.js,*.json,*.json5 |
    Select-String -SimpleMatch $pattern
  if ($hits) {
    Write-Host "[WARN] anciennes références '$pattern':" -ForegroundColor Yellow
    $hits | Select-Object Path, LineNumber, Line | Format-Table -AutoSize
  } else {
    Write-Host "[ OK ] aucune ancienne référence '$pattern'" -ForegroundColor Green
  }
}

if (Get-Command node -ErrorAction SilentlyContinue) {
  & node --check $pilot
  if ($LASTEXITCODE -ne 0) { throw 'node --check pilot-import.mjs a échoué' }
  Write-Host '[ OK ] node --check pilot-import.mjs' -ForegroundColor Green
}

if ($missing.Count -or $failed.Count) {
  throw "Verification failed: missing=$($missing.Count), failed=$($failed.Count)"
}

Write-Host "`nDOMAIN ASSETS PATCH GREEN" -ForegroundColor Green
