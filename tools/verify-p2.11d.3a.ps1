param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$p = Join-Path $SourceRoot "scripts\artificer-infusion-runtime.mjs"
if (-not (Test-Path $p)) { throw "Runtime Infusions introuvable : $p" }
$s = Get-Content $p -Raw -Encoding UTF8
foreach ($t in @('[[9, 10], [7, 8], [5, 6], [3, 4], [1, 2]]','const FLAG = "artificerInfusions"','async function add(actor, itemId)','async function remove(actor, infusionId)','function newest(actor)','async function clearAtLongRest(actor, { confirmed = false } = {})','export const artificerInfusionApi')) {
  if (-not $s.Contains($t)) { throw "Contrat manquant : $t" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node est requis pour node --check." }
& node --check $p
if ($LASTEXITCODE -ne 0) { throw "Syntaxe JS invalide." }
Write-Host 'P2.11d.3a GREEN (source)' -ForegroundColor Green
