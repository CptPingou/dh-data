param(
  [string]$SourceRoot = ""
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Pass([string]$Message) {
  Write-Host "[ OK ] $Message" -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$SourceRoot = (Resolve-Path $SourceRoot).Path
$bootstrap = Join-Path $SourceRoot "scripts\expedition-world-bootstrap.mjs"
$menu = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $bootstrap)) { Fail "expedition-world-bootstrap.mjs absent" }
if (-not (Test-Path $menu)) { Fail "item-backpack-menu.mjs absent" }

$menuText = Get-Content $menu -Raw -Encoding UTF8
if ($menuText -notmatch [regex]::Escape('import "./expedition-world-bootstrap.mjs";')) {
  Fail "item-backpack-menu.mjs ne charge pas expedition-world-bootstrap.mjs"
}
Pass "bootstrap chargé au démarrage"

$bootText = Get-Content $bootstrap -Raw -Encoding UTF8
foreach ($needle in @(
  'bootstrapWorldExpedition',
  'worldExpeditionStatus',
  'expeditionWorld.bootstrap',
  'expeditionWorld.status',
  'foundryActorUuid',
  'type: "backpack"',
  'scope: "personal"'
)) {
  if ($bootText -notmatch [regex]::Escape($needle)) {
    Fail "bootstrap incomplet : $needle absent"
  }
}
Pass "bootstrap World présent et complet"

Write-Host ""
Write-Host "P2.10g GREEN" -ForegroundColor Green
