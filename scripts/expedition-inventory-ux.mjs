import {
  containerAccessZone,
  backpackAccessState,
  backpackStoredAt,
  userOwnsBackpack,
  userCanAccessContainer,
  userCanTransferBetweenContainers,
  userCanViewZone,
  normalizeBackpackSlots,
} from "./expedition-inventory-policy.mjs";

import {
  ensureSharedContainers as ensureSharedContainersCore,
} from "./expedition-shared-containers.mjs";

import {
  configureExpeditionInventorySync,
  requestInventoryAuthorityAction as requestInventoryAuthorityActionSync,
  broadcastBackpackAccessChange as broadcastBackpackAccessChangeSync,
  installExpeditionSocketSync as installExpeditionSocketSyncCore,
} from "./expedition-inventory-sync.mjs";

import { processInventoryAuthorityRequest as processInventoryAuthorityRequestCore } from "./expedition-inventory-authority.mjs";

import {
  resolveManifestLogisticsPhase,
} from "./expedition-logistics-phase.mjs";

import {
  normalizeExpeditionAccess,
} from "./expedition-access.mjs";

import {
  createExpeditionShell,
  expeditionShellPane,
  activateExpeditionShellTab,
  setExpeditionShellTabVisibility,
} from "./expedition-shell.mjs";

import {
  projectExpeditionInventory,
} from "./expedition-inventory-projection.mjs";
import {
  projectExpeditionCaravan,
} from "./expedition-caravan-projection.mjs";

import {
  installCaravanEquipmentInManifest,
  removeCaravanEquipmentFromManifest,
  caravanInstalledContainerIds,
} from "./expedition-caravan-manifest.mjs";
import {
  renderExpeditionInventoryView,
  renderExpeditionContainerView,
} from "./expedition-inventory-view.mjs";
import {
  renderExpeditionCaravanView,
} from "./expedition-caravan-view.mjs";

import {
  createFoundryViewerCapabilities,
} from "./expedition-viewer-capabilities-foundry.mjs";

import {
  containerCapabilityResolver,
} from "./expedition-viewer-capabilities.mjs";

import {
  projectMaterialLibrary,
} from "./expedition-material-projection.mjs";

import {
  projectExpeditionDashboard,
} from "./expedition-dashboard-projection.mjs";

import {
  renderExpeditionView,
} from "./expedition-view.mjs";

import {
  hasHuntArtisanCard,
  isArtificer,
} from "./weapon-augment-workshop.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const PANEL_CLASS = "dhct-expedition-ux-summary";
const ROLE_TABS_CLASS = "dhct-expedition-role-tabs";
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

function expeditionIdOfDialog(dialog) {
  if (!isExpeditionDialog(dialog)) return null;
  return dialog.dataset.expeditionId
    ?? dialog.querySelector(".dhct-expedition-view")?.dataset.expeditionId
    ?? dialog.querySelector(".dct-expedition-summary strong")?.textContent?.trim()
    ?? null;
}

function findOpenExpeditionDialog(expeditionId = null) {
  const dialogs = [...document.querySelectorAll("dialog.application.dialog")]
    .filter(isExpeditionDialog);
  if (expeditionId) {
    return dialogs.find((dialog) =>
      expeditionIdOfDialog(dialog) === expeditionId
    ) ?? null;
  }
  return dialogs.find((dialog) => dialog.open) ?? dialogs[0] ?? null;
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

async function loadCurrentManifest(api, expeditionId = null) {
  if (!api?.expeditionManifest?.load) return null;
  const id = expeditionId
    ?? expeditionIdOfDialog(findOpenExpeditionDialog());
  // Never guess another expedition from the manifest list.
  if (!id) return null;
  return api.expeditionManifest.load(id);
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


async function chooseActionQuantity(
  entry,
  {
    actionLabel = "Consommer",
    actionVerb = "consommer",
  } = {}
) {
  const available =
    Math.max(
      1,
      Number(entry?.quantity) || 1
    );

  if (available <= 1) {
    return 1;
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  const itemName =
    entry?.itemRef?.name ??
    "Objet";

  if (DialogV2?.prompt) {
    const result =
      await DialogV2.prompt({
        window: {
          title:
            actionLabel +
            " \u2014 " +
            itemName,
        },

        content:
          `
            <div class="form-group">
              <label>Quantit\u00e9</label>
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
              <p class="hint">
                Disponible : ${available}
              </p>
            </div>
          `,

        ok: {
          label:
            actionLabel,

          callback:
            (
              _event,
              _button,
              dialog
            ) => {
              const input =
                dialog?.element
                  ?.querySelector?.(
                    '[name="quantity"]'
                  );

              return Number(
                input?.value ?? 1
              );
            },
        },

        rejectClose: false,
      });

    if (result == null) {
      return null;
    }

    const quantity =
      Math.floor(
        Number(result)
      );

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return null;
    }

    return Math.min(
      available,
      quantity
    );
  }

  const raw =
    window.prompt(
      "Quantit\u00e9 de \"" +
      itemName +
      "\" \u00e0 " +
      actionVerb +
      " (1-" +
      available +
      ") :",
      "1"
    );

  if (raw == null) {
    return null;
  }

  const quantity =
    Math.floor(
      Number(raw)
    );

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return Math.min(
    available,
    quantity
  );
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
      activeShellTab: null,
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

  const shell =
    dialog.querySelector(
      ".dhct-expedition-shell"
    );

  const activeShellTab =
    shell instanceof HTMLElement
      ? shell.dataset.dhctActiveTab ?? null
      : null;

  return {
    selectedContainerId,
    activeShellTab,
  };
}

async function restoreExpeditionViewState(state, {
  expeditionId = null,
  retries = 16,
  delay = 40,
} = {}) {
  if (
    !state?.selectedContainerId &&
    !state?.activeShellTab
  ) {
    return;
  }

  let remaining =
    Math.max(
      1,
      Number(retries) || 1
    );

  while (remaining > 0) {
    const dialog =
      findOpenExpeditionDialog();

    if (dialog) {
      let selectedRestored =
        !state.selectedContainerId;

      let tabRestored =
        !state.activeShellTab;

      if (state.selectedContainerId) {
        const row =
          dialog.querySelector(
            `.dct-expedition-list-item[data-container-id="${CSS.escape(state.selectedContainerId)}"]`
          );

        if (row instanceof HTMLElement) {
          if (
            !row.classList.contains(
              "is-selected"
            )
          ) {
            row.click();
          }

          selectedRestored = true;
        }
      }

      if (state.activeShellTab) {
        const shell =
          dialog.querySelector(
            ".dhct-expedition-shell"
          );

        if (shell instanceof HTMLElement) {
          const result =
            activateExpeditionShellTab(
              shell,
              state.activeShellTab
            );

          tabRestored =
            Boolean(result?.green);
        }
      }

      if (
        selectedRestored &&
        tabRestored
      ) {
        return;
      }
    }

    remaining -= 1;

    if (remaining <= 0) {
      return;
    }

    await new Promise(
      (resolve) =>
        setTimeout(resolve, delay)
    );
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
    await restoreExpeditionViewState(viewState, { expeditionId: manifest.expeditionId });
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

  if (!dialog.dataset.dhctLayoutInitialized) {
    dialog.style.height =
      `${appliedHeight}px`;

    dialog.dataset.dhctLayoutInitialized =
      "1";
  }

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function playerOwnsBackpack(container) {
  return userOwnsBackpack(game.user, container);
}

function playerCanAccessContainer(
  container,
  manifest
) {
  return userCanAccessContainer(
    game.user,
    container,
    manifest
  );
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
      .filter(
        (container) =>
          playerCanAccessContainer(
            container,
            manifest
          )
      )
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


async function ensureSharedContainers(api, manifest) {
  return ensureSharedContainersCore(api, manifest, {
    broadcastBackpackAccessChange,
  });
}


async function confirmBulkGmAction({
  title,
  content,
  confirmLabel = "Confirmer",
} = {}) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;

  if (DialogV2?.confirm) {
    return DialogV2.confirm({
      window: { title },
      content: `<p>${content}</p>`,
      yes: { label: confirmLabel },
      no: { label: "Annuler" },
    });
  }

  return window.confirm(content);
}

async function saveAndBroadcastBulkInventoryChange(api, manifest, {
  containerId = null,
  reason = "gm-bulk-inventory",
} = {}) {
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
    reason,
  });

  await reopenExpeditionDialog(api, manifest);
}

async function clearGroundContainer(api, manifest, container) {
  if (!game.user?.isGM) {
    return { green: false, reason: "not-gm" };
  }

  if (
    container?.containerId !== "ground" ||
    !api?.expeditionManifest?.lose
  ) {
    return { green: false, reason: "ground-container-unavailable" };
  }

  const entries = [...(container.contents ?? [])];
  if (!entries.length) {
    ui.notifications?.info("Le Sol est déjà vide.");
    return { green: true, changed: false, removed: 0 };
  }

  const confirmed = await confirmBulkGmAction({
    title: "Vider le Sol",
    content:
      `Supprimer les ${entries.length} entrée(s) présentes au Sol ? ` +
      "Cette action retire tout le contenu du Sol.",
    confirmLabel: "Vider le Sol",
  });

  if (!confirmed) {
    return { green: true, changed: false, cancelled: true };
  }

  let removed = 0;

  for (const entry of entries) {
    const quantity = Math.max(1, Number(entry?.quantity) || 1);

    const result = api.expeditionManifest.lose(manifest, {
      containerId: container.containerId,
      entryId: entry.entryId,
      quantity,
      note: "Suppression en masse du Sol par le MJ",
    });

    if (!result?.changed) {
      throw new Error(
        result?.reason ?? `Impossible de supprimer ${entry?.itemRef?.name ?? entry?.entryId}.`
      );
    }

    removed += 1;
  }

  await saveAndBroadcastBulkInventoryChange(api, manifest, {
    containerId: container.containerId,
    reason: "gm-clear-ground",
  });

  ui.notifications?.info(
    `Sol vidé : ${removed} entrée(s) supprimée(s).`
  );

  return { green: true, changed: true, removed };
}

async function transferBackpackContentsToGround(api, manifest, backpack) {
  if (!game.user?.isGM) {
    return { green: false, reason: "not-gm" };
  }

  if (
    backpack?.type !== "backpack" ||
    !api?.expeditionManifest?.transfer
  ) {
    return { green: false, reason: "backpack-unavailable" };
  }

  const ground =
    (manifest.containers ?? [])
      .find(
        (container) =>
          container?.containerId ===
          "ground"
      );

  if (!ground) {
    return { green: false, reason: "ground-container-not-found" };
  }

  const entries = [...(backpack.contents ?? [])];

  if (!entries.length) {
    ui.notifications?.info(`${backpack.name} est déjà vide.`);
    return { green: true, changed: false, moved: 0, remaining: 0 };
  }

  const confirmed = await confirmBulkGmAction({
    title: `Vider ${backpack.name} vers le Sol`,
    content:
      `Transférer les ${entries.length} entrée(s) de "${backpack.name}" vers le Sol ?`,
    confirmLabel: "Tout transférer",
  });

  if (!confirmed) {
    return { green: true, changed: false, cancelled: true };
  }

  let moved = 0;
  let failureReason = null;

  for (const entry of entries) {
    const result = api.expeditionManifest.transfer(manifest, {
      entryId: entry.entryId,
      fromContainerId: backpack.containerId,
      toContainerId: ground.containerId,
    });

    if (!result?.moved) {
      failureReason =
        result?.reason ??
        `Transfert refusé pour ${entry?.itemRef?.name ?? entry?.entryId}.`;
      break;
    }

    moved += 1;
  }

  if (moved > 0) {
    await saveAndBroadcastBulkInventoryChange(api, manifest, {
      containerId: ground.containerId,
      reason: "gm-backpack-to-ground",
    });
  }

  const remaining = (backpack.contents ?? []).length;

  if (failureReason) {
    ui.notifications?.warn(
      `${moved} entrée(s) transférée(s), ${remaining} restante(s) — ${failureReason}`
    );
  } else {
    ui.notifications?.info(
      `${moved} entrée(s) transférée(s) de ${backpack.name} vers le Sol.`
    );
  }

  return {
    green: moved > 0 || !failureReason,
    changed: moved > 0,
    moved,
    remaining,
    reason: failureReason,
  };
}


function renderAccessMatrixCheckbox({
  characterId,
  zone,
  permission,
  checked,
} = {}) {
  return `
    <input
      type="checkbox"
      data-dhct-access-character="${escapeHtml(characterId)}"
      data-dhct-access-zone="${escapeHtml(zone)}"
      data-dhct-access-permission="${escapeHtml(permission)}"
      ${checked ? "checked" : ""}
    />
  `;
}

function renderGmAccessMatrix(
  manifest
) {
  const characterIds =
    (manifest?.characters ?? [])
      .map(
        (character) =>
          String(
            character?.characterId ??
            ""
          ).trim()
      )
      .filter(Boolean);

  const access =
    normalizeExpeditionAccess(
      manifest?.access,
      {
        characterIds,
      }
    );

  const rows =
    (manifest?.characters ?? [])
      .map((character) => {
        const characterId =
          String(
            character?.characterId ??
            ""
          ).trim();

        if (!characterId) {
          return "";
        }

        const name =
          String(
            character?.name ??
            characterId
          );

        const rules =
          access.characters[
            characterId
          ];

        const cell =
          (
            zone,
            permission
          ) =>
            renderAccessMatrixCheckbox({
              characterId,
              zone,
              permission,
              checked:
                rules?.[zone]
                  ?.[permission] === true,
            });

        return `
          <tr data-dhct-access-row="${escapeHtml(characterId)}">
            <th scope="row">
              ${escapeHtml(name)}
            </th>

            <td>
              ${cell("ground", "view")}
            </td>
            <td>
              ${cell("ground", "transfer")}
            </td>

            <td>
              ${cell("fob", "view")}
            </td>
            <td>
              ${cell("fob", "transfer")}
            </td>

            <td>
              ${cell("caravan", "view")}
            </td>
            <td>
              ${cell("caravan", "transfer")}
            </td>
          </tr>
        `;
      })
      .join("");

  return `
    <section class="dhct-access-matrix-panel">
      <header>
        <div>
          <h3>Accès logistiques des PJ</h3>
          <p>
            Ce tableau devient la source unique pour la visibilit?
            et les transferts Sol, FOB et Caravane.
          </p>
        </div>
      </header>

      <div class="dhct-access-matrix-panel__scroll">
        <table class="dhct-access-matrix">
          <thead>
            <tr>
              <th rowspan="2">PJ</th>
              <th colspan="2">Sol</th>
              <th colspan="2">FOB</th>
              <th colspan="2">Caravane</th>
            </tr>

            <tr>
              <th>Voir</th>
              <th>Transf.</th>

              <th>Voir</th>
              <th>Transf.</th>

              <th>Voir</th>
              <th>Transf.</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows ||
              '<tr><td colspan="7">Aucun PJ dans l’expédition.</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <footer>
        <button
          type="button"
          data-dhct-access-matrix-save
        >
          <i class="fa-solid fa-floppy-disk"></i>
          Enregistrer les accès
        </button>
      </footer>
    </section>
  `;
}

function readGmAccessMatrix(
  panel,
  manifest
) {
  const characterIds =
    (manifest?.characters ?? [])
      .map(
        (character) =>
          String(
            character?.characterId ??
            ""
          ).trim()
      )
      .filter(Boolean);

  const access =
    normalizeExpeditionAccess(
      manifest?.access,
      {
        characterIds,
      }
    );

  for (
    const checkbox of
      panel.querySelectorAll(
        "[data-dhct-access-character]" +
        "[data-dhct-access-zone]" +
        "[data-dhct-access-permission]"
      )
  ) {
    if (
      !(checkbox instanceof HTMLInputElement)
    ) {
      continue;
    }

    const characterId =
      String(
        checkbox.dataset
          .dhctAccessCharacter ??
        ""
      ).trim();

    const zone =
      String(
        checkbox.dataset
          .dhctAccessZone ??
        ""
      ).trim();

    const permission =
      String(
        checkbox.dataset
          .dhctAccessPermission ??
        ""
      ).trim();

    const rule =
      access.characters
        ?.[characterId]
        ?.[zone];

    if (
      !rule ||
      ![
        "view",
        "transfer",
      ].includes(permission)
    ) {
      continue;
    }

    rule[permission] =
      checkbox.checked === true;
  }

  /*
   * Normalize once more so transfer=true always forces view=true.
   */
  return normalizeExpeditionAccess(
    access,
    {
      characterIds,
    }
  );
}

async function saveGmAccessMatrix(
  api,
  manifest,
  access
) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "not-gm",
    };
  }

  const characterIds =
    (manifest?.characters ?? [])
      .map(
        (character) =>
          String(
            character?.characterId ??
            ""
          ).trim()
      )
      .filter(Boolean);

  const normalized =
    normalizeExpeditionAccess(
      access,
      {
        characterIds,
      }
    );

  const before =
    JSON.stringify(
      normalizeExpeditionAccess(
        manifest?.access,
        {
          characterIds,
        }
      )
    );

  const after =
    JSON.stringify(
      normalized
    );

  if (before === after) {
    return {
      green: true,
      changed: false,
      access: normalized,
    };
  }

  manifest.access =
    normalized;

  manifest.revision =
    Math.max(
      1,
      Number(
        manifest.revision
      ) || 1
    ) + 1;

  const validation =
    api.expeditionManifest
      .validate?.(
        manifest
      );

  if (
    validation &&
    validation.green === false
  ) {
    throw new Error(
      "Manifest invalide : " +
      (
        validation.errors ??
        []
      ).join("; ")
    );
  }

  await saveAndBroadcastBulkInventoryChange(
    api,
    manifest,
    {
      reason:
        "gm-access-matrix",
    }
  );

  return {
    green: true,
    changed: true,
    access: normalized,
  };
}

