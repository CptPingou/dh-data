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
$path = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\expedition-foundry-items.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

$old = 'if (requestedQuantity == null && available > 1) {'
$new = 'if (available > 1 && (requestedQuantity == null || Number(requestedQuantity) >= available)) {'

if ($text.Contains($new)) {
  Pass "P2.10h.2d déjà appliqué"
  exit 0
}

if (-not $text.Contains($old)) {
  Fail "condition h.2c attendue introuvable. Aucun fichier modifié."
}

$text = $text.Replace($old, $new)

Set-Content -Path $path -Value $text -Encoding UTF8
Pass "P2.10h.2d appliqué à scripts\expedition-foundry-items.mjs"
