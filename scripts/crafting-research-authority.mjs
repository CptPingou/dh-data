const MODULE_ID = "daggerheart-campaign-toolkit";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_REQUEST = "crafting-research-authority-request";
const SOCKET_RESULT = "crafting-research-authority-result";
const TIMEOUT_MS = 10_000;
const RUNTIME_KEY = "__dhctCraftingResearchAuthority";

function runtime() {
  if (!globalThis[RUNTIME_KEY]) globalThis[RUNTIME_KEY] = { pending: new Map(), installed: false };
  return globalThis[RUNTIME_KEY];
}
function activeGm() {
  return [...(game.users ?? [])].filter((u) => u?.active && u?.isGM).sort((a,b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `dhct-research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function requesterControlsActor(user, actor) {
  return Boolean(user && actor?.testUserPermission?.(user, "OWNER") === true);
}
async function process(message) {
  if (!game.user?.isGM) return { green:false, reason:"not-authority" };
  const requester = game.users?.get(message?.sourceUserId) ?? null;
  if (!requester) return { green:false, reason:"requester-not-found" };
  const actor = message?.actorUuid ? await fromUuid(message.actorUuid) : null;
  if (!actor || actor.documentName !== "Actor") return { green:false, reason:"actor-not-found" };
  if (actor.type !== "character") return { green:false, reason:"actor-not-research-character" };
  if (!requesterControlsActor(requester, actor)) return { green:false, reason:"actor-not-owned" };

  const toolkit =
    game.modules.get(MODULE_ID)?.api ?? null;

  const crafting =
    toolkit?.crafting ?? null;

  const researchQueue =
    toolkit?.craftingResearchQueue ?? null;

  if (!crafting) {
    return {
      green:false,
      reason:"crafting-api-unavailable",
    };
  }

  const input = {
    actor,

    materialId:
      String(
        message?.materialId ?? ""
      ).trim(),

    propertyId:
      String(
        message?.propertyId ?? ""
      ).trim(),

    expeditionId:
      String(
        message?.expeditionId ?? ""
      ).trim(),

    containerId:
      String(
        message?.containerId ?? "fob"
      ).trim() || "fob",

    source:
      "foundry-research-station",
  };

  if (
    message?.operation ===
    "research"
  ) {
    if (!researchQueue?.enqueue) {
      return {
        green:false,
        reason:
          "research-queue-unavailable",
      };
    }

    return await researchQueue.enqueue({
      actor,
      materialId:
        input.materialId,
      propertyId:
        input.propertyId,
      expeditionId:
        input.expeditionId,
      containerId:
        input.containerId,
    });
  }

  if (
    message?.operation ===
    "document"
  ) {
    return await crafting
      .documentMaterialProperty(
        input
      );
  }

  return {
    green:false,
    reason:
      "unsupported-operation",
  };
}
function emitResult(message, result) {
  game.socket?.emit?.(SOCKET_CHANNEL, {
    type: SOCKET_RESULT,
    requestId: message?.requestId ?? null,
    targetUserId: message?.sourceUserId ?? null,
    ...result,
  });
}
export async function requestCraftingResearchAuthority({
  actor,
  operation,
  materialId,
  propertyId,
  expeditionId,
  containerId = "fob",
} = {}) {
  if (!game.socket?.emit) return { green:false, reason:"socket-unavailable" };
  const authority = activeGm();
  if (!authority) return { green:false, reason:"no-active-gm" };
  const message = {
    type: SOCKET_REQUEST,
    requestId: requestId(),
    sourceUserId: game.user?.id ?? null,
    actorUuid: actor?.uuid ?? null,
    operation,
    materialId,
    propertyId,
    expeditionId,
    containerId,
  };
  if (game.user?.isGM && authority.id === game.user.id) return await process(message);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      runtime().pending.delete(message.requestId);
      resolve({ green:false, reason:"authority-timeout" });
    }, TIMEOUT_MS);
    runtime().pending.set(message.requestId, { resolve, timer });
    game.socket.emit(SOCKET_CHANNEL, message);
  });
}
export function installCraftingResearchAuthority() {
  if (!game.socket?.on) return { green:false, reason:"socket-unavailable" };
  const state = runtime();
  if (state.installed) return { green:true, reused:true };
  state.installed = true;
  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (!message) return;
    if (message.type === SOCKET_REQUEST) {
      const authority = activeGm();
      if (!game.user?.isGM || !authority || authority.id !== game.user.id) return;
      let result;
      try { result = await process(message); }
      catch (error) {
        console.error(`${MODULE_ID} | research authority failed`, error);
        result = { green:false, reason:error?.message ?? "authority-request-failed" };
      }
      emitResult(message, result);
      return;
    }
    if (message.type !== SOCKET_RESULT || message.targetUserId !== game.user?.id) return;
    const pending = state.pending.get(message.requestId);
    if (!pending) return;
    state.pending.delete(message.requestId);
    clearTimeout(pending.timer);
    pending.resolve(message);
  });
  return { green:true, reused:false };
}
export const craftingResearchAuthorityApi = Object.freeze({
  install: installCraftingResearchAuthority,
  request: requestCraftingResearchAuthority,
});
