import { expeditionErrorMessage } from "./expedition-errors.mjs";
import "./expedition-world-bootstrap.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const PATCH_MARK = Symbol.for(`${MODULE_ID}.backpackContextMenuPatched`);

function getToolkitApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function getManifestContainers(manifest) {
  if (Array.isArray(manifest?.containers)) return manifest.containers;
  if (Array.isArray(manifest?.expedition?.containers)) return manifest.expedition.containers;
  return [];
}

function getManifestId(manifest) {
  return (
    manifest?.expeditionId ??
    manifest?.id ??
    manifest?.metadata?.expeditionId ??
    manifest?.metadata?.id ??
    null
  );
}

function scoreManifest(manifest) {
  const state =
    manifest?.lifecycle?.state ??
    manifest?.state ??
    manifest?.mode ??
    manifest?.metadata?.state ??
    "";

  if (state === "in_session" || state === "foundry") return 100;
  if (state === "prepared") return 50;
  if (state === "returned") return 10;
  return 0;
}

async function materializeManifest(api, candidate) {
  if (!candidate) return null;

  if (Array.isArray(candidate?.containers) || Array.isArray(candidate?.expedition?.containers)) {
    return candidate;
  }

  if (typeof candidate === "string") {
    return api.expeditionManifest.load(candidate);
  }

  const id = getManifestId(candidate);
  return id ? api.expeditionManifest.load(id) : null;
}

async function findActorBackpack(api, actor) {
  const listed = await api.expeditionManifest.list();

  const candidates = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.manifests)
      ? listed.manifests
      : listed && typeof listed === "object"
        ? Object.values(listed)
        : [];

  const manifests = [];

  for (const candidate of candidates) {
    try {
      const manifest = await materializeManifest(api, candidate);
      if (manifest) manifests.push(manifest);
    } catch (error) {
      console.warn(`${MODULE_ID} | manifest ignored while looking for backpack`, error);
    }
  }

  manifests.sort((a, b) => scoreManifest(b) - scoreManifest(a));

  for (const manifest of manifests) {
    const backpack = getManifestContainers(manifest).find((container) => {
      if (container?.type !== "backpack") return false;

      // A stored backpack still belongs to the character, but players
      // temporarily lose access to it until the GM retrieves it.
      if (
        !game.user?.isGM &&
        container?.presentation?.accessState === "stored"
      ) {
        return false;
      }

      const holder = container?.holderRef ?? {};
      return (
        holder.foundryActorUuid === actor.uuid ||
        holder.actorUuid === actor.uuid ||
        holder.uuid === actor.uuid
      );
    });

    if (backpack) return { manifest, backpack };
  }

  return null;
}

function getQuantityInfo(item) {
  const quantity = item?.system?.quantity;

  if (Number.isFinite(quantity)) {
    return {
      value: Math.max(1, Number(quantity)),
      updatePath: "system.quantity",
    };
  }

  if (Number.isFinite(quantity?.value)) {
    return {
      value: Math.max(1, Number(quantity.value)),
      updatePath: "system.quantity.value",
    };
  }

  const amount = item?.system?.amount;

  if (Number.isFinite(amount)) {
    return {
      value: Math.max(1, Number(amount)),
      updatePath: "system.amount",
    };
  }

  if (Number.isFinite(amount?.value)) {
    return {
      value: Math.max(1, Number(amount.value)),
      updatePath: "system.amount.value",
    };
  }

  return {
    value: 1,
    updatePath: null,
  };
}

function cloneManifest(manifest) {
  return foundry?.utils?.deepClone
    ? foundry.utils.deepClone(manifest)
    : structuredClone(manifest);
}

