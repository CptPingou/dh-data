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

if (-not (Test-Path $scriptsRoot)) {
  Fail "dossier scripts absent"
}

$files = Get-ChildItem $scriptsRoot -Filter "*.mjs" -File

$manifestFiles = @(
  $files | Where-Object {
    (Get-Content $_.FullName -Raw -Encoding UTF8) -match 'function\s+acquireExpeditionEntry\s*\('
  }
)

$itemFiles = @(
  $files | Where-Object {
    (Get-Content $_.FullName -Raw -Encoding UTF8) -match 'async\s+unloadToActor\s*\('
  }
)

if ($manifestFiles.Count -ne 1) {
  Fail "impossible d'identifier un unique fichier acquireExpeditionEntry (trouvé: $($manifestFiles.Count))"
}

if ($itemFiles.Count -ne 1) {
  Fail "impossible d'identifier un unique fichier unloadToActor (trouvé: $($itemFiles.Count))"
}

$manifestPath = $manifestFiles[0].FullName
$itemPath = $itemFiles[0].FullName

# ---------------------------------------------------------------------------
# A. Backpack stack merge — idempotent
# ---------------------------------------------------------------------------

$manifestText = Get-Content $manifestPath -Raw -Encoding UTF8

if ($manifestText -match 'P2\.10h\.3 backpack stack merge') {
  Pass "fusion backpack déjà présente"
}
else {
  $marker = '  // Reuse the same capacity/rule preflight as transfers by staging a temporary source.'

  if (-not $manifestText.Contains($marker)) {
    Fail "marqueur de preflight acquireExpeditionEntry introuvable"
  }

  $insert = @'
  // P2.10h.3 backpack stack merge
  const stackSnapshotKey = (itemRef) => {
    const snapshot = itemRef?.snapshot;
    if (!snapshot || typeof snapshot !== "object") return null;

    const normalized = clone(snapshot);
    delete normalized._id;
    delete normalized._stats;
    delete normalized.sort;
    delete normalized.folder;

    if (normalized.system && typeof normalized.system === "object") {
      if (Object.prototype.hasOwnProperty.call(normalized.system, "quantity")) {
        delete normalized.system.quantity;
      }
      if (Object.prototype.hasOwnProperty.call(normalized.system, "amount")) {
        delete normalized.system.amount;
      }
    }

    return JSON.stringify(normalized);
  };

  const candidateStackKey = stackSnapshotKey(candidate.itemRef);
  const existingStack =
    candidateStackKey == null
      ? null
      : (container.contents ?? []).find((existing) => {
          if (existing?.itemRef?.sourceId !== candidate.itemRef?.sourceId) return false;
          return stackSnapshotKey(existing.itemRef) === candidateStackKey;
        });

  if (existingStack) {
    existingStack.quantity =
      Math.max(1, Number(existingStack.quantity) || 1) + qty;

    manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

    const ledgerEvent = appendExpeditionLedgerEvent(manifest, {
      kind: "acquired",
      entryId: existingStack.entryId,
      itemRef: existingStack.itemRef,
      quantity: qty,
      toContainerId: containerId,
      note,
    });

    return {
      acquired: true,
      merged: true,
      entry: existingStack,
      ledgerEvent,
      manifest,
    };
  }

'@

  $manifestText = $manifestText.Replace($marker, $insert + $marker)
  Set-Content -Path $manifestPath -Value $manifestText -Encoding UTF8
  Pass "fusion backpack ajoutée"
}

# ---------------------------------------------------------------------------
# B. Actor stack merge — regex robuste
# ---------------------------------------------------------------------------

$itemText = Get-Content $itemPath -Raw -Encoding UTF8