function installAccessMatrixCoupling(
  panel
) {
  for (
    const checkbox of
      panel.querySelectorAll(
        "[data-dhct-access-character]" +
        "[data-dhct-access-zone]" +
        "[data-dhct-access-permission]"
      )
  ) {
    if (
      !(checkbox instanceof HTMLInputElement)
    ) {
      continue;
    }

    checkbox.addEventListener(
      "change",
      () => {
        const characterId =
          checkbox.dataset
            .dhctAccessCharacter;

        const zone =
          checkbox.dataset
            .dhctAccessZone;

        if (
          !characterId ||
          !zone
        ) {
          return;
        }

        const selectorBase =
          '[data-dhct-access-character="' +
          CSS.escape(
            characterId
          ) +
          '"]' +
          '[data-dhct-access-zone="' +
          CSS.escape(
            zone
          ) +
          '"]';

        const view =
          panel.querySelector(
            selectorBase +
            '[data-dhct-access-permission="view"]'
          );

        const transfer =
          panel.querySelector(
            selectorBase +
            '[data-dhct-access-permission="transfer"]'
          );

        if (
          !(view instanceof HTMLInputElement) ||
          !(transfer instanceof HTMLInputElement)
        ) {
          return;
        }

        if (
          checkbox.dataset
            .dhctAccessPermission ===
            "transfer" &&
          transfer.checked
        ) {
          view.checked = true;
        }

        if (
          checkbox.dataset
            .dhctAccessPermission ===
            "view" &&
          !view.checked
        ) {
          transfer.checked = false;
        }
      }
    );
  }
}

function injectGmGroundCleanup(
  dialog,
  manifest,
  api
) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "not-gm",
    };
  }

  const gmPane =
    dialog.querySelector(
      ".dhct-expedition-shell__gm-panel"
    );

  if (!(gmPane instanceof HTMLElement)) {
    return {
      green: false,
      reason: "gm-pane-not-found",
    };
  }

  gmPane
    .querySelector(
      "[data-dhct-gm-clear-ground]"
    )
    ?.closest(
      ".dhct-gm-ground-cleanup"
    )
    ?.remove();

  const section =
    document.createElement("section");

  section.className =
    "dhct-gm-ground-cleanup";

  section.style.display =
    "grid";

  section.style.gap =
    ".45rem";

  section.style.padding =
    ".65rem";

  section.style.marginBottom =
    ".75rem";

  section.style.border =
    "1px solid var(--color-border-light-2, rgba(255,255,255,.16))";

  section.style.borderRadius =
    "6px";

  const title =
    document.createElement("strong");

  title.textContent =
    "Gestion du terrain";

  const button =
    document.createElement("button");

  button.type =
    "button";

  button.dataset.dhctGmClearGround =
    "true";

  button.innerHTML =
    '<i class="fa-solid fa-trash-can"></i> Supprimer les objets au sol';

  button.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      button.disabled =
        true;

      try {
        const fresh =
          await api
            ?.expeditionManifest
            ?.load?.(
              manifest.expeditionId
            );

        if (!fresh) {
          throw new Error(
            "Expédition introuvable."
          );
        }

        const ground =
          (fresh.containers ?? [])
            .find(
              (container) =>
                container?.containerId ===
                "ground"
            );

        if (!ground) {
          throw new Error(
            "Conteneur Sol introuvable."
          );
        }

        const result =
          await clearGroundContainer(
            api,
            fresh,
            ground
          );

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "gm-clear-ground-failed"
          );
        }

        if (
          !result.changed &&
          !result.cancelled
        ) {
          button.disabled =
            false;
        }
      } catch (error) {
        console.error(
          MODULE_ID +
          " | GM clear ground failed",
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible de supprimer les objets au sol."
        );

        button.disabled =
          false;
      }
    }
  );

  section.append(
    title,
    button
  );

  gmPane.prepend(
    section
  );

  return {
    green: true,
  };
}

function injectGmAccessMatrix(
  dialog,
  manifest,
  api
) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "not-gm",
    };
  }

  const gmPane =
    dialog.querySelector(
      ".dhct-expedition-shell__gm-panel"
    );

  if (!(gmPane instanceof HTMLElement)) {
    return {
      green: false,
      reason: "gm-pane-not-found",
    };
  }

  gmPane
    .querySelector(
      ".dhct-access-matrix-panel"
    )
    ?.remove();

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.innerHTML =
    renderGmAccessMatrix(
      manifest
    ).trim();

  const panel =
    wrapper.firstElementChild;

  if (!(panel instanceof HTMLElement)) {
    return {
      green: false,
      reason: "panel-build-failed",
    };
  }

  /*
   * ACL matrix is the single logistics access control.
   */
  gmPane.prepend(
    panel
  );

  installAccessMatrixCoupling(
    panel
  );

  const save =
    panel.querySelector(
      "[data-dhct-access-matrix-save]"
    );

  save?.addEventListener(
    "pointerdown",
    (event) => {
      event.stopPropagation();
    }
  );

  save?.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        save instanceof
          HTMLButtonElement
      ) {
        save.disabled =
          true;
      }

      try {
        const fresh =
          await api
            .expeditionManifest
            .load(
              manifest.expeditionId
            );

        if (!fresh) {
          throw new Error(
            "Expédition introuvable."
          );
        }

        const access =
          readGmAccessMatrix(
            panel,
            fresh
          );

        const result =
          await saveGmAccessMatrix(
            api,
            fresh,
            access
          );

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "access-matrix-save-failed"
          );
        }

        if (!result.changed) {
          ui.notifications?.info(
            "Accès inchangés."
          );

          if (
            save instanceof
              HTMLButtonElement
          ) {
            save.disabled =
              false;
          }

          return;
        }

        ui.notifications?.info(
          "Accès logistiques enregistrés."
        );
      } catch (error) {
        console.error(
          MODULE_ID +
          " | access matrix save failed",
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible d’enregistrer les accès."
        );

        if (
          save instanceof
            HTMLButtonElement
        ) {
          save.disabled =
            false;
        }
      }
    }
  );

  return {
    green: true,

    characters:
      Object.keys(
        normalizeExpeditionAccess(
          manifest?.access,
          {
            characterIds:
              (
                manifest?.characters ??
                []
              )
                .map(
                  (character) =>
                    character
                      ?.characterId
                )
                .filter(Boolean),
          }
        ).characters
      ).length,
  };
}


async function processInventoryAuthorityRequest(message) {
  return processInventoryAuthorityRequestCore(message, {
    getApi,
    userCanAccessContainer,
    userCanTransferBetweenContainers,
    broadcastBackpackAccessChange,
  });
}

async function requestInventoryAuthorityAction(payload = {}) {
  return requestInventoryAuthorityActionSync(payload);
}

function broadcastBackpackAccessChange(manifest, containerId) {
  return broadcastBackpackAccessChangeSync(
    manifest,
    containerId
  );
}

async function refreshExpeditionFromSync({
  api,
  manifest,
} = {}) {
  if (!api || !manifest) return false;

  const dialog = findOpenExpeditionDialog();
  if (!dialog) return false;

  await reopenExpeditionDialog(api, manifest);
  return true;
}

function installExpeditionSocketSync() {
  configureExpeditionInventorySync({
    getApi,
    processInventoryAuthorityRequest,
    refreshExpedition: refreshExpeditionFromSync,
  });

  return installExpeditionSocketSyncCore();
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
          <button type="button" data-dhct-backpack-to-ground>
            <i class="fa-solid fa-arrow-down"></i>
            Tout transférer au Sol
          </button>

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
    ".dhct-expedition-shell__gm-panel"
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
    const toGround = card.querySelector("[data-dhct-backpack-to-ground]");

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

    toGround?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    toGround?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (toGround instanceof HTMLButtonElement) {
        toGround.disabled = true;
      }

      try {
        const freshManifest = await api.expeditionManifest.load(
          manifest.expeditionId
        );

        const freshBackpack = (freshManifest?.containers ?? []).find(
          (candidate) => candidate.containerId === containerId
        );

        if (!freshBackpack) {
          throw new Error("Sac à dos introuvable.");
        }

        await transferBackpackContentsToGround(
          api,
          freshManifest,
          freshBackpack
        );
      } catch (error) {
        console.error(`${MODULE_ID} | backpack to ground failed`, error);
        ui.notifications?.error(
          error?.message ?? "Impossible de transférer le sac vers le Sol."
        );

        if (toGround instanceof HTMLButtonElement) {
          toGround.disabled = false;
        }
      }
    });

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


function manifestForGeneralInventory(
  manifest
) {
  const installedIds =
    new Set(
      caravanInstalledContainerIds(
        manifest
      )
    );

  if (!installedIds.size) {
    return manifest;
  }

  return {
    ...manifest,

    containers:
      (manifest?.containers ?? [])
        .filter(
          (container) =>
            !installedIds.has(
              container?.containerId
            )
        ),
  };
}

function buildExpeditionInventoryView(
  manifest,
  {
    initialSharedRole = "ground",
  } = {}
) {
  const viewManifest =
    manifestForGeneralInventory(
      manifest
    );

  const viewerCapabilities =
    createFoundryViewerCapabilities({
      user: game.user,
      manifest:
        viewManifest,
    });

  const inventory =
    projectExpeditionInventory({
      manifest:
        viewManifest,
      capabilityResolver:
        containerCapabilityResolver(
          viewerCapabilities
        ),

      roleResolver:
        (container) =>
          container?.type === "backpack"
            ? "backpack"
            : containerAccessZone(
                manifest,
                container
              ),
      logisticsPhase:
        resolveManifestLogisticsPhase(
          manifest
        ),
    });

  return renderExpeditionInventoryView(
    inventory,
    {
      initialSharedRole,
    }
  );
}

// P3.3b — Capacité du conteneur d'inventaire FOB (sans composants FOB).
function installGmFobCapacityEditor(view, manifest, api) {
  if (!(view instanceof HTMLElement) || !game.user?.isGM) return;
  const container = (manifest?.containers ?? []).find(c => c?.containerId === "fob");
  if (!container) return;

  const panel = document.createElement("form");
  panel.className = "dhct-fob-capacity-editor";
  panel.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;padding:8px;border:1px solid var(--color-border-light-primary);border-radius:6px";
  const label = document.createElement("label");
  label.textContent = "MJ — Capacité de l’inventaire FOB (slots) : ";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100000";
  input.step = "1";
  input.required = true;
  input.value = String(container.capacity?.slots ?? 24);
  input.style.width = "90px";
  label.append(input);
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Enregistrer";
  panel.append(label, button);
  view.prepend(panel);

  panel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!game.user?.isGM || button.disabled) return;
    const raw = input.value.trim();
    const slots = Number(raw);
    if (!raw || !Number.isSafeInteger(slots) || slots < 0 || slots > 100000) {
      ui.notifications?.warn("La capacité doit être un entier compris entre 0 et 100 000.");
      return;
    }
    button.disabled = true;
    try {
      const fresh = await api.expeditionManifest.load(manifest.expeditionId);
      const target = (fresh?.containers ?? []).find(c => c?.containerId === "fob");
      if (!target) throw new Error("Inventaire FOB introuvable.");
      if (target.capacity?.slots === slots) return;
      const result = normalizeBackpackSlots(target, slots);
      if (!result.green) throw new Error(result.reason);
      fresh.revision = Math.max(1, Number(fresh.revision) || 1) + 1;
      await saveAndBroadcastBulkInventoryChange(api, fresh, {
        containerId: "fob", reason: "gm-fob-inventory-capacity",
      });
      ui.notifications?.info(`Capacité FOB enregistrée : ${slots} slots.`);
    } catch (error) {
      console.error(MODULE_ID + " | FOB capacity update failed", error);
      ui.notifications?.error(error?.message ?? "Impossible de modifier la capacité FOB.");
    } finally {
      button.disabled = false;
    }
  });
}

function buildExpeditionContainerView(
  manifest,
  role
) {
  const viewerCapabilities =
    createFoundryViewerCapabilities({
      user: game.user,
      manifest,
    });

  const inventory =
    projectExpeditionInventory({
      manifest,
      capabilityResolver:
        containerCapabilityResolver(
          viewerCapabilities
        ),

      roleResolver:
        (container) =>
          container?.type === "backpack"
            ? "backpack"
            : containerAccessZone(
                manifest,
                container
              ),
      logisticsPhase:
        resolveManifestLogisticsPhase(
          manifest
        ),
    });

  return renderExpeditionContainerView(
    inventory,
    {
      role,
    }
  );
}

async function buildExpeditionDashboardView(
  api,
  manifest
) {
  const viewerCapabilities =
    createFoundryViewerCapabilities({
      user: game.user,
      manifest,
    });

  const inventory =
    projectExpeditionInventory({
      manifest,
      capabilityResolver:
        containerCapabilityResolver(
          viewerCapabilities
        ),

      roleResolver:
        (container) =>
          container?.type === "backpack"
            ? "backpack"
            : containerAccessZone(
                manifest,
                container
              ),
      logisticsPhase:
        resolveManifestLogisticsPhase(
          manifest
        ),
    });

  const materials =
    await api.craftingMaterials.list();

  const propertyCatalog =
    await api.craftingMaterials.loadProperties();

  const materialInventory =
    inventory.containers.flatMap(
      (container) =>
        (container.entries ?? [])
          .filter(
            (entry) =>
              entry?.item?.materialId &&
              Number(entry?.quantity) > 0
          )
          .map((entry) => ({
            materialId:
              entry.item.materialId,
            quantity:
              Number(entry.quantity) || 0,
          }))
    );

  const materialLibrary =
    projectMaterialLibrary({
      materials,
      propertyCatalog,
      knowledge: {},
      inventory: materialInventory,
    });

  const dashboard =
    projectExpeditionDashboard({
      manifest,
      inventory,
      materialLibrary,
    });

  return renderExpeditionView(
    dashboard
  );
}


