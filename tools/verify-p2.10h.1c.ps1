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
$path = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\item-backpack-menu.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'refreshExpeditionWindows(api, manifest)',
  'api?.expeditionManifest?.open',
  'await api.expeditionManifest.open(expeditionId)',
  'app.close',
  'quantity <= 0'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1c incomplet : '$needle' absent"
  }
}

Pass "quantité 0 toujours refusée"
Pass "reopen réel de la fenêtre d'expédition présent"

Write-Host ""
Write-Host "P2.10h.1c GREEN" -ForegroundColor Green