if ($itemText -match 'P2\.10h\.3 actor stack merge') {
  Pass "fusion Actor déjà présente"
}
else {
  $pattern = '(?ms)^(\s*)const \[created\] = await actor\.createEmbeddedDocuments\("Item", \[data\]\);\s*\r?\n\1if \(!created\) return \{ unloaded: false, reason: "actor-item-create-failed", manifest \};\s*\r?\n\1const removal = expeditionManifestApi\.extract\(manifest, \{ containerId, entryId, quantity: qty \}\);\s*\r?\n\1if \(!removal\.changed\) \{\s*\r?\n\1\s+await created\.delete\(\);\s*\r?\n\1\s+return \{ unloaded: false, reason: removal\.reason \?\? "manifest-remove-failed", manifest \};\s*\r?\n\1\}'

  $match = [regex]::Match($itemText, $pattern)

  if (-not $match.Success) {
    Fail "séquence createEmbeddedDocuments/extract introuvable dans unloadToActor"
  }

  $indent = $match.Groups[1].Value

  $replacement = @"
${indent}// P2.10h.3 actor stack merge
${indent}const actorStackKey = (itemData) => {
${indent}  if (!itemData || typeof itemData !== "object") return null;

${indent}  const normalized = clone(itemData);
${indent}  delete normalized._id;
${indent}  delete normalized._stats;
${indent}  delete normalized.sort;
${indent}  delete normalized.folder;

${indent}  if (normalized.system && typeof normalized.system === "object") {
${indent}    if (Object.prototype.hasOwnProperty.call(normalized.system, "quantity")) {
${indent}      delete normalized.system.quantity;
${indent}    }
${indent}    if (Object.prototype.hasOwnProperty.call(normalized.system, "amount")) {
${indent}      delete normalized.system.amount;
${indent}    }
${indent}  }

${indent}  return JSON.stringify(normalized);
${indent}};

${indent}const desiredStackKey = actorStackKey(data);
${indent}const existingActorItem =
${indent}  desiredStackKey == null
${indent}    ? null
${indent}    : actor.items?.find?.((candidate) => {
${indent}        const candidateData = candidate?.toObject?.();
${indent}        return actorStackKey(candidateData) === desiredStackKey;
${indent}      }) ?? null;

${indent}let created = null;
${indent}let mergedActorItem = null;
${indent}let previousActorQuantity = null;
${indent}let actorQuantityPath = null;

${indent}if (existingActorItem) {
${indent}  const system = existingActorItem.system ?? {};

${indent}  if (Object.prototype.hasOwnProperty.call(system, "quantity")) {
${indent}    actorQuantityPath = "system.quantity";
${indent}    previousActorQuantity = Math.max(1, Number(system.quantity) || 1);
${indent}  } else if (Object.prototype.hasOwnProperty.call(system, "amount")) {
${indent}    actorQuantityPath = "system.amount";
${indent}    previousActorQuantity = Math.max(1, Number(system.amount) || 1);
${indent}  }

${indent}  if (actorQuantityPath) {
${indent}    await existingActorItem.update({
${indent}      [actorQuantityPath]: previousActorQuantity + qty,
${indent}    });
${indent}    mergedActorItem = existingActorItem;
${indent}  }
${indent}}

${indent}if (!mergedActorItem) {
${indent}  [created] = await actor.createEmbeddedDocuments("Item", [data]);
${indent}  if (!created) return { unloaded: false, reason: "actor-item-create-failed", manifest };
${indent}}

${indent}const removal = expeditionManifestApi.extract(manifest, { containerId, entryId, quantity: qty });
${indent}if (!removal.changed) {
${indent}  if (created) {
${indent}    await created.delete();
${indent}  } else if (mergedActorItem && actorQuantityPath && previousActorQuantity != null) {
${indent}    await mergedActorItem.update({
${indent}      [actorQuantityPath]: previousActorQuantity,
${indent}    });
${indent}  }

${indent}  return { unloaded: false, reason: removal.reason ?? "manifest-remove-failed", manifest };
${indent}}
"@

  $itemText = $itemText.Remove($match.Index, $match.Length).Insert($match.Index, $replacement.TrimEnd())

  $returnPattern = 'return\s+\{\s*unloaded:\s*true,\s*actorId:\s*actor\.id,\s*createdItemId:\s*created\.id,\s*removal,\s*ledgerEvent,\s*manifest\s*\};'
  $returnMatch = [regex]::Match($itemText, $returnPattern)

  if (-not $returnMatch.Success) {
    Fail "return final unloadToActor attendu introuvable"
  }

  $returnReplacement = @"
return {
        unloaded: true,
        actorId: actor.id,
        createdItemId: created?.id ?? null,
        mergedItemId: mergedActorItem?.id ?? null,
        merged: Boolean(mergedActorItem),
        removal,
        ledgerEvent,
        manifest,
      };
"@

  $itemText = $itemText.Remove($returnMatch.Index, $returnMatch.Length).Insert($returnMatch.Index, $returnReplacement.TrimEnd())
  Set-Content -Path $itemPath -Value $itemText -Encoding UTF8
  Pass "fusion Actor ajoutée"
}

Write-Host ""
Write-Host "P2.10h.3b patch appliqué" -ForegroundColor Green
