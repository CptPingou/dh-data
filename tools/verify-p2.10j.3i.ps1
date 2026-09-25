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
$path = Join-Path $SourceRoot "scripts\expedition-inventory-ux.mjs"

if (-not (Test-Path $path)) { Fail "expedition-inventory-ux.mjs absent" }

$text = Get-Content $path -Raw -Encoding UTF8

foreach ($needle in @(
  'actorFromContainerHolder',
  'resolveChatItem',
  'sendEntryToNativeChat',
  'new CONFIG.Item.documentClass',
  'await item.toChat(actorUuid)',
  'action === "consume"',
  'native consumable chat card failed'
)) {
  if ($text -notmatch [regex]::Escape($needle)) {
    Fail "j.3i incomplet : '$needle' absent"
  }
}

Pass "résolution actor du backpack présente"
Pass "fallback sourceId/snapshot présent"
Pass "appel natif Item.toChat(actorUuid) présent"
Pass "envoi chat branché avant consume"

Write-Host ""
Write-Host "P2.10j.3i GREEN (structure)" -ForegroundColor Green
