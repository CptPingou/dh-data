param(
  [string]$Repo = "E:\Dev\DH Data",
  [string]$Module = "E:\FoundryvttDataV14\Data\modules\daggerheart-campaign-toolkit"
)

$ErrorActionPreference = "Stop"

function Remove-IfExists([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "REMOVED $Path"
  } else {
    Write-Host "ABSENT  $Path"
  }
}

Write-Host "=== Repo generated residues ==="
Remove-IfExists (Join-Path $Repo "--help")
Remove-IfExists (Join-Path $Repo "hf-extraction-diagnostic.txt")
Remove-IfExists (Join-Path $Repo "tmp")

Write-Host "=== Foundry deployment residues ==="
Remove-IfExists (Join-Path $Module ".git")
Remove-IfExists (Join-Path $Module "docs\ChatGPT Image 10 sept. 2026, 11_45_47.png")
Remove-IfExists (Join-Path $Module "docs\ChatGPT Image 10 sept. 2026, 12_04_16.png")

Write-Host "=== Preserved on purpose ==="
Write-Host "KEEP data\srd-2.0            (still referenced by extraction/audit tools and provenance)"
Write-Host "KEEP data\hope-fear-private  (still referenced by campaign-frame/census tools)"
Write-Host "KEEP scripts\full-import.mjs and pilot-import.mjs (still imported by runtime API)"
Write-Host "KEEP native-fr scripts       (still imported by main/pilot runtime)"

Write-Host "=== Git status ==="
git -C $Repo status --short