async function chooseTransferQuantity(item, maximum) {
  if (maximum <= 1) return 1;

  const DialogV2 = foundry?.applications?.api?.DialogV2;

  if (DialogV2?.prompt) {
    const result = await DialogV2.prompt({
      window: {
        title: `Mettre ${item.name} dans le sac à dos`,
      },
      content: `
        <div class="form-group">
          <label>Quantité</label>
          <div class="form-fields">
            <input
              type="number"
              name="quantity"
              value="${maximum}"
              min="1"
              max="${maximum}"
              step="1"
              autofocus
            />
          </div>
          <p class="hint">Disponible sur le personnage : ${maximum}</p>
        </div>
      `,
      ok: {
        label: "Transférer",
        callback: (_event, button, dialog) => {
          const form = dialog?.element?.querySelector?.("form");
          const input = form?.elements?.quantity ?? dialog?.element?.querySelector?.('[name="quantity"]');
          return Number(input?.value ?? maximum);
        },
      },
      rejectClose: false,
    });

    if (result == null) return null;

    const quantity = Math.floor(Number(result));
    if (!Number.isFinite(quantity)) return maximum;
    if (quantity <= 0) {
      ui.notifications?.warn("La quantité à transférer doit être supérieure à 0.");
      return null;
    }
    return Math.min(maximum, quantity);
  }

  const raw = window.prompt(
    `Quantité de "${item.name}" à mettre dans le sac à dos (1-${maximum}) :`,
    String(maximum)
  );

  if (raw == null) return null;

  const quantity = Math.floor(Number(raw));
  if (!Number.isFinite(quantity)) return maximum;
  if (quantity <= 0) {
    ui.notifications?.warn("La quantité à transférer doit être supérieure à 0.");
    return null;
  }
  return Math.min(maximum, quantity);
}

async function applyActorDebit(item, quantity, quantityInfo) {
  const available = quantityInfo.value;

  if (quantity >= available || !quantityInfo.updatePath) {
    await item.delete();
    return {
      mode: "deleted",
      remaining: 0,
    };
  }

  const remaining = available - quantity;

  await item.update({
    [quantityInfo.updatePath]: remaining,
  });

  return {
    mode: "decremented",
    remaining,
  };
}


async function refreshOpenExpeditionFromTransfer(api, manifest) {
  const expeditionId = getManifestId(manifest);
  if (!expeditionId) return;

  let freshManifest = manifest;

  try {
    freshManifest = await api.expeditionManifest.load(expeditionId);
  } catch (error) {
    console.warn(`${MODULE_ID} | could not reload expedition manifest after transfer`, error);
  }

  const dialogs = [...document.querySelectorAll("dialog.application.dialog")];
  const expeditionDialog = dialogs.find((dialog) =>
    /préparer l[’']expédition|prepare expedition/i.test(dialog.textContent ?? "")
  );

  if (!expeditionDialog) return;

  try {
    // Reproduce the already validated manual close/open behavior.
    if (typeof expeditionDialog.close === "function" && expeditionDialog.open) {
      expeditionDialog.close();
    }

    // HTMLDialogElement.close() does not remove the node. The expedition
    // renderer creates a fresh dialog on open(), so the stale one must be
    // removed explicitly or both remain in the DOM.
    expeditionDialog.remove();

    // Yield one frame so Foundry's dialog teardown completes before reopening.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Important: open() expects the full manifest object, not expeditionId.
    if (typeof api?.expeditionManifest?.open === "function") {
      await api.expeditionManifest.open(freshManifest);
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | expedition dialog reopen after transfer failed`, error);
  }
}

async function moveItemToBackpack(item) {
  const actor = item?.parent;

  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
    ui.notifications?.warn("Cet objet n'appartient pas à un personnage.");
    return;
  }

  const api = getToolkitApi();

  if (
    !api?.expeditionManifest?.list ||
    !api?.expeditionManifest?.load ||
    !api?.expeditionManifest?.save ||
    !api?.expeditionItems?.loadFromActor
  ) {
    ui.notifications?.error("Sac à dos : API d'expédition indisponible.");
    return;
  }

  const binding = await findActorBackpack(api, actor);

  if (!binding) {
    ui.notifications?.warn(`Aucun sac à dos d'expédition accessible pour ${actor.name}.`);
    return;
  }

  const quantityInfo = getQuantityInfo(item);
  const quantity = await chooseTransferQuantity(item, quantityInfo.value);

  if (quantity == null) return;

  const { manifest, backpack } = binding;
  const snapshot = cloneManifest(manifest);

  let transferFailureReason = null;

  try {
    const result = await api.expeditionItems.loadFromActor(manifest, {
      containerId: backpack.containerId,
      item,
      quantity,
    });

    if (!result?.loaded) {
      transferFailureReason = result?.reason ?? "loadFromActor did not confirm the transfer.";
      throw new Error(transferFailureReason);
    }

    await api.expeditionManifest.save(manifest);

    try {
      const debit = await applyActorDebit(item, quantity, quantityInfo);

      ui.notifications?.info(
        debit.remaining > 0
          ? `${quantity} × ${item.name} → sac à dos (${debit.remaining} restant)`
          : `${quantity} × ${item.name} → sac à dos`
      );
    } catch (error) {
      await api.expeditionManifest.save(snapshot);
      throw error;
    }

    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      containerId: backpack.containerId,
      actorUuid: actor.uuid,
      itemName: item.name,
      quantity,
    });

    await refreshOpenExpeditionFromTransfer(api, manifest);
  } catch (error) {
    console.error(`${MODULE_ID} | Actor → backpack transfer failed`, error);
    ui.notifications?.error(
      expeditionErrorMessage(transferFailureReason ?? error?.message, {
        itemName: item.name,
        containerName: backpack?.name ?? "le sac à dos",
        actorName: actor.name,
      })
    );
  }
}

