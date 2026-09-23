const MODULE_ID = "daggerheart-campaign-toolkit";

function selectedActor() {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0]?.actor ?? null;
  if (controlled.length > 1) {
    ui.notifications.warn("Expédition : sélectionne un seul token.");
    return null;
  }

  const actor = game.user?.character ?? null;
  if (actor) return actor;

  ui.notifications.warn("Expédition : sélectionne un token ou assigne un personnage à ton utilisateur.");
  return null;
}

function chooseManifestSummary(summaries = []) {
  if (!summaries.length) return null;
  if (summaries.length === 1) return summaries[0];

  const inSession = summaries.filter((entry) => entry.phase === "in_session");
  if (inSession.length === 1) return inSession[0];

  return null;
}

export function createExpeditionCommandsApi({ persistenceApi, lifecycleApi, openManifest } = {}) {
  async function open() {
    const summaries = persistenceApi.list();
    const selected = chooseManifestSummary(summaries);

    if (!selected) {
      if (!summaries.length) {
        ui.notifications.warn("Expédition : aucun manifeste sauvegardé.");
      } else {
        ui.notifications.warn("Expédition : plusieurs manifestes sont disponibles. Aucun manifeste actif unique n'est identifiable.");
      }
      return { opened: false, reason: summaries.length ? "ambiguous-manifest" : "no-manifest" };
    }

    const manifest = await persistenceApi.load(selected.expeditionId);
    if (!manifest) {
      ui.notifications.error(`Expédition : manifeste introuvable (${selected.expeditionId}).`);
      return { opened: false, reason: "manifest-not-found", expeditionId: selected.expeditionId };
    }

    await openManifest(manifest);
    return { opened: true, expeditionId: manifest.expeditionId };
  }

  async function pack() {
    const actor = selectedActor();
    if (!actor) return { opened: false, reason: "no-actor" };

    const actorUuid = actor.uuid;
    const summaries = persistenceApi.list();
    const matches = [];

    for (const summary of summaries) {
      const manifest = await persistenceApi.load(summary.expeditionId);
      if (!manifest) continue;

      const containers = (manifest.containers ?? []).filter((container) =>
        container.scope === "personal"
        && container.holderRef?.kind === "character"
        && container.holderRef?.foundryActorUuid === actorUuid
      );

      for (const container of containers) {
        matches.push({ manifest, container });
      }
    }

    if (!matches.length) {
      ui.notifications.warn(`Expédition : aucun paquetage personnel lié à ${actor.name}.`);
      return { opened: false, reason: "no-bound-container", actorUuid };
    }

    if (matches.length > 1) {
      const inSession = matches.filter(({ manifest }) => manifest.phase === "in_session");
      if (inSession.length === 1) {
        const [{ manifest, container }] = inSession;
        await openManifest(manifest, container.containerId);
        return { opened: true, expeditionId: manifest.expeditionId, containerId: container.containerId, actorUuid };
      }

      ui.notifications.warn(`Expédition : plusieurs paquetages sont liés à ${actor.name}.`);
      return { opened: false, reason: "ambiguous-container", actorUuid };
    }

    const [{ manifest, container }] = matches;
    await openManifest(manifest, container.containerId);
    return { opened: true, expeditionId: manifest.expeditionId, containerId: container.containerId, actorUuid };
  }

  async function loadSelectedManifest() {
    const summaries = persistenceApi.list();
    const selected = chooseManifestSummary(summaries);
    if (!selected) {
      if (!summaries.length) ui.notifications.warn("Expédition : aucun manifeste sauvegardé.");
      else ui.notifications.warn("Expédition : plusieurs manifestes sont disponibles. Aucun manifeste actif unique n'est identifiable.");
      return null;
    }
    return persistenceApi.load(selected.expeditionId);
  }

  async function start() {
    const manifest = await loadSelectedManifest();
    if (!manifest) return { changed: false, reason: "manifest-not-selected" };

    const result = await lifecycleApi.start(manifest);
    if (!result.changed) {
      ui.notifications.warn(`Expédition : démarrage refusé (${result.reason}).`);
      return result;
    }

    ui.notifications.info("Expédition : autorité transférée à Foundry.");
    await openManifest(manifest);
    return result;
  }

  async function returnToWeb() {
    const manifest = await loadSelectedManifest();
    if (!manifest) return { changed: false, reason: "manifest-not-selected" };

    const result = await lifecycleApi.returnToWeb(manifest);
    if (!result.changed) {
      ui.notifications.warn(`Expédition : retour refusé (${result.reason}).`);
      return result;
    }

    ui.notifications.info("Expédition : état de retour prêt pour le Web.");
    await openManifest(manifest);
    return result;
  }

  return Object.freeze({ version: 2, open, pack, start, returnToWeb });
}

export const expeditionMacroDefinitions = Object.freeze([
  Object.freeze({
    name: "Expédition — Ouvrir",
    command: `await game.modules.get("${MODULE_ID}").api.expeditionCommands.open();`,
  }),
  Object.freeze({
    name: "Expédition — Paquetage",
    command: `await game.modules.get("${MODULE_ID}").api.expeditionCommands.pack();`,
  }),
  Object.freeze({
    name: "Expédition — Charger",
    command: `await game.modules.get("${MODULE_ID}").api.expeditionCommands.start();`,
  }),
  Object.freeze({
    name: "Expédition — Retour",
    command: `await game.modules.get("${MODULE_ID}").api.expeditionCommands.returnToWeb();`,
  }),
]);
