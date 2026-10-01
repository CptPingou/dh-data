const MODULE_ID = "daggerheart-campaign-toolkit";
const BUTTON_CLASS = "dct-artificer-workshop-launcher";
const CHAT_BUTTON_CLASS = "dct-hunt-artisan-chat-workshop";

import { hasHuntArtisanCard, isHuntArtisanCard } from "./weapon-augment-workshop.mjs";

export function huntArtisanCardLauncherEligibility(item, user = globalThis.game?.user) {
  if (!isHuntArtisanCard(item)) {
    return { green: false, reason: "item-not-hunt-artisan-card" };
  }

  const actor = item?.parent;
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
    return { green: false, reason: "artisan-card-not-embedded-on-character" };
  }

  const owned = Boolean(actor.isOwner || user?.isGM);
  if (!owned) {
    return { green: false, reason: "actor-not-owned" };
  }

  return { green: true, reason: "ok", actor };
}

export function artificerWorkshopLauncherEligibility(actor, user = globalThis.game?.user) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") {
    return { green: false, reason: "actor-not-character" };
  }

  if (!hasHuntArtisanCard(actor)) {
    return { green: false, reason: "actor-missing-hunt-artisan-card" };
  }

  const owned = Boolean(actor.isOwner || user?.isGM);
  if (!owned) {
    return { green: false, reason: "actor-not-owned" };
  }

  return { green: true, reason: "ok" };
}

function sheetRoot(app, html) {
  const appElement = app?.element;
  if (typeof HTMLElement !== "undefined" && appElement instanceof HTMLElement) return appElement;

  const root = html?.[0] ?? html;
  return typeof HTMLElement !== "undefined" && root instanceof HTMLElement ? root : null;
}

function chatRoot(html) {
  const root = html?.[0] ?? html;
  return typeof HTMLElement !== "undefined" && root instanceof HTMLElement ? root : null;
}

function headerTarget(root) {
  return (
    root.querySelector?.(".window-header") ??
    root.closest?.(".window-app")?.querySelector?.(".window-header") ??
    null
  );
}

function fallbackTarget(root) {
  return (
    root.querySelector?.(".window-content") ??
    root.querySelector?.("form") ??
    root
  );
}

