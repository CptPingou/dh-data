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

$archivePath = Join-Path $SourceRoot "scripts\expedition-item-archive.mjs"
$itemsPath = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $archivePath)) { Fail "expedition-item-archive.mjs absent" }
if (-not (Test-Path $itemsPath)) { Fail "expedition-foundry-items.mjs absent" }

$archive = Get-Content $archivePath -Raw -Encoding UTF8
$items = Get-Content $itemsPath -Raw -Encoding UTF8

foreach ($needle in @(
  'archiveTerminalExpeditionItems',
  'listArchivedExpeditionItems',
  'purgeArchivedExpeditionItems',
  'expeditionItemArchive',
  'archivedAt',
  'fromContainerId'
)) {
  if ($archive -notmatch [regex]::Escape($needle)) {
    Fail "archive lifecycle incomplète : '$needle' absent"
  }
}

foreach ($needle in @(
  'version: 8',
  'listArchive(manifest)',
  'archiveTerminal(manifest',
  'purgeArchive(manifest',
  'archive: {'
)) {
  if ($items -notmatch [regex]::Escape($needle)) {
    Fail "API archive incomplète : '$needle' absent"
  }
}

Pass "archive terminale présente"
Pass "purge explicite présente"
Pass "API expeditionItems v8 présente"
Pass "scanLifecycle expose un résumé archive"

Write-Host ""
Write-Host "P2.10i.3 GREEN (structure)" -ForegroundColor Green
