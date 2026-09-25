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
$path = Join-Path $SourceRoot "scripts\expedition-foundry-items.mjs"

if (-not (Test-Path $path)) {
  Fail "scripts\expedition-foundry-items.mjs absent"
}

$text = Get-Content $path -Raw -Encoding UTF8

if ($text -match 'Retour au personnage —') {
  Pass "P2.10h.2c déjà appliqué"
  exit 0
}

if ($text -notmatch 'async\s+unloadToActor\s*\(') {
  Fail "fonction unloadToActor introuvable"
}

$availablePattern = '(?m)^(\s*)const available = Math\.max\(1, Number\(entry\.quantity\) \|\| 1\);\s*$'
$qtyPattern = '(?m)^(\s*)const qty = quantity == null \? available : Math\.max\(1, Number\(quantity\) \|\| 1\);\s*$'

$availableMatch = [regex]::Match($text, $availablePattern)
$qtyMatch = [regex]::Match($text, $qtyPattern)

if (-not $availableMatch.Success) {
  Fail "ligne 'const available' attendue introuvable"
}

if (-not $qtyMatch.Success) {
  Fail "ligne 'const qty' attendue introuvable"
}

$indent = $availableMatch.Groups[1].Value

$insert = @"

${indent}let requestedQuantity = quantity;

${indent}if (requestedQuantity == null && available > 1) {
${indent}  const itemName = entry.itemRef?.name ?? "Objet";
${indent}  const DialogV2 = foundry?.applications?.api?.DialogV2;

${indent}  if (DialogV2?.prompt) {
${indent}    requestedQuantity = await DialogV2.prompt({
${indent}      window: {
${indent}        title: ``Retour au personnage — `${itemName}``,
${indent}      },
${indent}      content: ``
${indent}        <div class="form-group">
${indent}          <label>Quantité</label>
${indent}          <div class="form-fields">
${indent}            <input
${indent}              type="number"
${indent}              name="quantity"
${indent}              value="`${available}"
${indent}              min="1"
${indent}              max="`${available}"
${indent}              step="1"
${indent}              autofocus
${indent}            />
${indent}          </div>
${indent}          <p class="hint">Disponible dans le sac à dos : `${available}</p>
${indent}        </div>
${indent}      ``,
${indent}      ok: {
${indent}        label: "Rendre",
${indent}        callback: (_event, _button, dialog) => {
${indent}          const form = dialog?.element?.querySelector?.("form");
${indent}          const input =
${indent}            form?.elements?.quantity ??
${indent}            dialog?.element?.querySelector?.('[name="quantity"]');
${indent}          return Number(input?.value ?? available);
${indent}        },
${indent}      },
${indent}      rejectClose: false,
${indent}    });
${indent}  } else {
${indent}    const raw = window.prompt(
${indent}      ``Quantité de "`${itemName}" à rendre au personnage (1-`${available}) :``,
${indent}      String(available)
${indent}    );
${indent}    requestedQuantity = raw == null ? null : Number(raw);
${indent}  }

${indent}  if (requestedQuantity == null) {
${indent}    return { unloaded: false, cancelled: true, reason: "cancelled", manifest };
${indent}  }

${indent}  const parsedQuantity = Math.floor(Number(requestedQuantity));

${indent}  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
${indent}    ui.notifications?.warn("La quantité à rendre doit être supérieure à 0.");
${indent}    return { unloaded: false, cancelled: true, reason: "invalid-quantity", manifest };
${indent}  }

${indent}  requestedQuantity = Math.min(available, parsedQuantity);
${indent}}
"@

# Insert immediately after the available line.
$insertPos = $availableMatch.Index + $availableMatch.Length
$text = $text.Insert($insertPos, $insert)

# Recompute qty match after insertion, then replace just that line.
$qtyMatch2 = [regex]::Match($text, $qtyPattern)
if (-not $qtyMatch2.Success) {
  Fail "ligne 'const qty' perdue après insertion"
}

$qtyReplacement = @"
${indent}const qty =
${indent}  requestedQuantity == null
${indent}    ? available
${indent}    : Math.max(1, Number(requestedQuantity) || 1);
"@

$text = $text.Remove($qtyMatch2.Index, $qtyMatch2.Length).Insert($qtyMatch2.Index, $qtyReplacement.TrimEnd())

Set-Content -Path $path -Value $text -Encoding UTF8
Pass "P2.10h.2c appliqué à scripts\expedition-foundry-items.mjs"
