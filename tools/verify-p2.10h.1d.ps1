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
  'refreshOpenExpeditionFromTransfer',
  'await api.expeditionManifest.load(expeditionId)',
  'app = await api.expeditionManifest.open(expeditionId)',
  'if ("manifest" in app) app.manifest = freshManifest',
  'app.render({ force: true })',
  'await refreshOpenExpeditionFromTransfer(api, manifest)'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "P2.10h.1d incomplet : '$needle' absent"
  }
}

Pass "refresh local à l'action présent"
Pass "manifest relu depuis le storage"
Pass "instance ouverte réhydratée puis rerender"

Write-Host ""
Write-Host "P2.10h.1d GREEN" -ForegroundColor Green
