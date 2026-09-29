param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path
$r = Join-Path $SourceRoot 'scripts\artificer-infusion-runtime.mjs'
$t = Join-Path $SourceRoot 'tools\test-p2.11d.3e.mjs'
if (-not (Test-Path $r) -or -not (Test-Path $t)) { throw 'Fichiers P2.11d.3e absents' }
$source = Get-Content $r -Raw -Encoding UTF8
foreach ($part in @('scope: "world"', 'clearForRecipientAtLongRest', 'processedIncidentKeys', 'incidentKey', 'resolveCriticalDamage', 'startNewSession', 'version: "P2.11d.3e"')) {
  if (-not $source.Contains($part)) { throw "Contrat manquant : $part" }
}
& node --check $r
if ($LASTEXITCODE -ne 0) { throw 'Erreur de syntaxe Node' }
& node $t
if ($LASTEXITCODE -ne 0) { throw 'Tests isolés KO' }
Write-Host 'P2.11d.3e GREEN (source)' -ForegroundColor Green
