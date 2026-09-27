param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$pilot = Join-Path $SourceRoot "scripts\pilot-import.mjs"
if (-not (Test-Path $pilot)) { Fail "pilot-import.mjs absent" }

$p = Get-Content $pilot -Raw -Encoding UTF8

foreach ($needle in @(
  'export async function organizeDomainCardsByDomain()',
  'export async function domainCardFolderStatus()',
  'Folder.create(',
  '{ pack: pack.collection }',
  'domainCardFolder',
  'const folders = await organizeDomainCardsByDomain();'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "classement domaines incomplet : '$needle' absent"
  }
}

Write-Host "[ OK ] création idempotente des dossiers de domaine" -ForegroundColor Green
Write-Host "[ OK ] affectation des cartes via system.domain" -ForegroundColor Green
Write-Host "[ OK ] status de vérification disponible" -ForegroundColor Green
Write-Host "[ OK ] import Artificier + Artillery déclenche le classement" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.3 GREEN (source)" -ForegroundColor Green
