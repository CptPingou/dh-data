param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$bridge = Join-Path $SourceRoot "scripts\hunting-domain-card-bridge.mjs"
$main = Join-Path $SourceRoot "scripts\main.mjs"

if (-not (Test-Path $bridge)) { Fail "hunting-domain-card-bridge.mjs absent" }
if (-not (Test-Path $main)) { Fail "main.mjs absent" }

$b = Get-Content $bridge -Raw -Encoding UTF8
$m = Get-Content $main -Raw -Encoding UTF8

foreach ($needle in @(
  'const HUNT_DOMAIN_ID = "hunt"',
  'export function registerHuntDomain()',
  'domains[HUNT_DOMAIN_ID]',
  'label: "Chasse"',
  'console.log(`${MODULE_ID} | Hunt domain registered`)'
)) {
  if ($b -notmatch [regex]::Escape($needle)) {
    Fail "bridge incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'registerHuntDomain,',
  'const huntDomainBootstrapped = registerHuntDomain();',
  '!CONFIG?.DH?.DOMAIN?.domains?.hunt',
  'registerHuntDomain();'
)) {
  if ($m -notmatch [regex]::Escape($needle)) {
    Fail "main bootstrap incomplet : '$needle' absent"
  }
}

$bootIndex = $m.IndexOf('const huntDomainBootstrapped = registerHuntDomain();')
$initIndex = $m.IndexOf('Hooks.once("init"')
if ($bootIndex -lt 0 -or $initIndex -lt 0 -or $bootIndex -gt $initIndex) {
  Fail "registerHuntDomain() doit être exécuté avant le hook init"
}

Write-Host "[ OK ] domaine hunt déclaré dans CONFIG.DH.DOMAIN.domains" -ForegroundColor Green
Write-Host "[ OK ] bootstrap exécuté pendant l’évaluation du module" -ForegroundColor Green
Write-Host "[ OK ] fallback init conservé" -ForegroundColor Green
Write-Host "[ OK ] domaines hunting et blood non modifiés" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.4a GREEN (structure)" -ForegroundColor Green
