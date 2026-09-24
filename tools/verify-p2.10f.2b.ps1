param(
  [string]$SourceRoot = "",
  [string]$FoundryRoot = ""
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Pass([string]$Message) {
  Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Info([string]$Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

try {
  $SourceRoot = (Resolve-Path $SourceRoot).Path
} catch {
  Fail "Dépôt source introuvable : $SourceRoot"
}

Pass "DH Data détecté : $SourceRoot"

if ([string]::IsNullOrWhiteSpace($FoundryRoot)) {
  if (-not [string]::IsNullOrWhiteSpace($env:DH_FOUNDRY_MODULE)) {
    $FoundryRoot = $env:DH_FOUNDRY_MODULE
  } else {
    $candidates = @(
      (Join-Path $env:USERPROFILE "Espace de Travail\Foundryvtt_V14\Data\modules\daggerheart-campaign-toolkit"),
      (Join-Path $env:USERPROFILE "Foundryvtt_V14\Data\modules\daggerheart-campaign-toolkit"),
      "E:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit",
      "C:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit"
    )

    $FoundryRoot = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  }
}

if (-not [string]::IsNullOrWhiteSpace($FoundryRoot)) {
  try {
    $FoundryRoot = (Resolve-Path $FoundryRoot).Path
    Pass "Module Foundry détecté : $FoundryRoot"
  } catch {
    Info "Module Foundry non trouvé : $FoundryRoot"
    $FoundryRoot = ""
  }
} else {
  Info "Module Foundry non détecté. Contrôle source uniquement."
}

$sourceMain = Join-Path $SourceRoot "scripts\main.mjs"
$sourceHook = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $sourceMain)) { Fail "Source absente : $sourceMain" }
if (-not (Test-Path $sourceHook)) { Fail "Source absente : $sourceHook" }

$importLine = 'import "./item-backpack-menu.mjs";'
$sourceMainText = Get-Content $sourceMain -Raw -Encoding UTF8

if ($sourceMainText -notmatch [regex]::Escape($importLine)) {
  Fail "scripts\main.mjs n'importe pas item-backpack-menu.mjs"
}
Pass "main.mjs charge item-backpack-menu.mjs au démarrage"

$hookText = Get-Content $sourceHook -Raw -Encoding UTF8

foreach ($needle in @(
  '_getContextMenuCommonOptions',
  'Mettre dans le sac à dos',
  'Hooks.once("ready"',
  'expeditionItems.loadFromActor'
)) {
  if ($hookText -notmatch [regex]::Escape($needle)) {
    Fail "Hook incomplet : '$needle' absent de scripts\item-backpack-menu.mjs"
  }
}

Pass "hook sac à dos présent et complet dans DH Data"

if (-not [string]::IsNullOrWhiteSpace($FoundryRoot)) {
  $foundryMain = Join-Path $FoundryRoot "scripts\main.mjs"
  $foundryHook = Join-Path $FoundryRoot "scripts\item-backpack-menu.mjs"

  if (-not (Test-Path $foundryMain)) {
    Fail "Copie Foundry absente : $foundryMain"
  }

  if (-not (Test-Path $foundryHook)) {
    Fail "Copie Foundry absente : $foundryHook"
  }

  $foundryMainText = Get-Content $foundryMain -Raw -Encoding UTF8

  if ($foundryMainText -notmatch [regex]::Escape($importLine)) {
    Fail "La copie Foundry ne charge pas item-backpack-menu.mjs"
  }

  $sourceHash = (Get-FileHash $sourceHook -Algorithm SHA256).Hash
  $foundryHash = (Get-FileHash $foundryHook -Algorithm SHA256).Hash

  if ($sourceHash -ne $foundryHash) {
    Fail "La copie Foundry de item-backpack-menu.mjs diffère de DH Data"
  }

  Pass "copie Foundry synchronisée avec DH Data"
}

Write-Host ""
Write-Host "P2.10f.2b GREEN" -ForegroundColor Green
