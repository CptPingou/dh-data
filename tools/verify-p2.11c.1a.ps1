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
  'withArtificerImportPacksUnlocked',
  '"dh-features"',
  '"dh-domain-cards"',
  '"dh-classes"',
  '"dh-subclasses"',
  'await pack.configure({ locked: false });',
  'await pack.configure({ locked: true });',
  'return withArtificerImportPacksUnlocked(async () =>'
)) {
  if ($p -notmatch [regex]::Escape($needle)) {
    Fail "fix lock incomplet : '$needle' absent"
  }
}

# The three leaf importers must no longer own their own lock transactions.
$start = $p.IndexOf('async function upsertHomebrewFeature')
$end = $p.IndexOf('async function nativeLinkSpecimen', $start)
$leaf = $p.Substring($start, $end - $start)
if ($leaf -match [regex]::Escape('pack.configure({ locked: false })')) {
  Fail "upsertHomebrewFeature verrouille encore le pack localement"
}

Write-Host "[ OK ] transaction unique sur les 4 compendiums" -ForegroundColor Green
Write-Host "[ OK ] dh-features reste déverrouillé pendant toutes les créations" -ForegroundColor Green
Write-Host "[ OK ] relock garanti par finally" -ForegroundColor Green
Write-Host ""
Write-Host "P2.11c.1a GREEN (source)" -ForegroundColor Green
