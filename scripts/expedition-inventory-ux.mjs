const MODULE_ID = "daggerheart-campaign-toolkit";
const PANEL_CLASS = "dhct-expedition-ux-summary";
const ROLE_TABS_CLASS = "dhct-expedition-role-tabs";
const GM_TAB_ID = "dhct-expedition-gm";
const INVENTORY_TAB_ID = "dhct-expedition-inventory";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_BACKPACK_ACCESS = "expedition-backpack-access-changed";
const SOCKET_INVENTORY_REQUEST = "expedition-inventory-authority-request";
const SOCKET_INVENTORY_RESULT = "expedition-inventory-authority-result";
const AUTHORITY_REQUEST_TIMEOUT_MS = 10000;


function getApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function isExpeditionDialog(dialog) {
  if (!(dialog instanceof HTMLDialogElement)) return false;
  return /préparer l[’']expédition|prepare expedition/i.test(
    dialog.textContent ?? ""
  );
}

function findOpenExpeditionDialog() {
  return [...document.querySelectorAll("dialog.application.dialog")]
    .find(isExpeditionDialog) ?? null;
}

function badge(label, value, key) {
  return `
    <span class="${PANEL_CLASS}__badge" data-kind="${key}">
      <strong>${value}</strong>
      <span>${label}</span>
    </span>
  `;
}

function renderSummaryMarkup(scan, restitution) {
  const counts = scan?.counts ?? {};
  const archived = scan?.archive?.entries ?? 0;
  const blocked = restitution?.blockedItems ?? 0;

  return `
    <section class="${PANEL_CLASS}" aria-label="État de l’inventaire d’expédition">
      <div class="${PANEL_CLASS}__title">
        <span>Inventaire</span>
        <small>lifecycle</small>
      </div>

      <div class="${PANEL_CLASS}__badges">
        ${badge("Actifs", counts.active ?? 0, "active")}
        ${badge("Modifiés", counts.modified ?? 0, "modified")}
        ${badge("Legacy", counts.legacy ?? 0, "legacy")}
        ${badge("Archivés", archived, "archive")}
        ${badge("Bloqués", blocked, blocked ? "blocked" : "ready")}
      </div>
    </section>
  `;
}

async function loadCurrentManifest(api) {
  if (!api?.expeditionManifest?.list || !api?.expeditionManifest?.load) {
    return null;
  }

  const manifests = await api.expeditionManifest.list();

  if (!Array.isArray(manifests) || manifests.length === 0) {
    return null;
  }

  const preferred =
    manifests.find((entry) => entry?.phase === "prepared") ??
    manifests[0];

  const expeditionId =
    typeof preferred === "string"
      ? preferred
      : preferred?.expeditionId;

  if (!expeditionId) return null;

  return api.expeditionManifest.load(expeditionId);
}


function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function lifecycleLabel(state) {
  switch (state) {
    case "modified":
      return "Modifié";
    case "active":
      return "Actif";
    case "legacy":
      return "Legacy";
    default:
      return state ?? "Objet";
  }
}

function candidateItemHost(labelElement, dialog) {
  let current = labelElement;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      current !== dialog &&
      current instanceof HTMLElement &&
      (
        current.matches?.("[data-entry-id]") ||
        current.matches?.("[data-item-id]") ||
        current.matches?.("[data-tooltip]") ||
        current.matches?.("li") ||
        current.matches?.(".item") ||
        current.matches?.(".slot") ||
        current.children.length >= 1
      )
    ) {
      const rect = current.getBoundingClientRect?.();

      if (
        rect &&
        rect.width > 24 &&
        rect.height > 18 &&
        rect.width < 260 &&
        rect.height < 180
      ) {
        return current;
      }
    }

    current = current.parentElement;
  }

  return labelElement.parentElement ?? labelElement;
}

function findVisibleItemLabel(dialog, itemName) {
  const wanted = normalizeText(itemName);
  if (!wanted) return null;

  const candidates = [
    ...dialog.querySelectorAll(
      "span, div, p, label, small, strong, figcaption"
    ),
  ];

  return (
    candidates.find((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (!element.offsetParent) return false;

      const ownText = normalizeText(element.textContent);

      if (ownText !== wanted) return false;

      // Avoid selecting a wrapper that includes child labels.
      return ![...element.children].some((child) =>
        normalizeText(child.textContent)
      );
    }) ?? null
  );
}


async function chooseActionQuantity(entry) {
  const available = Math.max(1, Number(entry?.quantity) || 1);

  if (available <= 1) return 1;

  const DialogV2 = foundry?.applications?.api?.DialogV2;

  if (DialogV2?.prompt) {
    const result = await DialogV2.prompt({
      window: {
        title: `Consommer — ${entry.itemRef?.name ?? "Objet"}`,
      },
      content: `
        <div class="form-group">
          <label>Quantité</label>
          <div class="form-fields">
            <input
              type="number"
              name="quantity"
              value="1"
              min="1"
              max="${available}"
              step="1"
              autofocus
            />
          </div>
          <p class="hint">Disponible : ${available}</p>
        </div>
      `,
      ok: {
        label: "Consommer",
        callback: (_event, _button, dialog) => {
          const input =
            dialog?.element?.querySelector?.('[name="quantity"]');
          return Number(input?.value ?? 1);
        },
      },
      rejectClose: false,
    });

    if (result == null) return null;

    const quantity = Math.floor(Number(result));

    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    return Math.min(available, quantity);
  }

  const raw = window.prompt(
    `Quantité de "${entry.itemRef?.name ?? "Objet"}" à consommer (1-${available}) :`,
    "1"
  );

  if (raw == null) return null;

  const quantity = Math.floor(Number(raw));

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return Math.min(available, quantity);
}

async function confirmInventoryAction({
  title,
  content,
  confirmLabel,
} = {}) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;

  if (DialogV2?.confirm) {
    return DialogV2.confirm({
      window: { title },
      content: `<p>${content}</p>`,
      yes: { label: confirmLabel ?? "Confirmer" },
      no: { label: "Annuler" },
    });
  }

  return window.confirm(content);
}

function captureExpeditionViewState(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return {
      selectedContainerId: null,
      activeRoleTab: null,
    };
  }

  const selectedContainerId =
    dialog.querySelector(
      ".dct-expedition-list-item.is-selected[data-container-id]"
    )?.dataset?.containerId ??
    dialog.querySelector(
      ".dct-expedition-container[data-container-id]"
    )?.dataset?.containerId ??
    null;

  const activeRoleTab =
    dialog.querySelector(
      `.${ROLE_TABS_CLASS} [data-dhct-tab].active`
    )?.dataset?.dhctTab ??
    null;

  return {
    selectedContainerId,
    activeRoleTab,
  };
}

