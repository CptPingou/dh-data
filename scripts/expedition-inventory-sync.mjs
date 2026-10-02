const MODULE_ID = "daggerheart-campaign-toolkit";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_BACKPACK_ACCESS = "expedition-backpack-access-changed";
const SOCKET_INVENTORY_REQUEST = "expedition-inventory-authority-request";
const SOCKET_INVENTORY_RESULT = "expedition-inventory-authority-result";
const AUTHORITY_REQUEST_TIMEOUT_MS = 10000;

const pendingAuthorityRequests = new Map();

let dependencies = {
  getApi: null,
  processInventoryAuthorityRequest: null,
  refreshExpedition: null,
};

export function configureExpeditionInventorySync({
  getApi,
  processInventoryAuthorityRequest,
  refreshExpedition,
} = {}) {
  dependencies = {
    getApi: getApi ?? null,
    processInventoryAuthorityRequest:
      processInventoryAuthorityRequest ?? null,
    refreshExpedition:
      refreshExpedition ?? null,
  };
}

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

async function requestInventoryAuthorityActionCore(payload = {}) {
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
    const result = await dependencies.processInventoryAuthorityRequest(message);
    if (result?.green) {
      await refreshExpeditionFromRemoteChangeCore({
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

function broadcastBackpackAccessChangeCore(manifest, containerId) {
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

async function refreshExpeditionFromRemoteChangeCore({
  expeditionId,
  revision,
} = {}) {
  const api =
    typeof dependencies.getApi === "function"
      ? dependencies.getApi()
      : null;

  if (!expeditionId || !api?.expeditionManifest?.load) {
    return {
      green: false,
      reason: "manifest-api-unavailable",
    };
  }

  try {
    const fresh =
      await api.expeditionManifest.load(expeditionId);

    if (!fresh) {
      return {
        green: false,
        reason: "manifest-not-found",
      };
    }

    // Preserve the original stale-packet diagnostic.
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

    if (
      typeof dependencies.refreshExpedition !==
      "function"
    ) {
      return {
        green: true,
        refreshed: false,
        reason: "dialog-not-open",
      };
    }

    const refreshed =
      await dependencies.refreshExpedition({
        api,
        manifest: fresh,
      });

    if (!refreshed) {
      return {
        green: true,
        refreshed: false,
        reason: "dialog-not-open",
      };
    }

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
      reason:
        error?.message ?? "remote-refresh-failed",
    };
  }
}

function installExpeditionSocketSyncCore() {
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
        result = await dependencies.processInventoryAuthorityRequest(message);
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
        await refreshExpeditionFromRemoteChangeCore({
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
        await refreshExpeditionFromRemoteChangeCore({
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
        remaining: message.remaining ?? null,
      });
      return;
    }

    if (message.type !== SOCKET_BACKPACK_ACCESS) return;
    if (message.sourceUserId === game.user?.id) return;

    const result = await refreshExpeditionFromRemoteChangeCore({
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

export async function requestInventoryAuthorityAction(
  payload = {}
) {
  return requestInventoryAuthorityActionCore(payload);
}

export function broadcastBackpackAccessChange(
  manifest,
  containerId
) {
  return broadcastBackpackAccessChangeCore(
    manifest,
    containerId
  );
}

export function installExpeditionSocketSync() {
  return installExpeditionSocketSyncCore();
}
