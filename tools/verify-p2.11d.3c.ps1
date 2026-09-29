param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$runtime = Join-Path $SourceRoot "scripts\artificer-infusion-runtime.mjs"
$test = Join-Path $SourceRoot "tools\test-p2.11d.3c.mjs"
if (-not (Test-Path $runtime) -or -not (Test-Path $test)) { throw "Fichiers P2.11d.3c absents." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js requis." }
& node --check $runtime
if ($LASTEXITCODE -ne 0) { throw "Syntaxe JS invalide." }
& node $test
if ($LASTEXITCODE -ne 0) { throw "Tests P2.11d.3c echoues." }
Write-Host 'P2.11d.3c GREEN (source + tests isoles)' -ForegroundColor Green
