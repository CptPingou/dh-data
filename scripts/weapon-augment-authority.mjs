const MODULE_ID = "daggerheart-campaign-toolkit";

const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_REQUEST = "weapon-augment-authority-request";
const SOCKET_RESULT = "weapon-augment-authority-result";

const AUTHORITY_REQUEST_TIMEOUT_MS = 10_000;

const RUNTIME_KEY = "__dhctWeaponAugmentAuthorityRuntime";

function authorityRuntime() {
  const root = globalThis;

  if (!root[RUNTIME_KEY]) {
    root[RUNTIME_KEY] = {
      pendingRequests: new Map(),
      listenerInstalled: false,
    };
  }

  return root[RUNTIME_KEY];
}

function activeAuthorityGm() {
  return [...(game.users ?? [])]
    .filter((user) => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function makeRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `dhct-weapon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function resolveUuid(uuid) {
  if (!uuid) return null;
  return await fromUuid(uuid);
}

function requesterControlsActor(requester, actor) {
  if (!requester || !actor) return false;

  return actor.testUserPermission?.(requester, "OWNER") === true;
}

async function processAuthorityRequest(message) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "not-authority",
    };
  }

  const requester = game.users?.get(message?.sourceUserId) ?? null;

  if (!requester) {
    return {
      green: false,
      reason: "requester-not-found",
    };
  }

  const crafter = await resolveUuid(message?.crafterUuid);
  const weapon = await resolveUuid(message?.weaponUuid);

  if (!crafter || crafter.documentName !== "Actor") {
    return {
      green: false,
      reason: "crafter-not-found",
    };
  }

  if (
    !weapon ||
    weapon.documentName !== "Item" ||
    weapon.type !== "weapon" ||
    weapon.parent?.documentName !== "Actor"
  ) {
    return {
      green: false,
      reason: "weapon-not-found",
    };
  }

  // Never trust the crafter UUID supplied by the client.
  // The requesting user must actually own that actor.
  if (!requesterControlsActor(requester, crafter)) {
    return {
      green: false,
      reason: "crafter-not-owned",
    };
  }

  const permissions = await import(
    `./weapon-augment-permissions.mjs`
  );

  // Re-evaluate as the requesting user, not as the GM executing the mutation.
  const permission = permissions.canModifyMotherboard({
    user: requester,
    crafter,
    weapon,
    operation: message?.operation,
  });

  if (!permission?.allowed) {
    return {
      green: false,
      reason: permission?.reason ?? "permission-denied",
    };
  }

  const api =
    game.modules.get(MODULE_ID)?.api?.weaponAugmentState ?? null;

  if (!api) {
    return {
      green: false,
      reason: "weapon-augment-api-unavailable",
    };
  }

  const augmentId = String(message?.augmentId ?? "").trim();

  if (!augmentId) {
    return {
      green: false,
      reason: "augment-id-required",
    };
  }

  let state;

  switch (message.operation) {
    case "craft":
      state = await api.craft(weapon, augmentId);
      break;

    case "install":
      state = await api.install(weapon, augmentId);
      break;

    case "uninstall":
      state = await api.uninstall(weapon, augmentId);
      break;

    default:
      return {
        green: false,
        reason: "unsupported-operation",
      };
  }

  return {
    green: true,
    reason: permission.reason,
    operation: message.operation,
    crafterUuid: crafter.uuid,
    weaponUuid: weapon.uuid,
    augmentId,
    state,
  };
}

function emitAuthorityResult(message, result) {
  game.socket?.emit?.(SOCKET_CHANNEL, {
    type: SOCKET_RESULT,
    requestId: message?.requestId ?? null,
    sourceUserId: game.user?.id ?? null,
    targetUserId: message?.sourceUserId ?? null,

    operation: message?.operation ?? null,
    crafterUuid: message?.crafterUuid ?? null,
    weaponUuid: message?.weaponUuid ?? null,
    augmentId: message?.augmentId ?? null,

    ...result,
  });
}

export async function requestWeaponAugmentAuthority({
  crafter,
  weapon,
  operation,
  augmentId,
} = {}) {
  if (!game.socket?.emit) {
    return {
      green: false,
      reason: "socket-unavailable",
    };
  }

  const authority = activeAuthorityGm();

  if (!authority) {
    return {
      green: false,
      reason: "no-active-gm",
    };
  }

  const message = {
    type: SOCKET_REQUEST,
    requestId: makeRequestId(),
    sourceUserId: game.user?.id ?? null,
    crafterUuid: crafter?.uuid ?? null,
    weaponUuid: weapon?.uuid ?? null,
    operation: operation ?? null,
    augmentId: augmentId ?? null,
  };

  // Same fast path as expedition inventory when the authority itself
  // initiates the action.
  if (game.user?.isGM && authority.id === game.user.id) {
    return await processAuthorityRequest(message);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      authorityRuntime().pendingRequests.delete(message.requestId);

      resolve({
        green: false,
        reason: "authority-timeout",
      });
    }, AUTHORITY_REQUEST_TIMEOUT_MS);

    authorityRuntime().pendingRequests.set(message.requestId, {
      resolve,
      timer,
    });

    game.socket.emit(SOCKET_CHANNEL, message);
  });
}

export function installWeaponAugmentAuthority() {
  if (!game.socket?.on) {
    return {
      green: false,
      reason: "socket-unavailable",
    };
  }

  const runtime = authorityRuntime();

if (runtime.listenerInstalled) {
  return {
    green: true,
    reused: true,
  };
}

runtime.listenerInstalled = true;

  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (!message) return;

    if (message.type === SOCKET_REQUEST) {
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
        result = await processAuthorityRequest(message);
      } catch (error) {
        console.error(
          `${MODULE_ID} | GM weapon augment authority request failed`,
          error
        );

        result = {
          green: false,
          reason: error?.message ?? "authority-request-failed",
        };
      }

      emitAuthorityResult(message, result);
      return;
    }

    if (message.type !== SOCKET_RESULT) return;
    if (message.targetUserId !== game.user?.id) return;

    const pending = authorityRuntime().pendingRequests.get(message.requestId);
    if (!pending) return;

    authorityRuntime().pendingRequests.delete(message.requestId);
    clearTimeout(pending.timer);

    pending.resolve({
      green: Boolean(message.green),
      reason: message.reason ?? null,
      operation: message.operation ?? null,
      crafterUuid: message.crafterUuid ?? null,
      weaponUuid: message.weaponUuid ?? null,
      augmentId: message.augmentId ?? null,
      state: message.state ?? null,
    });
  });

  return {
    green: true,
    reused: false,
  };
}

export const weaponAugmentAuthorityApi = Object.freeze({
  install: installWeaponAugmentAuthority,
  request: requestWeaponAugmentAuthority,
});