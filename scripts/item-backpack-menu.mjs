const MODULE_ID = "daggerheart-campaign-toolkit";

function getToolkitApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function getActorFromApplication(application) {
  const doc = application?.actor ?? application?.document ?? null;
  if (!doc || doc.documentName !== "Actor" || doc.type !== "character") return null;
  return doc;
}

function getItemId(target) {
  if (!target) return null;

  const row =
    target.closest?.("[data-item-id]") ??
    target.closest?.("[data-document-id]") ??
    target.closest?.("[data-entry-id]") ??
    target;

  return (
    row?.dataset?.itemId ??
    row?.dataset?.documentId ??
    row?.dataset?.entryId ??
    target?.dataset?.itemId ??
    null
  );
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

async function materializeManifest(api, candidate) {
  if (!candidate) return null;

  if (Array.isArray(candidate?.containers) || Array.isArray(candidate?.expedition?.containers)) {
    return candidate;
  }

  if (typeof candidate === "string") {
    return await api.expeditionManifest.load(candidate);
  }

  const id = getManifestId(candidate);
  if (id) return await api.expeditionManifest.load(id);

  return null;
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

async function findActorBackpack(api, actor) {
  const listed = await api.expeditionManifest.list();

  const candidates = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.manifests)
      ? listed.manifests
      : listed && typeof listed === "object"
        ? Object.values(listed)
        : [];

  const resolved = [];
  for (const candidate of candidates) {
    try {
      const manifest = await materializeManifest(api, candidate);
      if (manifest) resolved.push(manifest);
    } catch (err) {
      console.warn(`${MODULE_ID} | impossible de charger un manifeste d'expédition`, err);
    }
  }

  resolved.sort((a, b) => scoreManifest(b) - scoreManifest(a));

  for (const manifest of resolved) {
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

function getItemQuantity(item) {
  const q = item?.system?.quantity;

  if (typeof q === "number" && Number.isFinite(q)) return Math.max(1, q);
  if (typeof q?.value === "number" && Number.isFinite(q.value)) return Math.max(1, q.value);

  return 1;
}

function cloneManifest(manifest) {
  if (foundry?.utils?.deepClone) return foundry.utils.deepClone(manifest);
  return structuredClone(manifest);
}

async function moveActorItemToBackpack(actor, item) {
  const api = getToolkitApi();

  if (!api?.expeditionManifest?.list ||
      !api?.expeditionManifest?.load ||
      !api?.expeditionManifest?.save ||
      !api?.expeditionItems?.loadFromActor) {
    ui.notifications?.error("Sac à dos : API d'expédition indisponible.");
    return;
  }

  const binding = await findActorBackpack(api, actor);
  if (!binding) {
    ui.notifications?.warn(`Aucun sac à dos d'expédition lié à ${actor.name}.`);
    return;
  }

  const { manifest, backpack } = binding;
  const before = cloneManifest(manifest);
  const quantity = getItemQuantity(item);

  try {
    const result = api.expeditionItems.loadFromActor(manifest, {
      containerId: backpack.containerId,
      item,
      quantity
    });

    if (!result?.loaded) {
      throw new Error("loadFromActor n'a pas confirmé le chargement.");
    }

    await api.expeditionManifest.save(manifest);

    try {
      await item.delete();
    } catch (actorError) {
      await api.expeditionManifest.save(before);
      throw actorError;
    }

    ui.notifications?.info(`${item.name} → sac à dos`);
    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      containerId: backpack.containerId,
      actorUuid: actor.uuid,
      itemName: item.name
    });
  } catch (err) {
    console.error(`${MODULE_ID} | transfert Actor → sac à dos échoué`, err);
    ui.notifications?.error(`Impossible de mettre ${item.name} dans le sac à dos.`);
  }
}

Hooks.on("getItemContextOptions", (application, menuItems) => {
  const actor = getActorFromApplication(application);
  if (!actor) return;

  const entry = {
    label: "Mettre dans le sac à dos",
    icon: "fas fa-backpack",
    visible: (target) => {
      const itemId = getItemId(target);
      return Boolean(itemId && actor.items?.get(itemId));
    },
    onClick: async (_event, target) => {
      const itemId = getItemId(target);
      const item = itemId ? actor.items?.get(itemId) : null;

      if (!item) {
        ui.notifications?.warn("Objet introuvable sur la fiche.");
        return;
      }

      await moveActorItemToBackpack(actor, item);
    }
  };

  const deleteIndex = menuItems.findIndex((option) => {
    const label = String(option?.label ?? option?.name ?? "").toLowerCase();
    return label.includes("delete") || label.includes("supprimer");
  });

  if (deleteIndex >= 0) menuItems.splice(deleteIndex, 0, entry);
  else menuItems.push(entry);
});