async function restoreExpeditionViewState(state, {
  retries = 16,
  delay = 40,
} = {}) {
  if (!state?.selectedContainerId && !state?.activeRoleTab) return;

  let remaining = Math.max(1, Number(retries) || 1);

  while (remaining > 0) {
    const dialog = findOpenExpeditionDialog();

    if (dialog) {
      let selectedRestored = !state.selectedContainerId;
      let tabRestored = !state.activeRoleTab;

      if (state.selectedContainerId) {
        const row = dialog.querySelector(
          `.dct-expedition-list-item[data-container-id="${CSS.escape(state.selectedContainerId)}"]`
        );

        if (row instanceof HTMLElement) {
          if (!row.classList.contains("is-selected")) {
            row.click();
          }
          selectedRestored = true;
        }
      }

      if (state.activeRoleTab) {
        const tabs = dialog.querySelector(`.${ROLE_TABS_CLASS}`);

        if (tabs instanceof HTMLElement) {
          const button = tabs.querySelector(
            `[data-dhct-tab="${CSS.escape(state.activeRoleTab)}"]`
          );

          if (button instanceof HTMLElement) {
            activateRoleTab(tabs, state.activeRoleTab);
            tabRestored = true;
          }
        }
      }

      if (selectedRestored && tabRestored) return;
    }

    remaining -= 1;
    if (remaining <= 0) return;

    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function reopenExpeditionDialog(api, manifest) {
  const current = findOpenExpeditionDialog();
  const viewState = captureExpeditionViewState(current);

  if (current) {
    try {
      if (typeof current.close === "function" && current.open) {
        current.close();
      }
    } catch (_error) {
      // Ignore close errors; removal below is authoritative.
    }

    current.remove();
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const fresh = await api.expeditionManifest.load(manifest.expeditionId);

  if (typeof api.expeditionManifest.open === "function") {
    await api.expeditionManifest.open(fresh);
    await restoreExpeditionViewState(viewState);
  }
}

async function commitInventoryAction(api, manifest, result, {
  containerId,
  entryId,
  archiveTerminal = false,
} = {}) {
  if (!result?.changed) return result;

  if (archiveTerminal) {
    const current = api.expeditionItems.lifecycleStatus(manifest, {
      containerId,
      entryId,
    });

    if (current?.terminal) {
      api.expeditionItems.archiveTerminal(manifest, {
        containerId,
        entryIds: [entryId],
        note: "Archivage automatique depuis l’interface d’inventaire",
      });
    }
  }

  await api.expeditionManifest.save(manifest);

  Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
    manifest,
    containerId,
    entryId,
    source: "inventory-ux",
  });

  await reopenExpeditionDialog(api, manifest);

  return result;
}

async function handleInventoryItemAction(action, {
  manifest,
  container,
  entry,
} = {}) {
  const api = getApi();

  if (!api?.expeditionItems || !api?.expeditionManifest?.save) {
    ui.notifications?.error("Inventaire d’expédition : API indisponible.");
    return;
  }

  const containerId = container.containerId;
  const entryId = entry.entryId;
  const itemName = entry.itemRef?.name ?? "Objet";

  try {
    if (action === "consume") {
      const quantity = await chooseActionQuantity(entry);
      if (quantity == null) return;

      const result = api.expeditionItems.consume(manifest, {
        containerId,
        entryId,
        quantity,
        note: "Consommé depuis l’interface d’inventaire",
      });

      if (!result?.changed) {
        ui.notifications?.warn(
          result?.reason ?? `Impossible de consommer ${itemName}.`
        );
        return;
      }

      await commitInventoryAction(api, manifest, result, {
        containerId,
        entryId,
        archiveTerminal: true,
      });

      ui.notifications?.info(`${quantity} × ${itemName} consommé`);
      return;
    }

    if (action === "modify") {
      const confirmed = await confirmInventoryAction({
        title: `Marquer modifié — ${itemName}`,
        content:
          `Marquer "${itemName}" comme modifié sans changer son contenu mécanique ?`,
        confirmLabel: "Marquer modifié",
      });

      if (!confirmed) return;

      const result = api.expeditionItems.setLifecycle(manifest, {
        containerId,
        entryId,
        state: "modified",
        note: "Marqué modifié depuis l’interface d’inventaire",
      });

      if (!result?.changed) {
        ui.notifications?.warn(
          result?.reason ?? `Impossible de modifier l’état de ${itemName}.`
        );
        return;
      }

      await commitInventoryAction(api, manifest, result, {
        containerId,
        entryId,
      });

      ui.notifications?.info(`${itemName} marqué comme modifié`);
      return;
    }

    if (action === "delete") {
      const confirmed = await confirmInventoryAction({
        title: `Supprimer — ${itemName}`,
        content:
          `Supprimer "${itemName}" du paquetage ? L’entrée restera conservée dans l’archive d’expédition.`,
        confirmLabel: "Supprimer",
      });

      if (!confirmed) return;

      const result = api.expeditionItems.delete(manifest, {
        containerId,
        entryId,
        note: "Supprimé depuis l’interface d’inventaire",
      });

      if (!result?.changed) {
        ui.notifications?.warn(
          result?.reason ?? `Impossible de supprimer ${itemName}.`
        );
        return;
      }

      await commitInventoryAction(api, manifest, result, {
        containerId,
        entryId,
        archiveTerminal: true,
      });

      ui.notifications?.info(`${itemName} supprimé du paquetage`);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | inventory item action failed`, error);
    ui.notifications?.error(
      `Action impossible sur ${itemName}. Voir la console pour le détail.`
    );
  }
}



async function loadFreshSelectedEntry(selection) {
  const api = getApi();

  if (
    !selection?.expeditionId ||
    !selection?.containerId ||
    !selection?.entryId ||
    !api?.expeditionManifest?.load
  ) {
    return null;
  }

  const manifest = await api.expeditionManifest.load(
    selection.expeditionId
  );

  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === selection.containerId
  );

  const entry = (container?.contents ?? []).find(
    (candidate) => candidate.entryId === selection.entryId
  );

  if (!container || !entry) return null;

  return { api, manifest, container, entry };
}

function getNativeObjectActionContext(dialog) {
  const actionsHost = dialog.querySelector(
    ".dct-expedition-item-panel .dct-expedition-item-actions"
  );

  if (!(actionsHost instanceof HTMLElement)) return null;

  const returnButton = actionsHost.querySelector(
    'button[data-expedition-action="return-to-actor"]'
  );

  if (!(returnButton instanceof HTMLButtonElement)) return null;

  const containerId = returnButton.dataset.containerId ?? null;
  const entryId = returnButton.dataset.entryId ?? null;

  if (!containerId || !entryId) return null;

  return {
    actionsHost,
    returnButton,
    containerId,
    entryId,
  };
}

async function loadFreshNativeEntry(
  expeditionId,
  containerId,
  entryId
) {
  const api = getApi();

  if (!api?.expeditionManifest?.load || !expeditionId) return null;

  const manifest = await api.expeditionManifest.load(expeditionId);

  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === containerId
  );

  const entry = (container?.contents ?? []).find(
    (candidate) => candidate.entryId === entryId
  );

  if (!container || !entry) return null;

  return { manifest, container, entry };
}

function createNativeSiblingButton({
  returnButton,
  action,
  label,
  iconClass,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dhctInventoryAction = action;

  if (returnButton.className) {
    button.className = returnButton.className;
  }

  const icon = document.createElement("i");
  icon.className = iconClass;

  button.append(icon, document.createTextNode(` ${label}`));
  return button;
}


function actorFromContainerHolder(container) {
  const uuid = container?.holderRef?.foundryActorUuid;

  if (!uuid || typeof uuid !== "string") return null;

  if (uuid.startsWith("Actor.")) {
    return game.actors?.get(uuid.slice(6)) ?? null;
  }

  return game.actors?.get(uuid) ?? null;
}

async function resolveChatItem(entry, actor) {
  const ref = entry?.itemRef;

  if (!ref) return null;

  if (ref.uuid) {
    const direct = await fromUuid(ref.uuid).catch(() => null);

    if (direct?.documentName === "Item") {
      return direct;
    }
  }

  if (ref.sourceId) {
    const source = await fromUuid(ref.sourceId).catch(() => null);

    if (source?.documentName === "Item") {
      return source;
    }
  }

  if (
    ref.snapshot &&
    typeof ref.snapshot === "object" &&
    CONFIG.Item?.documentClass
  ) {
    const data = structuredClone(ref.snapshot);

    // A transient embedded Item is sufficient for Daggerheart's toChat().
    // It is never inserted into the Actor collection.
    try {
      return new CONFIG.Item.documentClass(
        data,
        actor ? { parent: actor } : {}
      );
    } catch (error) {
      console.warn(
        `${MODULE_ID} | transient chat item creation failed`,
        error
      );
    }
  }

  return null;
}

async function sendEntryToNativeChat(container, entry) {
  const actor = actorFromContainerHolder(container);
  const item = await resolveChatItem(entry, actor);

  if (!item || typeof item.toChat !== "function") {
    ui.notifications?.warn(
      `Impossible d’envoyer ${entry?.itemRef?.name ?? "cet objet"} dans le chat.`
    );

    return {
      sent: false,
      reason: "chat-item-unavailable",
    };
  }

  const actorUuid = actor?.uuid ?? null;

  await item.toChat(actorUuid);

  return {
    sent: true,
    actorUuid,
    itemName: item.name ?? entry?.itemRef?.name ?? null,
  };
}


function applyPlayerObjectDetailVisibility(dialog) {
  if (!(dialog instanceof HTMLElement)) return;

  const panel = dialog.querySelector(".dct-expedition-item-panel");
  if (!(panel instanceof HTMLElement)) return;

  const detail = panel.querySelector(".dct-expedition-item-detail");
  if (!(detail instanceof HTMLElement)) return;

  const technicalRefs = [
    ...detail.querySelectorAll("small"),
  ].filter((node) => {
    const value = (node.textContent ?? "").trim();

    return (
      value.startsWith("Actor.") ||
      value.startsWith("Compendium.") ||
      value.startsWith("Item.") ||
      value.includes(".Item.")
    );
  });

  for (const node of technicalRefs) {
    node.hidden = !game.user?.isGM;
    node.dataset.dhctTechnicalRef = "true";
  }
}

async function injectNativeObjectActions(dialog, manifest) {
  const context = getNativeObjectActionContext(dialog);

  if (!context) {
    return {
      green: false,
      reason: "native-object-action-context-not-found",
    };
  }

  const {
    actionsHost,
    returnButton,
    containerId,
    entryId,
  } = context;

  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === containerId
  );

  const entry = (container?.contents ?? []).find(
    (candidate) => candidate.entryId === entryId
  );

  if (!entry) {
    return {
      green: false,
      reason: "selected-entry-not-found",
    };
  }

  const lifecycle = entry?.itemRef?.lifecycle?.state ?? "legacy";

  if (!["active", "modified", "legacy"].includes(lifecycle)) {
    actionsHost
      .querySelectorAll("[data-dhct-inventory-action]")
      .forEach((node) => node.remove());

    return {
      green: false,
      reason: "selected-entry-not-actionable",
    };
  }

  const existing = [
    ...actionsHost.querySelectorAll("[data-dhct-inventory-action]"),
  ];

  const sameSelection =
    existing.length > 0 &&
    existing.every(
      (button) =>
        button.dataset.containerId === containerId &&
        button.dataset.entryId === entryId
    );

  if (sameSelection) {
    return {
      green: true,
      containerId,
      entryId,
      buttons: existing.length,
      reused: true,
    };
  }

  existing.forEach((node) => node.remove());

  const run = async (action) => {
    const fresh = await loadFreshNativeEntry(
      manifest.expeditionId,
      containerId,
      entryId
    );

    if (!fresh) {
      ui.notifications?.warn(
        "Cet objet n’est plus disponible dans le paquetage."
      );
      return;
    }

    if (action === "consume") {
      try {
        await sendEntryToNativeChat(
          fresh.container,
          fresh.entry
        );
      } catch (error) {
        console.warn(
          `${MODULE_ID} | native consumable chat card failed`,
          error
        );
      }
    }

    await handleInventoryItemAction(action, fresh);
  };

  const specs = [];

  if (entry?.itemRef?.type === "consumable") {
    specs.push({
      action: "consume",
      label: "Consommer",
      iconClass: "fa-solid fa-flask",
    });
  }

  if (game.user?.isGM) {
    specs.push({
      action: "modify",
      label: "Modifier",
      iconClass: "fa-solid fa-pen",
    });
  }

  specs.push({
    action: "delete",
    label: "Supprimer",
    iconClass: "fa-solid fa-trash",
  });

  for (const spec of specs) {
    const button = createNativeSiblingButton({
      returnButton,
      ...spec,
    });

    button.dataset.containerId = containerId;
    button.dataset.entryId = entryId;

    button.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
      },
      true
    );

    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await run(spec.action);
      },
      true
    );

    actionsHost.append(button);
  }

  return {
    green: true,
    containerId,
    entryId,
    buttons: specs.length,
    reused: false,
  };
}

function annotateVisibleInventoryItems(dialog, manifest) {
  dialog.querySelectorAll(".dhct-item-lifecycle-badge").forEach((node) => {
    node.remove();
  });


  let annotated = 0;

  for (const container of manifest?.containers ?? []) {
    for (const entry of container?.contents ?? []) {
      const state = entry?.itemRef?.lifecycle?.state ?? "legacy";

      if (!["active", "modified", "legacy"].includes(state)) continue;

      const name = entry?.itemRef?.name;
      const label = findVisibleItemLabel(dialog, name);
      if (!label) continue;

      const host = candidateItemHost(label, dialog);
      if (!(host instanceof HTMLElement)) continue;

      // If the renderer exposes no useful class/data attribute, mark our host
      // so future refreshes can find it deterministically.
      host.dataset.dhctEntryId = entry.entryId ?? "";
      host.style.position ||= "relative";

      const badge = document.createElement("span");
      badge.className = "dhct-item-lifecycle-badge";
      badge.dataset.state = state;

      const quantity = Math.max(0, Number(entry.quantity) || 0);
      const quantityText = quantity > 1 ? ` ×${quantity}` : "";

      badge.textContent = `${lifecycleLabel(state)}${quantityText}`;
      badge.title = `${name} — ${lifecycleLabel(state)}${quantityText}`;

      host.append(badge);
      annotated += 1;
    }
  }

  return annotated;
}



function applyExpeditionDialogLayout(dialog) {
  if (!(dialog instanceof HTMLDialogElement)) {
    return {
      green: false,
      reason: "dialog-not-found",
    };
  }

  if (!dialog.dataset.dhctBaseHeight) {
    const nativeHeight = Math.max(
      1,
      Math.round(dialog.getBoundingClientRect().height)
    );

    dialog.dataset.dhctBaseHeight = String(nativeHeight);
  }

  const baseHeight = Math.max(
    1,
    Number(dialog.dataset.dhctBaseHeight) ||
      Math.round(dialog.getBoundingClientRect().height)
  );

  const requestedHeight = Math.round(baseHeight * 1.10);
  const viewportLimit = Math.floor(window.innerHeight * 0.94);
  const appliedHeight = Math.min(requestedHeight, viewportLimit);

  dialog.style.height = `${appliedHeight}px`;
  dialog.style.maxHeight = "94vh";
  dialog.classList.add("dhct-expedition-layout");

  const windowContent = dialog.querySelector(".window-content");
  if (windowContent instanceof HTMLElement) {
    windowContent.classList.add(
      "dhct-expedition-layout__window-content"
    );
  }

  const form = dialog.querySelector(".dialog-form");
  if (form instanceof HTMLElement) {
    form.classList.add("dhct-expedition-layout__form");
  }

  const content = dialog.querySelector(".dialog-content");
  if (content instanceof HTMLElement) {
    content.classList.add("dhct-expedition-layout__content");
  }

  const expeditionWindow = dialog.querySelector(".dct-expedition-window");
  if (expeditionWindow instanceof HTMLElement) {
    expeditionWindow.classList.add("dhct-expedition-layout__window");
  }

  const browser = dialog.querySelector(".dct-expedition-browser");
  if (browser instanceof HTMLElement) {
    browser.classList.add("dhct-expedition-layout__browser");
  }

  const closeHost = findCloseHost(expeditionWindow);
  if (closeHost instanceof HTMLElement) {
    closeHost.classList.add("dhct-expedition-layout__footer");
  }

  return {
    green: true,
    baseHeight,
    requestedHeight,
    appliedHeight,
    browser: Boolean(browser),
    footer: Boolean(closeHost),
  };
}

function findExpeditionWindow(dialog) {
  return dialog.querySelector(".dct-expedition-window");
}

function findCloseHost(expeditionWindow) {
  if (!(expeditionWindow instanceof HTMLElement)) return null;

  return [...expeditionWindow.children].find((child) => {
    if (!(child instanceof HTMLElement)) return false;

    return [...child.querySelectorAll("button")].some(
      (button) => normalizeText(button.textContent) === "fermer"
    );
  }) ?? null;
}

function findTechnicalNodes(expeditionWindow, browser, closeHost) {
  if (!(expeditionWindow instanceof HTMLElement)) return [];

  return [...expeditionWindow.children].filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child === browser || child === closeHost) return false;
    if (child.classList.contains(ROLE_TABS_CLASS)) return false;

    const text = normalizeText(child.textContent);

    return (
      text.includes("web") ||
      text.includes("foundry") ||
      text.includes("journal")
    );
  });
}

function activateRoleTab(tabs, name) {
  if (!(tabs instanceof HTMLElement)) return;

  for (const button of tabs.querySelectorAll("[data-dhct-tab]")) {
    const active = button.dataset.dhctTab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }

  for (const pane of tabs.querySelectorAll("[data-dhct-pane]")) {
    pane.hidden = pane.dataset.dhctPane !== name;
  }
}

function makeRoleTabButton(name, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${ROLE_TABS_CLASS}__button`;
  button.dataset.dhctTab = name;
  button.setAttribute("role", "tab");
  button.textContent = label;
  return button;
}


function backpackAccessState(container) {
  return container?.presentation?.accessState === "stored"
    ? "stored"
    : "available";
}

function backpackStoredAt(container) {
  return String(container?.presentation?.storedAt ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeAccessToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function inferredSharedRole(container) {
  const explicit = normalizeAccessToken(
    container?.presentation?.playerRole
  );

  if (["fob", "caravan", "ground"].includes(explicit)) {
    return explicit;
  }

  const type = normalizeAccessToken(container?.type);
  const name = normalizeAccessToken(container?.name);

  if (type === "caravan" || name.includes("caravane") || name.includes("caravan")) {
    return "caravan";
  }

  if (
    ["fob", "camp", "forward-base", "forward_base", "forwardbase"].includes(type) ||
    name === "fob" ||
    name.includes("camp avance") ||
    name.includes("forward operating base")
  ) {
    return "fob";
  }

  if (
    ["ground", "floor", "sol"].includes(type) ||
    name === "sol" ||
    name.includes("zone au sol") ||
    name.includes("ground")
  ) {
    return "ground";
  }

  return null;
}

function sharedPlayerAccessEnabled(container) {
  return container?.presentation?.playerAccess === true;
}

function actorFromHolderRef(holderRef) {
  const uuid =
    holderRef?.foundryActorUuid ??
    holderRef?.actorUuid ??
    holderRef?.uuid ??
    null;

  if (!uuid) return null;

  try {
    if (typeof fromUuidSync === "function") {
      const doc = fromUuidSync(uuid);
      if (doc?.documentName === "Actor") return doc;
    }
  } catch (_error) {
    // Fall through to direct Actor lookup.
  }

  if (String(uuid).startsWith("Actor.")) {
    return game.actors?.get(String(uuid).slice(6)) ?? null;
  }

  return game.actors?.get(String(uuid)) ?? null;
}

function userOwnsBackpack(user, container) {
  if (container?.type !== "backpack") return false;

  const actor = actorFromHolderRef(container?.holderRef);
  if (!actor || !user) return false;

  const assignedCharacter = user.character ?? null;

  if (assignedCharacter) {
    return actor.id === assignedCharacter.id;
  }

  if (typeof actor.testUserPermission === "function") {
    return actor.testUserPermission(user, "OWNER");
  }

  return user.id === game.user?.id ? Boolean(actor.isOwner) : false;
}

function playerOwnsBackpack(container) {
  return userOwnsBackpack(game.user, container);
}

function userCanAccessContainer(user, container) {
  if (!container || !user) return false;
  if (user.isGM) return true;

  if (container.type === "backpack") {
    return (
      userOwnsBackpack(user, container) &&
      backpackAccessState(container) !== "stored"
    );
  }

  const role = inferredSharedRole(container);

  return Boolean(
    role &&
    ["fob", "caravan", "ground"].includes(role) &&
    sharedPlayerAccessEnabled(container)
  );
}

function playerCanAccessContainer(container) {
  return userCanAccessContainer(game.user, container);
}

function filterPlayerContainers(dialog, manifest) {
  if (game.user?.isGM) {
    return {
      hidden: 0,
      visible: (manifest?.containers ?? []).length,
    };
  }

  const allowedIds = new Set(
    (manifest?.containers ?? [])
      .filter(playerCanAccessContainer)
      .map((container) => container.containerId)
      .filter(Boolean)
  );

  const allIds = new Set(
    (manifest?.containers ?? [])
      .map((container) => container?.containerId)
      .filter(Boolean)
  );

  const hiddenIds = [...allIds].filter((id) => !allowedIds.has(id));

  let removed = 0;

  // Remove the renderer's container-bound roots for every unauthorized
  // container. Work deepest-first to avoid counting/removing stale children.
  const candidates = [...dialog.querySelectorAll("[data-container-id]")]
    .filter((node) => hiddenIds.includes(node.dataset.containerId))
    .sort((a, b) => {
      const depth = (node) => {
        let n = node;
        let d = 0;
        while (n?.parentElement) {
          d += 1;
          n = n.parentElement;
        }
        return d;
      };
      return depth(b) - depth(a);
    });

  for (const node of candidates) {
    if (!(node instanceof HTMLElement) || !node.isConnected) continue;

    // Prefer the container list/detail root, but never climb into the whole
    // browser.
    const root =
      node.closest?.(".dct-expedition-container-list-item") ??
      node.closest?.(".dct-expedition-container") ??
      node;

    if (
      root instanceof HTMLElement &&
      root.isConnected &&
      !root.classList.contains("dct-expedition-browser")
    ) {
      root.remove();
      removed += 1;
    }
  }

  return {
    hidden: hiddenIds.length,
    visible: allowedIds.size,
    allowedIds: [...allowedIds],
  };
}


const SHARED_CONTAINER_SPECS = Object.freeze([
  Object.freeze({
    containerId: "ground",
    name: "Sol",
    role: "ground",
    slots: 12,
    playerAccess: true,
  }),
  Object.freeze({
    containerId: "fob",
    name: "FOB",
    role: "fob",
    slots: 24,
    playerAccess: false,
  }),
  Object.freeze({
    containerId: "caravan",
    name: "Caravane",
    role: "caravan",
    slots: 40,
    playerAccess: false,
  }),
]);

function buildSharedContainer(manifest, spec) {
  return {
    containerId: spec.containerId,
    type: "caravan",
    name: spec.name,
    scope: "expedition",
    holderRef: {
      kind: "expedition",
      id: manifest.expeditionId,
    },
    capacity: {
      slots: spec.slots,
    },
    layout: {
      slots: Array.from({ length: spec.slots }, (_, index) => ({
        slotId: `slot-${index + 1}`,
      })),
    },
    rules: [],
    contents: [],
    presentation: {
      playerRole: spec.role,
      playerAccess: spec.playerAccess,
    },
  };
}

async function ensureSharedContainers(api, manifest) {
  if (!game.user?.isGM) {
    return { green: false, reason: "not-gm", changed: false };
  }

  manifest.containers ??= [];

  const byId = new Map(
    manifest.containers
      .filter((container) => container?.containerId)
      .map((container) => [container.containerId, container])
  );

  const created = [];
  let metadataChanged = false;

  for (const spec of SHARED_CONTAINER_SPECS) {
    let container = byId.get(spec.containerId);

    if (!container) {
      container = buildSharedContainer(manifest, spec);
      manifest.containers.push(container);
      byId.set(container.containerId, container);
      created.push(container.containerId);
      continue;
    }

    // Never overwrite existing content, capacity or name.
    container.presentation ??= {};

    if (!container.presentation.playerRole) {
      container.presentation.playerRole = spec.role;
      metadataChanged = true;
    }

    if (container.presentation.playerAccess == null) {
      container.presentation.playerAccess = spec.playerAccess;
      metadataChanged = true;
    }
  }

  if (!created.length && !metadataChanged) {
    return {
      green: true,
      changed: false,
      created: [],
    };
  }

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  const validation = api.expeditionManifest.validate?.(manifest);

  if (validation && validation.green === false) {
    throw new Error(
      `Manifest invalide après création des conteneurs partagés : ${(validation.errors ?? []).join("; ")}`
    );
  }

  await api.expeditionManifest.save(manifest);

  broadcastBackpackAccessChange(manifest, null);

  Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
    manifest,
    reason: "shared-containers-bootstrap",
    created,
  });

  return {
    green: true,
    changed: true,
    created,
  };
}

function sharedRoleLabel(role) {
  switch (role) {
    case "fob":
      return "FOB";
    case "caravan":
      return "Caravane";
    case "ground":
      return "Sol";
    default:
      return "Masqué";
  }
}

function renderGmSharedAccessManagement(manifest) {
  const containers = (manifest?.containers ?? []).filter(
    (container) => container?.type !== "backpack"
  );

  const rows = containers.map((container) => {
    const role = inferredSharedRole(container) ?? "";
    const enabled = sharedPlayerAccessEnabled(container);

    return `
      <article
        class="dhct-shared-access-card"
        data-dhct-shared-access="${escapeHtml(container.containerId)}"
      >
        <div class="dhct-shared-access-copy">
          <strong>${escapeHtml(container.name)}</strong>
          <small>${escapeHtml(container.type ?? "container")} · ${escapeHtml(container.scope ?? "?")}</small>
        </div>

        <label>
          <span>Rôle joueur</span>
          <select data-dhct-shared-role>
            <option value="" ${role ? "" : "selected"}>Masqué</option>
            <option value="fob" ${role === "fob" ? "selected" : ""}>FOB</option>
            <option value="caravan" ${role === "caravan" ? "selected" : ""}>Caravane</option>
            <option value="ground" ${role === "ground" ? "selected" : ""}>Sol</option>
          </select>
        </label>

        <label class="dhct-shared-access-toggle">
          <input
            type="checkbox"
            data-dhct-shared-enabled
            ${enabled ? "checked" : ""}
            ${role ? "" : "disabled"}
          />
          <span>Accès joueur</span>
        </label>

        <button type="button" data-dhct-shared-save>
          <i class="fa-solid fa-floppy-disk"></i>
          Enregistrer
        </button>
      </article>
    `;
  }).join("");

  return `
    <section class="dhct-shared-access-panel">
      <header>
        <h3>Accès joueurs aux conteneurs partagés</h3>
        <p>
          Les joueurs ne voient que leur sac personnel et les conteneurs
          FOB, Caravane ou Sol explicitement autorisés ici.
        </p>
      </header>

      <div class="dhct-shared-access-list">
        ${rows || "<p>Aucun conteneur partagé à configurer.</p>"}
      </div>
    </section>
  `;
}

async function saveSharedAccessAdministration(api, {
  expeditionId,
  containerId,
  role,
  enabled,
} = {}) {
  const manifest = await api.expeditionManifest.load(expeditionId);
  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === containerId
  );

  if (!container || container.type === "backpack") {
    throw new Error("Conteneur partagé introuvable.");
  }

  const cleanRole = ["fob", "caravan", "ground"].includes(role)
    ? role
    : null;

  container.presentation ??= {};

  if (cleanRole) {
    container.presentation.playerRole = cleanRole;
    container.presentation.playerAccess = Boolean(enabled);
  } else {
    delete container.presentation.playerRole;
    container.presentation.playerAccess = false;
  }

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  const validation = api.expeditionManifest.validate?.(manifest);
  if (validation && validation.green === false) {
    throw new Error(
      `Manifest invalide : ${(validation.errors ?? []).join("; ")}`
    );
  }

  await api.expeditionManifest.save(manifest);

  broadcastBackpackAccessChange(manifest, containerId);

  Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
    manifest,
    containerId,
    reason: "shared-container-access",
  });

  await reopenExpeditionDialog(api, manifest);
}

