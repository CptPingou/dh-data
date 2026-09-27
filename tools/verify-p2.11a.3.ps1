param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
$tool = Join-Path $SourceRoot "tools\audit-p2.11a.3-hunt.py"

if (-not (Test-Path $tool)) { Fail "audit-p2.11a.3-hunt.py absent" }

python $tool --root $SourceRoot
if ($LASTEXITCODE -ne 0) { Fail "audit P2.11a.3 en échec" }

$report = Join-Path $SourceRoot "reports\p2.11a.3-hunt-audit\hunt-audit.json"
if (-not (Test-Path $report)) { Fail "rapport JSON absent" }

$data = Get-Content $report -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($data).Count -ne 17) { Fail "17 cartes attendues, $(@($data).Count) trouvées" }

$wrongDomain = @($data | Where-Object { $_.domain -ne "hunt" })
if ($wrongDomain.Count -gt 0) {
  Fail "$($wrongDomain.Count) carte(s) ne sont pas dans hunt"
}

Write-Host "[ OK ] 17 cartes auditées" -ForegroundColor Green
Write-Host "[ OK ] 17/17 dans hunt" -ForegroundColor Green
Write-Host "[ OK ] rapports JSON/CSV/MD générés" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11a.3 GREEN" -ForegroundColor Green