function collectSheetClasses() {
  const found = new Set();

  for (const typeConfig of Object.values(CONFIG.Actor?.sheetClasses ?? {})) {
    for (const registration of Object.values(typeConfig ?? {})) {
      const cls =
        registration?.cls ??
        registration?.sheetClass ??
        registration;

      if (typeof cls === "function") found.add(cls);
    }
  }

  return [...found];
}

function patchSheetClass(SheetClass) {
  const proto = SheetClass?.prototype;
  if (!proto || proto[PATCH_MARK]) return false;

  const original = proto._getContextMenuCommonOptions;
  if (typeof original !== "function") return false;

  Object.defineProperty(proto, PATCH_MARK, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  proto._getContextMenuCommonOptions = function (...args) {
    const options = original.apply(this, args);

    if (!Array.isArray(options)) return options;

    const backpackOption = {
      name: "Mettre dans le sac à dos",
      icon: '<i class="fa-solid fa-backpack"></i>',
      condition: (target) => {
        const row = target?.closest?.("[data-item-uuid]");
        const uuid = row?.dataset?.itemUuid;
        if (!uuid) return false;

        const item = fromUuidSync(uuid);
        const actor = item?.parent;

        return Boolean(
          item &&
          item.documentName === "Item" &&
          actor?.documentName === "Actor" &&
          actor?.type === "character"
        );
      },
      callback: async (target) => {
        const row = target?.closest?.("[data-item-uuid]");
        const uuid = row?.dataset?.itemUuid;
        const item = uuid ? await fromUuid(uuid) : null;

        if (!item) {
          ui.notifications?.warn("Objet introuvable.");
          return;
        }

        await moveItemToBackpack(item);
      },
    };

    const deleteIndex = options.findIndex((option) =>
      option?.name === "CONTROLS.CommonDelete"
    );

    if (deleteIndex >= 0) options.splice(deleteIndex, 0, backpackOption);
    else options.push(backpackOption);

    return options;
  };

  return true;
}

Hooks.once("ready", () => {
  let patched = 0;

  for (const SheetClass of collectSheetClasses()) {
    try {
      if (patchSheetClass(SheetClass)) patched += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | could not patch sheet context menu`, SheetClass?.name, error);
    }
  }

  console.log(`${MODULE_ID} | backpack context menu patched`, { patched });
});