async function openWorkshop(actor, button = null) {
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api?.weaponAugmentWorkshop?.open) {
    ui.notifications?.error("Atelier d’armes de chasse indisponible.");
    return;
  }

  if (button) button.disabled = true;
  try {
    await api.weaponAugmentWorkshop.open(actor);
  } catch (error) {
    console.error(`${MODULE_ID} | unable to open hunt weapon workshop`, error);
    ui.notifications?.error(
      `Atelier d’armes de chasse : ${error?.message ?? "erreur inconnue"}`,
    );
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function buildLauncher(actor) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${BUTTON_CLASS} header-control`;
  button.dataset.tooltip = "Atelier d’armes de chasse";
  button.setAttribute("aria-label", "Atelier d’armes de chasse");
  button.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i><span>Atelier d’armes de chasse</span>';

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openWorkshop(actor, button);
  });

  return button;
}

export function injectArtificerWorkshopLauncher(app, html) {
  const actor = app?.document ?? app?.object ?? null;
  const eligibility = artificerWorkshopLauncherEligibility(actor);
  if (!eligibility.green) return eligibility;

  const root = sheetRoot(app, html);
  if (!root) return { green: false, reason: "sheet-root-unavailable" };

  if (root.querySelector?.(`.${BUTTON_CLASS}`)) {
    return { green: true, reason: "already-present" };
  }

  const button = buildLauncher(actor);
  const header = headerTarget(root);

  if (header) {
    const close = header.querySelector?.('[data-action="close"], .close');
    if (close?.parentElement === header) header.insertBefore(button, close);
    else header.append(button);
  } else {
    const target = fallbackTarget(root);
    button.classList.add("dct-artificer-workshop-launcher-fallback");
    target.prepend(button);
  }

  return { green: true, reason: "injected", actorUuid: actor.uuid };
}

export function injectHuntArtisanCardWorkshopLauncher(app, html) {
  const item = app?.document ?? app?.object ?? null;
  const eligibility = huntArtisanCardLauncherEligibility(item);
  if (!eligibility.green) return eligibility;

  const root = sheetRoot(app, html);
  if (!root) return { green: false, reason: "sheet-root-unavailable" };

  if (root.querySelector?.(`.${BUTTON_CLASS}`)) {
    return { green: true, reason: "already-present" };
  }

  const button = buildLauncher(eligibility.actor);
  button.dataset.tooltip = "Ouvrir l’Atelier d’armes de chasse";
  button.setAttribute("aria-label", "Ouvrir l’Atelier d’armes de chasse");

  const header = headerTarget(root);
  if (header) {
    const close = header.querySelector?.('[data-action="close"], .close');
    if (close?.parentElement === header) header.insertBefore(button, close);
    else header.append(button);
  } else {
    fallbackTarget(root).prepend(button);
  }

  return { green: true, reason: "injected", actorUuid: eligibility.actor.uuid, itemUuid: item.uuid };
}

function actorFromChatMessage(message, item = null) {
  const parent = item?.parent;
  if (parent?.documentName === "Actor" && parent.type === "character") return parent;

  const actorRef = message?.system?.actor;
  if (typeof actorRef === "string") {
    const actorId = actorRef.startsWith("Actor.") ? actorRef.slice(6) : actorRef;
    const actor = game.actors?.get?.(actorId);
    if (actor?.type === "character") return actor;
  }

  const speakerId = message?.speaker?.actor;
  const speakerActor = speakerId ? game.actors?.get?.(speakerId) : null;
  return speakerActor?.type === "character" ? speakerActor : null;
}

export function huntArtisanChatMessageContext(message, user = globalThis.game?.user) {
  const item = message?.system?.item ?? null;
  if (!isHuntArtisanCard(item)) {
    return { green: false, reason: "message-not-hunt-artisan" };
  }

  const actor = actorFromChatMessage(message, item);
  if (!actor) return { green: false, reason: "chat-actor-not-found" };
  if (!hasHuntArtisanCard(actor)) return { green: false, reason: "chat-actor-missing-artisan" };
  if (!(actor.isOwner || user?.isGM)) return { green: false, reason: "actor-not-owned" };

  return { green: true, reason: "ok", actor, item };
}

export function injectHuntArtisanChatWorkshopLauncher(message, html) {
  const context = huntArtisanChatMessageContext(message);
  if (!context.green) return context;

  const root = chatRoot(html);
  if (!root) return { green: false, reason: "chat-root-unavailable" };
  if (root.querySelector?.(`.${CHAT_BUTTON_CLASS}`)) {
    return { green: true, reason: "already-present" };
  }

  const target = root.querySelector?.(".message-content") ?? root;
  const wrapper = document.createElement("div");
  wrapper.className = `${CHAT_BUTTON_CLASS}-wrapper`;
  wrapper.style.marginTop = ".5rem";

  const button = document.createElement("button");
  button.type = "button";
  button.className = CHAT_BUTTON_CLASS;
  button.dataset.action = "open-hunt-weapon-workshop";
  button.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> Atelier d’armes de chasse';
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openWorkshop(context.actor, button);
  });

  wrapper.append(button);
  target.append(wrapper);
  return { green: true, reason: "injected", actorUuid: context.actor.uuid };
}

export function registerArtificerWorkshopLauncher() {
  Hooks.on("renderActorSheet", (app, html) => {
    try { injectArtificerWorkshopLauncher(app, html); }
    catch (error) { console.warn(`${MODULE_ID} | actor workshop launcher failed`, error); }
  });

  Hooks.on("renderItemSheet", (app, html) => {
    try { injectHuntArtisanCardWorkshopLauncher(app, html); }
    catch (error) { console.warn(`${MODULE_ID} | Artisant card workshop launcher failed`, error); }
  });

  const renderChat = (message, html) => {
    try { injectHuntArtisanChatWorkshopLauncher(message, html); }
    catch (error) { console.warn(`${MODULE_ID} | Artisant chat workshop launcher failed`, error); }
  };
  Hooks.on("renderChatMessage", renderChat);
  Hooks.on("renderChatMessageHTML", renderChat);

  return Object.freeze({
    green: true,
    hooks: ["renderActorSheet", "renderItemSheet", "renderChatMessage", "renderChatMessageHTML"],
  });
}

export const artificerWorkshopLauncherApi = Object.freeze({
  eligibility: artificerWorkshopLauncherEligibility,
  cardEligibility: huntArtisanCardLauncherEligibility,
  chatEligibility: huntArtisanChatMessageContext,
  inject: injectArtificerWorkshopLauncher,
  injectCard: injectHuntArtisanCardWorkshopLauncher,
  injectChat: injectHuntArtisanChatWorkshopLauncher,
  register: registerArtificerWorkshopLauncher,
});
