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
$scriptsRoot = Join-Path $SourceRoot "scripts"
$menuPath = Join-Path $scriptsRoot "item-backpack-menu.mjs"

if (-not (Test-Path $menuPath)) {
  Fail "scripts\item-backpack-menu.mjs absent"
}

$files = Get-ChildItem $scriptsRoot -Filter "*.mjs" -File
$itemFiles = @(
  $files | Where-Object {
    (Get-Content $_.FullName -Raw -Encoding UTF8) -match 'async\s+unloadToActor\s*\('
  }
)

if ($itemFiles.Count -ne 1) {
  Fail "impossible d'identifier un unique fichier unloadToActor (trouvé: $($itemFiles.Count))"
}

$itemPath = $itemFiles[0].FullName

# ---------------------------------------------------------------------------
# 1. Actor -> Backpack UI : keep technical reason, show clean user message
# ---------------------------------------------------------------------------

$menu = Get-Content $menuPath -Raw -Encoding UTF8

if ($menu -notmatch 'expeditionErrorMessage') {
  $importLine = 'import { expeditionErrorMessage } from "./expedition-errors.mjs";' + "`r`n"
  $menu = $importLine + $menu
}

if ($menu -notmatch 'let transferFailureReason = null;') {
  $tryMarker = '  try {' + "`r`n" + '    const result = await api.expeditionItems.loadFromActor(manifest, {'
  if (-not $menu.Contains($tryMarker)) {
    $tryMarker = '  try {' + "`n" + '    const result = await api.expeditionItems.loadFromActor(manifest, {'
  }

  if (-not $menu.Contains($tryMarker)) {
    Fail "appel loadFromActor attendu introuvable dans item-backpack-menu.mjs"
  }

  $replacement = '  let transferFailureReason = null;' + "`r`n`r`n" +
    '  try {' + "`r`n" +
    '    const result = await api.expeditionItems.loadFromActor(manifest, {'
  $menu = $menu.Replace($tryMarker, $replacement)
}

$oldFailure = @'
    if (!result?.loaded) {
      throw new Error(result?.reason ?? "loadFromActor did not confirm the transfer.");
    }
'@

$newFailure = @'
    if (!result?.loaded) {
      transferFailureReason = result?.reason ?? "loadFromActor did not confirm the transfer.";
      throw new Error(transferFailureReason);
    }
'@

if ($menu.Contains($oldFailure)) {
  $menu = $menu.Replace($oldFailure, $newFailure)
}
elseif ($menu -notmatch 'transferFailureReason = result\?\.reason') {
  Fail "bloc d'échec loadFromActor attendu introuvable"
}

$oldCatch = '    ui.notifications?.error(`Impossible de mettre ${item.name} dans le sac à dos.`);'
$newCatch = @'
    ui.notifications?.error(
      expeditionErrorMessage(transferFailureReason ?? error?.message, {
        itemName: item.name,
        containerName: backpack?.name ?? "le sac à dos",
        actorName: actor.name,
      })
    );
'@

if ($menu.Contains($oldCatch)) {
  $menu = $menu.Replace($oldCatch, $newCatch.TrimEnd())
}
elseif ($menu -notmatch 'containerName: backpack\?\.name') {
  Fail "notification Actor -> Backpack attendue introuvable"
}

Set-Content -Path $menuPath -Value $menu -Encoding UTF8
Pass "messages Actor -> Backpack centralisés"

# ---------------------------------------------------------------------------
# 2. unloadToActor API : add userMessage to technical failures
# ---------------------------------------------------------------------------

$item = Get-Content $itemPath -Raw -Encoding UTF8

if ($item -notmatch 'withExpeditionUserMessage') {
  $importLine = 'import { withExpeditionUserMessage } from "./expedition-errors.mjs";' + "`r`n"
  $item = $importLine + $item
}

$replacements = @{
  'return { unloaded: false, reason: "container-holder-actor-not-found", manifest };' =
    'return withExpeditionUserMessage({ unloaded: false, reason: "container-holder-actor-not-found", manifest }, { containerName: container?.name ?? "le sac à dos" });'

  'return { unloaded: false, reason: "entry-not-found", manifest };' =
    'return withExpeditionUserMessage({ unloaded: false, reason: "entry-not-found", manifest }, { containerName: container?.name ?? "le sac à dos" });'

  'return { unloaded: false, reason: "quantity-exceeds-entry", manifest };' =
    'return withExpeditionUserMessage({ unloaded: false, reason: "quantity-exceeds-entry", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });'

  'return { unloaded: false, reason: "foundry-item-not-resolved", manifest };' =
    'return withExpeditionUserMessage({ unloaded: false, reason: "foundry-item-not-resolved", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });'

  'return { unloaded: false, reason: "actor-item-create-failed", manifest };' =
    'return withExpeditionUserMessage({ unloaded: false, reason: "actor-item-create-failed", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });'
}

foreach ($key in $replacements.Keys) {
  if ($item.Contains($key)) {
    $item = $item.Replace($key, $replacements[$key])
  }
}

# Patch manifest-remove-failed return whether h.3 is present or not.
$pattern = 'return \{ unloaded: false, reason: removal\.reason \?\? "manifest-remove-failed", manifest \};'
if ($item -match $pattern) {
  $replacement = 'return withExpeditionUserMessage({ unloaded: false, reason: removal.reason ?? "manifest-remove-failed", manifest }, { itemName: entry?.itemRef?.name ?? "cet objet", containerName: container?.name ?? "le sac à dos", actorName: actor?.name ?? "le personnage" });'
  $item = [regex]::Replace($item, $pattern, $replacement)
}

Set-Content -Path $itemPath -Value $item -Encoding UTF8
Pass "userMessage ajouté aux erreurs unloadToActor"

Write-Host ""
Write-Host "P2.10h.4 patch appliqué" -ForegroundColor Green
