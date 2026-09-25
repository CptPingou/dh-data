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
  Fail "impossible d'identifier un unique fichier contenant acquireExpeditionEntry (trouvé: $($manifestFiles.Count))"
}

if ($itemFiles.Count -ne 1) {
  Fail "impossible d'identifier un unique fichier contenant unloadToActor (trouvé: $($itemFiles.Count))"
}

$manifestPath = $manifestFiles[0].FullName
$itemPath = $itemFiles[0].FullName

# ---------------------------------------------------------------------------
# A. Backpack stack merge
# ---------------------------------------------------------------------------

$manifestText = Get-Content $manifestPath -Raw -Encoding UTF8

if ($manifestText -notmatch 'P2\.10h\.3 backpack stack merge') {
  $marker = '  // Reuse the same capacity/rule preflight as transfers by staging a temporary source.'

  if (-not $manifestText.Contains($marker)) {
    Fail "marqueur de preflight acquireExpeditionEntry introuvable"
  }

  $insert = @'
  // P2.10h.3 backpack stack merge
  // Merge only when both entries carry snapshots and their mechanical data
  // are identical once volatile identity/quantity fields are removed.
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
  Pass "fusion de stack backpack ajoutée : $($manifestFiles[0].Name)"
} else {
  Pass "fusion de stack backpack déjà présente"
}

# ---------------------------------------------------------------------------
# B. Actor stack merge on unload
# ---------------------------------------------------------------------------

$itemText = Get-Content $itemPath -Raw -Encoding UTF8

if ($itemText -notmatch 'P2\.10h\.3 actor stack merge') {
  $old = @'
      const [created] = await actor.createEmbeddedDocuments("Item", [data]);
      if (!created) return { unloaded: false, reason: "actor-item-create-failed", manifest };
      const removal = expeditionManifestApi.extract(manifest, { containerId, entryId, quantity: qty });
      if (!removal.changed) {
        await created.delete();
        return { unloaded: false, reason: removal.reason ?? "manifest-remove-failed", manifest };
      }
'@

  if (-not $itemText.Contains($old)) {
    Fail "bloc createEmbeddedDocuments attendu introuvable dans unloadToActor"
  }

  $new = @'
      // P2.10h.3 actor stack merge
      const actorStackKey = (itemData) => {
        if (!itemData || typeof itemData !== "object") return null;

        const normalized = clone(itemData);
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

      const desiredStackKey = actorStackKey(data);
      const existingActorItem =
        desiredStackKey == null
          ? null
          : actor.items?.find?.((candidate) => {
              const candidateData = candidate?.toObject?.();
              return actorStackKey(candidateData) === desiredStackKey;
            }) ?? null;

      let created = null;
      let mergedActorItem = null;
      let previousActorQuantity = null;
      let actorQuantityPath = null;

      if (existingActorItem) {
        const system = existingActorItem.system ?? {};

        if (Object.prototype.hasOwnProperty.call(system, "quantity")) {
          actorQuantityPath = "system.quantity";
          previousActorQuantity = Math.max(1, Number(system.quantity) || 1);
        } else if (Object.prototype.hasOwnProperty.call(system, "amount")) {
          actorQuantityPath = "system.amount";
          previousActorQuantity = Math.max(1, Number(system.amount) || 1);
        }

        if (actorQuantityPath) {
          await existingActorItem.update({
            [actorQuantityPath]: previousActorQuantity + qty,
          });
          mergedActorItem = existingActorItem;
        }
      }

      if (!mergedActorItem) {
        [created] = await actor.createEmbeddedDocuments("Item", [data]);
        if (!created) return { unloaded: false, reason: "actor-item-create-failed", manifest };
      }

      const removal = expeditionManifestApi.extract(manifest, { containerId, entryId, quantity: qty });
      if (!removal.changed) {
        if (created) {
          await created.delete();
        } else if (mergedActorItem && actorQuantityPath && previousActorQuantity != null) {
          await mergedActorItem.update({
            [actorQuantityPath]: previousActorQuantity,
          });
        }

        return { unloaded: false, reason: removal.reason ?? "manifest-remove-failed", manifest };
      }
'@

  $itemText = $itemText.Replace($old, $new)

  $oldReturn = 'return { unloaded: true, actorId: actor.id, createdItemId: created.id, removal, ledgerEvent, manifest };'
  $newReturn = @'
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
'@

  if (-not $itemText.Contains($oldReturn)) {
    Fail "return unloadToActor attendu introuvable"
  }

  $itemText = $itemText.Replace($oldReturn, $newReturn.TrimEnd())
  Set-Content -Path $itemPath -Value $itemText -Encoding UTF8
  Pass "fusion de stack Actor ajoutée : $($itemFiles[0].Name)"
} else {
  Pass "fusion de stack Actor déjà présente"
}

Write-Host ""
Write-Host "P2.10h.3 patch appliqué" -ForegroundColor Green
