param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$path = Join-Path $SourceRoot 'scripts\artificer-rest-diagnostic.mjs'
if (-not (Test-Path $path)) { throw 'Sonde absente' }
$source = Get-Content $path -Raw -Encoding UTF8
foreach ($token in @('preUpdateActor', 'updateActor', 'createChatMessage', 'updateChatMessage', 'stop()', 'summary()')) {
  if (-not $source.Contains($token)) { throw "Sonde incomplète: $token" }
}
if ($source -match 'game\.settings\.set|clearForRecipientAtLongRest|\.delete\(') { throw 'Sonde potentiellement destructive' }
& node --check $path
if ($LASTEXITCODE -ne 0) { throw 'Node syntax KO' }
Write-Host 'P2.11d.3f.0 GREEN (sonde source non destructive)' -ForegroundColor Green