function injectGmSharedAccessManagement(dialog, manifest, api) {
  if (!game.user?.isGM) return { green: false, reason: "not-gm" };

  const gmPane = dialog.querySelector(
    `.${ROLE_TABS_CLASS} [data-dhct-pane="${GM_TAB_ID}"]`
  );

  if (!(gmPane instanceof HTMLElement)) {
    return { green: false, reason: "gm-pane-not-found" };
  }

  const expeditionId = String(manifest?.expeditionId ?? "");
  const revision = String(manifest?.revision ?? "");
  const existing = gmPane.querySelector(".dhct-shared-access-panel");

  if (
    existing instanceof HTMLElement &&
    existing.dataset.expeditionId === expeditionId &&
    existing.dataset.manifestRevision === revision
  ) {
    return {
      green: true,
      reused: true,
      containers: existing.querySelectorAll("[data-dhct-shared-access]").length,
    };
  }

  existing?.remove();

  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderGmSharedAccessManagement(manifest).trim();
  const panel = wrapper.firstElementChild;

  if (!(panel instanceof HTMLElement)) {
    return { green: false, reason: "panel-build-failed" };
  }

  panel.dataset.expeditionId = expeditionId;
  panel.dataset.manifestRevision = revision;

  const backpackPanel = gmPane.querySelector(".dhct-backpack-admin-panel");
  if (backpackPanel instanceof HTMLElement) {
    backpackPanel.insertAdjacentElement("afterend", panel);
  } else {
    gmPane.prepend(panel);
  }

  for (const card of panel.querySelectorAll("[data-dhct-shared-access]")) {
    const containerId = card.dataset.dhctSharedAccess;
    const roleSelect = card.querySelector("[data-dhct-shared-role]");
    const enabledInput = card.querySelector("[data-dhct-shared-enabled]");
    const saveButton = card.querySelector("[data-dhct-shared-save]");

    roleSelect?.addEventListener("change", () => {
      if (enabledInput instanceof HTMLInputElement) {
        enabledInput.disabled = !roleSelect.value;
        if (!roleSelect.value) enabledInput.checked = false;
      }
    });

    const persist = async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (saveButton instanceof HTMLButtonElement) {
        saveButton.disabled = true;
      }

      try {
        await saveSharedAccessAdministration(api, {
          expeditionId: manifest.expeditionId,
          containerId,
          role: roleSelect?.value ?? "",
          enabled: Boolean(enabledInput?.checked),
        });
      } catch (error) {
        console.error(`${MODULE_ID} | shared access administration failed`, error);
        ui.notifications?.error(
          error?.message ?? "Échec de la configuration des droits du conteneur."
        );

        if (saveButton instanceof HTMLButtonElement) {
          saveButton.disabled = false;
        }
      }
    };

    saveButton?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    saveButton?.addEventListener("click", persist);

    for (const control of [roleSelect, enabledInput]) {
      control?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      control?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    }
  }

  return {
    green: true,
    reused: false,
    containers: panel.querySelectorAll("[data-dhct-shared-access]").length,
  };
}


