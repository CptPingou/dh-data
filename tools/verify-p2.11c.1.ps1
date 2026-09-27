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

$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
$bridge = Join-Path $SourceRoot "scripts\hunting-domain-card-bridge.mjs"
$main = Join-Path $SourceRoot "scripts\main.mjs"
$classPath = Join-Path $SourceRoot "data\homebrew\artificer\classes\artificer.json"
$armorerPath = Join-Path $SourceRoot "data\homebrew\artificer\subclasses\armorer.json"
$smithPath = Join-Path $SourceRoot "data\homebrew\artificer\subclasses\battle-smith.json"
$cardsPath = Join-Path $SourceRoot "data\homebrew\artificer\domains\artillery\domain-cards.json"

foreach ($path in @($pilot,$bridge,$main,$classPath,$armorerPath,$smithPath,$cardsPath)) {
  if (-not (Test-Path $path)) { Fail "fichier absent : $path" }
}

$class = Get-Content $classPath -Raw -Encoding UTF8 | ConvertFrom-Json
$armorer = Get-Content $armorerPath -Raw -Encoding UTF8 | ConvertFrom-Json
$smith = Get-Content $smithPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cards = Get-Content $cardsPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($class.kind -ne "class") { Fail "Artificier kind != class" }
if (@($class.domains).Count -ne 2 -or $class.domains[0] -ne "codex" -or $class.domains[1] -ne "artillery") {
  Fail "Artificier doit cibler Codex + Artillery"
}
if ($class.starting_evasion -ne 10 -or $class.starting_hit_points -ne 5) {
  Fail "stats de départ Artificier invalides"
}
if ($armorer.kind -ne "subclass" -or $smith.kind -ne "subclass") {
  Fail "sous-classes invalides"
}
if (@($armorer.features).Count -ne 3) { Fail "Armurier : 3 features attendues" }
if (@($smith.features).Count -ne 4) { Fail "Battle Smith : 4 features attendues" }
if (@($cards).Count -ne 9) { Fail "Artillery : 9 cartes attendues" }

$levels = @($cards | Group-Object level | Sort-Object Name)
$expected = @{ "1" = 3; "2" = 2; "3" = 2; "4" = 2 }
foreach ($group in $levels) {
  if (-not $expected.ContainsKey([string]$group.Name) -or $group.Count -ne $expected[[string]$group.Name]) {
    Fail "répartition niveaux Artillery invalide"
  }
}

$battle = @($cards | Where-Object { $_.id -eq "homebrew.artificer.domain-card.artillery.battle-rhythm" })
if ($battle.Count -ne 1 -or $battle[0].name -ne "Rythme de bataille") {
  Fail "correction Battle Rhythm absente"
}

$p = Get-Content $pilot -Raw -Encoding UTF8
$b = Get-Content $bridge -Raw -Encoding UTF8
$m = Get-Content $main -Raw -Encoding UTF8

foreach ($needle in @(
  'ensureArtilleryDomain',
  'importArtificerArtillery',
  'artificerArtilleryStatus',
  'ARTILLERY_CARD_SOURCE',
  'dh-features',
  'buildLinkedSourceFeature'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "pilot incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'registerArtilleryDomain',
  'Artillery domain registered'
)) {
  if ($b -notmatch [regex]::Escape($needle)) {
    Fail "bridge incomplet : '$needle' absent"
  }
}

foreach ($needle in @(
  'registerArtilleryDomain,',
  'const artilleryDomainBootstrapped = registerArtilleryDomain();',
  'domains?.artillery'
)) {
  if ($m -notmatch [regex]::Escape($needle)) {
    Fail "main incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] Artificier : Codex + Artillery, Evasion 10, HP 5" -ForegroundColor Green
Write-Host "[ OK ] Armurier : 3 paliers" -ForegroundColor Green
Write-Host "[ OK ] Battle Smith : 4 features" -ForegroundColor Green
Write-Host "[ OK ] Artillery : 9 cartes L1-L4" -ForegroundColor Green
Write-Host "[ OK ] Battle Rhythm corrigé" -ForegroundColor Green
Write-Host "[ OK ] bootstrap précoce Artillery" -ForegroundColor Green
Write-Host "[ OK ] import classe/sous-classes/features/cartes disponible" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.1 GREEN (source)" -ForegroundColor Green
