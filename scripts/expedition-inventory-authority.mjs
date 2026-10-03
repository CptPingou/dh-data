const MODULE_ID = "daggerheart-campaign-toolkit";

export async function processInventoryAuthorityRequest(
  message,
  {
    getApi,
    userCanAccessContainer,
    broadcastBackpackAccessChange,
  }
) {
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
      quantity:
        message.quantity == null
          ? null
          : Math.max(
              1,
              Math.floor(
                Number(message.quantity) || 1
              )
            ),
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

  if (message.action === "actor-to-backpack") {
    const to = (manifest.containers ?? []).find(
      (container) => container.containerId === message.toContainerId
    );

    if (!to) {
      return { green: false, reason: "container-not-found" };
    }

    if (!userCanAccessContainer(requester, to)) {
      return { green: false, reason: "container-access-denied" };
    }

    if (!api?.expeditionItems?.loadFromActor) {
      return { green: false, reason: "load-from-actor-unavailable" };
    }

    const item = message.itemUuid
      ? await fromUuid(message.itemUuid).catch(() => null)
      : null;

    if (!item || item.documentName !== "Item") {
      return { green: false, reason: "item-not-found" };
    }

    const actor = item.parent;
    if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
      return { green: false, reason: "actor-not-found" };
    }

    if (
      typeof actor.testUserPermission !== "function" ||
      !actor.testUserPermission(requester, "OWNER")
    ) {
      return { green: false, reason: "actor-access-denied" };
    }

    const quantity = Math.max(1, Math.floor(Number(message.quantity) || 1));
    const manifestSnapshot = structuredClone(manifest);
    const itemSnapshot = item.toObject();

    try {
      const result = await api.expeditionItems.loadFromActor(manifest, {
        containerId: message.toContainerId,
        item,
        quantity,
      });

      if (!result?.loaded) {
        return {
          green: false,
          reason: result?.reason ?? "load-from-actor-refused",
        };
      }

      const validation = api.expeditionManifest.validate?.(manifest);
      if (validation && validation.green === false) {
        throw new Error(
          `manifest-invalid: ${(validation.errors ?? []).join("; ")}`
        );
      }

      await api.expeditionManifest.save(manifest);
      broadcastBackpackAccessChange(manifest, message.toContainerId);

      const remainingItem = actor.items.get(itemSnapshot._id);
      const remaining = remainingItem
        ? Math.max(0, Number(
            remainingItem.system?.quantity ??
            remainingItem.system?.count ??
            remainingItem.system?.uses?.value ??
            1
          ) || 0)
        : 0;

      Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
        manifest,
        source: "gm-authority-actor-to-backpack",
        requestUserId: requester.id,
        actorUuid: actor.uuid,
        containerId: message.toContainerId,
        itemUuid: itemSnapshot._id,
        itemName: itemSnapshot.name ?? null,
        quantity,
      });

      return {
        green: true,
        action: "actor-to-backpack",
        revision: manifest.revision ?? null,
        containerId: message.toContainerId,
        itemName: itemSnapshot.name ?? null,
        remaining,
      };
    } catch (error) {
      console.error(
        `${MODULE_ID} | GM Actor → backpack authority failed`,
        error
      );

      try {
        await api.expeditionManifest.save(manifestSnapshot);
      } catch (rollbackError) {
        console.error(
          `${MODULE_ID} | Actor → backpack manifest rollback failed`,
          rollbackError
        );
      }

      try {
        const currentItem = actor.items.get(itemSnapshot._id);

        if (currentItem) {
          await actor.updateEmbeddedDocuments("Item", [itemSnapshot]);
        } else {
          await actor.createEmbeddedDocuments("Item", [itemSnapshot], {
            keepId: true,
          });
        }
      } catch (rollbackError) {
        console.error(
          `${MODULE_ID} | Actor → backpack item rollback failed`,
          rollbackError
        );
      }

      return {
        green: false,
        reason: error?.message ?? "actor-to-backpack-failed",
      };
    }
  }

  if (message.action === "backpack-to-actor") {
    const from = (manifest.containers ?? []).find(
      (container) => container.containerId === message.fromContainerId
    );

    if (!from) {
      return { green: false, reason: "container-not-found" };
    }

    if (!userCanAccessContainer(requester, from)) {
      return { green: false, reason: "container-access-denied" };
    }

    if (!api?.expeditionItems?.unloadToActor) {
      return { green: false, reason: "unload-to-actor-unavailable" };
    }

    const entry = (from.contents ?? []).find(
      (candidate) => candidate.entryId === message.entryId
    );

    if (!entry) {
      return { green: false, reason: "entry-not-found" };
    }

    const quantity = Math.max(
      1,
      Math.floor(Number(message.quantity) || 1)
    );

    const result = await api.expeditionItems.unloadToActor(
      manifest,
      {
        containerId: message.fromContainerId,
        entryId: message.entryId,
        quantity,
        note: `Restitu? ? son personnage par ${requester.name ?? "joueur"}`,
      }
    );

    if (!result?.unloaded) {
      return {
        green: false,
        reason: result?.reason ?? "unload-to-actor-refused",
      };
    }

    const validation =
      api.expeditionManifest.validate?.(manifest);

    if (validation && validation.green === false) {
      return {
        green: false,
        reason: `manifest-invalid: ${(validation.errors ?? []).join("; ")}`,
      };
    }

    await api.expeditionManifest.save(manifest);

    broadcastBackpackAccessChange(
      manifest,
      message.fromContainerId
    );

    Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
      manifest,
      source: "gm-authority-backpack-to-actor",
      requestUserId: requester.id,
      containerId: message.fromContainerId,
      entryId: message.entryId,
      quantity,
      actorId: result.actorId ?? null,
      createdItemId: result.createdItemId ?? null,
      mergedItemId: result.mergedItemId ?? null,
    });

    return {
      green: true,
      action: "backpack-to-actor",
      revision: manifest.revision ?? null,
      containerId: message.fromContainerId,
      entryId: message.entryId,
      quantity,
      actorId: result.actorId ?? null,
      createdItemId: result.createdItemId ?? null,
      mergedItemId: result.mergedItemId ?? null,
      merged: result.merged === true,
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