function normalizeBackpackSlots(container, slotCount) {
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  const contents = Array.isArray(container?.contents) ? container.contents : [];

  if (contents.length > count) {
    return {
      green: false,
      reason: `Impossible de réduire à ${count} slots : ${contents.length} objet(s) sont encore présents.`,
    };
  }

  const oldSlots = Array.isArray(container?.layout?.slots)
    ? container.layout.slots
    : [];

  const oldById = new Map(
    oldSlots
      .filter((slot) => slot?.slotId)
      .map((slot) => [slot.slotId, slot])
  );

  const slots = Array.from({ length: count }, (_, index) => {
    const slotId = `slot-${index + 1}`;
    return {
      ...(oldById.get(slotId) ?? {}),
      slotId,
    };
  });

  container.capacity ??= {};
  container.capacity.slots = count;
  container.layout ??= {};
  container.layout.slots = slots;

  // Compact contents deterministically so every entry still points to
  // an existing unique slot after a capacity edit.
  contents.forEach((entry, index) => {
    entry.slotId = slots[index]?.slotId ?? null;
  });

  return { green: true, slots: count };
}



const pendingAuthorityRequests = new Map();

function activeAuthorityGm() {
  return [...(game.users ?? [])]
    .filter((user) => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function makeAuthorityRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `dhct-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitAuthorityResult(message, result) {
  game.socket?.emit?.(SOCKET_CHANNEL, {
    type: SOCKET_INVENTORY_RESULT,
    requestId: message?.requestId ?? null,
    sourceUserId: game.user?.id ?? null,
    targetUserId: message?.sourceUserId ?? null,
    expeditionId: message?.expeditionId ?? null,
    ...result,
  });
}

async function processInventoryAuthorityRequest(message) {
  const api = getApi();

  if (
    !game.user?.isGM ||
    !api?.expeditionManifest?.load ||
    !api?.expeditionManifest?.save
  ) {
    return { green: false, reason: "authority-api-unavailable" };
  }

  const requester = game.users?.get(message?.sourceUserId) ?? null;
  if (!requester) {
    return { green: false, reason: "requester-not-found" };
  }

  const expeditionId = String(message?.expeditionId ?? "").trim();
  if (!expeditionId) {
    return { green: false, reason: "expedition-id-required" };
  }

  const manifest = await api.expeditionManifest.load(expeditionId);
  if (!manifest) {
    return { green: false, reason: "manifest-not-found" };
  }

  if (message.action === "transfer") {
    const from = (manifest.containers ?? []).find(
      (container) => container.containerId === message.fromContainerId
    );
    const to = (manifest.containers ?? []).find(
      (container) => container.containerId === message.toContainerId
    );

    if (!from || !to) {
      return { green: false, reason: "container-not-found" };
    }

    if (
      !userCanAccessContainer(requester, from) ||
      !userCanAccessContainer(requester, to)
    ) {
      return { green: false, reason: "container-access-denied" };
    }

    const result = api.expeditionManifest.transfer(manifest, {
      entryId: message.entryId,
      fromContainerId: message.fromContainerId,
      toContainerId: message.toContainerId,
      toSlotId: message.toSlotId ?? null,
    });

    if (!result?.moved) {
      return {
        green: false,
        reason: result?.reason ?? "transfer-refused",
      };
    }

    const validation = api.expeditionManifest.validate?.(manifest);
    if (validation && validation.green === false) {
      return {
        green: false,
        reason: `manifest-invalid: ${(validation.errors ?? []).join("; ")}`,
      };
    }

    await api.expeditionManifest.save(manifest);
    broadcastBackpackAccessChange(manifest, message.toContainerId);

    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      source: "gm-authority-transfer",
      requestUserId: requester.id,
      fromContainerId: message.fromContainerId,
      containerId: message.toContainerId,
      entryId: message.entryId,
    });

    return {
      green: true,
      action: "transfer",
      revision: manifest.revision ?? null,
      containerId: message.toContainerId,
      entryId: message.entryId,
    };
  }

  if (message.action === "acquire-item") {
    const to = (manifest.containers ?? []).find(
      (container) => container.containerId === message.toContainerId
    );

    if (!to) {
      return { green: false, reason: "container-not-found" };
    }

    if (!userCanAccessContainer(requester, to)) {
      return { green: false, reason: "container-access-denied" };
    }

    const item = message.itemUuid
      ? await fromUuid(message.itemUuid).catch(() => null)
      : null;

    if (!item || item.documentName !== "Item") {
      return { green: false, reason: "item-not-found" };
    }

    if (!api?.expeditionItems?.acquire) {
      return { green: false, reason: "expedition-item-acquire-unavailable" };
    }

    const result = api.expeditionItems.acquire(manifest, {
      containerId: message.toContainerId,
      item,
      quantity: Math.max(1, Math.floor(Number(message.quantity) || 1)),
      note: `Déposé par ${requester.name ?? "joueur"} depuis une fiche Foundry`,
    });

    if (!result?.acquired) {
      return {
        green: false,
        reason: result?.reason ?? "acquire-refused",
      };
    }

    const validation = api.expeditionManifest.validate?.(manifest);
    if (validation && validation.green === false) {
      return {
        green: false,
        reason: `manifest-invalid: ${(validation.errors ?? []).join("; ")}`,
      };
    }

    await api.expeditionManifest.save(manifest);
    broadcastBackpackAccessChange(manifest, message.toContainerId);

    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      source: "gm-authority-acquire",
      requestUserId: requester.id,
      containerId: message.toContainerId,
      entryId: result.entry?.entryId ?? null,
      itemUuid: item.uuid,
    });

    return {
      green: true,
      action: "acquire-item",
      revision: manifest.revision ?? null,
      containerId: message.toContainerId,
      entryId: result.entry?.entryId ?? null,
      itemName: item.name ?? null,
    };
  }

  return { green: false, reason: "unsupported-authority-action" };
}

async function requestInventoryAuthorityAction(payload = {}) {
  const authority = activeAuthorityGm();

  if (!authority) {
    return { green: false, reason: "no-active-gm" };
  }

  const message = {
    type: SOCKET_INVENTORY_REQUEST,
    requestId: makeAuthorityRequestId(),
    sourceUserId: game.user?.id ?? null,
    expeditionId: payload.expeditionId ?? null,
    action: payload.action ?? null,
    fromContainerId: payload.fromContainerId ?? null,
    toContainerId: payload.toContainerId ?? null,
    toSlotId: payload.toSlotId ?? null,
    entryId: payload.entryId ?? null,
    itemUuid: payload.itemUuid ?? null,
    quantity: payload.quantity ?? 1,
  };

  if (game.user?.isGM && authority.id === game.user.id) {
    const result = await processInventoryAuthorityRequest(message);
    if (result?.green) {
      await refreshExpeditionFromRemoteChange({
        expeditionId: message.expeditionId,
        revision: result.revision,
      });
    }
    return result;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingAuthorityRequests.delete(message.requestId);
      resolve({ green: false, reason: "authority-timeout" });
    }, AUTHORITY_REQUEST_TIMEOUT_MS);

    pendingAuthorityRequests.set(message.requestId, {
      resolve,
      timer,
      expeditionId: message.expeditionId,
    });

    game.socket.emit(SOCKET_CHANNEL, message);
  });
}

function installExternalItemDragBridge() {
  if (document.documentElement.dataset.dhctExternalItemDrag === "1") {
    return { green: true, reused: true };
  }

  document.documentElement.dataset.dhctExternalItemDrag = "1";

  const markLink = (target) => {
    const link = target?.closest?.("[data-uuid]");
    if (!(link instanceof HTMLElement)) return null;

    const uuid = String(link.dataset.uuid ?? "");
    if (!uuid || !(uuid.startsWith("Item.") || uuid.includes(".Item."))) {
      return null;
    }

    link.draggable = true;
    link.dataset.dhctItemDrag = "1";
    return link;
  };

  document.addEventListener(
    "pointerover",
    (event) => {
      markLink(event.target);
    },
    true
  );

  document.addEventListener(
    "dragstart",
    (event) => {
      const link = markLink(event.target);
      if (!link || !event.dataTransfer) return;

      const uuid = String(link.dataset.uuid ?? "");
      event.dataTransfer.setData(
        "application/x-dct-foundry-item",
        JSON.stringify({ itemUuid: uuid })
      );
      event.dataTransfer.effectAllowed = "copy";
    },
    true
  );

  return { green: true, reused: false };
}

globalThis.dhctExpeditionAuthority = {
  ...(globalThis.dhctExpeditionAuthority ?? {}),
  request: requestInventoryAuthorityAction,
};

function broadcastBackpackAccessChange(manifest, containerId) {
  if (!game.socket?.emit) return false;

  game.socket.emit(SOCKET_CHANNEL, {
    type: SOCKET_BACKPACK_ACCESS,
    sourceUserId: game.user?.id ?? null,
    expeditionId: manifest?.expeditionId ?? null,
    revision: manifest?.revision ?? null,
    containerId: containerId ?? null,
  });

  return true;
}

async function refreshExpeditionFromRemoteChange({
  expeditionId,
  revision,
} = {}) {
  const api = getApi();

  if (!expeditionId || !api?.expeditionManifest?.load) {
    return { green: false, reason: "manifest-api-unavailable" };
  }

  const dialog = findOpenExpeditionDialog();

  // Nothing is currently open: the next manual open will load persisted state.
  if (!dialog) {
    return {
      green: true,
      refreshed: false,
      reason: "dialog-not-open",
    };
  }

  try {
    const fresh = await api.expeditionManifest.load(expeditionId);

    if (!fresh) {
      return { green: false, reason: "manifest-not-found" };
    }

    // Ignore a stale socket packet when persistent storage is already newer.
    if (
      Number.isFinite(Number(revision)) &&
      Number.isFinite(Number(fresh.revision)) &&
      Number(fresh.revision) < Number(revision)
    ) {
      console.warn(
        `${MODULE_ID} | remote backpack refresh saw an older persisted revision`,
        {
          requestedRevision: revision,
          persistedRevision: fresh.revision,
        }
      );
    }

    await reopenExpeditionDialog(api, fresh);

    return {
      green: true,
      refreshed: true,
      revision: fresh.revision ?? null,
    };
  } catch (error) {
    console.warn(
      `${MODULE_ID} | remote backpack access refresh failed`,
      error
    );

    return {
      green: false,
      reason: error?.message ?? "remote-refresh-failed",
    };
  }
}

function installExpeditionSocketSync() {
  if (!game.socket?.on) {
    return { green: false, reason: "socket-unavailable" };
  }

  if (game.socket.__dhctExpeditionInventorySyncInstalled) {
    return { green: true, reused: true };
  }

  game.socket.__dhctExpeditionInventorySyncInstalled = true;

  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (!message) return;

    if (message.type === SOCKET_INVENTORY_REQUEST) {
      const authority = activeAuthorityGm();

      if (
        !game.user?.isGM ||
        !authority ||
        authority.id !== game.user.id
      ) {
        return;
      }

      let result;
      try {
        result = await processInventoryAuthorityRequest(message);
      } catch (error) {
        console.error(`${MODULE_ID} | GM inventory authority request failed`, error);
        result = {
          green: false,
          reason: error?.message ?? "authority-request-failed",
        };
      }

      emitAuthorityResult(message, result);

      // The authoritative GM is also the writer, so its own socket broadcast
      // is intentionally ignored. Refresh the local GM window explicitly from
      // the persisted manifest after a successful player request.
      if (result?.green) {
        await refreshExpeditionFromRemoteChange({
          expeditionId: message.expeditionId,
          revision: result.revision,
        });
      }

      return;
    }

    if (message.type === SOCKET_INVENTORY_RESULT) {
      if (message.targetUserId !== game.user?.id) return;

      const pending = pendingAuthorityRequests.get(message.requestId);
      if (!pending) return;

      pendingAuthorityRequests.delete(message.requestId);
      clearTimeout(pending.timer);

      if (message.green) {
        await refreshExpeditionFromRemoteChange({
          expeditionId: message.expeditionId,
          revision: message.revision,
        });
      }

      pending.resolve({
        green: Boolean(message.green),
        reason: message.reason ?? null,
        action: message.action ?? null,
        revision: message.revision ?? null,
        containerId: message.containerId ?? null,
        entryId: message.entryId ?? null,
        itemName: message.itemName ?? null,
      });
      return;
    }

    if (message.type !== SOCKET_BACKPACK_ACCESS) return;
    if (message.sourceUserId === game.user?.id) return;

    const result = await refreshExpeditionFromRemoteChange({
      expeditionId: message.expeditionId,
      revision: message.revision,
    });

    if (result?.green && result?.refreshed) {
      Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
        source: "socket",
        expeditionId: message.expeditionId,
        containerId: message.containerId ?? null,
        revision: result.revision ?? message.revision ?? null,
      });
    }
  });

  return { green: true, reused: false };
}

async function saveBackpackAdministration(api, {
  expeditionId,
  containerId,
  name,
  slots,
  accessState,
  storedAt,
} = {}) {
  const manifest = await api.expeditionManifest.load(expeditionId);
  const container = (manifest?.containers ?? []).find(
    (candidate) => candidate.containerId === containerId
  );

  if (!container || container.type !== "backpack") {
    throw new Error("Sac à dos introuvable.");
  }

  const cleanName = String(name ?? "").trim();
  if (!cleanName) throw new Error("Le nom du sac à dos est obligatoire.");

  const slotCount = Math.max(0, Math.floor(Number(slots)));
  if (!Number.isFinite(slotCount)) {
    throw new Error("Le nombre de slots est invalide.");
  }

  const normalized = normalizeBackpackSlots(container, slotCount);
  if (!normalized.green) throw new Error(normalized.reason);

  container.name = cleanName;
  container.presentation ??= {};
  container.presentation.accessState =
    accessState === "stored" ? "stored" : "available";
  container.presentation.storedAt =
    accessState === "stored" ? String(storedAt ?? "").trim() : "";

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  const validation = api.expeditionManifest.validate?.(manifest);
  if (validation && validation.green === false) {
    throw new Error(
      `Manifest invalide : ${(validation.errors ?? []).join("; ")}`
    );
  }

  await api.expeditionManifest.save(manifest);

  broadcastBackpackAccessChange(manifest, containerId);

  Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
    manifest,
    containerId,
    reason: "backpack-administration",
  });

  await reopenExpeditionDialog(api, manifest);
}

function renderGmBackpackManagement(manifest) {
  const backpacks = (manifest?.containers ?? []).filter(
    (container) => container?.type === "backpack"
  );

  const rows = backpacks.map((container) => {
    const state = backpackAccessState(container);
    const stored = state === "stored";
    const storedAt = backpackStoredAt(container);
    const slots = Math.max(0, Number(container?.capacity?.slots) || 0);
    const used = Array.isArray(container?.contents)
      ? container.contents.length
      : 0;
    const owner =
      container?.holderRef?.name ??
      container?.holderRef?.id ??
      "Sans propriétaire";

    return `
      <article
        class="dhct-backpack-admin-card"
        data-dhct-backpack-admin="${escapeHtml(container.containerId)}"
      >
        <header>
          <div>
            <strong>${escapeHtml(container.name)}</strong>
            <small>${escapeHtml(owner)} · ${used}/${slots} slots</small>
          </div>
          <span class="dhct-backpack-admin-state ${stored ? "is-stored" : "is-available"}">
            ${stored ? `Déposé${storedAt ? ` — ${escapeHtml(storedAt)}` : ""}` : "Accessible"}
          </span>
        </header>

        <div class="dhct-backpack-admin-fields">
          <label>
            <span>Nom</span>
            <input
              type="text"
              data-dhct-backpack-name
              value="${escapeHtml(container.name)}"
            />
          </label>

          <label>
            <span>Slots</span>
            <input
              type="number"
              min="${used}"
              step="1"
              data-dhct-backpack-slots
              value="${slots}"
            />
          </label>

          <label class="dhct-backpack-admin-location">
            <span>Lieu d’attente</span>
            <input
              type="text"
              data-dhct-backpack-location
              value="${escapeHtml(storedAt)}"
              placeholder="Ex. Camp avancé, auberge…"
              ${stored ? "" : "disabled"}
            />
          </label>
        </div>

        <div class="dhct-backpack-admin-actions">
          <button type="button" data-dhct-backpack-save>
            <i class="fa-solid fa-floppy-disk"></i>
            Enregistrer
          </button>

          <button
            type="button"
            data-dhct-backpack-toggle
            data-next-state="${stored ? "available" : "stored"}"
          >
            <i class="fa-solid ${stored ? "fa-person-walking-arrow-right" : "fa-location-dot"}"></i>
            ${stored ? "Récupérer" : "Déposer"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  return `
    <section class="dhct-backpack-admin-panel">
      <header class="dhct-backpack-admin-panel__header">
        <div>
          <h3>Gestion des sacs à dos</h3>
          <p>Administration MJ : nom, capacité et disponibilité temporaire.</p>
        </div>
      </header>
      <div class="dhct-backpack-admin-list">
        ${rows || "<p>Aucun sac à dos dans cette expédition.</p>"}
      </div>
    </section>
  `;
}

function injectGmBackpackManagement(dialog, manifest, api) {
  if (!game.user?.isGM) return { green: false, reason: "not-gm" };

  const gmPane = dialog.querySelector(
    `.${ROLE_TABS_CLASS} [data-dhct-pane="${GM_TAB_ID}"]`
  );
  if (!(gmPane instanceof HTMLElement)) {
    return { green: false, reason: "gm-pane-not-found" };
  }

  const expeditionId = String(manifest?.expeditionId ?? "");
  const revision = String(manifest?.revision ?? "");
  const existing = gmPane.querySelector(".dhct-backpack-admin-panel");

  // Keep the live form untouched while the manifest has not changed.
  // This preserves focus, typed values and pending Deposit/Retrieve state.
  if (
    existing instanceof HTMLElement &&
    existing.dataset.expeditionId === expeditionId &&
    existing.dataset.manifestRevision === revision
  ) {
    return {
      green: true,
      reused: true,
      backpacks: existing.querySelectorAll("[data-dhct-backpack-admin]").length,
    };
  }

  existing?.remove();

  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderGmBackpackManagement(manifest).trim();
  const panel = wrapper.firstElementChild;

  if (!(panel instanceof HTMLElement)) {
    return { green: false, reason: "panel-build-failed" };
  }

  panel.dataset.expeditionId = expeditionId;
  panel.dataset.manifestRevision = revision;
  gmPane.prepend(panel);

  for (const card of panel.querySelectorAll("[data-dhct-backpack-admin]")) {
    const containerId = card.dataset.dhctBackpackAdmin;
    const nameInput = card.querySelector("[data-dhct-backpack-name]");
    const slotsInput = card.querySelector("[data-dhct-backpack-slots]");
    const locationInput = card.querySelector("[data-dhct-backpack-location]");
    const stateLabel = card.querySelector(".dhct-backpack-admin-state");
    const toggle = card.querySelector("[data-dhct-backpack-toggle]");
    const save = card.querySelector("[data-dhct-backpack-save]");

    const currentContainer = (manifest.containers ?? []).find(
      (candidate) => candidate.containerId === containerId
    );
    let accessState = backpackAccessState(currentContainer);

    const renderPendingState = () => {
      const stored = accessState === "stored";

      if (locationInput instanceof HTMLInputElement) {
        locationInput.disabled = !stored;
        if (!stored) locationInput.value = "";
      }

      if (stateLabel instanceof HTMLElement) {
        stateLabel.classList.toggle("is-stored", stored);
        stateLabel.classList.toggle("is-available", !stored);
        stateLabel.textContent = stored
          ? "Déposé — en attente d’enregistrement"
          : "Accessible — en attente d’enregistrement";
      }

      if (toggle instanceof HTMLButtonElement) {
        toggle.dataset.nextState = stored ? "available" : "stored";
        toggle.innerHTML = stored
          ? '<i class="fa-solid fa-person-walking-arrow-right"></i> Récupérer'
          : '<i class="fa-solid fa-location-dot"></i> Déposer';
      }
    };

    toggle?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    toggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      accessState = accessState === "stored" ? "available" : "stored";
      renderPendingState();

      if (
        accessState === "stored" &&
        locationInput instanceof HTMLInputElement
      ) {
        locationInput.focus();
      }
    });

    const persist = async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (save instanceof HTMLButtonElement) save.disabled = true;
      if (toggle instanceof HTMLButtonElement) toggle.disabled = true;

      try {
        await saveBackpackAdministration(api, {
          expeditionId: manifest.expeditionId,
          containerId,
          name: nameInput?.value,
          slots: slotsInput?.value,
          accessState,
          storedAt: locationInput?.value,
        });
      } catch (error) {
        console.error(`${MODULE_ID} | backpack administration failed`, error);
        ui.notifications?.error(
          error?.message ?? "Échec de la gestion du sac à dos."
        );

        if (save instanceof HTMLButtonElement) save.disabled = false;
        if (toggle instanceof HTMLButtonElement) toggle.disabled = false;
      }
    };

    save?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    save?.addEventListener("click", persist);

    for (const input of [nameInput, slotsInput, locationInput]) {
      input?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      input?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    }
  }

  return {
    green: true,
    reused: false,
    backpacks: panel.querySelectorAll("[data-dhct-backpack-admin]").length,
  };
}