function installCaravanEquipmentViewHandlers(
  view,
  manifest,
  api
) {
  if (
    !(view instanceof HTMLElement)
  ) {
    return;
  }

  view.addEventListener("dhct-caravan-metadata-update", async (event) => {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Action réservée au MJ.");
      return;
    }
    const { kind, id, values = {} } = event.detail ?? {};
    if (!["caravan", "component", "cargo"].includes(kind) || !id) return;
    const name = String(values.name ?? "").trim();
    if (!name || name.length > 120) {
      ui.notifications?.warn("Le nom doit contenir entre 1 et 120 caractères.");
      return;
    }
    try {
      const fresh = await api.expeditionManifest.load(manifest.expeditionId);
      if (!fresh?.caravan) throw new Error("Caravane introuvable.");
      const target = kind === "caravan"
        ? fresh.caravan
        : kind === "component"
          ? fresh.caravan.components?.find((entry) => entry.id === id)
          : fresh.caravan.cargoSlots?.find((entry) => entry.id === id);
      if (!target || target.id !== id) throw new Error("Élément de caravane introuvable.");
      let changed = target.name !== name;
      target.name = name;
      if (kind === "component") {
        if (values.hpMax !== undefined || values.hpValue !== undefined) {
          const max = Number(values.hpMax ?? target.hp?.max);
          const value = Number(values.hpValue ?? target.hp?.value);
          if (!Number.isSafeInteger(max) || max < 0 ||
              !Number.isSafeInteger(value) || value < 0 || value > max) {
            throw new Error("PV invalides : 0 ≤ PV actuels ≤ PV maximum.");
          }
          if (target.hp?.max !== max || target.hp?.value !== value) changed = true;
          target.hp = { max, value };
        }
        for (const key of ["x", "y", "width", "height", "rotation"]) {
          if (values[key] === undefined) continue;
          const number = Number(values[key]);
          if (!Number.isFinite(number) ||
              (key !== "rotation" && (number < 0 || number > 1))) {
            throw new Error("Coordonnée invalide : " + key);
          }
          target.layout ??= {};
          if (target.layout[key] !== number) changed = true;
          target.layout[key] = number;
        }
      }
      if (!changed) return;
      fresh.revision = Math.max(1, Number(fresh.revision) || 1) + 1;
      await saveAndBroadcastBulkInventoryChange(api, fresh, {
        reason: "gm-caravan-metadata",
      });
      ui.notifications?.info("Caravane mise à jour.");
    } catch (error) {
      console.error(MODULE_ID + " | caravan metadata update failed", error);
      ui.notifications?.error(error?.message ?? "Échec de la modification de la caravane.");
    }
  });

  view.addEventListener("dhct-caravan-component-add", async () => {
    if (!game.user?.isGM) return ui.notifications?.warn("Action réservée au MJ.");
    try {
      const fresh = await api.expeditionManifest.load(manifest.expeditionId);
      if (!fresh?.caravan) throw new Error("Caravane introuvable.");
      fresh.caravan.components ??= [];
      const existing = new Set(fresh.caravan.components.map((c) => c.id));
      let index = 1;
      while (existing.has("custom-component-" + index)) index++;
      const id = "custom-component-" + index;
      fresh.caravan.components.push({
        id, type: "generic", name: "Nouveau composant " + index,
        hp: { value: 10, max: 10 }, containerId: null,
        layout: { x: 0.42, y: 0.42, width: 0.15, height: 0.15, rotation: 0 },
        state: {},
      });
      fresh.revision = Math.max(1, Number(fresh.revision) || 1) + 1;
      await saveAndBroadcastBulkInventoryChange(api, fresh, {
        reason: "gm-caravan-component-add",
      });
      ui.notifications?.info("Composant ajouté : " + id);
    } catch (error) {
      console.error(MODULE_ID + " | caravan component add failed", error);
      ui.notifications?.error(error?.message ?? "Ajout impossible.");
    }
  });

  view.addEventListener("dhct-caravan-component-remove", async (event) => {
    if (!game.user?.isGM) return ui.notifications?.warn("Action réservée au MJ.");
    try {
      const id = String(event.detail?.componentId ?? "");
      const fresh = await api.expeditionManifest.load(manifest.expeditionId);
      if (!fresh?.caravan?.components?.some((c) => c.id === id)) {
        throw new Error("Composant introuvable.");
      }
      if (fresh.caravan.cargoSlots?.some((slot) => slot.componentId === id)) {
        throw new Error("Retirez d'abord ce composant de son emplacement cargo.");
      }
      const component = fresh.caravan.components.find((c) => c.id === id);
      if (component.containerId) {
        throw new Error("Composant associé à un conteneur : retrait bloqué.");
      }
      fresh.caravan.components = fresh.caravan.components.filter((c) => c.id !== id);
      fresh.revision = Math.max(1, Number(fresh.revision) || 1) + 1;
      await saveAndBroadcastBulkInventoryChange(api, fresh, {
        reason: "gm-caravan-component-remove",
      });
      ui.notifications?.info("Composant supprimé.");
    } catch (error) {
      console.error(MODULE_ID + " | caravan component remove failed", error);
      ui.notifications?.error(error?.message ?? "Suppression impossible.");
    }
  });

  view.addEventListener(
    "dhct-caravan-wheel-hp-change",
    async (event) => {
      if (!game.user?.isGM) {
        ui.notifications?.warn(
          "Action réservée au MJ."
        );

        return;
      }

      const detail =
        event.detail ?? {};

      const componentId =
        String(
          detail.componentId ?? ""
        ).trim();

      const delta =
        Math.trunc(
          Number(
            detail.delta
          ) || 0
        );

      if (
        !componentId ||
        ![-1, 1].includes(delta)
      ) {
        ui.notifications?.warn(
          "Modification de roue invalide."
        );

        return;
      }

      try {
        const fresh =
          await api.expeditionManifest.load(
            manifest.expeditionId
          );

        if (!fresh) {
          throw new Error(
            "Manifeste d’expédition introuvable."
          );
        }

        const component =
          fresh.caravan
            ?.components
            ?.find(
              (candidate) =>
                candidate.id ===
                componentId
            );

        if (
          !component ||
          component.type !== "wheel"
        ) {
          throw new Error(
            "Roue introuvable dans la caravane."
          );
        }

        const max =
          Math.max(
            0,
            Math.floor(
              Number(
                component.hp?.max
              ) || 0
            )
          );

        const current =
          Math.max(
            0,
            Math.min(
              max,
              Math.floor(
                Number(
                  component.hp?.value
                ) || 0
              )
            )
          );

        const next =
          Math.max(
            0,
            Math.min(
              max,
              current + delta
            )
          );

        if (next === current) {
          return;
        }

        component.hp ??= {
          value: current,
          max,
        };

        component.hp.value =
          next;

        component.hp.max =
          max;

        fresh.revision =
          Math.max(
            1,
            Number(
              fresh.revision
            ) || 1
          ) + 1;

        await saveAndBroadcastBulkInventoryChange(
          api,
          fresh,
          {
            reason:
              "gm-caravan-wheel-hp",
          }
        );

        ui.notifications?.info(
          component.name +
          " : " +
          String(next) +
          "/" +
          String(max) +
          " PV."
        );
      } catch (error) {
        console.error(
          MODULE_ID +
          " | caravan wheel HP update failed",
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible de modifier les PV de la roue."
        );
      }
    }
  );

  view.addEventListener(
    "dhct-caravan-equipment-install",
    async (event) => {
      if (!game.user?.isGM) {
        ui.notifications?.warn(
          "Action r\u00e9serv\u00e9e au MJ."
        );
        return;
      }

      const detail =
        event.detail ?? {};

      try {
        const fresh =
          await api.expeditionManifest.load(
            manifest.expeditionId
          );

        const componentId =
          String(
            detail.slotId ?? ""
          ) +
          "-" +
          String(
            detail.definitionId ?? ""
          );

        const result =
          installCaravanEquipmentInManifest(
            fresh,
            {
              slotId:
                detail.slotId,

              definitionId:
                detail.definitionId,

              componentId,

              capacitySlots:
                detail.capacitySlots,
            }
          );

        await saveAndBroadcastBulkInventoryChange(
          api,
          result.manifest,
          {
            containerId:
              result.container
                ?.containerId ??
              null,

            reason:
              "gm-caravan-equipment-install",
          }
        );

        ui.notifications?.info(
          (
            result.component?.name ??
            "Composant"
          ) +
          " install\u00e9 dans " +
          String(
            result.slotId
          )
        );
      } catch (error) {
        console.error(
          MODULE_ID +
          " | caravan equipment install failed",
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible d'installer le composant."
        );
      }
    }
  );

  view.addEventListener(
    "dhct-caravan-equipment-remove",
    async (event) => {
      if (!game.user?.isGM) {
        ui.notifications?.warn(
          "Action r\u00e9serv\u00e9e au MJ."
        );
        return;
      }

      const detail =
        event.detail ?? {};

      try {
        const fresh =
          await api.expeditionManifest.load(
            manifest.expeditionId
          );

        const result =
          removeCaravanEquipmentFromManifest(
            fresh,
            {
              slotId:
                detail.slotId,
            }
          );

        if (!result.changed) {
          if (
            result.reason ===
              "container-not-empty"
          ) {
            ui.notifications?.warn(
              "Videz ce conteneur avant de retirer le composant."
            );

            return;
          }

          if (
            result.reason ===
              "cargo-slot-empty"
          ) {
            ui.notifications?.info(
              "Cet emplacement est d\u00e9j\u00e0 vide."
            );

            return;
          }

          throw new Error(
            result.reason ??
            "Retrait refus\u00e9."
          );
        }

        await saveAndBroadcastBulkInventoryChange(
          api,
          result.manifest,
          {
            containerId:
              result.container
                ?.containerId ??
              null,

            reason:
              "gm-caravan-equipment-remove",
          }
        );

        ui.notifications?.info(
          (
            result.component?.name ??
            "Composant"
          ) +
          " retir\u00e9 de " +
          String(
            result.slotId
          )
        );
      } catch (error) {
        console.error(
          MODULE_ID +
          " | caravan equipment remove failed",
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible de retirer le composant."
        );
      }
    }
  );
}

function parseExternalFoundryItemDrop(
  dataTransfer
) {
  if (!dataTransfer) {
    return null;
  }

  try {
    const payload =
      JSON.parse(
        dataTransfer.getData(
          "application/x-dct-foundry-item"
        ) || "null"
      );

    const itemUuid =
      String(
        payload?.itemUuid ?? ""
      ).trim();

    if (itemUuid) {
      return { itemUuid };
    }
  } catch (_error) {}

  for (const mime of [
    "text/plain",
    "application/json",
  ]) {
    const raw =
      dataTransfer.getData(mime);

    if (!raw) {
      continue;
    }

    try {
      const payload =
        JSON.parse(raw);

      const itemUuid =
        String(
          payload?.uuid ??
          payload?.data?.uuid ??
          ""
        ).trim();

      const type =
        String(
          payload?.type ??
          payload?.documentName ??
          payload?.data?.type ??
          ""
        ).trim();

      if (
        itemUuid &&
        (
          type === "Item" ||
          itemUuid.startsWith("Item.") ||
          itemUuid.includes(".Item.") ||
          itemUuid.startsWith("Compendium.")
        )
      ) {
        return { itemUuid };
      }
    } catch (_error) {}
  }

  return null;
}


function findExternalItemDropTarget(
  view,
  manifest,
  eventTarget
) {
  if (
    !(view instanceof HTMLElement) ||
    !(eventTarget instanceof Element)
  ) {
    return null;
  }

  const node =
    eventTarget.closest(
      "[data-container-id]"
    );

  if (
    !(node instanceof HTMLElement) ||
    !view.contains(node)
  ) {
    return null;
  }

  const containerId =
    String(
      node.dataset.containerId ?? ""
    ).trim();

  const container =
    (manifest?.containers ?? [])
      .find(
        (candidate) =>
          candidate?.containerId ===
          containerId
      );

  if (!container) {
    return null;
  }

  const zone =
    containerAccessZone(
      manifest,
      container
    );

  if (
    ![
      "ground",
      "fob",
      "caravan",
    ].includes(zone)
  ) {
    return null;
  }

  return {
    node,
    container,
    containerId,
    zone,
  };
}


function installInventoryViewHandlers(
  view,
  manifest
) {
  /*
   * Foundry / Compendium -> stockage partag?.
   */
  view.addEventListener(
    "dragover",
    (event) => {
      const types =
        [
          ...(event.dataTransfer?.types ?? []),
        ];

      const external =
        types.includes(
          "application/x-dct-foundry-item"
        ) ||
        types.includes("text/plain") ||
        types.includes("application/json");

      if (!external) {
        return;
      }

      const target =
        findExternalItemDropTarget(
          view,
          manifest,
          event.target
        );

      if (!target) {
        return;
      }

      event.preventDefault();

      target.node.classList.add(
        "dhct-inventory-view__drop-target"
      );

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect =
          "copy";
      }
    }
  );

  view.addEventListener(
    "dragleave",
    (event) => {
      const node =
        event.target instanceof Element
          ? event.target.closest(
              "[data-container-id]"
            )
          : null;

      if (
        !(node instanceof HTMLElement) ||
        !view.contains(node)
      ) {
        return;
      }

      if (
        event.relatedTarget &&
        node.contains(event.relatedTarget)
      ) {
        return;
      }

      node.classList.remove(
        "dhct-inventory-view__drop-target"
      );
    }
  );

  view.addEventListener(
    "drop",
    async (event) => {
      /*
       * Ne jamais intercepter le drag DHCT interne.
       */
      if (
        event.dataTransfer?.getData(
          "application/x-dhct-inventory-entry"
        )
      ) {
        return;
      }

      const payload =
        parseExternalFoundryItemDrop(
          event.dataTransfer
        );

      if (!payload?.itemUuid) {
        return;
      }

      const target =
        findExternalItemDropTarget(
          view,
          manifest,
          event.target
        );

      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      target.node.classList.remove(
        "dhct-inventory-view__drop-target"
      );

      try {
        const result =
          await requestInventoryAuthorityAction({
            expeditionId:
              manifest.expeditionId,
            action:
              "acquire-item",
            itemUuid:
              payload.itemUuid,
            toContainerId:
              target.containerId,
            quantity: 1,
          });

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "acquire-item-refused"
          );
        }

        ui.notifications?.info(
          `${result.itemName ?? "Objet"} ajouté à ${target.container.name ?? target.containerId}.`
        );
      } catch (error) {
        console.error(
          `${MODULE_ID} | native Foundry item drop failed`,
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible d'ajouter cet objet."
        );
      }
    }
  );


  view.addEventListener(
    "dhct-inventory-transfer-request",
    async (event) => {
      const detail = event.detail ?? {};

      const button =
        event.target instanceof Element
          ? event.target.closest("button")
          : null;

      if (button) {
        button.disabled = true;
      }

      try {
        const available =
          Math.max(
            1,
            Number(detail.quantity) || 1
          );

        const quantity =
          available > 1
            ? await chooseActionQuantity(
                {
                  quantity:
                    available,
                },
                {
                  actionLabel:
                    "Transf\u00e9rer",
                  actionVerb:
                    "transf\u00e9rer",
                }
              )
            : 1;

        if (quantity == null) {
          if (button) {
            button.disabled = false;
          }
          return;
        }

        const result =
          await requestInventoryAuthorityAction({
            expeditionId:
              manifest.expeditionId,
            action: "transfer",
            fromContainerId:
              detail.fromContainerId,
            toContainerId:
              detail.toContainerId,
            entryId:
              detail.entryId,
            quantity,
          });

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "Transfert refus\u00e9."
          );
        }

        ui.notifications?.info(
          "Objet transf\u00e9."
        );
      } catch (error) {
        console.error(
          `${MODULE_ID} | projected inventory transfer failed`,
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible de transf\u00e9rer cet objet."
        );

        if (button) {
          button.disabled = false;
        }
      }
    }
  );

  view.addEventListener(
    "dhct-inventory-return-request",
    async (event) => {
      const detail = event.detail ?? {};

      try {
        const available =
          Math.max(
            1,
            Number(detail.quantity) || 1
          );

        const quantity =
          available > 1
            ? await chooseActionQuantity(
                {
                  quantity:
                    available,
                },
                {
                  actionLabel:
                    "Renvoyer",
                  actionVerb:
                    "renvoyer",
                }
              )
            : 1;

        if (quantity == null) {
          return;
        }

        const result =
          await requestInventoryAuthorityAction({
            expeditionId:
              manifest.expeditionId,
            action: "backpack-to-actor",
            fromContainerId:
              detail.fromContainerId,
            entryId:
              detail.entryId,
            quantity,
          });

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "Restitution refus\u00e9e."
          );
        }

        ui.notifications?.info(
          "Objet renvoy\u00e9 au personnage."
        );
      } catch (error) {
        console.error(
          `${MODULE_ID} | projected inventory return failed`,
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Impossible de renvoyer cet objet."
        );
      }
    }
  );

  view.addEventListener(
    "dhct-inventory-item-action-request",
    async (event) => {
      const detail = event.detail ?? {};

      const action =
        String(detail.action ?? "");

      if (
        action !== "consume" &&
        action !== "delete"
      ) {
        return;
      }

      try {
        const api = getApi();

        const freshManifest =
          await api.expeditionManifest.load(
            manifest.expeditionId
          );

        const container =
          (freshManifest?.containers ?? [])
            .find(
              (candidate) =>
                candidate.containerId ===
                detail.containerId
            );

        const entry =
          (container?.contents ?? [])
            .find(
              (candidate) =>
                candidate.entryId ===
                detail.entryId
            );

        if (!container || !entry) {
          throw new Error(
            "Cet objet n'est plus disponible."
          );
        }

        await handleInventoryItemAction(
          action,
          {
            manifest: freshManifest,
            container,
            entry,
          }
        );
      } catch (error) {
        console.error(
          `${MODULE_ID} | projected inventory item action failed`,
          error
        );

        ui.notifications?.error(
          error?.message ??
          "Action d'inventaire impossible."
        );
      }
    }
  );
}

