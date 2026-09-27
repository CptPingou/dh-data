param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$path = Join-Path $SourceRoot "data\homebrew\artificer\classes\artificer.json"
if (-not (Test-Path $path)) { Fail "artificer.json absent" }

$d = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json

if ($d.hope_feature.integration_status -ne "text-only") {
  Fail "Deus Ex Machina doit rester text-only"
}

$magic = @($d.features | Where-Object { $_.name_original -eq "Magical Tinkering" })[0]
if (-not $magic -or $magic.integration.status -ne "text-only") {
  Fail "Magical Tinkering doit rester text-only"
}

$infusions = @($d.features | Where-Object { $_.name_original -eq "Artificer Infusions" })[0]
if (-not $infusions -or $infusions.integration.status -ne "deferred-p2.11d.3") {
  Fail "Infusions doit etre differe vers P2.11d.3"
}

$capacity = $infusions.integration.known_contract.capacity_by_level
if (
  $capacity.'1' -ne 2 -or
  $capacity.'3' -ne 4 -or
  $capacity.'5' -ne 6 -or
  $capacity.'7' -ne 8 -or
  $capacity.'9' -ne 10
) {
  Fail "progression du nombre d'infusions incorrecte"
}

if ($infusions.integration.unknown_contract -notcontains "infusion-bonus-list") {
  Fail "lacune source sur les bonus d'infusion non tracee"
}

$audit = $d.integration.feature_audit
if ($audit.version -ne "P2.11d.2") { Fail "audit version absent" }

$arcane = @($audit.unsupported_features | Where-Object { $_.name -eq "Arcane Jolt" })[0]
if (-not $arcane -or $arcane.status -ne "not-in-current-artificer-source") {
  Fail "Arcane Jolt doit etre explicitement hors source"
}

Write-Host "[ OK ] Deus Ex Machina -> text-only" -ForegroundColor Green
Write-Host "[ OK ] Bricolage magique -> text-only" -ForegroundColor Green
Write-Host "[ OK ] Infusions -> P2.11d.3" -ForegroundColor Green
Write-Host "[ OK ] contrat connu des Infusions trace sans inventer les bonus" -ForegroundColor Green
Write-Host "[ OK ] Arcane Jolt retire de la roadmap faute de source" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11d.2 GREEN (source)" -ForegroundColor Green
