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

function getQuantity(item) {
  const quantity = item?.system?.quantity;

  if (Number.isFinite(quantity)) return Math.max(1, Number(quantity));
  if (Number.isFinite(quantity?.value)) return Math.max(1, Number(quantity.value));

  return 1;
}

function cloneManifest(manifest) {
  return foundry?.utils?.deepClone
    ? foundry.utils.deepClone(manifest)
    : structuredClone(manifest);
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
    ui.notifications?.warn(`Aucun sac à dos d'expédition lié à ${actor.name}.`);
    return;
  }

  const { manifest, backpack } = binding;
  const snapshot = cloneManifest(manifest);

  try {
    const result = await api.expeditionItems.loadFromActor(manifest, {
      containerId: backpack.containerId,
      item,
      quantity: getQuantity(item)
    });

    if (!result?.loaded) {
      throw new Error("loadFromActor did not confirm the transfer.");
    }

    await api.expeditionManifest.save(manifest);

    try {
      await item.delete();
    } catch (error) {
      await api.expeditionManifest.save(snapshot);
      throw error;
    }

    ui.notifications?.info(`${item.name} → sac à dos`);

    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      containerId: backpack.containerId,
      actorUuid: actor.uuid,
      itemName: item.name
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Actor → backpack transfer failed`, error);
    ui.notifications?.error(`Impossible de mettre ${item.name} dans le sac à dos.`);
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
    value: true
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
      }
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