function resolveActorNameFromUuid(
  actorUuid
) {
  const value =
    String(actorUuid ?? "").trim();

  if (!value.startsWith("Actor.")) {
    return value;
  }

  const actorId =
    value.slice("Actor.".length);

  return (
    game.actors?.get(actorId)?.name ??
    value
  );
}

function resolveWeaponNameFromUuid(
  weaponUuid
) {
  const value =
    String(weaponUuid ?? "").trim();

  const match =
    /^Actor\.([^.]+)\.Item\.([^.]+)$/
      .exec(value);

  if (!match) {
    return value;
  }

  const actor =
    game.actors?.get(
      match[1]
    );

  return (
    actor?.items?.get(
      match[2]
    )?.name ??
    value
  );
}

function fobQueueProgressLabel(
  entry
) {
  const progress =
    Math.max(
      0,
      Number(entry?.progress) || 0
    );

  const required =
    Math.max(
      1,
      Number(entry?.turnsRequired) || 1
    );

  if (progress >= required) {
    return "Prêt à finaliser";
  }

  return (
    String(progress) +
    "/" +
    String(required) +
    " tour(s)"
  );
}

async function chooseResearchContributor(
  entry,
  action
) {
  const current =
    new Set(
      Array.isArray(
        entry?.contributors
      )
        ? entry.contributors
            .filter(
              contributor =>
                contributor?.type ===
                  "actor" &&
                contributor?.uuid
            )
            .map(
              contributor =>
                contributor.uuid
            )
        : []
    );

  let candidates =
    [...(game.actors ?? [])]
      .filter(
        actor =>
          actor?.type ===
            "character"
      )
      .filter(
        actor =>
          action === "add"
            ? !current.has(
                actor.uuid
              )
            : current.has(
                actor.uuid
              )
      )
      .sort(
        (a, b) =>
          String(a.name ?? "")
            .localeCompare(
              String(b.name ?? ""),
              game.i18n?.lang ??
                "fr"
            )
      );

  if (!candidates.length) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (DialogV2?.prompt) {
    const options =
      candidates
        .map(
          actor =>
            '<option value="' +
            escapeHtml(actor.uuid) +
            '">' +
            escapeHtml(actor.name) +
            "</option>"
        )
        .join("");

    const selectedUuid =
      await DialogV2.prompt({
        window: {
          title:
            action === "add"
              ? "Ajouter un contributeur"
              : "Retirer un contributeur",
        },

        content:
          `
            <div class="form-group">
              <label>
                Personnage
              </label>

              <div class="form-fields">
                <select
                  name="dhct-research-contributor"
                  autofocus
                >
                  ${options}
                </select>
              </div>
            </div>
          `,

        ok: {
          label:
            action === "add"
              ? "Ajouter"
              : "Retirer",

          callback:
            (
              _event,
              _button,
              dialog
            ) =>
              dialog?.element
                ?.querySelector?.(
                  '[name="dhct-research-contributor"]'
                )
                ?.value ??
              null,
        },

        rejectClose:
          false,
      });

    if (!selectedUuid) {
      return null;
    }

    return (
      candidates.find(
        actor =>
          actor.uuid ===
          selectedUuid
      ) ?? null
    );
  }

  return candidates[0];
}


async function chooseCraftContributor(
  entry,
  action
) {
  const contributors =
    Array.isArray(
      entry?.contributors
    )
      ? entry.contributors
          .filter(
            contributor =>
              contributor?.type ===
                "actor" &&
              contributor?.uuid
          )
          .map(
            contributor =>
              contributor.uuid
          )
      : [];

  const contributorSet =
    new Set(contributors);

  const eligible =
    [...(game.actors ?? [])]
      .filter(
        actor =>
          actor?.type ===
            "character"
      )
      .filter(
        actor =>
          action === "add"
            ? (
                (
                  hasHuntArtisanCard(
                    actor
                  ) ||
                  isArtificer(
                    actor
                  )
                ) &&
                !contributorSet.has(
                  actor.uuid
                )
              )
            : contributorSet.has(
                actor.uuid
              )
      )
      .sort(
        (a, b) =>
          String(
            a.name ?? ""
          ).localeCompare(
            String(
              b.name ?? ""
            ),
            game.i18n?.lang ??
              "fr"
          )
      );

  if (
    eligible.length === 0
  ) {
    return null;
  }

  if (
    eligible.length === 1
  ) {
    return eligible[0];
  }

  const options =
    eligible
      .map(
        actor =>
          `<option value="${actor.uuid}">${actor.name}</option>`
      )
      .join("");

  if (
    foundry?.applications?.api
      ?.DialogV2?.prompt
  ) {
    const uuid =
      await foundry
        .applications
        .api
        .DialogV2
        .prompt({
          window: {
            title:
              action === "add"
                ? "Ajouter un contributeur"
                : "Retirer un contributeur",
          },

          content:
            `<label>
              Personnage
              <select name="actorUuid">
                ${options}
              </select>
            </label>`,

          ok: {
            label:
              action === "add"
                ? "Ajouter"
                : "Retirer",

            callback:
              (
                _event,
                button
              ) =>
                button.form
                  ?.elements
                  ?.actorUuid
                  ?.value ??
                null,
          },
        });

    return (
      eligible.find(
        actor =>
          actor.uuid === uuid
      ) ?? null
    );
  }

  const listing =
    eligible
      .map(
        (actor, index) =>
          `${index + 1}. ${actor.name}`
      )
      .join("\n");

  const answer =
    globalThis.window
      ?.prompt?.(
        (
          action === "add"
            ? "Ajouter un contributeur"
            : "Retirer un contributeur"
        ) +
        "\n\n" +
        listing
      );

  const index =
    Number(answer) - 1;

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < eligible.length
      ? eligible[index]
      : null
  );
}

function renderFobQueueColumn({
  title,
  kind,
  entries,
  isGm = false,
} = {}) {
  const section =
    document.createElement(
      "section"
    );

  section.className =
    "dhct-fob-queue";

  const heading =
    document.createElement(
      "h4"
    );

  heading.textContent =
    title;

  section.append(
    heading
  );

  if (!entries.length) {
    const empty =
      document.createElement(
        "p"
      );

    empty.className =
      "dhct-fob-queue__empty";

    empty.textContent =
      "Aucune activité programmée.";

    section.append(
      empty
    );

    return section;
  }

  entries.forEach(
    (entry, index) => {
      const row =
        document.createElement(
          "article"
        );

      row.className =
        "dhct-fob-queue__row";

      row.dataset.dhctFobQueueKind =
        kind;

      row.dataset.dhctFobQueueEntryId =
        entry.id;

      const copy =
        document.createElement(
          "div"
        );

      copy.className =
        "dhct-fob-queue__copy";

      const titleLine =
        document.createElement(
          "strong"
        );

      titleLine.dataset.dhctFobQueueTitle =
        "true";

      if (kind === "research") {
        row.dataset.dhctFobMaterialId =
          entry.materialId ?? "";

        row.dataset.dhctFobPropertyId =
          entry.propertyId ?? "";

        titleLine.textContent =
          String(index + 1) +
          ". " +
          String(
            entry.propertyId ??
            "Propriété"
          ) +
          " — " +
          String(
            entry.materialId ??
            "Matériau"
          );
      } else {
        row.dataset.dhctFobAugmentId =
          entry.augmentId ?? "";

        row.dataset.dhctFobWeaponUuid =
          entry.weaponUuid ?? "";

        titleLine.textContent =
          String(index + 1) +
          ". " +
          String(
            entry.augmentId ??
            "Fabrication"
          ) +
          " — " +
          resolveWeaponNameFromUuid(
            entry.weaponUuid
          );
      }

      const actor =
        document.createElement(
          "small"
        );

      // R4.2b.3a : contributors est la source de verite.
      // Le repli actorUuid est reserve aux anciennes entrees
      // qui ne possedent pas encore le champ contributors.
      const contributorUuids =
        Array.isArray(entry?.contributors)
          ? entry.contributors
              .filter(
                contributor =>
                  contributor?.type === "actor" &&
                  contributor?.uuid
              )
              .map(
                contributor => contributor.uuid
              )
          : [entry?.actorUuid].filter(Boolean);

      const contributorNames =
        contributorUuids
          .map(resolveActorNameFromUuid)
          .filter(Boolean);

      actor.textContent =
        "Contributeurs : " +
        (
          contributorNames.length
            ? contributorNames.join(", ")
            : "aucun"
        );
      const progress =
        document.createElement(
          "span"
        );

      progress.className =
        "dhct-fob-queue__progress";

      progress.textContent =
        fobQueueProgressLabel(
          entry
        );

      copy.append(
        titleLine,
        actor,
        progress
      );

      if (
        kind === "craft" &&
        index === 0
      ) {
        const next =
          document.createElement(
            "span"
          );

        next.className =
          "dhct-fob-queue__next";

        next.textContent =
          "Prochain tour de Base Avancée";

        copy.append(
          next
        );
      }

      row.append(
        copy
      );

      if (
        isGm &&
        kind === "research"
      ) {
        const controls =
          document.createElement(
            "div"
          );

        controls.className =
          "dhct-fob-queue__controls";

        const add =
          document.createElement(
            "button"
          );

        add.type = "button";
        add.textContent = "+";
        add.title =
          "Ajouter un contributeur";

        add.dataset
          .dhctResearchContributorAction =
            "add";

        const remove =
          document.createElement(
            "button"
          );

        remove.type = "button";
        remove.textContent = "−";
        remove.title =
          "Retirer un contributeur";

        remove.dataset
          .dhctResearchContributorAction =
            "remove";

        /*
         * R3 conserve au moins un contributeur.
         * R4 autorisera 0 contributeur avec +0 progrès.
         */
        remove.disabled =
          !Array.isArray(
            entry?.contributors
          ) ||
          entry.contributors.length === 0;

        controls.append(
          add,
          remove
        );

        row.append(
          controls
        );
      }

      if (
        isGm &&
        kind === "craft"
      ) {
        const controls =
          document.createElement(
            "div"
          );

        controls.className =
          "dhct-fob-queue__controls";

        const up =
          document.createElement(
            "button"
          );

        up.type = "button";
        up.textContent = "↑";
        up.title =
          "Avancer dans la file";
        up.dataset.dhctFobQueueMove =
          "up";
        up.disabled =
          index === 0;

        const down =
          document.createElement(
            "button"
          );

        down.type = "button";
        down.textContent = "↓";
        down.title =
          "Reculer dans la file";
        down.dataset.dhctFobQueueMove =
          "down";
        down.disabled =
          index ===
          entries.length - 1;

        const addContributor =
          document.createElement(
            "button"
          );

        addContributor.type =
          "button";

        addContributor.textContent =
          "+";

        addContributor.title =
          "Ajouter un contributeur";

        addContributor.dataset
          .dhctFobCraftContributor =
            "add";

        const removeContributor =
          document.createElement(
            "button"
          );

        removeContributor.type =
          "button";

        removeContributor.textContent =
          "−";

        removeContributor.title =
          "Retirer un contributeur";

        removeContributor.dataset
          .dhctFobCraftContributor =
            "remove";

        removeContributor.disabled =
          !Array.isArray(
            entry?.contributors
          ) ||
          entry.contributors.length === 0;

        controls.append(
          addContributor,
          removeContributor,
          up,
          down
        );

        row.append(
          controls
        );
      }

      section.append(
        row
      );
    }
  );

  return section;
}

async function hydrateFobActivityPanelLabels(
  panel
) {
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  const api =
    getApi();

  const rows =
    [
      ...panel.querySelectorAll(
        "[data-dhct-fob-queue-entry-id]"
      ),
    ];

  for (const row of rows) {
    if (!(row instanceof HTMLElement)) {
      continue;
    }

    const kind =
      row.dataset
        .dhctFobQueueKind;

    const materialId =
      row.dataset
        .dhctFobMaterialId ?? "";

    const propertyId =
      row.dataset
        .dhctFobPropertyId ?? "";

    const augmentId =
      row.dataset
        .dhctFobAugmentId ?? "";

    const weaponUuid =
      row.dataset
        .dhctFobWeaponUuid ?? "";

    const title =
      row.querySelector(
        "[data-dhct-fob-queue-title]"
      );

    if (!(title instanceof HTMLElement)) {
      continue;
    }

    try {
      if (
        kind === "research" &&
        materialId &&
        propertyId
      ) {
        const [
          material,
          property,
        ] =
          await Promise.all([
            api?.craftingMaterials
              ?.get?.(
                materialId
              ),

            api?.craftingMaterials
              ?.property?.(
                propertyId
              ),
          ]);

        const materialName =
          material?.name ??
          material?.label ??
          material?.material?.name ??
          materialId;

        const propertyName =
          property?.label ??
          property?.name ??
          propertyId;

        title.textContent =
          propertyName +
          " — " +
          materialName;

        continue;
      }

      if (
        kind === "craft" &&
        augmentId
      ) {
        const augment =
          await api?.weaponAugments
            ?.get?.(
              augmentId
            );

        const augmentName =
          augment?.name ??
          augment?.label ??
          augmentId;

        const weaponName =
          resolveWeaponNameFromUuid(
            weaponUuid
          );

        title.textContent =
          augmentName +
          " — " +
          weaponName;
      }
    } catch (error) {
      console.warn(
        MODULE_ID +
        " | FOB activity label hydration failed",
        {
          kind,
          materialId,
          propertyId,
          augmentId,
          weaponUuid,
          error,
        }
      );
    }
  }
}