function configurePlayerInventoryView(dialog, manifest) {
  const expeditionWindow = findExpeditionWindow(dialog);
  if (!(expeditionWindow instanceof HTMLElement)) {
    return { green: false, reason: "expedition-window-not-found" };
  }

  // A player must never receive the GM tab or its toolkit lifecycle panel.
  dialog.querySelectorAll(`.${ROLE_TABS_CLASS}`).forEach((node) => node.remove());
  dialog.querySelectorAll(`.${PANEL_CLASS}`).forEach((node) => node.remove());

  const browser = expeditionWindow.querySelector(".dct-expedition-browser");
  const closeHost = findCloseHost(expeditionWindow);
  const technicalNodes = findTechnicalNodes(
    expeditionWindow,
    browser,
    closeHost
  );

  for (const node of technicalNodes) {
    node.remove();
  }

  const containerAccess = filterPlayerContainers(
    dialog,
    manifest
  );

  return {
    green: Boolean(browser),
    mode: "player",
    browser: Boolean(browser),
    removedTechnicalNodes: technicalNodes.length,
    containerAccess,
  };
}

function configureGmTabbedView(dialog, lifecyclePanel) {
  const expeditionWindow = findExpeditionWindow(dialog);
  if (!(expeditionWindow instanceof HTMLElement)) {
    return { green: false, reason: "expedition-window-not-found" };
  }

  const existingTabs = expeditionWindow.querySelector(
    `.${ROLE_TABS_CLASS}`
  );

  if (existingTabs instanceof HTMLElement) {
    const gmPane = existingTabs.querySelector(
      `[data-dhct-pane="${GM_TAB_ID}"]`
    );

    if (
      lifecyclePanel instanceof HTMLElement &&
      gmPane instanceof HTMLElement &&
      !gmPane.contains(lifecyclePanel)
    ) {
      gmPane.prepend(lifecyclePanel);
    }

    return {
      green: true,
      mode: "gm",
      reused: true,
    };
  }

  const browser = expeditionWindow.querySelector(".dct-expedition-browser");
  if (!(browser instanceof HTMLElement)) {
    return { green: false, reason: "expedition-browser-not-found" };
  }

  const closeHost = findCloseHost(expeditionWindow);
  const technicalNodes = findTechnicalNodes(
    expeditionWindow,
    browser,
    closeHost
  );

  const tabs = document.createElement("section");
  tabs.className = ROLE_TABS_CLASS;

  const nav = document.createElement("div");
  nav.className = `${ROLE_TABS_CLASS}__nav`;
  nav.setAttribute("role", "tablist");

  const inventoryButton = makeRoleTabButton(
    INVENTORY_TAB_ID,
    "Inventaire"
  );

  const gmButton = makeRoleTabButton(
    GM_TAB_ID,
    "MJ"
  );

  nav.append(inventoryButton, gmButton);

  const inventoryPane = document.createElement("div");
  inventoryPane.className = `${ROLE_TABS_CLASS}__pane`;
  inventoryPane.dataset.dhctPane = INVENTORY_TAB_ID;
  inventoryPane.setAttribute("role", "tabpanel");

  const gmPane = document.createElement("div");
  gmPane.className = `${ROLE_TABS_CLASS}__pane`;
  gmPane.dataset.dhctPane = GM_TAB_ID;
  gmPane.setAttribute("role", "tabpanel");

  // Insert the wrapper where the browser lived, then move the original
  // renderer nodes. Moving nodes preserves their existing event handlers.
  browser.insertAdjacentElement("beforebegin", tabs);
  tabs.append(nav, inventoryPane, gmPane);
  inventoryPane.append(browser);

  if (lifecyclePanel instanceof HTMLElement) {
    gmPane.append(lifecyclePanel);
  }

  for (const node of technicalNodes) {
    gmPane.append(node);
  }

  inventoryButton.addEventListener("click", () => {
    activateRoleTab(tabs, INVENTORY_TAB_ID);
  });

  gmButton.addEventListener("click", () => {
    activateRoleTab(tabs, GM_TAB_ID);
  });

  activateRoleTab(tabs, INVENTORY_TAB_ID);

  return {
    green: true,
    mode: "gm",
    reused: false,
    technicalNodes: technicalNodes.length,
    closeOutsideTabs: Boolean(closeHost),
  };
}

