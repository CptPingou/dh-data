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

$uxPath = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"
$menuPath = Join-Path $SourceRoot "scripts\item-backpack-menu.mjs"

if (-not (Test-Path $uxPath)) { Fail "expedition-inventory-ux.mjs absent" }
if (-not (Test-Path $menuPath)) { Fail "item-backpack-menu.mjs absent" }

$ux = Get-Content $uxPath -Raw -Encoding UTF8
$menu = Get-Content $menuPath -Raw -Encoding UTF8

foreach ($needle in @(
  'const SOCKET_CHANNEL = `module.${MODULE_ID}`',
  'SOCKET_BACKPACK_ACCESS',
  'broadcastBackpackAccessChange',
  'refreshExpeditionFromRemoteChange',
  'installExpeditionSocketSync',
  'game.socket.emit',
  'game.socket.on',
  'sourceUserId',
  'await reopenExpeditionDialog(api, fresh)'
)) {
  if ($ux -notmatch [regex]::Escape($needle)) {
    Fail "j.6c incomplet : '$needle' absent"
  }
}

if ($menu -notmatch [regex]::Escape('container?.presentation?.accessState === "stored"')) {
  Fail "garde d'accès au sac déposé absente du menu Actor"
}

Write-Host "[ OK ] socket module installé" -ForegroundColor Green
Write-Host "[ OK ] changement MJ diffusé aux autres clients" -ForegroundColor Green
Write-Host "[ OK ] manifest rechargé côté joueur" -ForegroundColor Green
Write-Host "[ OK ] fenêtre joueur reconstruite si ouverte" -ForegroundColor Green
Write-Host "[ OK ] Actor -> sac déposé reste interdit côté joueur" -ForegroundColor Green
Write-Host ""
Write-Host "P2.10j.6c GREEN (structure)" -ForegroundColor Green