// R4.8h.1: creation d'un projet de consommable depuis la FOB (MJ seulement).
async function openFobConsumableCraftDialog(expeditionId) {
  if (!game.user?.isGM) return { green: false, reason: "not-gm" };
  const api = getApi();
  if (
    !api?.crafting?.listRecipes ||
    !api?.crafting?.planRecipe ||
    !api?.craftingCraftQueue?.enqueueConsumable
  ) {
    throw new Error("API de fabrication des consommables indisponible.");
  }

  const [recipes, manifest] = await Promise.all([
    api.crafting.listRecipes(),
    api.expeditionManifest.load(expeditionId),
  ]);
  if (!manifest?.fob?.storageContainerId ||
      !(manifest.containers ?? []).some(c => c.containerId === manifest.fob.storageContainerId)) {
    throw new Error("Stockage FOB introuvable.");
  }

  const availableRecipes = (recipes ?? [])
    .filter(recipe => recipe?.output?.type === "consumable" && recipe.id)
    .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "fr"));
  const artisans = [...(game.actors ?? [])]
    .filter(actor => actor?.type === "character" &&
      (hasHuntArtisanCard(actor) || isArtificer(actor)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  if (!availableRecipes.length) throw new Error("Aucune recette de consommable disponible.");
  if (!artisans.length) throw new Error("Aucun Artisan ou Artificier disponible.");

  const choices = `
    <div class="form-group"><label>Recette</label>
      <select name="dhct-craft-recipe">
        ${availableRecipes.map(recipe => `<option value="${escapeHtml(recipe.id)}">${escapeHtml(recipe.name ?? recipe.label ?? recipe.id)} — ${Number(recipe.craft?.turns) || 1} tour(s)</option>`).join("")}
      </select>
    </div>
    <div class="form-group"><label>Artisan responsable</label>
      <select name="dhct-craft-actor">
        ${artisans.map(actor => `<option value="${escapeHtml(actor.uuid)}">${escapeHtml(actor.name)}</option>`).join("")}
      </select>
    </div>
    <p class="hint">La fabrication sera ajoutée à la file, sans consommer de matériaux maintenant.</p>`;

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.prompt) throw new Error("DialogV2 indisponible.");
  const selection = await DialogV2.prompt({
    window: { title: "Programmer une fabrication FOB" },
    content: choices,
    ok: {
      label: "Vérifier la recette",
      callback: (_event, button, dialog) => {
        const form = button?.form ?? dialog?.element;
        return {
          recipeId: form?.querySelector('[name="dhct-craft-recipe"]')?.value ?? null,
          actorUuid: form?.querySelector('[name="dhct-craft-actor"]')?.value ?? null,
        };
      },
    },
    rejectClose: false,
  });
  if (!selection) return { green: true, cancelled: true };
  const recipe = availableRecipes.find(item => item.id === selection.recipeId);
  const actor = artisans.find(item => item.uuid === selection.actorUuid);
  if (!recipe || !actor) throw new Error("Choix de fabrication invalide.");

  // Lecture seule: la file et les matériaux restent intacts tant que le MJ ne confirme pas.
  const plan = await api.crafting.planRecipe({
    crafter: actor, recipeId: recipe.id, expeditionId,
  });
  if (!plan?.green) {
    ui.notifications?.warn(`Fabrication impossible : ${plan?.reason ?? "matériaux insuffisants"}.`);
    return { green: false, reason: plan?.reason ?? "craft-plan-unavailable" };
  }
  // Explicit allocation: defaults to the engine suggestion; no stock is mutated here.
  const suggested = new Map();
  for (const a of plan.allocations ?? []) suggested.set(a.materialId, (suggested.get(a.materialId) ?? 0) + a.quantity);
  const inventoryRows = (plan.inventory ?? []).filter(row => Number(row.quantity) > 0);
  // P2-UI: display catalog names and material properties.
  const materialDefinitions = await api.craftingMaterials.list();
  const materialById = new Map(materialDefinitions.map(m => [m.id, m]));

  const materialPropertyLabels = {
    light: "Léger",
    flexible: "Souple",
    resonant: "Résonnant",
    reinforcing: "Renforçant",
  };

  const materialInputs = inventoryRows.map((row, index) => {
    const definition = materialById.get(row.materialId);
    const displayName = definition?.name ?? row.materialId;
    const properties = Object.entries(definition?.material?.properties ?? {})
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) =>
        `${escapeHtml(materialPropertyLabels[key] ?? key)} ${Number(value)}`
      )
      .join(" · ");

    return `<label style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:.5rem 0">` +
      `<span><strong>${escapeHtml(displayName)}</strong> (stock ${Number(row.quantity)})` +
      (properties ? `<small style="display:block;opacity:.75">${properties}</small>` : "") +
      `</span>` +
      `<input type="number" name="dhct-material-${index}" min="0" max="${Number(row.quantity)}" step="1" ` +
      `value="${Number(suggested.get(row.materialId) ?? 0)}" style="width:5rem" /></label>`;
  }).join("");
  // P2-UI: live craft validation.
  const requirementLabels = (recipe.requirements ?? [])
    .map(r => `${escapeHtml(materialPropertyLabels[r.match?.property] ?? r.match?.property ?? r.id)} : ${Number(r.value) || 0}`)
    .join(" | ");

  let validationSerial = 0;
  let validationTimer = null;

  const chosen = await DialogV2.prompt({
    window: { title: "Choisir les composants" },
    content: `<p>Indique les quantités à consommer.</p>
      <div data-dhct-craft-material-list style="max-height:320px;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;padding-right:8px;">${materialInputs || "Aucun matériau requis."}</div>
      <hr>
      <p><strong>Propriétés requises :</strong> ${requirementLabels}</p>
      <div data-dhct-craft-gauges></div>
       <p data-dhct-craft-validation>Vérification des propriétés…</p>`,
    ok: {
      label: "Vérifier la sélection",
      callback: (_event, button, dialog) => {
        const form = button?.form ?? dialog?.element;
        return inventoryRows.map((row, index) => ({
          materialId: row.materialId,
          quantity: Number(form?.querySelector(`[name="dhct-material-${index}"]`)?.value ?? 0),
        }));
      },
    },
    render: (_event, dialog) => {
      const root = dialog?.element;
      if (!root?.querySelector) return;

      const confirmButton = root.querySelector('button[data-action="ok"]');
      const status = root.querySelector('[data-dhct-craft-validation]');
      const gauges = root.querySelector('[data-dhct-craft-gauges]');

      const updateGauges = (selected) => {
        if (!gauges) return;

        const activeMaterials = selected
          .filter(entry => entry.quantity > 0)
          .map(entry => materialById.get(entry.materialId))
          .filter(Boolean);

        gauges.innerHTML = (recipe.requirements ?? []).map(req => {
          const propertyId = req.match?.property;
          const target = Number(req.value) || 0;

          const achieved = activeMaterials.reduce((max, material) => {
            if (req.match?.materialId !== undefined &&
                material.id !== req.match.materialId) return max;

            if (req.match?.family !== undefined &&
                material.material?.family !== req.match.family) return max;

            if (req.match?.minimumQuality !== undefined &&
                Number(material.material?.quality) < req.match.minimumQuality)
              return max;

            return Math.max(
              max,
              Number(material.material?.properties?.[propertyId]) || 0
            );
          }, 0);

          const valid = achieved >= target;
          const percentage = target > 0
            ? Math.min(100, achieved / target * 100)
            : 100;

          const label = materialPropertyLabels[propertyId] ??
            propertyId ?? req.id;

          return `<div style="margin:.65rem 0">` +
            `<div style="display:flex;justify-content:space-between;gap:.5rem">` +
            `<strong>${escapeHtml(label)}</strong>` +
            `<span>${achieved} / ${target} ${valid ? "✓" : "✕"}</span>` +
            `</div>` +
            `<div style="height:8px;background:#7775;border-radius:4px;overflow:hidden">` +
            `<div style="height:100%;width:${percentage}%;background:${valid ? "#369568" : "#bd8742"}"></div>` +
            `</div></div>`;
        }).join("");
      };

      const validate = async () => {
        const serial = ++validationSerial;
        if (confirmButton) confirmButton.disabled = true;
        if (status) status.textContent = "Vérification des propriétés…";

        const selected = inventoryRows.map((row, index) => ({
          materialId: row.materialId,
          quantity: Number(root.querySelector(`[name="dhct-material-${index}"]`)?.value ?? 0),
        }));

        updateGauges(selected);

        if (selected.some((a, index) =>
          !Number.isSafeInteger(a.quantity) ||
          a.quantity < 0 ||
          a.quantity > Number(inventoryRows[index].quantity)
        )) {
          if (status) status.textContent = "Quantités invalides.";
          return;
        }

        try {
          const result = await api.crafting.planRecipe({
            crafter: actor,
            recipeId: recipe.id,
            expeditionId,
            componentSelection: selected.filter(a => a.quantity > 0),
          });

          if (serial !== validationSerial) return;

          if (status) status.textContent = result?.green
            ? "✓ Propriétés suffisantes"
            : `✕ Sélection insuffisante (${result?.reason ?? "invalide"})`;

          if (confirmButton) confirmButton.disabled = !result?.green;
        } catch (error) {
          if (serial !== validationSerial) return;
          if (status) status.textContent = "Erreur de validation.";
          if (confirmButton) confirmButton.disabled = true;
          console.error("P2-UI validation", error);
        }
      };

      root.querySelectorAll('input[name^="dhct-material-"]').forEach(input => {
        input.addEventListener("input", () => {
          clearTimeout(validationTimer);
          if (confirmButton) confirmButton.disabled = true;
          validationTimer = setTimeout(validate, 200);
        });
      });

      void validate();
    },
    rejectClose: false,
  });
  if (!chosen) return { green: true, cancelled: true };
  if (chosen.some(a => !Number.isSafeInteger(a.quantity) || a.quantity < 0)) {
    ui.notifications?.warn("Quantités de composants invalides.");
    return { green: false, reason: "craft-selection-invalid" };
  }
  const componentSelection = chosen.filter(a => a.quantity > 0);
  const checkedPlan = await api.crafting.planRecipe({
    crafter: actor, recipeId: recipe.id, expeditionId, componentSelection,
  });
  if (!checkedPlan?.green) {
    ui.notifications?.warn(`Sélection incompatible : ${checkedPlan?.reason ?? "propriétés insuffisantes"}.`);
    return { green: false, reason: checkedPlan?.reason ?? "craft-selection-invalid" };
  }
  const allocations = (checkedPlan.allocations ?? [])
    .map(a => `${Number(a.quantity) || 0} × ${materialById.get(a.materialId)?.name ?? a.materialId ?? "Matériau"}`)
    .join(", ") || "aucun (recette de test)";
  const confirmed = await confirmInventoryAction({
    title: "Programmer la fabrication",
    content: `Recette : ${escapeHtml(recipe.name ?? recipe.id)}. Artisan : ${escapeHtml(actor.name)}. ` +
      `Matériaux prévus : ${escapeHtml(allocations)}. ` +
      `Durée : ${Number(recipe.craft?.turns) || 1} tour(s) FOB.`,
    confirmLabel: "Fabriquer",
  });
  if (!confirmed) return { green: true, cancelled: true };

  // L'API refait les controles sur les données actuelles avant ecriture de la file.
  const result = await api.craftingCraftQueue.enqueueConsumable({
    actor, recipeId: recipe.id, expeditionId, componentSelection,
  });
  if (!result?.green) throw new Error(result?.reason ?? "Impossible d'ajouter la fabrication.");
  ui.notifications?.info(`${recipe.name ?? recipe.id} ajoutée à la file de fabrication.`);
  await refreshOpenFobActivityPanel();
  return result;
}

function renderFobActivityPanel(
  manifest,
  {
    isGm = false,
  } = {}
) {
  const api =
    getApi();

  const panel =
    document.createElement(
      "section"
    );

  panel.className =
    "dhct-fob-activity-panel";

  const heading =
    document.createElement(
      "h3"
    );

  heading.textContent =
    "Activités programmées";

  panel.append(
    heading
  );

  const expeditionId =
    String(
      manifest?.expeditionId ?? ""
    );

  let researchQueue = [];
  let craftQueue = [];

  try {
    researchQueue =
      api?.craftingResearchQueue
        ?.status?.()
        ?.queue ?? [];
  } catch (error) {
    console.warn(
      MODULE_ID +
      " | research queue status unavailable",
      error
    );
  }

  try {
    craftQueue =
      api?.craftingCraftQueue
        ?.status?.()
        ?.queue ?? [];
  } catch (error) {
    console.warn(
      MODULE_ID +
      " | craft queue status unavailable",
      error
    );
  }

  const research =
    researchQueue.filter(
      (entry) =>
        String(
          entry?.expeditionId ?? ""
        ) === expeditionId
    );

  const craft =
    craftQueue.filter(
      (entry) =>
        String(
          entry?.expeditionId ?? ""
        ) === expeditionId
    );

  const grid =
    document.createElement(
      "div"
    );

  grid.className =
    "dhct-fob-activity-panel__grid";

  grid.append(
    renderFobQueueColumn({
      title: "Recherche",
      kind: "research",
      entries: research,
      isGm,
    }),

    renderFobQueueColumn({
      title: "Fabrication",
      kind: "craft",
      entries: craft,
      isGm,
    })
  );

  panel.append(
    grid
  );

  // P2-UI: résolution asynchrone des noms des recettes.
  if (craft.some(entry => entry.recipeId)) {
    void api.crafting.listRecipes().then(recipes => {
      const recipeNames = new Map(
        (recipes ?? []).map(recipe => [
          recipe.id,
          recipe.name ?? recipe.label ?? recipe.id
        ])
      );

      for (const row of panel.querySelectorAll(
        '[data-dhct-fob-queue-kind="craft"]'
      )) {
        const entry = craft.find(item =>
          String(item.id) === String(row.dataset.dhctFobQueueEntryId)
        );

        if (!entry?.recipeId) continue;

        const title = row.querySelector(
          '[data-dhct-fob-queue-title="true"]'
        );

        if (title) {
          const index = craft.indexOf(entry) + 1;
          title.textContent =
            `${index}. ${recipeNames.get(entry.recipeId) ?? entry.recipeId}`;
        }
      }
    }).catch(error => {
      console.warn("DHCT | Résolution des noms de recettes impossible", error);
    });
  }

  // R4.8h.1: acces MJ aux consommables depuis les activites FOB.
  if (isGm) {
    const craftButton = document.createElement("button");
    craftButton.type = "button";
    craftButton.dataset.dhctFobCraftCreate = "true";
    craftButton.textContent = "Fabriquer un consommable";
    craftButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      craftButton.disabled = true;
      try {
        await openFobConsumableCraftDialog(expeditionId);
      } catch (error) {
        console.error(`${MODULE_ID} | FOB consumable craft creation failed`, error);
        ui.notifications?.error(error?.message ?? "Impossible de programmer la fabrication.");
      } finally {
        if (craftButton.isConnected) craftButton.disabled = false;
      }
    });
    panel.append(craftButton);
  }

  if (isGm) {
    panel.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest(
                "[data-dhct-research-contributor-action]"
              )
            : null;

        if (
          !(button instanceof HTMLButtonElement)
        ) {
          return;
        }

        const row =
          button.closest(
            "[data-dhct-fob-queue-entry-id]"
          );

        if (!(row instanceof HTMLElement)) {
          return;
        }

        if (
          row.dataset
            .dhctFobQueueKind !==
          "research"
        ) {
          return;
        }

        const entryId =
          row.dataset
            .dhctFobQueueEntryId;

        const action =
          button.dataset
            .dhctResearchContributorAction;

        const queueApi =
          getApi()
            ?.craftingResearchQueue;

        if (
          !entryId ||
          ![
            "add",
            "remove",
          ].includes(action) ||
          !queueApi?.status ||
          !queueApi?.addContributor ||
          !queueApi?.removeContributor
        ) {
          return;
        }

        const entry =
          queueApi.status()
            ?.queue
            ?.find(
              candidate =>
                candidate.id ===
                entryId
            );

        if (!entry) {
          return;
        }

        const actor =
          await chooseResearchContributor(
            entry,
            action
          );

        if (!actor) {
          return;
        }

        button.disabled =
          true;

        try {
          const result =
            action === "add"
              ? await queueApi
                  .addContributor(
                    entryId,
                    actor.uuid
                  )
              : await queueApi
                  .removeContributor(
                    entryId,
                    actor.uuid
                  );

          if (!result?.green) {
            throw new Error(
              result?.reason ??
                "research-contributor-update-failed"
            );
          }

          // Le hook peut avoir remplace le panneau initial.
          // Toujours rafraichir le panneau actuellement monte.
          await refreshOpenFobActivityPanel();
        } catch (error) {
          console.error(
            MODULE_ID +
              " | research contributor update failed",
            error
          );

          ui.notifications?.error(
            error?.message ??
              "Impossible de modifier les contributeurs."
          );

          if (button.isConnected) {
            button.disabled =
              false;
          }
        }
      }
    );
  }

  if (isGm) {
    panel.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest(
                "[data-dhct-fob-craft-contributor]"
              )
            : null;

        if (
          !(button instanceof HTMLButtonElement)
        ) {
          return;
        }

        const row =
          button.closest(
            "[data-dhct-fob-queue-entry-id]"
          );

        if (!(row instanceof HTMLElement)) {
          return;
        }

        if (
          row.dataset
            .dhctFobQueueKind !==
          "craft"
        ) {
          return;
        }

        const entryId =
          row.dataset
            .dhctFobQueueEntryId;

        const action =
          button.dataset
            .dhctFobCraftContributor;

        const queueApi =
          getApi()
            ?.craftingCraftQueue;

        if (
          !entryId ||
          !queueApi?.status ||
          !queueApi?.addContributor ||
          !queueApi?.removeContributor
        ) {
          return;
        }

        const entry =
          queueApi
            .status()
            ?.queue
            ?.find(
              candidate =>
                candidate.id ===
                entryId
            ) ?? null;

        if (!entry) {
          return;
        }

        const actor =
          await chooseCraftContributor(
            entry,
            action
          );

        if (!actor) {
          return;
        }

        button.disabled = true;

        try {
          const result =
            action === "add"
              ? await queueApi
                  .addContributor(
                    entryId,
                    actor.uuid
                  )
              : await queueApi
                  .removeContributor(
                    entryId,
                    actor.uuid
                  );

          if (!result?.green) {
            throw new Error(
              result?.reason ??
              "craft-contributor-update-failed"
            );
          }


          // Le hook peut avoir remplace le panneau initial.
          // Toujours rafraichir le panneau actuellement monte.
          await refreshOpenFobActivityPanel();
        } catch (error) {
          console.error(
            MODULE_ID +
            " | craft contributor update failed",
            error
          );

          ui.notifications?.error(
            error?.message ??
            "Impossible de modifier les contributeurs."
          );
        } finally {
          if (button.isConnected) {
            button.disabled = false;
          }
        }
      }
    );


    panel.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest(
                "[data-dhct-fob-queue-move]"
              )
            : null;

        if (
          !(button instanceof HTMLButtonElement)
        ) {
          return;
        }

        const row =
          button.closest(
            "[data-dhct-fob-queue-entry-id]"
          );

        if (!(row instanceof HTMLElement)) {
          return;
        }

        const kind =
          row.dataset
            .dhctFobQueueKind;

        if (kind !== "craft") {
          return;
        }

        const entryId =
          row.dataset
            .dhctFobQueueEntryId;

        const direction =
          button.dataset
            .dhctFobQueueMove;

        const queueApi =
          kind === "research"
            ? getApi()
                ?.craftingResearchQueue
            : getApi()
                ?.craftingCraftQueue;

        if (
          !entryId ||
          !queueApi?.status ||
          !queueApi?.move
        ) {
          return;
        }

        const fullQueue =
          queueApi.status()
            ?.queue ?? [];

        const expeditionEntries =
          fullQueue.filter(
            (entry) =>
              String(
                entry?.expeditionId ?? ""
              ) === expeditionId
          );

        const localIndex =
          expeditionEntries.findIndex(
            (entry) =>
              entry.id === entryId
          );

        if (localIndex < 0) {
          return;
        }

        const targetLocalIndex =
          direction === "up"
            ? localIndex - 1
            : localIndex + 1;

        if (
          targetLocalIndex < 0 ||
          targetLocalIndex >=
            expeditionEntries.length
        ) {
          return;
        }

        const targetEntry =
          expeditionEntries[
            targetLocalIndex
          ];

        const targetGlobalIndex =
          fullQueue.findIndex(
            (entry) =>
              entry.id ===
              targetEntry.id
          );

        if (targetGlobalIndex < 0) {
          return;
        }

        button.disabled = true;

        try {
          const result =
            await queueApi.move(
              entryId,
              targetGlobalIndex
            );

          if (!result?.green) {
            throw new Error(
              result?.reason ??
              "queue-move-failed"
            );
          }

          // Le hook peut avoir remplace le panneau initial.
          // Toujours rafraichir le panneau actuellement monte.
          await refreshOpenFobActivityPanel();
        } catch (error) {
          console.error(
            MODULE_ID +
            " | FOB queue move failed",
            error
          );

          ui.notifications?.error(
            error?.message ??
            "Impossible de réordonner la file."
          );

          if (button.isConnected) {
            button.disabled = false;
          }
        }
      }
    );
  }

  return panel;
}