export async function refreshExpeditionInventoryUx() {
  const dialog = findOpenExpeditionDialog();
  if (!dialog) return { green: false, reason: "expedition-dialog-not-found" };

  const layout = applyExpeditionDialogLayout(dialog);

  const api = getApi();

  if (
    !api?.expeditionItems?.scanLifecycle ||
    !api?.expeditionItems?.restitutionStatus
  ) {
    return { green: false, reason: "expedition-items-api-unavailable" };
  }

  const manifest = await loadCurrentManifest(api);
  if (!manifest) return { green: false, reason: "manifest-not-found" };

  const isGm = Boolean(game.user?.isGM);

  if (isGm) {
    try {
      const sharedBootstrap = await ensureSharedContainers(api, manifest);

      if (sharedBootstrap?.changed) {
        await reopenExpeditionDialog(api, manifest);

        return {
          green: true,
          refreshed: true,
          reason: "shared-containers-created",
          created: sharedBootstrap.created,
        };
      }
    } catch (error) {
      console.error(`${MODULE_ID} | shared container bootstrap failed`, error);
      ui.notifications?.error(
        error?.message ?? "Impossible de créer les conteneurs partagés."
      );
    }
  }

  let scan = null;
  let restitution = null;
  let lifecyclePanel = null;

  // Lifecycle is a GM diagnostic concern. Do not construct it for players.
  if (isGm) {
    scan = api.expeditionItems.scanLifecycle(manifest);
    restitution = api.expeditionItems.restitutionStatus(manifest);

    dialog.querySelector(`.${PANEL_CLASS}`)?.remove();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderSummaryMarkup(scan, restitution).trim();
    lifecyclePanel = wrapper.firstElementChild;
  } else {
    dialog.querySelectorAll(`.${PANEL_CLASS}`).forEach((node) => node.remove());
  }

  const roleView = isGm
    ? configureGmTabbedView(dialog, lifecyclePanel)
    : configurePlayerInventoryView(dialog, manifest);

  const backpackAdministration = isGm
    ? injectGmBackpackManagement(dialog, manifest, api)
    : { green: false, reason: "not-gm" };

  const sharedAccessAdministration = isGm
    ? injectGmSharedAccessManagement(dialog, manifest, api)
    : { green: false, reason: "not-gm" };

  // Lifecycle badges are diagnostic too: GM only.
  dialog.querySelectorAll(".dhct-item-lifecycle-badge").forEach((node) => {
    node.remove();
  });

  const annotatedItems = isGm
    ? annotateVisibleInventoryItems(dialog, manifest)
    : 0;

  applyPlayerObjectDetailVisibility(dialog);

  const nativeObjectActions = await injectNativeObjectActions(
    dialog,
    manifest
  );

  return {
    green: Boolean(roleView?.green),
    expeditionId: manifest.expeditionId ?? null,
    mode: isGm ? "gm" : "player",
    layout,
    scan,
    restitution,
    roleView,
    backpackAdministration,
    sharedAccessAdministration,
    annotatedItems,
    nativeObjectActions,
  };
}
function injectStyles() {
  if (document.getElementById(`${MODULE_ID}-expedition-ux-styles`)) return;

  const style = document.createElement("style");
  style.id = `${MODULE_ID}-expedition-ux-styles`;
  style.textContent = `
    .${PANEL_CLASS} {
      display: grid;
      gap: .45rem;
      margin: 0 0 .75rem;
      padding: .6rem .7rem;
      border: 1px solid var(--color-border-light-2, rgba(255,255,255,.16));
      border-radius: 6px;
      background: rgba(0,0,0,.12);
    }

    .${PANEL_CLASS}__title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .75rem;
      font-size: .9rem;
    }

    .${PANEL_CLASS}__title small {
      opacity: .65;
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .${PANEL_CLASS}__badges {
      display: flex;
      flex-wrap: wrap;
      gap: .35rem;
    }

    .${PANEL_CLASS}__badge {
      display: inline-flex;
      align-items: center;
      gap: .3rem;
      padding: .25rem .42rem;
      border-radius: 999px;
      background: rgba(255,255,255,.07);
      font-size: .75rem;
      line-height: 1;
    }

    .${PANEL_CLASS}__badge strong {
      font-size: .82rem;
    }

    .${PANEL_CLASS}__badge[data-kind="modified"] {
      outline: 1px solid rgba(255, 190, 80, .45);
    }

    .${PANEL_CLASS}__badge[data-kind="archive"] {
      opacity: .8;
    }

    .${PANEL_CLASS}__badge[data-kind="blocked"] {
      outline: 1px solid rgba(220, 70, 70, .65);
      background: rgba(150, 20, 20, .18);
    }

    .${PANEL_CLASS}__badge[data-kind="ready"] {
      outline: 1px solid rgba(80, 180, 120, .35);
    }

    .dhct-item-lifecycle-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      z-index: 2;
      max-width: calc(100% - 4px);
      padding: 2px 4px;
      border-radius: 4px;
      background: rgba(15, 15, 18, .86);
      border: 1px solid rgba(255, 255, 255, .18);
      box-shadow: 0 1px 2px rgba(0, 0, 0, .35);
      font-size: 9px;
      line-height: 1.1;
      white-space: nowrap;
      pointer-events: none;
    }

    .dhct-item-lifecycle-badge[data-state="modified"] {
      border-color: rgba(255, 190, 80, .62);
    }

    .dhct-item-lifecycle-badge[data-state="legacy"] {
      opacity: .72;
    }

    .${ROLE_TABS_CLASS} {
      display: grid;
      gap: .55rem;
      min-height: 0;
    }

    .${ROLE_TABS_CLASS}__nav {
      display: flex;
      gap: .35rem;
      padding-bottom: .4rem;
      border-bottom: 1px solid var(--color-border-light-2, rgba(255,255,255,.16));
    }

    .${ROLE_TABS_CLASS}__button {
      flex: 0 0 auto;
      min-width: 7rem;
      padding: .4rem .75rem;
    }

    .${ROLE_TABS_CLASS}__button.active {
      font-weight: 700;
      box-shadow: inset 0 -2px 0 currentColor;
    }

    .${ROLE_TABS_CLASS}__pane {
      min-height: 0;
    }

    .${ROLE_TABS_CLASS}__pane[hidden] {
      display: none !important;
    }

    .${ROLE_TABS_CLASS}__pane[data-dhct-pane="${GM_TAB_ID}"] {
      display: grid;
      gap: .65rem;
    }

    dialog.dhct-expedition-layout {
      width: min(96vw, 1200px) !important;
      max-width: min(96vw, 1200px) !important;
    }

    dialog.dhct-expedition-layout .dhct-expedition-layout__window-content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    dialog.dhct-expedition-layout .dhct-expedition-layout__form {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    dialog.dhct-expedition-layout .dhct-expedition-layout__content {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    dialog.dhct-expedition-layout .dhct-expedition-layout__window {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    dialog.dhct-expedition-layout .${ROLE_TABS_CLASS} {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    dialog.dhct-expedition-layout .${ROLE_TABS_CLASS}__pane {
      min-height: 0;
      overflow: auto;
      padding-bottom: 1rem;
    }

    dialog.dhct-expedition-layout .dct-expedition-browser {
      column-gap: 1.25rem !important;
      gap: 1.25rem !important;
      min-width: 0;
      min-height: 0;
    }

    dialog.dhct-expedition-layout .dct-expedition-grid {
      grid-auto-rows: 128px !important;
      row-gap: .85rem !important;
    }

    dialog.dhct-expedition-layout .dct-expedition-grid-slot {
      min-height: 128px;
      overflow: visible;
    }

    dialog.dhct-expedition-layout .dct-expedition-item-tile {
      min-height: 118px;
      height: auto;
      align-content: start;
    }

    dialog.dhct-expedition-layout .dct-expedition-item-name {
      display: block;
      line-height: 1.15;
      margin-top: .2rem;
      white-space: normal;
      overflow-wrap: anywhere;
    }


    dialog.dhct-expedition-layout .dct-expedition-browser > * {
      box-sizing: border-box;
      padding: .8rem;
      border: 1px solid rgba(201, 177, 137, .32);
      border-radius: 8px;
      background: rgba(18, 17, 22, .38);
    }

    dialog.dhct-expedition-layout .dct-expedition-browser > *:nth-child(1) {
      background: rgba(28, 25, 29, .48);
    }

    dialog.dhct-expedition-layout .dct-expedition-browser > *:nth-child(2) {
      background: rgba(22, 25, 30, .48);
    }

    dialog.dhct-expedition-layout .dct-expedition-browser > *:nth-child(3) {
      background: rgba(26, 23, 31, .48);
    }

    dialog.dhct-expedition-layout .dct-expedition-grid-slot {
      box-sizing: border-box;
      border: 1px solid rgba(203, 182, 147, .34);
      border-radius: 7px;
      transition:
        background-color 120ms ease,
        border-color 120ms ease,
        box-shadow 120ms ease;
    }

    dialog.dhct-expedition-layout .dct-expedition-grid-slot.is-empty {
      background: rgba(53, 56, 63, .30);
      border-color: rgba(172, 176, 186, .25);
    }

    dialog.dhct-expedition-layout .dct-expedition-grid-slot.is-occupied {
      background: rgba(87, 67, 45, .32);
      border-color: rgba(205, 174, 128, .50);
    }

    dialog.dhct-expedition-layout .dct-expedition-grid-slot:hover {
      border-color: rgba(229, 203, 159, .72);
      box-shadow: inset 0 0 0 1px rgba(229, 203, 159, .12);
    }


    dialog.dhct-expedition-layout
      .dct-expedition-item-detail
      [data-dhct-technical-ref="true"][hidden] {
      display: none !important;
    }



    .dhct-shared-access-panel {
      display: grid;
      gap: .65rem;
      padding: .75rem;
      border: 1px solid rgba(201, 177, 137, .32);
      border-radius: 8px;
      background: rgba(18, 17, 22, .42);
    }

    .dhct-shared-access-panel > header h3 {
      margin: 0;
    }

    .dhct-shared-access-panel > header p {
      margin: .2rem 0 0;
      opacity: .7;
    }

    .dhct-shared-access-list {
      display: grid;
      gap: .5rem;
    }

    .dhct-shared-access-card {
      display: grid;
      grid-template-columns: minmax(180px, 1.5fr) minmax(130px, .8fr) auto auto;
      align-items: end;
      gap: .55rem;
      padding: .6rem;
      border: 1px solid rgba(203, 182, 147, .22);
      border-radius: 7px;
      background: rgba(32, 31, 36, .45);
    }

    .dhct-shared-access-copy {
      display: grid;
      gap: .12rem;
      align-self: center;
    }

    .dhct-shared-access-copy small {
      opacity: .65;
    }

    .dhct-shared-access-card > label {
      display: grid;
      gap: .2rem;
    }

    .dhct-shared-access-toggle {
      display: flex !important;
      flex-direction: row !important;
      align-items: center;
      gap: .35rem !important;
      padding-bottom: .35rem;
      white-space: nowrap;
    }

    .dhct-backpack-admin-panel {
      display: grid;
      gap: .65rem;
      padding: .75rem;
      border: 1px solid rgba(201, 177, 137, .32);
      border-radius: 8px;
      background: rgba(18, 17, 22, .42);
    }

    .dhct-backpack-admin-panel__header h3 {
      margin: 0;
    }

    .dhct-backpack-admin-panel__header p {
      margin: .2rem 0 0;
      opacity: .7;
    }

    .dhct-backpack-admin-list {
      display: grid;
      gap: .6rem;
    }

    .dhct-backpack-admin-card {
      display: grid;
      gap: .55rem;
      padding: .65rem;
      border: 1px solid rgba(203, 182, 147, .24);
      border-radius: 7px;
      background: rgba(32, 31, 36, .45);
    }

    .dhct-backpack-admin-card > header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: .75rem;
    }

    .dhct-backpack-admin-card > header > div {
      display: grid;
      gap: .12rem;
    }

    .dhct-backpack-admin-card small {
      opacity: .65;
    }

    .dhct-backpack-admin-state {
      padding: .18rem .45rem;
      border: 1px solid rgba(170, 190, 170, .32);
      border-radius: 999px;
      white-space: nowrap;
      font-size: .82em;
    }

    .dhct-backpack-admin-state.is-stored {
      border-color: rgba(211, 170, 115, .45);
    }

    .dhct-backpack-admin-fields {
      display: grid;
      grid-template-columns: minmax(180px, 2fr) minmax(80px, .6fr) minmax(180px, 2fr);
      gap: .55rem;
    }

    .dhct-backpack-admin-fields label {
      display: grid;
      gap: .2rem;
    }

    .dhct-backpack-admin-actions {
      display: flex;
      justify-content: flex-end;
      gap: .4rem;
    }

    dialog.dhct-expedition-layout .dhct-expedition-layout__footer {
      flex: 0 0 auto;
      margin-top: auto;
      padding-top: 1rem;
      padding-bottom: .25rem;
      position: relative;
      z-index: 5;
      background: var(--background, inherit);
    }



  `;

  document.head.append(style);
}

