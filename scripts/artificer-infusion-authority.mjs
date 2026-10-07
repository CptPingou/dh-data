import {
  artificerInfusionApi,
} from "./artificer-infusion-runtime.mjs";

const MODULE_ID =
  "daggerheart-campaign-toolkit";

const SOCKET_CHANNEL =
  `module.${MODULE_ID}`;

const SOCKET_REQUEST =
  "artificer-infusion-authority-request";

const SOCKET_RESULT =
  "artificer-infusion-authority-result";

const AUTHORITY_REQUEST_TIMEOUT_MS =
  10_000;

const RUNTIME_KEY =
  "__dhctArtificerInfusionAuthorityRuntime";


function authorityRuntime() {
  const root =
    globalThis;

  if (!root[RUNTIME_KEY]) {
    root[RUNTIME_KEY] = {
      pendingRequests:
        new Map(),

      listenerInstalled:
        false,
    };
  }

  return root[RUNTIME_KEY];
}


function activeAuthorityGm() {
  return [
    ...(game.users ?? []),
  ]
    .filter(
      user =>
        user?.active &&
        user?.isGM
    )
    .sort(
      (a, b) =>
        String(a.id)
          .localeCompare(
            String(b.id)
          )
    )[0] ?? null;
}


function makeRequestId() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ??
    `dhct-infusion-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}


async function resolveUuid(
  uuid
) {
  if (
    typeof uuid !== "string" ||
    !uuid
  ) {
    return null;
  }

  return await fromUuid(
    uuid
  );
}


function requesterControlsActor(
  requester,
  actor
) {
  if (
    !requester ||
    !actor
  ) {
    return false;
  }

  return (
    actor.testUserPermission?.(
      requester,
      "OWNER"
    ) === true
  );
}


async function processAuthorityRequest(
  message
) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason:
        "not-authority",
    };
  }

  if (
    message?.operation !==
    "add"
  ) {
    return {
      green: false,
      reason:
        "unsupported-operation",
    };
  }

  const requester =
    game.users?.get(
      message?.sourceUserId
    ) ?? null;

  if (!requester) {
    return {
      green: false,
      reason:
        "requester-not-found",
    };
  }

  const artificer =
    await resolveUuid(
      message?.artificerUuid
    );

  if (
    !artificer ||
    artificer.documentName !==
      "Actor"
  ) {
    return {
      green: false,
      reason:
        "artificer-not-found",
    };
  }

  /*
   * Never trust the Actor UUID supplied
   * by a player client.
   *
   * A player may only request an
   * infusion from an Actor they own.
   */
  if (
    !requesterControlsActor(
      requester,
      artificer
    )
  ) {
    return {
      green: false,
      reason:
        "artificer-not-owned",
    };
  }

  const weapon =
    await resolveUuid(
      message?.weaponUuid
    );

  if (
    !weapon ||
    weapon.documentName !==
      "Item" ||
    weapon.type !==
      "weapon" ||
    weapon.parent?.documentName !==
      "Actor"
  ) {
    return {
      green: false,
      reason:
        "weapon-not-found",
    };
  }

  if (
    typeof message?.augmentId !==
      "string" ||
    !message.augmentId.trim()
  ) {
    return {
      green: false,
      reason:
        "augment-id-required",
    };
  }

  /*
   * The authoritative runtime performs
   * all actual rules:
   *
   * - Artificer identity
   * - Tier
   * - capacity
   * - Motherboard initialization
   * - augment eligibility
   * - permanent/temporary duplicate
   * - world registry mutation
   * - weapon resync
   *
   * Ownership of the TARGET actor is
   * deliberately not required:
   * an Artificer may infuse another
   * player's hunting weapon.
   */
  const status =
    await artificerInfusionApi.add(
      artificer,
      weapon.parent.uuid,
      weapon.id,
      message.augmentId
    );

  return {
    green: true,
    reason:
      game.user?.id ===
      message?.sourceUserId
        ? "GM"
        : "authority",

    operation:
      "add",

    artificerUuid:
      artificer.uuid,

    weaponUuid:
      weapon.uuid,

    augmentId:
      message.augmentId,

    status,
  };
}


function emitAuthorityResult(
  message,
  result
) {
  game.socket?.emit?.(
    SOCKET_CHANNEL,
    {
      type:
        SOCKET_RESULT,

      requestId:
        message?.requestId ??
        null,

      sourceUserId:
        game.user?.id ??
        null,

      targetUserId:
        message?.sourceUserId ??
        null,

      operation:
        message?.operation ??
        null,

      artificerUuid:
        message?.artificerUuid ??
        null,

      weaponUuid:
        message?.weaponUuid ??
        null,

      augmentId:
        message?.augmentId ??
        null,

      ...result,
    }
  );
}


export async function requestArtificerInfusionAuthority({
  artificer,
  weapon,
  augmentId,
} = {}) {
  if (!game.socket?.emit) {
    return {
      green: false,
      reason:
        "socket-unavailable",
    };
  }

  const authority =
    activeAuthorityGm();

  if (!authority) {
    return {
      green: false,
      reason:
        "no-active-gm",
    };
  }

  const message = {
    type:
      SOCKET_REQUEST,

    requestId:
      makeRequestId(),

    sourceUserId:
      game.user?.id ??
      null,

    operation:
      "add",

    artificerUuid:
      artificer?.uuid ??
      null,

    weaponUuid:
      weapon?.uuid ??
      null,

    augmentId:
      augmentId ??
      null,
  };

  /*
   * Fast path for the lead GM.
   */
  if (
    game.user?.isGM &&
    authority.id ===
      game.user.id
  ) {
    return await processAuthorityRequest(
      message
    );
  }

  return new Promise(
    resolve => {
      const timer =
        setTimeout(
          () => {
            authorityRuntime()
              .pendingRequests
              .delete(
                message.requestId
              );

            resolve({
              green: false,
              reason:
                "authority-timeout",
            });
          },
          AUTHORITY_REQUEST_TIMEOUT_MS
        );

      authorityRuntime()
        .pendingRequests
        .set(
          message.requestId,
          {
            resolve,
            timer,
          }
        );

      game.socket.emit(
        SOCKET_CHANNEL,
        message
      );
    }
  );
}


export function installArtificerInfusionAuthority() {
  const runtime =
    authorityRuntime();

  if (
    runtime.listenerInstalled
  ) {
    return {
      installed: true,
      duplicate: true,
      version:
        "P2.13h.2",
    };
  }

  if (!game.socket?.on) {
    return {
      installed: false,
      reason:
        "socket-unavailable",
    };
  }

  game.socket.on(
    SOCKET_CHANNEL,
    async message => {
      if (!message) {
        return;
      }

      if (
        message.type ===
        SOCKET_REQUEST
      ) {
        const authority =
          activeAuthorityGm();

        if (
          !game.user?.isGM ||
          !authority ||
          authority.id !==
            game.user.id
        ) {
          return;
        }

        let result;

        try {
          result =
            await processAuthorityRequest(
              message
            );
        } catch (error) {
          console.error(
            `${MODULE_ID} | GM Artificer infusion authority request failed`,
            error
          );

          result = {
            green: false,
            reason:
              error?.message ??
              "authority-request-failed",
          };
        }

        emitAuthorityResult(
          message,
          result
        );

        return;
      }

      if (
        message.type !==
        SOCKET_RESULT
      ) {
        return;
      }

      if (
        message.targetUserId !==
        game.user?.id
      ) {
        return;
      }

      const pending =
        authorityRuntime()
          .pendingRequests
          .get(
            message.requestId
          );

      if (!pending) {
        return;
      }

      authorityRuntime()
        .pendingRequests
        .delete(
          message.requestId
        );

      clearTimeout(
        pending.timer
      );

      pending.resolve({
        green:
          Boolean(
            message.green
          ),

        reason:
          message.reason ??
          null,

        operation:
          message.operation ??
          null,

        artificerUuid:
          message.artificerUuid ??
          null,

        weaponUuid:
          message.weaponUuid ??
          null,

        augmentId:
          message.augmentId ??
          null,

        status:
          message.status ??
          null,
      });
    }
  );

  runtime.listenerInstalled =
    true;

  return {
    installed: true,
    duplicate: false,
    version:
      "P2.13h.2",
  };
}


export const artificerInfusionAuthorityApi =
  Object.freeze({
    install:
      installArtificerInfusionAuthority,

    request:
      requestArtificerInfusionAuthority,
  });
