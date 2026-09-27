param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path

$source = Join-Path $SourceRoot "data\homebrew\monster-hunter\dh-domain-cards.json"
$importer = Join-Path $SourceRoot "scripts\pilot-import.mjs"

if (-not (Test-Path $source)) { Fail "source Monster Hunter absente" }
if (-not (Test-Path $importer)) { Fail "pilot-import.mjs absent" }

$cards = Get-Content $source -Raw -Encoding UTF8 | ConvertFrom-Json
$wanted = @(
  "Appui défensif","Conversion","Couverture","Cuistot","Diversion","Extracteur",
  "Feinte d’approche","Frappe d’épuisement","Frappe de rupture","Frappe mutilante",
  "Guidage du finisher","Naturaliste","Ouverture","Ouverture précise","Provocation",
  "Tacticien","Traqueur"
)

$matched = @($cards | Where-Object { $wanted -contains $_.name -or ($_.name -eq "Guidage du Finisher") })
if ($matched.Count -ne 17) { Fail "17 cartes attendues, $($matched.Count) trouvées" }

foreach ($card in $matched) {
  $roles = $card.flags.'daggerheart-campaign-toolkit'.huntingCardRoles
  if ($null -eq $roles) { Fail "huntingCardRoles absent: $($card.name)" }
  if ($roles.schemaVersion -ne 1) { Fail "schemaVersion invalide: $($card.name)" }
}

$i = Get-Content $importer -Raw -Encoding UTF8
foreach ($needle in @(
  'HUNT_CARD_ROLE_CONTRACT',
  'normalizeHuntCardRoles',
  'huntCardRoleStatus',
  'combatRole: "opener"',
  'huntRole: "tracking"'
)) {
  if ($i -notmatch [regex]::Escape($needle)) {
    Fail "runtime P2.11a.4 incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] 17 cartes avec huntingCardRoles" -ForegroundColor Green
Write-Host "[ OK ] double axe combatRole / huntRole" -ForegroundColor Green
Write-Host "[ OK ] runtime status disponible" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.4 GREEN (source)" -ForegroundColor Green
