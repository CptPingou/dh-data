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

function typeLabel(type) {
  return ({ backpack: "Sac à dos", caravan: "Caravane" })[type] ?? type;
}

function holderLabel(container, characterById) {
  const holder = container.holderRef;
  if (holder?.kind === "character") return characterById.get(holder.id)?.name ?? holder.id;
  if (holder?.kind === "party") return "Groupe";
  if (holder?.kind === "expedition") return "Expédition";
  return "Sans détenteur";
}

function usedSlots(container) {
  return new Set((container.contents ?? []).map((entry) => entry.slotId).filter(Boolean)).size || (container.contents ?? []).length;
}

function graphicImg(src, className, alt = "") {
  if (typeof src !== "string" || !src.trim()) return "";
  return `<img class="${className}" src="${esc(src)}" alt="${esc(alt)}" draggable="false">`;
}

function containerPresentation(container) {
  return container?.presentation && typeof container.presentation === "object"
    ? container.presentation
    : {};
}

function capacityPercent(container) {
  const capacity = Math.max(0, Number(container.capacity?.slots ?? 0));
  if (!capacity) return 0;
  return Math.min(100, Math.round((usedSlots(container) / capacity) * 100));
}

function entryTileHtml(entry, containerId) {
  const quantity = Number(entry.quantity ?? 1);
  const quantityBadge = quantity > 1 ? `<span class="dct-expedition-quantity">×${esc(quantity)}</span>` : "";
  const rawName = entry.itemRef?.name ?? entry.itemRef?.sourceId ?? "Objet";
  const name = esc(rawName);
  const image = graphicImg(entry.itemRef?.img, "dct-expedition-item-art", rawName);
  return `<div class="dct-expedition-entry dct-expedition-item-tile${image ? " has-art" : ""}" draggable="true"
      data-entry-id="${esc(entry.entryId)}" data-source-container-id="${esc(containerId)}"
      title="${name}" role="button" tabindex="0">
    ${image}
    <span class="dct-expedition-item-name">${name}</span>
    ${quantityBadge}
  </div>`;
}

function inventoryGridHtml(container) {
  const contents = container.contents ?? [];
  const declaredSlots = container.layout?.slots ?? [];
  const capacity = Math.max(0, Number(container.capacity?.slots ?? 0));
  const slotCount = Math.max(capacity, declaredSlots.length);
  const columns = Math.max(1, Math.min(Number(container.layout?.columns ?? 4) || 4, Math.max(slotCount, 1)));

  const slots = Array.from({ length: slotCount }, (_, index) =>
    declaredSlots[index] ?? { slotId: `slot-${index + 1}`, label: `Emplacement ${index + 1}` }
  );
  const bySlot = new Map(contents.filter((entry) => entry.slotId).map((entry) => [entry.slotId, entry]));
  const unslotted = contents.filter((entry) => !entry.slotId);
  let unslottedIndex = 0;

  const cells = slots.map((slot) => {
    const entry = bySlot.get(slot.slotId) ?? unslotted[unslottedIndex++] ?? null;
    const occupied = Boolean(entry);
    const presentation = containerPresentation(container);
    const slotArt = !entry ? graphicImg(presentation.slotBackground, "dct-expedition-slot-art", "") : "";
    return `<div class="dct-expedition-grid-slot${occupied ? " is-occupied" : " is-empty"}"
        data-drop-container-id="${esc(container.containerId)}"
        data-slot-id="${esc(slot.slotId)}"
        title="${esc(slot.label ?? slot.slotId)}">
      ${slotArt}
      ${entry ? entryTileHtml(entry, container.containerId) : `<span class="dct-expedition-slot-index">${esc(String(slots.indexOf(slot) + 1))}</span>`}
    </div>`;
  }).join("");

  return `<div class="dct-expedition-grid" style="
      display:grid;
      grid-template-columns:repeat(${columns}, 82px);
      grid-auto-rows:82px;
      gap:.45rem;
      width:max-content;
      max-width:100%;
      margin-top:.65rem;">
    ${cells}
  </div>`;
}

