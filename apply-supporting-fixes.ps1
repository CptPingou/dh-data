param(
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Update-ExactText {
  param(
    [Parameter(Mandatory=$true)][string]$RelativePath,
    [Parameter(Mandatory=$true)][hashtable[]]$Replacements
  )

  $path = Join-Path $RepoRoot $RelativePath
  if (-not (Test-Path $path)) {
    Write-Host "[SKIP] $RelativePath absent" -ForegroundColor Yellow
    return
  }

  $content = Get-Content $path -Raw -Encoding UTF8
  $next = $content
  $changed = $false

  foreach ($r in $Replacements) {
    $old = [string]$r.Old
    $new = [string]$r.New
    if ($next.Contains($new)) {
      Write-Host "[OK]   $RelativePath déjà corrigé: $new" -ForegroundColor DarkGreen
      continue
    }
    if (-not $next.Contains($old)) {
      Write-Host "[WARN] motif attendu absent dans $RelativePath : $old" -ForegroundColor Yellow
      continue
    }
    $next = $next.Replace($old, $new)
    $changed = $true
    Write-Host "[PATCH] $RelativePath" -ForegroundColor Cyan
  }

  if ($changed) {
    Copy-Item $path "$path.bak-domain-assets-$stamp"
    Set-Content $path $next -Encoding UTF8 -NoNewline
    Write-Host "[SAVE] backup: $path.bak-domain-assets-$stamp" -ForegroundColor Green
  }
}

# Runtime domain registry bridge: src is the small SVG shown beside HOPE.
Update-ExactText -RelativePath 'scripts\hunting-domain-card-bridge.mjs' -Replacements @(
  @{
    Old = 'src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png"'
    New = 'src: "modules/daggerheart-campaign-toolkit/assets/icons/artillery.svg"'
  },
  @{
    Old = 'src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/hunt.png"'
    New = 'src: "modules/daggerheart-campaign-toolkit/assets/icons/hunt.svg"'
  }
)

# Blood registry icon, if this legacy registration is still present.
Update-ExactText -RelativePath 'scripts\main.mjs' -Replacements @(
  @{
    Old = 'src: "icons/svg/blood.svg"'
    New = 'src: "modules/daggerheart-campaign-toolkit/assets/icons/blood.svg"'
  }
)

Write-Host "`nSupporting registry fixes complete." -ForegroundColor Green
