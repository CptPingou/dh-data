const MODULE_ID = "daggerheart-campaign-toolkit";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function phaseLabel(phase) {
  return ({ prepared: "Préparée", in_session: "En session", returned: "Retour d’expédition" })[phase] ?? phase;
}

function authorityLabel(authority) {
  return authority === "web" ? "Web" : authority === "foundry" ? "Foundry" : authority;
}

function ledgerHtml(manifest) {
  const events = manifest.ledger ?? [];
  if (!events.length) return `<div class="dct-expedition-ledger"><strong>Journal :</strong> aucun événement</div>`;

  const labels = {
    consumed: "Consommé",
    acquired: "Acquis",
    transferred: "Transféré",
    lost: "Perdu",
  };
  const recent = events.slice(-5).reverse();
  return `<details class="dct-expedition-ledger">
    <summary><strong>Journal d’expédition</strong> · ${events.length} événement${events.length > 1 ? "s" : ""}</summary>
    <ul>${recent.map((event) => {
      const name = esc(event.itemRef?.name ?? event.itemRef?.sourceId ?? event.entryId ?? "Objet");
      const fromLabel = event.fromContainerId ?? event.fromRef?.name ?? event.fromRef?.uuid ?? "?";
      const toLabel = event.toContainerId ?? event.toRef?.name ?? event.toRef?.uuid ?? "?";
      const movement = event.kind === "transferred"
        ? ` · ${esc(fromLabel)} → ${esc(toLabel)}`
        : "";
      return `<li>${esc(labels[event.kind] ?? event.kind)} · ${name} ×${esc(event.quantity ?? 1)}${movement}</li>`;
    }).join("")}</ul>
  </details>`;
}

export function expeditionWindowContent(manifest, validation = null, selectedId = null) {
  const green = validation?.green !== false;

  return `<div class="dct-expedition-window">
    <style>
      .dct-expedition-window{display:flex;flex-direction:column;gap:.75rem}
      .dct-expedition-bridge{display:grid;grid-template-columns:1fr auto 1fr;gap:.65rem;align-items:center}
      .dct-expedition-side,.dct-expedition-link,.dct-expedition-summary{border:1px solid var(--color-border-light-2);border-radius:6px;padding:.55rem .7rem}
      .dct-expedition-side{display:flex;justify-content:center;gap:.35rem;opacity:.65}
      .dct-expedition-side.is-authority{opacity:1;box-shadow:inset 0 0 0 1px var(--color-warm-1)}
      .dct-expedition-link{text-align:center}
      .dct-expedition-summary{display:flex;gap:1rem;justify-content:space-between;flex-wrap:wrap}
    </style>
    <section class="dct-expedition-bridge">
      <div class="dct-expedition-side ${manifest.authority === "web" ? "is-authority" : ""}"><strong>WEB</strong><span> état persistant</span></div>
      <div class="dct-expedition-link"><span>${manifest.phase === "returned" ? "FOUNDRY → WEB" : "WEB → FOUNDRY"}</span> · <small>${esc(phaseLabel(manifest.phase))}</small></div>
      <div class="dct-expedition-side ${manifest.authority === "foundry" ? "is-authority" : ""}"><strong>FOUNDRY</strong><span> état de session</span></div>
    </section>

    <section class="dct-expedition-summary">
      <div><strong>${esc(manifest.expeditionId)}</strong> · révision ${esc(manifest.revision)}</div>
      <div>Autorité : <strong>${esc(authorityLabel(manifest.authority))}</strong></div>
      <div class="${green ? "is-green" : "is-red"}">${green ? "Contrat valide" : "Contrat invalide"}</div>
    </section>

    ${ledgerHtml(manifest)}



  </div>`;
}


export async function openExpeditionWindow(inputManifest, { validate = null, normalize = null, transfer = null, unloadToActor = null, save = null, selectedId = null } = {}) {
  // Keep the caller's manifest as the live session object. `normalize()` may
  // return a clone (and does for @2), which previously made drag/drop mutate
  // only a private window copy. Copy normalized data back into the original
  // object so closing the window does not discard session changes.
  let manifest = inputManifest;
  if (typeof normalize === "function") {
    const normalized = normalize(inputManifest);
    if (normalized !== inputManifest && inputManifest && typeof inputManifest === "object") {
      for (const key of Object.keys(inputManifest)) delete inputManifest[key];
      Object.assign(inputManifest, normalized);
      manifest = inputManifest;
    } else {
      manifest = normalized;
    }
  }
  const validation = typeof validate === "function" ? validate(manifest) : null;
  if (validation && !validation.green) {
    ui.notifications.warn("Campaign Toolkit : manifeste d’expédition invalide — voir la fenêtre et la console.");
    console.warn(`${MODULE_ID} | invalid expedition manifest`, validation);
  }

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) throw new Error("Foundry DialogV2 API is unavailable");

  const dialog = new DialogV2({
    window: { title: `Préparer l’expédition — ${manifest.expeditionId ?? "sans identifiant"}`, resizable: true },
    position: { width: 900, height: "auto" },
    content: expeditionWindowContent(manifest, validation, selectedId),
    buttons: [{ action: "close", label: "Fermer", icon: "fa-solid fa-xmark", default: true }],
  });

  dialog.render({ force: true });

  return dialog;
}

export const expeditionWindowApi = Object.freeze({
  version: 16,
  content: expeditionWindowContent,
  open: openExpeditionWindow,
});