function itemDetailHtml(container, entry) {
  if (!container || !entry) {
    return `<section class="dct-expedition-item-detail is-empty">
      <div class="dct-expedition-item-detail-placeholder">Sélectionne un objet pour afficher ses détails et ses actions.</div>
    </section>`;
  }

  const ref = entry.itemRef ?? {};
  const rawName = ref.name ?? ref.sourceId ?? "Objet";
  const image = graphicImg(ref.img, "dct-expedition-item-detail-art", rawName);
  const quantity = Math.max(1, Number(entry.quantity ?? 1));
  const canReturn = container.scope === "personal"
    && container.holderRef?.kind === "character"
    && Boolean(container.holderRef?.foundryActorUuid)
    && ref.kind === "foundry-item";

  return `<section class="dct-expedition-item-detail" data-selected-entry-id="${esc(entry.entryId)}">
    <div class="dct-expedition-item-detail-main">
      <div class="dct-expedition-item-detail-art-slot">${image || `<i class="fa-solid fa-box"></i>`}</div>
      <div class="dct-expedition-item-detail-copy">
        <strong>${esc(rawName)}</strong>
        <span>${esc(ref.type ?? "objet")} · ×${esc(quantity)}</span>
        <small>${esc(ref.sourceId ?? ref.uuid ?? entry.entryId)}</small>
      </div>
    </div>
    <div class="dct-expedition-item-actions">
      ${canReturn ? `<button type="button" data-expedition-action="return-to-actor"
          data-container-id="${esc(container.containerId)}"
          data-entry-id="${esc(entry.entryId)}">
        <i class="fa-solid fa-arrow-right-to-bracket"></i> Rendre au personnage
      </button>` : ""}
    </div>
  </section>`;
}