function renderFobWorkshopCards(
  manifest
) {
  const section =
    document.createElement(
      "section"
    );

  section.className =
    "dhct-fob-workshops";

  const heading =
    document.createElement(
      "h3"
    );

  heading.textContent =
    "Ateliers";

  section.append(
    heading
  );

  const components =
    new Map(
      (
        manifest?.fob
          ?.components ?? []
      )
        .filter(
          (component) =>
            component?.id
        )
        .map(
          (component) => [
            component.id,
            component,
          ]
        )
    );

  const installed =
    (
      manifest?.fob
        ?.slots ?? []
    )
      .filter(
        (slot) =>
          slot?.enabled !== false &&
          slot?.componentId
      )
      .map(
        (slot) => ({
          slot,
          component:
            components.get(
              slot.componentId
            ) ?? null,
        })
      )
      .filter(
        ({ component }) =>
          component?.type ===
          "workshop"
      );

  if (!installed.length) {
    const empty =
      document.createElement(
        "p"
      );

    empty.textContent =
      "Aucun atelier install\u00e9.";

    section.append(
      empty
    );

    return section;
  }

  const grid =
    document.createElement(
      "div"
    );

  grid.className =
    "dhct-fob-workshops__grid";

  grid.style.display =
    "grid";

  grid.style.gridTemplateColumns =
    "repeat(2, minmax(0, 1fr))";

  grid.style.gap =
    ".75rem";

  grid.style.alignItems =
    "stretch";

  for (
    const {
      slot,
      component,
    }
    of installed
  ) {
    const card =
      document.createElement(
        "button"
      );

    card.type =
      "button";

    card.className =
      "dhct-fob-workshop-card";

    card.dataset
      .dhctFobWorkshopCard =
        component.id;

    card.dataset
      .dhctFobSlotId =
        slot.id ?? "";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      component.name ??
      component.id;

    card.append(
      title
    );

    const capabilities =
      Array.isArray(
        component.capabilities
      )
        ? component.capabilities
        : [];

    if (
      capabilities.includes(
        "research"
      )
    ) {
      const detail =
        document.createElement(
          "span"
        );

      detail.textContent =
        "Recherche et connaissances";

      card.append(
        detail
      );

      card.addEventListener(
        "click",
        async () => {
          const api =
            getApi();

          const station =
            api?.craftingResearchStation;

          if (!station?.open) {
            ui.notifications?.warn(
              "Campaign Toolkit : centre d'\u00e9tude indisponible."
            );

            return;
          }

          const result =
            await station.open({
              expeditionId:
                manifest.expeditionId,
            });

          if (
            result?.green === false
          ) {
            ui.notifications?.warn(
              "Campaign Toolkit : centre d'\u00e9tude - " +
              result.reason
            );
          }
        }
      );
    } else {
      card.disabled =
        true;
    }

    grid.append(
      card
    );
  }

  section.append(
    grid
  );

  return section;
}

async function chooseHuntWorkshopCrafter(
  workshop,
  api
) {
  /*
   * Players keep the simple ownership-based resolution.
   */
  if (!game.user?.isGM) {
    return (
      workshop?.crafterForUser?.(
        game.user
      ) ?? null
    );
  }

  /*
   * A GM owns everything, so crafterForUser() would
   * otherwise always select the first Artisan found.
   *
   * Build the actual Artisan candidates explicitly
   * and let the GM choose.
   */
  const candidates =
    [...(game.actors ?? [])]
      .filter(
        actor =>
          actor?.type ===
            "character"
      )
      .filter(
        actor => {
          try {
            return (
              workshop
                ?.list?.({
                  crafter:
                    actor,
                  api,
                })
                ?.green ===
              true
            );
          } catch (_error) {
            return false;
          }
        }
      )
      .sort(
        (a, b) =>
          String(a.name ?? "")
            .localeCompare(
              String(b.name ?? ""),
              game.i18n?.lang ??
                "fr"
            )
      );

  if (!candidates.length) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (DialogV2?.prompt) {
    const options =
      candidates
        .map(
          actor =>
            '<option value="' +
            escapeHtml(actor.uuid) +
            '">' +
            escapeHtml(actor.name) +
            "</option>"
        )
        .join("");

    const selectedUuid =
      await DialogV2.prompt({
        window: {
          title:
            "Choisir l’Artisan",
        },

        content:
          `
            <div class="form-group">
              <label>
                Artisan
              </label>

              <div class="form-fields">
                <select
                  name="dhct-hunt-artisan"
                  autofocus
                >
                  ${options}
                </select>
              </div>

              <p class="hint">
                Cet Artisan portera la fabrication
                et les modifications de l’atelier.
              </p>
            </div>
          `,

        ok: {
          label:
            "Ouvrir l’atelier",

          callback:
            (
              _event,
              _button,
              dialog
            ) =>
              dialog?.element
                ?.querySelector?.(
                  '[name="dhct-hunt-artisan"]'
                )
                ?.value ??
              null,
        },

        rejectClose:
          false,
      });

    if (!selectedUuid) {
      return null;
    }

    return (
      candidates.find(
        actor =>
          actor.uuid ===
          selectedUuid
      ) ?? null
    );
  }

  /*
   * Very old/fallback UI path.
   */
  const labels =
    candidates
      .map(
        (actor, index) =>
          String(index + 1) +
          ". " +
          actor.name
      )
      .join("\n");

  const raw =
    window.prompt(
      "Choisir l’Artisan :\n" +
        labels,
      "1"
    );

  if (raw == null) {
    return null;
  }

  const index =
    Math.trunc(
      Number(raw)
    ) - 1;

  return (
    candidates[index] ??
    null
  );
}


function installHuntWorkshopFobCard(fobView) {
  if (!(fobView instanceof HTMLElement)) {
    return {
      green: false,
      reason:
        "fob-view-not-found",
    };
  }

  const api =
    getApi();

  const workshop =
    api?.weaponAugmentWorkshop;

  if (
    !workshop?.open ||
    !workshop?.list
  ) {
    return {
      green: false,
      reason:
        "hunt-workshop-unavailable",
    };
  }

  /*
   * Players still need an immediately resolvable
   * Artisan for the shortcut to be exposed.
   *
   * GM selection happens on click instead.
   */
  if (
    !game.user?.isGM &&
    !workshop?.crafterForUser?.(
      game.user
    )
  ) {
    return {
      green: false,
      reason:
        "viewer-missing-hunt-artisan-card",
    };
  }

  const grid =
    fobView.querySelector(
      ".dhct-fob-workshops__grid"
    );

  if (!(grid instanceof HTMLElement)) {
    return {
      green: false,
      reason:
        "fob-workshop-grid-not-found",
    };
  }

  if (
    grid.querySelector(
      "[data-dhct-fob-workshop-card='hunt-weapon-workshop']"
    )
  ) {
    return {
      green: true,
      reused: true,
    };
  }

  const card =
    document.createElement(
      "button"
    );

  card.type =
    "button";

  card.className =
    "dhct-fob-workshop-card";

  card.dataset
    .dhctFobWorkshopCard =
      "hunt-weapon-workshop";

  card.dataset
    .dhctFobSlotId =
      "hunt-weapon-workshop-shortcut";

  const title =
    document.createElement(
      "strong"
    );

  title.textContent =
    "Atelier d’armes de chasse";

  const detail =
    document.createElement(
      "span"
    );

  detail.textContent =
    game.user?.isGM
      ? "Choisir un Artisan · fabrication et modifications"
      : "Fabrication et modifications";

  card.append(
    title,
    detail
  );

  card.addEventListener(
    "click",
    async () => {
      const api =
        getApi();

      const workshop =
        api?.weaponAugmentWorkshop;

      if (
        !workshop?.open ||
        !workshop?.list
      ) {
        ui.notifications?.warn(
          "Campaign Toolkit : atelier d'armes de chasse indisponible."
        );

        return;
      }

      const crafter =
        await chooseHuntWorkshopCrafter(
          workshop,
          api
        );

      if (!crafter) {
        if (game.user?.isGM) {
          ui.notifications?.warn(
            "Campaign Toolkit : aucun Artisan sélectionné."
          );
        }

        return;
      }

      const result =
        await workshop.open(
          crafter,
          {
            allowCraft: true,
            source: "fob",
          }
        );

      if (
        result?.green ===
        false
      ) {
        ui.notifications?.warn(
          "Campaign Toolkit : atelier d'armes de chasse — " +
          result.reason +
          "."
        );
      }
    }
  );

  grid.append(
    card
  );

  return {
    green: true,
    reused: false,
  };
}


