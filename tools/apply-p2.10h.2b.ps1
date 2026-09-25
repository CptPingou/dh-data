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

if ($text -match "Retour au personnage —") {
  Pass "P2.10h.2b déjà appliqué"
  exit 0
}

$old = @'
async unloadToActor(manifest, { containerId, entryId, quantity = null, note = null } = {}) {
      const container = (manifest?.containers ?? []).find((c) => c.containerId === containerId);
      const actor = actorFromContainer(container);
      if (!actor) return { unloaded: false, reason: "container-holder-actor-not-found", manifest };
      const entry = (container?.contents ?? []).find((e) => e.entryId === entryId);
      if (!entry) return { unloaded: false, reason: "entry-not-found", manifest };
      const source = await resolveFoundryItemRef(entry.itemRef);
      const available = Math.max(1, Number(entry.quantity) || 1);
      const qty = quantity == null ? available : Math.max(1, Number(quantity) || 1);
      if (qty > available) return { unloaded: false, reason: "quantity-exceeds-entry", manifest };
'@

$new = @'
async unloadToActor(manifest, { containerId, entryId, quantity = null, note = null } = {}) {
      const container = (manifest?.containers ?? []).find((c) => c.containerId === containerId);
      const actor = actorFromContainer(container);
      if (!actor) return { unloaded: false, reason: "container-holder-actor-not-found", manifest };
      const entry = (container?.contents ?? []).find((e) => e.entryId === entryId);
      if (!entry) return { unloaded: false, reason: "entry-not-found", manifest };
      const source = await resolveFoundryItemRef(entry.itemRef);
      const available = Math.max(1, Number(entry.quantity) || 1);

      let requestedQuantity = quantity;

      if (requestedQuantity == null && available > 1) {
        const itemName = entry.itemRef?.name ?? "Objet";
        const DialogV2 = foundry?.applications?.api?.DialogV2;

        if (DialogV2?.prompt) {
          requestedQuantity = await DialogV2.prompt({
            window: {
              title: `Retour au personnage — ${itemName}`,
            },
            content: `
              <div class="form-group">
                <label>Quantité</label>
                <div class="form-fields">
                  <input
                    type="number"
                    name="quantity"
                    value="${available}"
                    min="1"
                    max="${available}"
                    step="1"
                    autofocus
                  />
                </div>
                <p class="hint">Disponible dans le sac à dos : ${available}</p>
              </div>
            `,
            ok: {
              label: "Rendre",
              callback: (_event, _button, dialog) => {
                const form = dialog?.element?.querySelector?.("form");
                const input =
                  form?.elements?.quantity ??
                  dialog?.element?.querySelector?.('[name="quantity"]');
                return Number(input?.value ?? available);
              },
            },
            rejectClose: false,
          });
        } else {
          const raw = window.prompt(
            `Quantité de "${itemName}" à rendre au personnage (1-${available}) :`,
            String(available)
          );
          requestedQuantity = raw == null ? null : Number(raw);
        }

        if (requestedQuantity == null) {
          return { unloaded: false, cancelled: true, reason: "cancelled", manifest };
        }

        const parsedQuantity = Math.floor(Number(requestedQuantity));

        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          ui.notifications?.warn("La quantité à rendre doit être supérieure à 0.");
          return { unloaded: false, cancelled: true, reason: "invalid-quantity", manifest };
        }

        requestedQuantity = Math.min(available, parsedQuantity);
      }

      const qty =
        requestedQuantity == null
          ? available
          : Math.max(1, Number(requestedQuantity) || 1);

      if (qty > available) return { unloaded: false, reason: "quantity-exceeds-entry", manifest };
'@

if (-not $text.Contains($old)) {
  Fail "Bloc unloadToActor attendu introuvable. Aucun fichier modifié."
}

$text = $text.Replace($old, $new)

Set-Content -Path $path -Value $text -Encoding UTF8
Pass "P2.10h.2b appliqué à scripts\expedition-foundry-items.mjs"