function containerDetailHtml(container, characterById) {
  if (!container) return `<div class="dct-expedition-empty">Aucun conteneur dans cette expédition.</div>`;
  const owner = holderLabel(container, characterById);
  const used = usedSlots(container);
  const capacity = container.capacity?.slots ?? 0;
  const presentation = containerPresentation(container);
  const icon = graphicImg(presentation.icon, "dct-expedition-container-icon", container.name);
  const background = graphicImg(presentation.background, "dct-expedition-container-background", "");
  const frame = graphicImg(presentation.frame, "dct-expedition-container-frame", "");
  const rules = (container.rules ?? []).length
    ? `<div class="dct-expedition-rules"><strong>Règles :</strong> ${container.rules.map((r) => esc(r.text ?? r.label ?? r.name ?? r.ruleId ?? r.id ?? "Règle spéciale")).join(" · ")}</div>`
    : `<div class="dct-expedition-rules is-empty">Aucune règle spéciale</div>`;

  const looseEntries = (container.contents ?? []).filter((entry) => !entry.slotId && used >= capacity);
  const overflow = looseEntries.length
    ? `<div class="dct-expedition-overflow"><strong>Hors grille :</strong> ${looseEntries.map((entry) => esc(entry.itemRef?.name ?? "Objet")).join(" · ")}</div>`
    : "";

  return `<section class="dct-expedition-container dct-expedition-container--${esc(container.type)}"
      data-container-id="${esc(container.containerId)}" data-container-type="${esc(container.type)}">
    <div class="dct-expedition-container-stage">
      ${background}
      <div class="dct-expedition-container-stage-content">
        <header class="dct-expedition-container-header">
          <div class="dct-expedition-container-identity">
            <div class="dct-expedition-container-icon-slot">${icon || `<i class="fa-solid ${container.type === "caravan" ? "fa-wagon-covered" : "fa-bag-shopping"}"></i>`}</div>
            <div>
              <div class="dct-expedition-container-name">${esc(container.name)}</div>
              <div class="dct-expedition-container-owner">${esc(owner)} · ${esc(typeLabel(container.type))} · ${esc(container.scope)}</div>
            </div>
          </div>
          <div class="dct-expedition-capacity">
            <strong>${used}/${capacity}</strong>
            <span>emplacements</span>
          </div>
        </header>

        <meter class="dct-expedition-capacity-meter"
          min="0" max="${Math.max(1, capacity)}" value="${Math.min(used, Math.max(1, capacity))}"
          aria-label="${used} emplacements utilisés sur ${capacity}">
          ${used}/${capacity}
        </meter>

        ${rules}

        <div class="dct-expedition-grid-shell">
          ${inventoryGridHtml(container)}
        </div>
        ${overflow}
      </div>
      ${frame}
    </div>
  </section>`;
}
function containerListHtml(containers, characterById, selectedId) {
  if (!containers.length) return `<div class="dct-expedition-empty">Aucun conteneur</div>`;
  const groups = [
    ["personal", "Personnels"],
    ["party", "Groupe"],
    ["expedition", "Expédition"],
  ];
  return groups.map(([scope, label]) => {
    const scoped = containers.filter((c) => c.scope === scope);
    if (!scoped.length) return "";
    return `<section class="dct-expedition-list-group"><h4>${label}</h4>${scoped.map((container) => {
      const used = usedSlots(container);
      const capacity = container.capacity?.slots ?? 0;
      const presentation = containerPresentation(container);
      const icon = graphicImg(presentation.icon, "dct-expedition-list-icon", container.name);
      return `<div class="dct-expedition-list-item${container.containerId === selectedId ? " is-selected" : ""}"
          data-container-id="${esc(container.containerId)}"
          data-drop-container-id="${esc(container.containerId)}">
        <div class="dct-expedition-list-icon-slot">${icon || `<i class="fa-solid ${container.type === "caravan" ? "fa-wagon-covered" : "fa-bag-shopping"}"></i>`}</div>
        <div class="dct-expedition-list-copy">
          <strong>${esc(container.name)}</strong>
          <span>${esc(holderLabel(container, characterById))} · ${esc(typeLabel(container.type))}</span>
          <meter class="dct-expedition-list-meter"
            min="0" max="${Math.max(1, capacity)}" value="${Math.min(used, Math.max(1, capacity))}"
            aria-label="${used} emplacements utilisés sur ${capacity}">
            ${used}/${capacity}
          </meter>
        </div>
        <div class="dct-expedition-list-count">${used}/${capacity}</div>
      </div>`;
    }).join("")}</section>`;
  }).join("");
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
  const characterById = new Map((manifest.characters ?? []).map((c) => [c.characterId, c]));
  const containers = manifest.containers ?? [];
  const green = validation?.green !== false;
  const selected = containers.find((container) => container.containerId === selectedId) ?? containers[0] ?? null;

  return `<div class="dct-expedition-window">
    <style>
      .dct-expedition-window{--dct-slot-size:82px;display:flex;flex-direction:column;gap:.75rem}
      .dct-expedition-bridge{display:grid;grid-template-columns:1fr auto 1fr;gap:.65rem;align-items:center}
      .dct-expedition-side,.dct-expedition-link,.dct-expedition-summary{border:1px solid var(--color-border-light-2);border-radius:6px;padding:.55rem .7rem}
      .dct-expedition-side{display:flex;justify-content:center;gap:.35rem;opacity:.65}
      .dct-expedition-side.is-authority{opacity:1;box-shadow:inset 0 0 0 1px var(--color-warm-1)}
      .dct-expedition-link{text-align:center}
      .dct-expedition-summary{display:flex;gap:1rem;justify-content:space-between;flex-wrap:wrap}
      .dct-expedition-browser{min-height:420px}
      .dct-expedition-container-list{display:flex;flex-direction:column;gap:.55rem}
      .dct-expedition-list-group h4{margin:.5rem 0 .3rem}
      .dct-expedition-list-item{display:grid;grid-template-columns:42px 1fr auto;gap:.55rem;align-items:center;padding:.5rem;border:1px solid var(--color-border-light-2);border-radius:6px;cursor:pointer}
      .dct-expedition-list-item.is-selected{box-shadow:inset 0 0 0 2px var(--color-warm-1)}
      .dct-expedition-list-item.is-drop-target{outline:2px solid var(--color-warm-1)}
      .dct-expedition-list-icon-slot,.dct-expedition-container-icon-slot{display:grid;place-items:center;overflow:hidden;border:1px solid var(--color-border-light-2);background:rgba(0,0,0,.12)}
      .dct-expedition-list-icon-slot{width:42px;height:42px;border-radius:5px}
      .dct-expedition-container-icon-slot{width:56px;height:56px;border-radius:7px;font-size:1.5rem}
      .dct-expedition-list-icon,.dct-expedition-container-icon{width:100%;height:100%;object-fit:cover}
      .dct-expedition-list-copy{min-width:0;display:flex;flex-direction:column;gap:.12rem}
      .dct-expedition-list-copy span{font-size:.8rem;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dct-expedition-list-count{font-weight:700;font-variant-numeric:tabular-nums}
      .dct-expedition-capacity-meter,.dct-expedition-list-meter{display:block;width:100%;min-width:90px}
      .dct-expedition-capacity-meter{height:14px;margin:.55rem 0 .65rem}
      .dct-expedition-list-meter{height:10px;margin-top:.18rem}
      .dct-expedition-container-stage{position:relative;overflow:hidden;border:1px solid var(--color-border-light-2);border-radius:8px;min-height:320px}
      .dct-expedition-container-background,.dct-expedition-container-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
      .dct-expedition-container-background{z-index:0;opacity:.26}
      .dct-expedition-container-frame{z-index:3;object-fit:fill}
      .dct-expedition-container-stage-content{position:relative;z-index:2;padding:.8rem}
      .dct-expedition-container-header{display:flex;justify-content:space-between;gap:1rem;align-items:center}
      .dct-expedition-container-identity{display:flex;gap:.7rem;align-items:center;min-width:0}
      .dct-expedition-container-name{font-size:1.15rem;font-weight:700}
      .dct-expedition-container-owner{font-size:.85rem;opacity:.72}
      .dct-expedition-capacity{display:flex;flex-direction:column;text-align:right}
      .dct-expedition-capacity strong{font-size:1.1rem}
      .dct-expedition-capacity span{font-size:.75rem;opacity:.68}
      .dct-expedition-capacity-track{margin:.6rem 0}
      .dct-expedition-rules{padding:.4rem .5rem;border-left:3px solid var(--color-warm-1);background:rgba(0,0,0,.08);border-radius:3px}
      .dct-expedition-rules.is-empty{opacity:.58}
      .dct-expedition-grid-shell{overflow:auto;padding:.1rem 0 .25rem}
      .dct-expedition-grid-slot{position:relative;width:var(--dct-slot-size);height:var(--dct-slot-size);box-sizing:border-box;border:1px solid var(--color-border-light-2);border-radius:5px;background:rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;overflow:hidden}
      .dct-expedition-grid-slot.is-empty{border-style:dashed}
      .dct-expedition-grid-slot.is-drop-target{outline:2px solid var(--color-warm-1)}
      .dct-expedition-slot-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.72;pointer-events:none}
      .dct-expedition-item-tile{position:absolute;inset:0;padding:.35rem;display:flex;align-items:center;justify-content:center;text-align:center;cursor:grab;background:rgba(255,255,255,.055);font-weight:600}
      .dct-expedition-item-tile.has-art{padding:0}
      .dct-expedition-item-tile.is-selected{outline:3px solid var(--color-warm-1);outline-offset:-3px}
      .dct-expedition-item-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .dct-expedition-item-tile.has-art .dct-expedition-item-name{display:none}
      .dct-expedition-item-name{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
      .dct-expedition-quantity{position:absolute;right:.25rem;top:.2rem;padding:.05rem .25rem;border-radius:3px;background:rgba(0,0,0,.78);color:#fff;font-weight:700;z-index:2}
      .dct-expedition-slot-index{position:absolute;right:.28rem;bottom:.18rem;z-index:1;font-size:.66rem;opacity:.42}
      .dct-expedition-item-panel{position:sticky;top:.25rem;min-width:0}
      .dct-expedition-item-panel .dct-expedition-item-detail{margin-top:0}
      .dct-expedition-item-detail{padding:.65rem;border:1px solid var(--color-border-light-2);border-radius:6px;background:rgba(0,0,0,.08);display:flex;flex-direction:column;gap:.75rem;align-items:stretch}
      .dct-expedition-item-detail.is-empty{opacity:.65}
      .dct-expedition-item-detail-main{display:flex;gap:.65rem;align-items:center;min-width:0}
      .dct-expedition-item-detail-art-slot{width:58px;height:58px;flex:0 0 58px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--color-border-light-2);border-radius:5px;background:rgba(0,0,0,.14)}
      .dct-expedition-item-detail-art{width:100%;height:100%;object-fit:cover}
      .dct-expedition-item-detail-copy{min-width:0;display:flex;flex-direction:column;gap:.12rem}
      .dct-expedition-item-detail-copy strong{font-size:1rem}
      .dct-expedition-item-detail-copy span{font-size:.82rem;opacity:.78}
      .dct-expedition-item-detail-copy small{font-size:.68rem;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}
      .dct-expedition-item-actions{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-start}
      .dct-expedition-item-actions button{white-space:nowrap}
      .dct-expedition-item-detail-placeholder{font-style:italic}
      .dct-expedition-overflow{margin-top:.5rem;padding:.35rem;border:1px solid var(--color-level-warning-border);border-radius:4px}
      @media (max-width: 980px){
        .dct-expedition-browser{grid-template-columns:minmax(220px,32%) minmax(0,1fr) !important}
        .dct-expedition-item-panel{grid-column:2;position:static}
      }
      .dct-expedition-container--caravan .dct-expedition-container-stage{min-height:380px}
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

    <div class="dct-expedition-browser" style="display:grid;grid-template-columns:minmax(230px,26%) minmax(0,1fr) minmax(260px,30%);gap:1rem;align-items:start;">
      <aside class="dct-expedition-container-list">
        <h3>Conteneurs (${containers.length})</h3>
        ${containerListHtml(containers, characterById, selected?.containerId)}
      </aside>
      <main class="dct-expedition-container-detail">
        <h3>Contenu</h3>
        ${containerDetailHtml(selected, characterById)}
      </main>
      <aside class="dct-expedition-item-panel">
        <h3>Objet</h3>
        ${itemDetailHtml(selected, null)}
      </aside>
    </div>

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

  let currentSelectedId = manifest.containers?.some((c) => c.containerId === selectedId)
    ? selectedId
    : manifest.containers?.[0]?.containerId ?? null;
  let currentSelectedEntryId = null;

  const dialog = new DialogV2({
    window: { title: `Préparer l’expédition — ${manifest.expeditionId ?? "sans identifiant"}`, resizable: true },
    position: { width: 900, height: "auto" },
    content: expeditionWindowContent(manifest, validation, currentSelectedId),
    buttons: [{ action: "close", label: "Fermer", icon: "fa-solid fa-xmark", default: true }],
  });

  const bindInteractions = () => {
    const root = dialog.element;
    if (!root) return;

    const characterById = new Map((manifest.characters ?? []).map((c) => [c.characterId, c]));

    const refreshLocal = () => {
      const list = root.querySelector(".dct-expedition-container-list");
      const detail = root.querySelector(".dct-expedition-container-detail");
      const itemPanel = root.querySelector(".dct-expedition-item-panel");
      const ledger = root.querySelector(".dct-expedition-ledger");
      if (!list || !detail || !itemPanel) return;

      const selected = manifest.containers?.find((c) => c.containerId === currentSelectedId)
        ?? manifest.containers?.[0]
        ?? null;
      currentSelectedId = selected?.containerId ?? null;

      list.innerHTML = `<h3>Conteneurs (${manifest.containers?.length ?? 0})</h3>
        ${containerListHtml(manifest.containers ?? [], characterById, currentSelectedId)}`;
      detail.innerHTML = `<h3>Contenu</h3>${containerDetailHtml(selected, characterById)}`;

      const selectedEntry = selected?.contents?.find((entry) => entry.entryId === currentSelectedEntryId) ?? null;
      if (!selectedEntry) currentSelectedEntryId = null;
      itemPanel.innerHTML = `<h3>Objet</h3>${itemDetailHtml(selected, selectedEntry)}`;
      if (currentSelectedEntryId) {
        detail.querySelector(`.dct-expedition-entry[data-entry-id="${CSS.escape(currentSelectedEntryId)}"]`)?.classList.add("is-selected");
      }

      if (ledger) ledger.outerHTML = ledgerHtml(manifest);

      bindInteractions();
    };

    for (const row of root.querySelectorAll(".dct-expedition-list-item[data-container-id]")) {
      if (row.dataset.dctBound === "1") continue;
      row.dataset.dctBound = "1";
      row.style.cursor = "pointer";

      row.addEventListener("click", () => {
        currentSelectedId = row.dataset.containerId;
        currentSelectedEntryId = null;
        refreshLocal();
      });

      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", async (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        if (typeof transfer !== "function") return;

        let payload = null;
        try {
          payload = JSON.parse(event.dataTransfer?.getData("application/x-dct-expedition-entry") || "null");
        } catch (_) {}
        if (!payload?.entryId || !payload?.fromContainerId) return;

        const toContainerId = row.dataset.containerId;
        const result = transfer(manifest, { ...payload, toContainerId });
        if (!result?.moved) {
          if (result?.reason && result.reason !== "same-container") {
            ui.notifications.warn(`Campaign Toolkit : transfert refusé — ${result.reason}.`);
          }
          return;
        }

        currentSelectedId = toContainerId;
        if (typeof save === "function") {
          try {
            await save(manifest);
          } catch (error) {
            console.error(`${MODULE_ID} | expedition autosave failed`, error);
            ui.notifications.error("Campaign Toolkit : transfert effectué, mais sauvegarde World échouée.");
            refreshLocal();
            return;
          }
        }
        ui.notifications.info(`Campaign Toolkit : objet transféré et sauvegardé vers ${row.querySelector("strong")?.textContent ?? toContainerId}.`);
        refreshLocal();
      });
    }

    for (const slot of root.querySelectorAll(".dct-expedition-grid-slot[data-drop-container-id][data-slot-id]")) {
      if (slot.dataset.dctBound === "1") continue;
      slot.dataset.dctBound = "1";

      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        slot.classList.add("is-drop-target");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-drop-target"));
      slot.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        slot.classList.remove("is-drop-target");
        if (typeof transfer !== "function") return;

        let payload = null;
        try {
          payload = JSON.parse(event.dataTransfer?.getData("application/x-dct-expedition-entry") || "null");
        } catch (_) {}
        if (!payload?.entryId || !payload?.fromContainerId) return;

        const toContainerId = slot.dataset.dropContainerId;
        const toSlotId = slot.dataset.slotId;
        const result = transfer(manifest, { ...payload, toContainerId, toSlotId });
        if (!result?.moved) {
          if (result?.reason && !["same-container", "same-slot"].includes(result.reason)) {
            ui.notifications.warn(`Campaign Toolkit : transfert refusé — ${result.reason}.`);
          }
          return;
        }

        currentSelectedId = toContainerId;
        if (typeof save === "function") {
          try {
            await save(manifest);
          } catch (error) {
            console.error(`${MODULE_ID} | expedition autosave failed`, error);
            ui.notifications.error("Campaign Toolkit : modification effectuée, mais sauvegarde World échouée.");
            refreshLocal();
            return;
          }
        }
        refreshLocal();
      });
    }

    for (const entry of root.querySelectorAll(".dct-expedition-entry[data-entry-id]")) {
      if (entry.dataset.dctSelectBound === "1") continue;
      entry.dataset.dctSelectBound = "1";

      const selectEntry = (event) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        if (event.type === "keydown") event.preventDefault();
        currentSelectedId = entry.dataset.sourceContainerId;
        currentSelectedEntryId = entry.dataset.entryId;
        refreshLocal();
      };

      entry.addEventListener("click", selectEntry);
      entry.addEventListener("keydown", selectEntry);
    }

    for (const button of root.querySelectorAll("[data-expedition-action='return-to-actor']")) {
      if (button.dataset.dctBound === "1") continue;
      button.dataset.dctBound = "1";
      button.addEventListener("click", async () => {
        if (typeof unloadToActor !== "function") {
          ui.notifications.warn("Campaign Toolkit : pont Actor indisponible.");
          return;
        }

        const containerId = button.dataset.containerId;
        const entryId = button.dataset.entryId;
        const container = manifest.containers?.find((c) => c.containerId === containerId);
        const entry = container?.contents?.find((e) => e.entryId === entryId);
        if (!container || !entry) return;

        button.disabled = true;
        try {
          const result = await unloadToActor(manifest, {
            containerId,
            entryId,
            quantity: Number(entry.quantity ?? 1),
          });
          if (!result?.unloaded) {
            ui.notifications.warn(`Campaign Toolkit : restitution refusée — ${result?.reason ?? "inconnue"}.`);
            return;
          }

          currentSelectedEntryId = null;
          if (typeof save === "function") await save(manifest);
          ui.notifications.info(`Campaign Toolkit : ${entry.itemRef?.name ?? "objet"} rendu à ${result.actorName ?? "son personnage"}.`);
          refreshLocal();
        } catch (error) {
          console.error(`${MODULE_ID} | return-to-actor failed`, error);
          ui.notifications.error("Campaign Toolkit : restitution au personnage échouée.");
        } finally {
          button.disabled = false;
        }
      });
    }

    for (const entry of root.querySelectorAll(".dct-expedition-entry[draggable='true']")) {
      if (entry.dataset.dctBound === "1") continue;
      entry.dataset.dctBound = "1";
      entry.style.cursor = "grab";
      entry.addEventListener("dragstart", (event) => {
        const payload = {
          entryId: entry.dataset.entryId,
          fromContainerId: entry.dataset.sourceContainerId,
        };
        event.dataTransfer?.setData("application/x-dct-expedition-entry", JSON.stringify(payload));
        event.dataTransfer?.setData("text/plain", payload.entryId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
    }
  };

  dialog.render({ force: true });

  // DialogV2 mounts asynchronously. The initial content can therefore precede
  // the final window DOM/layout. Once mounted, bind and immediately rebuild the
  // two dynamic panels from the live manifest so the inventory grid is visible
  // before the first user interaction.
  setTimeout(() => {
    bindInteractions();

    const root = dialog.element;
    if (!root) return;

    const characterById = new Map((manifest.characters ?? []).map((c) => [c.characterId, c]));
    const list = root.querySelector(".dct-expedition-container-list");
    const detail = root.querySelector(".dct-expedition-container-detail");
    const itemPanel = root.querySelector(".dct-expedition-item-panel");
    const selected = manifest.containers?.find((c) => c.containerId === currentSelectedId)
      ?? manifest.containers?.[0]
      ?? null;

    currentSelectedId = selected?.containerId ?? null;

    if (list) {
      list.innerHTML = `<h3>Conteneurs (${manifest.containers?.length ?? 0})</h3>
        ${containerListHtml(manifest.containers ?? [], characterById, currentSelectedId)}`;
    }
    if (detail) {
      detail.innerHTML = `<h3>Contenu</h3>${containerDetailHtml(selected, characterById)}`;
    }
    if (itemPanel) {
      itemPanel.innerHTML = `<h3>Objet</h3>${itemDetailHtml(selected, null)}`;
    }

    bindInteractions();
  }, 0);

  return dialog;
}

export const expeditionWindowApi = Object.freeze({
  version: 14,
  content: expeditionWindowContent,
  open: openExpeditionWindow,
});