async function configureExpeditionShell(
  dialog,
  manifest,
  lifecyclePanel,
  {
    isGm = false,
  } = {}
) {
  const expeditionWindow =
    findExpeditionWindow(dialog);

  if (
    !(expeditionWindow instanceof HTMLElement)
  ) {
    return {
      green: false,
      reason: "expedition-window-not-found",
    };
  }

  const existingShell =
    expeditionWindow.querySelector(
      ".dhct-expedition-shell"
    );

  if (existingShell instanceof HTMLElement) {
    return {
      green: true,
      mode: isGm ? "gm" : "player",
      reused: true,
      activeTab:
        existingShell.dataset.dhctActiveTab ??
        null,
    };
  }

  // Remove the obsolete Inventaire | MJ wrapper if a previous
  // refresh created it before the new shell was mounted.
  const legacyTabs =
    expeditionWindow.querySelector(
      `.${ROLE_TABS_CLASS}`
    );

  const legacyInventoryPane =
    legacyTabs?.querySelector(
      `[data-dhct-pane="${INVENTORY_TAB_ID}"]`
    );

  const browser =
    (
      legacyInventoryPane instanceof HTMLElement
        ? legacyInventoryPane.querySelector(
            ".dct-expedition-browser"
          )
        : null
    ) ??
    expeditionWindow.querySelector(
      ".dct-expedition-browser"
    );

  const retainLegacyBrowser =
    false;

  if (
    !retainLegacyBrowser &&
    browser instanceof HTMLElement
  ) {
    browser.remove();
  }

  const hasLegacyBrowser =
    retainLegacyBrowser &&
    browser instanceof HTMLElement;


  // Moving the original browser preserves the listeners installed
  // by expedition-window.mjs.
  if (
    hasLegacyBrowser &&
    legacyTabs instanceof HTMLElement &&
    legacyTabs.contains(browser)
  ) {
    legacyTabs.insertAdjacentElement(
      "beforebegin",
      browser
    );
  }

  legacyTabs?.remove();

  // Players must never retain GM diagnostics/admin nodes.
  dialog
    .querySelectorAll(
      `.${PANEL_CLASS}`
    )
    .forEach((node) => {
      if (!isGm) node.remove();
    });

  const closeHost =
    findCloseHost(expeditionWindow);

  const technicalNodes =
    findTechnicalNodes(
      expeditionWindow,
      browser,
      closeHost
    );

  const shell =
    createExpeditionShell({
      activeTab: "expedition",
      canManage: isGm,
    });

  const fobTab =
    shell.querySelector(
      '[data-dhct-expedition-tab="fob"]'
    );

  if (fobTab instanceof HTMLElement) {
    fobTab.textContent =
      "Base Avancée Temporaire";
  }

  const fobVisible =
    isGm ||
    userCanViewZone(
      game.user,
      manifest,
      "fob"
    );

  const caravanVisible =
    isGm ||
    userCanViewZone(
      game.user,
      manifest,
      "caravan"
    );

  setExpeditionShellTabVisibility(
    shell,
    "fob",
    fobVisible
  );

  setExpeditionShellTabVisibility(
    shell,
    "caravan",
    caravanVisible
  );

  shell.dataset.dhctFobVisible =
    fobVisible
      ? "1"
      : "0";

  shell.dataset.dhctCaravanVisible =
    caravanVisible
      ? "1"
      : "0";

  if (hasLegacyBrowser) {
    browser.insertAdjacentElement(
      "beforebegin",
      shell
    );
  } else if (
    closeHost instanceof HTMLElement &&
    closeHost.parentElement === expeditionWindow
  ) {
    closeHost.insertAdjacentElement(
      "beforebegin",
      shell
    );
  } else {
    expeditionWindow.append(shell);
  }

  const inventoryPane =
    expeditionShellPane(
      shell,
      "inventory"
    );

  const expeditionPane =
    expeditionShellPane(
      shell,
      "expedition"
    );

  const fobPane =
    expeditionShellPane(
      shell,
      "fob"
    );

  const caravanPane =
    expeditionShellPane(
      shell,
      "caravan"
    );



  if (
    !(inventoryPane instanceof HTMLElement) ||
    !(expeditionPane instanceof HTMLElement) ||
    !(fobPane instanceof HTMLElement) ||
    !(caravanPane instanceof HTMLElement)
  ) {
    shell.remove();

    return {
      green: false,
      reason: "shell-pane-not-found",
    };
  }

  // Transitional mount: retain the legacy browser
  // and its listeners until the new inventory actions
  // are connected.
  if (hasLegacyBrowser) {
    browser.hidden = true;
  }

  const inventoryView =
    buildExpeditionInventoryView(
      manifest
    );

  installInventoryViewHandlers(
    inventoryView,
    manifest
  );

  inventoryPane.append(
    inventoryView
  );

  if (hasLegacyBrowser) {
    inventoryPane.append(
      browser
    );
  }

  const fobView =
    buildExpeditionContainerView(
      manifest,
      "fob"
    );

  const fobViewTitle =
    fobView?.querySelector?.(
      ".dhct-inventory-view__pane-title, h2, h3"
    );

  if (fobViewTitle instanceof HTMLElement) {
    fobViewTitle.textContent =
      "Inventaire de la Base Avancée";
  }

  const caravanProjection =
    projectExpeditionCaravan({
      manifest,
    });

  const caravanView =
    renderExpeditionCaravanView(
      caravanProjection,
      {
        isGm,
      }
    );

  installInventoryViewHandlers(
    fobView,
    manifest
  );

  installGmFobCapacityEditor(
    fobView, manifest, getApi()
  );

  installInventoryViewHandlers(
    caravanView,
    manifest
  );

  installCaravanEquipmentViewHandlers(
    caravanView,
    manifest,
    getApi()
  );

  const fobWorkshopCards =
    renderFobWorkshopCards(
      manifest
    );

  installHuntWorkshopFobCard(
    fobWorkshopCards
  );

  const fobActivityPanel =
    renderFobActivityPanel(
      manifest,
      {
        isGm,
      }
    );

  fobPane.append(
    fobWorkshopCards,
    fobActivityPanel,
    fobView
  );

  void hydrateFobActivityPanelLabels(
    fobActivityPanel
  );

  caravanPane.append(
    caravanView
  );

  const expeditionView =
    await buildExpeditionDashboardView(
      getApi(),
      manifest
    );

  expeditionPane.append(
    expeditionView
  );

  // P3.2f — Gestion explicite des participants.
  if (isGm) {
    const participantsButton = document.createElement("button");
    participantsButton.type = "button";
    participantsButton.className = "dhct-participants-button";
    participantsButton.textContent = "Gérer les participants";

    expeditionPane.prepend(participantsButton);

    participantsButton.addEventListener("click", async () => {
      const expeditionApi = getApi()?.expeditionManifest;
      const assign = getApi()?.expeditionWorld?.assign;
      const removeParticipant = getApi()?.expeditionWorld?.removeParticipant;

      if (!expeditionApi?.list || !expeditionApi?.load || !assign || !removeParticipant) {
        ui.notifications.error("Gestion des participants indisponible.");
        return;
      }

      const summaries = await expeditionApi.list();
      const manifests = await Promise.all(
        summaries.map(row => expeditionApi.load(row.expeditionId))
      );

      const current = manifests.find(
        row => row?.expeditionId === manifest.expeditionId
      );

      if (!current) {
        ui.notifications.error("Manifeste introuvable.");
        return;
      }

      const allowedTypes = ["character", "npc", "companion"];

      const actors = game.actors.contents
        .filter(actor => allowedTypes.includes(actor.type))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

      const escapeHtml = value =>
        foundry.utils.escapeHTML(String(value ?? ""));

      const actorRows = actors.map(actor => {
        const assignedHere = (current.characters ?? []).some(c =>
          c.foundryActorUuid === actor.uuid
        );

        const assignedElsewhere = manifests.some(other =>
          other?.expeditionId !== current.expeditionId &&
          (other?.characters ?? []).some(c =>
            c.foundryActorUuid === actor.uuid
          )
        );

        const disabled = assignedElsewhere;

        const status = assignedHere
          ? "Dans cette expédition"
          : assignedElsewhere
            ? "Autre expédition"
            : "Disponible";

        return `
          <label class="dhct-participant-row"
                 data-actor-type="${escapeHtml(actor.type)}"
                 style="display:flex;gap:10px;align-items:center;padding:6px">
            <input type="checkbox"
                   name="participant"
                   value="${escapeHtml(actor.uuid)}"
                   data-assigned-here="${assignedHere}"
                   ${assignedHere ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <span style="flex:1">${escapeHtml(actor.name)}</span>
            <small>${escapeHtml(status)}</small>
          </label>
        `;
      }).join("");

      const content = `
        <section class="dhct-participants-manager">
          <p>Cochez pour ajouter un acteur. Décochez un participant pour le retirer après confirmation. Un sac non vide bloque le retrait.</p>

          <nav style="display:flex;gap:6px;margin-bottom:10px">
            <button type="button" data-filter="all">Tous</button>
            <button type="button" data-filter="character">PJ</button>
            <button type="button" data-filter="npc">PNJ</button>
            <button type="button" data-filter="companion">Compagnons</button>
          </nav>

          <div data-participant-list
               style="max-height:350px;overflow-y:auto">
            ${actorRows}
          </div>
        </section>
      `;

      let participantsChanged = false;

      const selected = await foundry.applications.api.DialogV2.wait({
        window: {
          title: "Participants — " + current.expeditionId
        },
        content,
        buttons: [
          {
            action: "cancel",
            label: "Annuler",
            callback: () => null
          },
          {
            action: "save",
            label: "Ajouter les participants",
            default: true,
            callback: (_event, button, dialog) => {
              const root = dialog.element;

              return [...root.querySelectorAll('input[name="participant"]:checked:not([data-assigned-here="true"])')]
                .map(input => input.value);
            }
          }
        ],
        render: (_event, dialog) => {
          const root = dialog.element;

          root.querySelectorAll('input[name="participant"][data-assigned-here="true"]').forEach(input => {
            input.addEventListener("change", async () => {
              if (input.checked) return;
              input.checked = true; // conserver l'état jusqu'à la confirmation et la sauvegarde
              const actorName = input.closest("label")?.querySelector("span")?.textContent ?? input.value;
              const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Retirer un participant" },
                content: `<p>Retirer <strong>${escapeHtml(actorName)}</strong> de l'expédition <strong>${escapeHtml(current.expeditionId)}</strong> ?</p><p>Le personnage et son sac vide seront désaffectés. Le contenu d'un sac non vide empêche le retrait.</p>`,
                rejectClose: false
              });
              if (!confirmed) return;
              input.disabled = true;
              const result = await removeParticipant({ expeditionId: current.expeditionId, actorUuid: input.value });
              if (!result.green) {
                input.disabled = false;
                ui.notifications.error(result.reason === "backpack-not-empty"
                  ? "Retrait refusé : vider le sac à dos avant de retirer ce participant."
                  : `Retrait refusé : ${result.reason}`);
                console.warn("DHCT | participants remove", result);
                return;
              }
              participantsChanged = true;
              // Reclasser la ligne comme disponible au lieu de laisser un état périmé.
              input.dataset.assignedHere = "false";
              input.checked = false;
              input.disabled = false;
              const status = input.closest("label")?.querySelector("small");
              if (status) status.textContent = "Disponible";
              ui.notifications.info(`${actorName} retiré de l'expédition (révision ${result.revision}).`);
              console.log("DHCT | participants remove GREEN", result);
            });
          });
          root.querySelectorAll("[data-filter]").forEach(button => {
            button.addEventListener("click", () => {
              const filter = button.dataset.filter;

              root.querySelectorAll(
                "[data-actor-type]"
              ).forEach(row => {
                row.hidden =
                  filter !== "all" &&
                  row.dataset.actorType !== filter;

                row.style.display = row.hidden ? "none" : "flex";
              });
            });
          });
        }
      });

      if (selected?.length) {
        const result = await assign({
          expeditionId: current.expeditionId,
          actorUuids: selected
        });

        if (!result.green) {
          ui.notifications.error("Affectation refusée : " + result.reason);
          console.warn("DHCT | participants assign", result);
        } else {
          participantsChanged = true;
          ui.notifications.info(
            `${result.actors} participant(s) traité(s), ` +
            `${result.backpacksCreated} sac(s) créé(s).`
          );
          console.log("DHCT | participants assign GREEN", result);
        }
      }

      // Le shell d'expédition réutilise sinon son ancien manifeste.
      // Reconstruire la fenêtre principale après fermeture du dialogue modal.
      if (participantsChanged) {
        try {
          await reopenExpeditionDialog(getApi(), current);
        } catch (error) {
          console.error("DHCT | participants refresh failed", error);
          ui.notifications.error("Participants enregistrés, mais rafraîchissement impossible : rouvrir l'expédition.");
        }
      }
    });
  }



  let gmPanel = null;

  if (isGm) {
    gmPanel =
      document.createElement("aside");

    gmPanel.className =
      "dhct-expedition-shell__gm-panel";

    gmPanel.hidden = true;

    if (
      lifecyclePanel instanceof HTMLElement
    ) {
      gmPanel.append(lifecyclePanel);
    }

    for (const node of technicalNodes) {
      gmPanel.append(node);
    }

    shell.append(gmPanel);

    const gmSplitter =
      document.createElement("div");

    gmSplitter.className =
      "dhct-expedition-shell__gm-splitter";

    gmSplitter.setAttribute(
      "role",
      "separator"
    );

    gmSplitter.setAttribute(
      "aria-orientation",
      "vertical"
    );

    gmSplitter.title =
      "Redimensionner le panneau MJ";

    let splitterDrag = null;

    const stopSplitterDrag = () => {
      if (!splitterDrag) return;

      splitterDrag = null;

      shell.classList.remove(
        "dhct-expedition-shell--resizing"
      );

      window.removeEventListener(
        "mousemove",
        moveSplitter
      );

      window.removeEventListener(
        "mouseup",
        stopSplitterDrag
      );

      window.removeEventListener(
        "blur",
        stopSplitterDrag
      );
    };

    const moveSplitter = (event) => {
      if (!splitterDrag) return;

      event.preventDefault();

      const delta =
        splitterDrag.startX -
        event.clientX;

      const minWidth = 300;

      const maxWidth =
        Math.max(
          minWidth,
          splitterDrag.shellWidth * 0.70
        );

      const width =
        Math.min(
          maxWidth,
          Math.max(
            minWidth,
            splitterDrag.startWidth +
              delta
          )
        );

      shell.style.setProperty(
        "--dhct-gm-panel-width",
        `${Math.round(width)}px`
      );
    };

    gmSplitter.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        const shellRect =
          shell.getBoundingClientRect();

        const panelRect =
          gmPanel.getBoundingClientRect();

        splitterDrag = {
          startX: event.clientX,
          startWidth: panelRect.width,
          shellWidth: shellRect.width,
        };

        shell.classList.add(
          "dhct-expedition-shell--resizing"
        );

        window.addEventListener(
          "mousemove",
          moveSplitter
        );

        window.addEventListener(
          "mouseup",
          stopSplitterDrag
        );

        window.addEventListener(
          "blur",
          stopSplitterDrag
        );
      }
    );

    shell.append(gmSplitter);

    const gmButton =
      shell.querySelector(
        "[data-dhct-expedition-gm]"
      );

    if (gmButton instanceof HTMLButtonElement) {
      gmButton.addEventListener(
        "click",
        () => {
          gmPanel.hidden =
            !gmPanel.hidden;

          gmButton.classList.toggle(
            "active",
            !gmPanel.hidden
          );

          gmButton.setAttribute(
            "aria-expanded",
            gmPanel.hidden
              ? "false"
              : "true"
          );
        }
      );

      gmButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  } else {
    for (const node of technicalNodes) {
      node.remove();
    }

    filterPlayerContainers(
      dialog,
      manifest
    );
  }

  return {
    green: true,
    mode: isGm ? "gm" : "player",
    reused: false,
    activeTab: "expedition",
    technicalNodes:
      technicalNodes.length,
    gmPanel:
      Boolean(gmPanel),
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

  const manifest = await loadCurrentManifest(api, expeditionIdOfDialog(dialog));
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

  const roleView =
    await configureExpeditionShell(
      dialog,
      manifest,
      lifecyclePanel,
      { isGm }
    );

  const backpackAdministration = isGm
    ? injectGmBackpackManagement(dialog, manifest, api)
    : { green: false, reason: "not-gm" };

  const accessMatrixAdministration = isGm
    ? injectGmAccessMatrix(
        dialog,
        manifest,
        api
      )
    : { green: false, reason: "not-gm" };

  const groundCleanupAdministration =
    isGm
      ? injectGmGroundCleanup(
          dialog,
          manifest,
          api
        )
      : {
          green: false,
          reason: "not-gm",
        };

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
    accessMatrixAdministration,
    backpackAdministration,
    groundCleanupAdministration,
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

    .dhct-expedition-shell {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: grid;
      --dhct-gm-panel-width: clamp(340px, 31vw, 420px);
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      column-gap: .75rem;
      row-gap: .65rem;
      overflow: hidden;
    }

    .dhct-expedition-shell__header {
      grid-column: 1 / -1;
      grid-row: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: .5rem;
      padding-bottom: .45rem;
      border-bottom: 1px solid var(--color-border-light-2, rgba(255,255,255,.16));
    }

    .dhct-expedition-shell__nav {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: .35rem;
      min-width: 0;
    }

    .dhct-expedition-shell__tab,
    .dhct-expedition-shell__gm {
      flex: 0 0 auto;
      padding: .4rem .75rem;
    }

    .dhct-expedition-shell__tab.active {
      font-weight: 700;
      box-shadow: inset 0 -2px 0 currentColor;
    }

    .dhct-expedition-shell__gm {
      margin-left: auto;
    }

    .dhct-expedition-shell__gm.active {
      font-weight: 700;
      box-shadow: inset 0 -2px 0 currentColor;
    }

    .dhct-expedition-shell:has(
      .dhct-expedition-shell__gm-panel:not([hidden])
    ) {
      grid-template-columns:
        minmax(0, 1fr)
        8px
        minmax(
          300px,
          var(--dhct-gm-panel-width)
        );
      column-gap: 0;
    }

    .dhct-expedition-shell__panes {
      grid-column: 1;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .dhct-expedition-shell__pane {
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      padding-bottom: 1rem;
    }

    .dhct-expedition-shell__pane[hidden] {
      display: none !important;
    }

    .dhct-fob-activity-panel {
      display: grid;
      gap: .55rem;
      margin: .9rem 0;
      padding: .7rem;
      border:
        1px solid
        rgba(201, 177, 137, .32);
      border-radius: 8px;
      background:
        rgba(18, 17, 22, .38);
    }

    .dhct-fob-activity-panel > h3,
    .dhct-fob-queue > h4 {
      margin: 0;
    }

    .dhct-fob-activity-panel__grid {
      display: grid;
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
      gap: .75rem;
    }

    .dhct-fob-queue {
      display: grid;
      align-content: start;
      gap: .4rem;
      min-width: 0;
    }

    .dhct-fob-queue__row {
      display: grid;
      grid-template-columns:
        minmax(0, 1fr) auto;
      gap: .5rem;
      align-items: center;
      padding: .5rem;
      border:
        1px solid
        rgba(201, 177, 137, .18);
      border-radius: 6px;
    }

    .dhct-fob-queue__copy {
      display: grid;
      gap: .15rem;
      min-width: 0;
    }

    .dhct-fob-queue__copy strong {
      overflow-wrap: anywhere;
    }

    .dhct-fob-queue__copy small,
    .dhct-fob-queue__progress,
    .dhct-fob-queue__empty {
      opacity: .72;
    }

    .dhct-fob-queue__next {
      font-size: .78rem;
      font-weight: 700;
    }

    .dhct-fob-queue__controls {
      display: grid;
      grid-template-columns:
        repeat(2, auto);
      gap: .25rem;
    }

    .dhct-fob-queue__controls button {
      min-width: 32px;
    }

    @media (max-width: 760px) {
      .dhct-fob-activity-panel__grid {
        grid-template-columns: 1fr;
      }
    }

    /* P2.12l.4 inventory vertical scroll */
    .dhct-expedition-shell__pane[data-dhct-expedition-pane="inventory"] {
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-gutter: stable;
    }

    .dhct-expedition-shell__gm-panel {
      grid-column: 3;
      grid-row: 2;
      width: auto;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      display: grid;
      align-content: start;
      gap: .65rem;
      padding: 0 0 1rem .75rem;
      border-left: 1px solid var(--color-border-light-2, rgba(255,255,255,.16));
    }

    .dhct-expedition-shell__gm-panel[hidden] {
      display: none !important;
    }

    .dhct-expedition-shell__gm-splitter {
      grid-column: 2;
      grid-row: 2;
      position: relative;
      min-width: 8px;
      width: 8px;
      cursor: col-resize;
      user-select: none;
    }

    .dhct-expedition-shell__gm-splitter::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 3px;
      width: 2px;
      border-radius: 2px;
      background:
        var(
          --color-border-light-2,
          rgba(255, 255, 255, .20)
        );
      opacity: .65;
    }

    .dhct-expedition-shell__gm-splitter:hover::before,
    .dhct-expedition-shell--resizing
      .dhct-expedition-shell__gm-splitter::before {
      width: 3px;
      left: 2px;
      opacity: 1;
    }

    .dhct-expedition-shell:has(
      .dhct-expedition-shell__gm-panel[hidden]
    )
      .dhct-expedition-shell__gm-splitter {
      display: none;
    }

    .dhct-expedition-shell--resizing {
      cursor: col-resize;
      user-select: none;
    }

    .dhct-access-matrix-panel {
      display: grid;
      gap: .65rem;
      padding: .75rem;
      border:
        1px solid
        rgba(201, 177, 137, .32);
      border-radius: 8px;
      background:
        rgba(18, 17, 22, .42);
    }

    .dhct-access-matrix-panel > header h3 {
      margin: 0;
    }

    .dhct-access-matrix-panel > header p {
      margin:
        .25rem 0 0;
      opacity: .78;
    }

    .dhct-access-matrix-panel__scroll {
      overflow-x: auto;
    }

    .dhct-access-matrix {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
    }

    .dhct-access-matrix th,
    .dhct-access-matrix td {
      padding:
        .35rem .45rem;
      border-bottom:
        1px solid
        rgba(201, 177, 137, .16);
      white-space: nowrap;
    }

    .dhct-access-matrix tbody th {
      text-align: left;
    }

    .dhct-access-matrix input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
    }

    .dhct-access-matrix-panel footer {
      display: flex;
      justify-content: flex-end;
    }

    /* Expedition inventory view */

    .dhct-inventory-view {
      display: grid;
      grid-template-rows:
        minmax(0, 1fr)
        auto;
      gap: .75rem;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
    }

    .dhct-inventory-view__columns {
      display: grid;
      grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);
      gap: .75rem;
      min-height: 0;
    }

    .dhct-inventory-view__pane,
    .dhct-inventory-view__detail {
      box-sizing: border-box;
      border:
        1px solid rgba(201, 177, 137, .32);
      border-radius: 8px;
      background: rgba(18, 17, 22, .38);
    }

    .dhct-inventory-view__pane {
      display: flex;
      flex-direction: column;
      gap: .55rem;
      min-width: 0;
      min-height: 0;
      padding: .75rem;
    }

    .dhct-inventory-view__pane-header,
    .dhct-inventory-view__shared-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
    }

    .dhct-inventory-view__pane-title,
    .dhct-inventory-view__detail-title {
      margin: 0;
    }

    .dhct-inventory-view__container-name {
      font-weight: 600;
    }

    .dhct-inventory-view__capacity {
      opacity: .72;
      white-space: nowrap;
    }

    .dhct-inventory-view__shared-tabs {
      display: flex;
      gap: .35rem;
    }

    .dhct-inventory-view__shared-tab {
      flex: 1 1 0;
      min-width: 0;
    }

    .dhct-inventory-view__shared-tab.active {
      outline:
        1px solid rgba(220, 190, 135, .85);
    }

    .dhct-inventory-view__entries {
      display: grid;
      grid-template-columns:
        repeat(
          auto-fill,
          minmax(145px, 1fr)
        );
      gap: .4rem;
      align-content: start;
      min-height: 0;
      overflow: auto;
    }

    .dhct-inventory-view__entry {
      display: flex;
      align-items: center;
      gap: .45rem;
      min-width: 0;
      min-height: 42px;
      text-align: left;
    }

    .dhct-inventory-view__entry.active {
      outline:
        1px solid rgba(220, 190, 135, .9);
    }

    .dhct-inventory-view__entry-icon {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      flex: 0 0 32px;
    }

    .dhct-inventory-view__entry-icon img {
      width: 32px;
      height: 32px;
      object-fit: cover;
      border-radius: 4px;
    }

    .dhct-inventory-view__entry-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dhct-inventory-view__detail {
      min-height: 110px;
      padding: .75rem;
    }

    .dhct-inventory-view__detail-header {
      display: flex;
      align-items: center;
      gap: .65rem;
    }

    .dhct-inventory-view__detail-image {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      object-fit: cover;
      border-radius: 5px;
    }

    .dhct-inventory-view__detail-identity {
      display: grid;
      gap: .15rem;
    }

    .dhct-inventory-view__detail-meta {
      display: flex;
      gap: .75rem;
      margin-top: .45rem;
      opacity: .72;
    }

    .dhct-inventory-view__actions {
      display: flex;
      justify-content: flex-end;
      gap: .4rem;
      margin-top: .6rem;
    }

    .dhct-inventory-view__actions-placeholder,
    .dhct-inventory-view__empty {
      opacity: .62;
    }

    .dhct-inventory-view__empty {
      padding: .7rem;
    }

    @media (max-width: 820px) {
      .dhct-inventory-view__columns {
        grid-template-columns: 1fr;
      }
    }

    /* Expedition dashboard */

    .dhct-expedition-view {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
      padding: .2rem .15rem 1rem;
    }

    .dhct-expedition-view__header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 1rem;
      padding: .15rem .15rem .8rem;
      border-bottom: 1px solid rgba(201, 177, 137, .28);
    }

    .dhct-expedition-view__header h2 {
      margin: 0;
      font-size: 1.65rem;
      line-height: 1;
    }

    .dhct-expedition-view__header
      .dhct-expedition-view__metric {
      display: flex;
      align-items: center;
      gap: .45rem;
      padding: .3rem .6rem;
      border: 1px solid rgba(201, 177, 137, .28);
      border-radius: 999px;
      background: rgba(18, 17, 22, .38);
    }

    .dhct-expedition-view__header
      .dhct-expedition-view__metric-label {
      opacity: .66;
      font-size: .78rem;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .dhct-expedition-view__header
      .dhct-expedition-view__metric-value {
      font-weight: 700;
    }

    .dhct-expedition-view__overview {
      display: grid;
      grid-template-columns:
        minmax(0, 2fr)
        minmax(220px, 1fr);
      gap: 1rem;
      align-items: start;
    }

    .dhct-expedition-view__section {
      min-width: 0;
    }

    .dhct-expedition-view__section > h3 {
      margin: 0 0 .45rem;
      font-size: .82rem;
      line-height: 1.1;
      text-transform: uppercase;
      letter-spacing: .07em;
      opacity: .72;
    }

    .dhct-expedition-view__section-body {
      min-width: 0;
    }

    .dhct-expedition-view__section--hunters
      .dhct-expedition-view__section-body,
    .dhct-expedition-view__section--logistics
      .dhct-expedition-view__section-body {
      overflow: hidden;
      border: 1px solid rgba(201, 177, 137, .30);
      border-radius: 8px;
      background: rgba(18, 17, 22, .34);
    }

    .dhct-expedition-view__hunter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 1rem;
      min-height: 2.7rem;
      padding: .45rem .7rem;
      border-bottom: 1px solid rgba(201, 177, 137, .16);
    }

    .dhct-expedition-view__hunter:last-child {
      border-bottom: 0;
    }

    .dhct-expedition-view__hunter h4 {
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1rem;
    }

    .dhct-expedition-view__hunter
      .dhct-expedition-view__metric {
      display: flex;
      align-items: baseline;
      gap: .45rem;
      white-space: nowrap;
    }

    .dhct-expedition-view__hunter
      .dhct-expedition-view__metric-label {
      opacity: .58;
      font-size: .76rem;
      text-transform: uppercase;
    }

    .dhct-expedition-view__hunter
      .dhct-expedition-view__metric-value {
      min-width: 3.5rem;
      text-align: right;
      font-weight: 700;
    }

    .dhct-expedition-view__section--logistics
      .dhct-expedition-view__metric {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: .75rem;
      min-height: 2.7rem;
      padding: .45rem .7rem;
      border-bottom: 1px solid rgba(201, 177, 137, .16);
    }

    .dhct-expedition-view__section--logistics
      .dhct-expedition-view__metric:last-child {
      border-bottom: 0;
    }

    .dhct-expedition-view__section--logistics
      .dhct-expedition-view__metric-value {
      font-weight: 700;
      white-space: nowrap;
    }

    .dhct-expedition-view__section--materials
      .dhct-expedition-view__section-body {
      display: flex;
      flex-wrap: wrap;
      gap: .45rem;
      min-height: 3rem;
      padding: .65rem;
      border: 1px solid rgba(201, 177, 137, .30);
      border-radius: 8px;
      background: rgba(18, 17, 22, .28);
    }

    .dhct-expedition-view__material {
      display: inline-flex;
      align-items: center;
      gap: .45rem;
      padding: .35rem .6rem;
      border: 1px solid rgba(203, 182, 147, .34);
      border-radius: 999px;
      background: rgba(87, 67, 45, .26);
    }

    .dhct-expedition-view__material span:last-child {
      font-weight: 700;
    }

    .dhct-expedition-view__section--materials
      .dhct-expedition-view__metric {
      display: flex;
      align-items: center;
      gap: .45rem;
      opacity: .68;
    }

    .dhct-expedition-view__section--materials
      .dhct-expedition-view__metric-label {
      display: none;
    }

    .dhct-expedition-view__readiness {
      display: grid;
      grid-template-columns:
        repeat(4, minmax(0, 1fr));
      gap: .45rem;
    }

    .dhct-expedition-view__readiness
      .dhct-expedition-view__metric {
      display: flex;
      flex-direction: row-reverse;
      justify-content: flex-end;
      align-items: center;
      gap: .45rem;
      min-width: 0;
      padding: .5rem .6rem;
      border: 1px solid rgba(201, 177, 137, .24);
      border-radius: 6px;
      background: rgba(18, 17, 22, .28);
    }

    .dhct-expedition-view__readiness
      .dhct-expedition-view__metric-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dhct-expedition-view__readiness
      .dhct-expedition-view__metric-value {
      flex: 0 0 auto;
      font-weight: 700;
    }

    @media (max-width: 820px) {
      .dhct-expedition-view__overview {
        grid-template-columns: 1fr;
      }

      .dhct-expedition-view__section--readiness
        .dhct-expedition-view__section-body {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }




    dialog.dhct-expedition-layout {
      min-width: min(760px, 90vw);
      min-height: min(520px, 80vh);
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

    dialog.dhct-expedition-layout .dhct-expedition-shell {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    dialog.dhct-expedition-layout .dhct-expedition-shell__pane {
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

    dialog.dhct-expedition-layout
      .dct-expedition-item-detail
      [data-dhct-technical-ref="true"][hidden] {
      display: none !important;
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

async function refreshOpenFobActivityPanel() {
  const dialog =
    findOpenExpeditionDialog();

  if (!(dialog instanceof HTMLElement)) {
    return {
      green: false,
      reason: "expedition-dialog-not-open",
    };
  }

  const shell =
    dialog.querySelector(
      ".dhct-expedition-shell"
    );

  if (!(shell instanceof HTMLElement)) {
    return {
      green: false,
      reason: "expedition-shell-not-found",
    };
  }

  const fobPane =
    expeditionShellPane(
      shell,
      "fob"
    );

  if (!(fobPane instanceof HTMLElement)) {
    return {
      green: false,
      reason: "fob-pane-not-found",
    };
  }

  /*
   * Do not rely on a private CSS class here.
   * The panel already has a stable player-facing title.
   */
  const currentPanel =
    [...fobPane.children]
      .find(
        (node) =>
          node instanceof HTMLElement &&
          String(
            node.textContent ?? ""
          ).includes(
            "Activités programmées"
          )
      ) ?? null;

  if (!(currentPanel instanceof HTMLElement)) {
    return {
      green: false,
      reason: "fob-activity-panel-not-found",
    };
  }

  const api =
    getApi();

  const manifest =
    await loadCurrentManifest(
      api, expeditionIdOfDialog(dialog)
    );

  if (!manifest) {
    return {
      green: false,
      reason: "expedition-manifest-not-found",
    };
  }

  const replacement =
    renderFobActivityPanel(
      manifest,
      {
        isGm:
          game.user?.isGM === true,
      }
    );

  if (!(replacement instanceof HTMLElement)) {
    return {
      green: false,
      reason: "fob-activity-panel-render-failed",
    };
  }

  currentPanel.replaceWith(
    replacement
  );

  void hydrateFobActivityPanelLabels(
    replacement
  );

  return {
    green: true,
    changed: true,
  };
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
          target?.matches?.("dialog.application.dialog")
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
        ".dhct-access-matrix-panel",
        ".dhct-expedition-shell__gm-splitter",
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

  // R4.8f.8b: rebuild an already mounted inventory after a persisted FOB craft.
  // A standard scheduleRefresh() reuses the shell and keeps its old projection.
  let fobCraftRefreshPending = false;
  Hooks.on(`${MODULE_ID}.expeditionChanged`, (event = {}) => {
    if (event?.source !== "fob-craft") {
      scheduleRefresh({ retries: 8, delay: 80 });
      return;
    }
    if (fobCraftRefreshPending || !findOpenExpeditionDialog()) return;
    fobCraftRefreshPending = true;
    void (async () => {
      try {
        const api = getApi();
        const dialog = findOpenExpeditionDialog();
        const manifest = await loadCurrentManifest(api, expeditionIdOfDialog(dialog));
        if (!manifest || !findOpenExpeditionDialog(manifest.expeditionId)) return;
        await reopenExpeditionDialog(api, manifest);
      } catch (error) {
        console.warn(`${MODULE_ID} | FOB craft inventory refresh failed`, error);
      } finally {
        fobCraftRefreshPending = false;
      }
    })();
  });

  Hooks.on(
    `${MODULE_ID}.fobActivitiesChanged`,
    () => {
      void refreshOpenFobActivityPanel()
        .catch(
          (error) => {
            console.warn(
              `${MODULE_ID} | FOB activity panel refresh failed`,
              error
            );
          }
        );
    }
  );


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