let refreshTimer = null;

function scheduleRefresh({ retries = 8, delay = 80 } = {}) {
  if (refreshTimer) clearTimeout(refreshTimer);

  let remaining = Math.max(1, Number(retries) || 1);

  const attempt = async () => {
    try {
      const result = await refreshExpeditionInventoryUx();

      if (result?.green) {
        refreshTimer = null;
        return;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | expedition UX refresh failed`, error);
    }

    remaining -= 1;

    if (remaining > 0) {
      refreshTimer = setTimeout(attempt, delay);
    } else {
      refreshTimer = null;
    }
  };

  requestAnimationFrame(attempt);
}

export function installExpeditionInventoryUx() {
  injectStyles();

  Hooks.once("ready", () => {
    installExpeditionSocketSync();
    installExternalItemDragBridge();
    scheduleRefresh();

    const observer = new MutationObserver((mutations) => {
      const dialogMutation = mutations.some((mutation) => {
        const target =
          mutation.target instanceof Element
            ? mutation.target
            : null;

        if (
          target?.matches?.("dialog.application.dialog") ||
          target?.closest?.("dialog.application.dialog")
        ) {
          return true;
        }

        return [...mutation.addedNodes].some((node) =>
          node instanceof HTMLElement &&
          (
            node.matches?.("dialog.application.dialog") ||
            node.querySelector?.("dialog.application.dialog")
          )
        );
      });

      const toolkitSelector = [
        "[data-dhct-inventory-action]",
        ".dhct-expedition-role-tabs",
        ".dhct-expedition-ux-summary",
        ".dhct-item-lifecycle-badge",
        ".dhct-backpack-admin-panel",
        ".dhct-shared-access-panel",
      ].join(", ");

      const toolkitOnlyMutation = mutations.every((mutation) => {
        const targetElement =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target?.parentElement ?? null;

        if (targetElement?.closest?.(toolkitSelector)) {
          return true;
        }

        const changedNodes = [
          ...mutation.addedNodes,
          ...mutation.removedNodes,
        ].filter((node) => node instanceof HTMLElement);

        return (
          changedNodes.length > 0 &&
          changedNodes.every((node) =>
            node.matches?.(toolkitSelector) ||
            node.closest?.(toolkitSelector)
          )
        );
      });

      if (toolkitOnlyMutation) return;

      const itemDetailMutation = mutations.some((mutation) => {
        const target =
          mutation.target instanceof Element
            ? mutation.target
            : null;

        return Boolean(
          target?.closest?.(".dct-expedition-item-panel") ||
          [...mutation.addedNodes].some((node) =>
            node instanceof HTMLElement &&
            (
              node.matches?.(".dct-expedition-item-panel, .dct-expedition-item-detail") ||
              node.querySelector?.(".dct-expedition-item-panel, .dct-expedition-item-detail")
            )
          )
        );
      });

      if (dialogMutation || itemDetailMutation) {
        scheduleRefresh({ retries: 12, delay: 100 });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  Hooks.on(`${MODULE_ID}.expeditionChanged`, () => {
    scheduleRefresh({ retries: 8, delay: 80 });
  });


  Hooks.on("renderApplicationV2", (application) => {
    const element = application?.element;

    if (
      element instanceof HTMLElement &&
      (
        element.matches?.("dialog.application.dialog") ||
        element.querySelector?.("dialog.application.dialog")
      )
    ) {
      scheduleRefresh({ retries: 8, delay: 80 });
    }
  });

  return {
    green: true,
    installed: true,
  };
}
