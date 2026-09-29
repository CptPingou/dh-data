/** P2.11d.3f — bridge for the observed Foundryborne 2.10.6 LONG REST chat card.
 * GM-only; no Actor factory document; no hook on open/cancel or generic HP healing.
 */
import { expireForNativeLongRest } from "./artificer-infusion-runtime.mjs";
const SCOPE = "daggerheart-campaign-toolkit";
let hookId = null;
let queued = Promise.resolve();
const processing = new Set();

function leadGM() {
  const activeGMs = (game.users?.contents ?? []).filter(u => u.active && u.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return activeGMs[0]?.id === game.user?.id;
}

/** Strict match for the tested post-confirmation downtime message. */
export function nativeLongRestRecipient(message) {
  if (!message || message.type !== "base") return null;
  if (!/<div\s+class=["'][^"']*\bdaggerheart\b[^"']*\bchat\b[^"']*\bdowntime\b/.test(String(message.content ?? ""))) return null;
  const system = message.system;
  const uuid = system?.actor;
  if (typeof uuid !== "string" || !/^Actor\.[^.]+$/.test(uuid)) return null;
  // The message must be spoken by that exact Actor (not a GM/system notice).
  if (message.speaker?.actor !== uuid.slice(6)) return null;
  const moves = system?.moves;
  if (!Array.isArray(moves) || moves.length === 0) return null;
  if (!moves.every(m => typeof m?.movePath === "string" &&
    m.movePath.startsWith("longRest.moves."))) return null;
  if (!game.actors?.get?.(uuid.slice(6))) return null;
  return uuid;
}

/** Attach only once on the active GM client. Multiple GM clients are deduplicated
 * by leader selection plus persisted processedRestMessageIds. */
export function registerNativeLongRestInfusionBridge() {
  if (hookId !== null || !game.user?.isGM) return { installed: hookId !== null };
  hookId = Hooks.on("createChatMessage", (message) => {
    if (!leadGM()) return;
    const uuid = nativeLongRestRecipient(message);
    if (!uuid || !message.id || processing.has(message.id)) return;
    processing.add(message.id);
    queued = queued.catch(() => {}).then(async () => {
      try {
        const result = await expireForNativeLongRest({ messageId: message.id, recipientUuid: uuid });
        if (result.handled) console.info(`${SCOPE} | native long rest -> world infusions`, result);
      } catch (error) {
        console.error(`${SCOPE} | native long rest bridge failed (world infusions unchanged unless set succeeded)`, error);
      } finally { processing.delete(message.id); }
    });
  });
  return { installed: true, version: "P2.11d.3f" };
}
