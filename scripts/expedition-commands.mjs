import { exportExpeditionTransfer, importExpeditionTransfer } from "./expedition-transfer-ui.mjs";
import { createEmptyExpeditionManifest } from "./expedition-manifest.mjs";

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

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function requireGm() {
  if (!game.user?.isGM) throw new Error("Action réservée au MJ.");
}

export function createExpeditionCommandsApi({ persistenceApi, lifecycleApi, openManifest } = {}) {
  async function createExpedition() {
    requireGm();
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2?.prompt) throw new Error("DialogV2 indisponible.");
    const input = await DialogV2.prompt({
      window: { title: "Créer une expédition" },
      content: `<div class="form-group"><label>Identifiant unique de l'expédition</label>
        <input type="text" name="dhct-new-expedition-id" required maxlength="80" placeholder="nouvelle-expedition" />
        <p class="hint">Lettres minuscules, chiffres et tirets. Cet identifiant servira aux transferts JSON.</p></div>`,
      ok: { label: "Créer", callback: (_event, button, dialog) =>
        (button?.form ?? dialog?.element)?.querySelector('[name="dhct-new-expedition-id"]')?.value?.trim() ?? "" },
      rejectClose: false,
    });
    if (input == null) return { created: false, reason: "cancelled" };
    const expeditionId = String(input).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expeditionId) || expeditionId.length > 80) {
      ui.notifications.warn("Identifiant invalide : utiliser des lettres minuscules, chiffres et tirets (80 caractères maximum).");
      return { created: false, reason: "invalid-id" };
    }
    if (await persistenceApi.load(expeditionId)) {
      ui.notifications.warn(`Expédition déjà existante : ${expeditionId}`);
      return { created: false, reason: "already-exists" };
    }
    const manifest = createEmptyExpeditionManifest({ expeditionId });
    await persistenceApi.save(manifest);
    ui.notifications.info(`Expédition créée : ${expeditionId}`);
    await openManifest(manifest);
    return { created: true, expeditionId };
  }

  async function deleteExpedition(expeditionId) {
    requireGm();
    const manifest = await persistenceApi.load(expeditionId);
    if (!manifest) return { removed: false, reason: "not-found" };
    if (manifest.phase === "in_session" || manifest.authority === "foundry") {
      ui.notifications.error("Suppression interdite : expédition en session ou sous autorité Foundry.");
      return { removed: false, reason: "active-expedition" };
    }
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2?.prompt) throw new Error("DialogV2 indisponible.");
    const typed = await DialogV2.prompt({
      window: { title: `Supprimer l'expédition ${expeditionId}` },
      content: `<p><strong>Suppression définitive du manifeste ${escapeHtml(expeditionId)}.</strong></p>
        <p>Les inventaires, la caravane et les associations de personnages enregistrés dans ce manifeste seront supprimés. Les données globales du monde ne sont pas effacées.</p>
        <p>Exporte d'abord une sauvegarde si nécessaire. Pour confirmer, saisis exactement l'identifiant :</p>
        <div class="form-group"><input type="text" name="dhct-delete-confirm" autocomplete="off" /></div>`,
      ok: { label: "Confirmer la suppression", callback: (_event, button, dialog) =>
        (button?.form ?? dialog?.element)?.querySelector('[name="dhct-delete-confirm"]')?.value ?? "" },
      rejectClose: false,
    });
    if (typed !== expeditionId) {
      if (typed != null) ui.notifications.warn("Suppression annulée : identifiant non confirmé.");
      return { removed: false, reason: "not-confirmed" };
    }
    // Relire après confirmation pour éviter de supprimer une expédition devenue active.
    const current = await persistenceApi.load(expeditionId);
    if (!current || current.phase === "in_session" || current.authority === "foundry" || current.revision !== manifest.revision) {
      ui.notifications.error("Suppression bloquée : l'expédition a changé depuis la confirmation.");
      return { removed: false, reason: "state-changed" };
    }
    const result = await persistenceApi.remove(expeditionId);
    if (result.removed) ui.notifications.info(`Expédition supprimée : ${expeditionId}`);
    return result;
  }

  async function open() {
    const summaries = persistenceApi.list();
    let selected = chooseManifestSummary(summaries);

    if (summaries.length > 0) {
      const DialogV2 = foundry?.applications?.api?.DialogV2;
      if (!DialogV2?.prompt) {
        throw new Error("DialogV2 indisponible pour la sélection d'expédition.");
      }

      const options = summaries.map((entry) => {
        const id = escapeHtml(entry.expeditionId);
        return `<option value="${id}">${id} — révision ${escapeHtml(entry.revision ?? "?")}</option>`;
      }).join("");

      const selection = await DialogV2.prompt({
        window: { title: "Choisir une expédition" },
        content: `
          <div class="form-group">
            <label>Expédition disponible</label>
            <select name="dhct-expedition-choice">${options}</select>
          </div>
          ${game.user?.isGM ? `<div class="form-group"><label>Échange avec le Web</label>
            <select name="dhct-expedition-action">
              <option value="open">Ouvrir l'expédition</option>
              <option value="export">Exporter l'expédition (JSON)</option>
              <option value="import">Importer l'expédition (JSON)</option>
              <option value="create">Créer une expédition</option>
              <option value="delete">Supprimer l'expédition</option>
            </select></div>` : ""}`,
        ok: {
          label: "Continuer",
          callback: (_event, button, dialog) => {
            const root = button?.form ?? dialog?.element;
            return {
              id: root?.querySelector('[name="dhct-expedition-choice"]')?.value ?? null,
              action: root?.querySelector('[name="dhct-expedition-action"]')?.value ?? "open",
            };
          },
        },
        rejectClose: false,
      });
      const selectedId = selection?.id;
      if (selectedId && selection.action !== "open") {
        if (!game.user?.isGM) throw new Error("Action réservée au MJ.");
        if (selection.action === "export") await exportExpeditionTransfer(selectedId);
        else if (selection.action === "import") await importExpeditionTransfer(selectedId);
        else if (selection.action === "create") return await createExpedition();
        else if (selection.action === "delete") return await deleteExpedition(selectedId);
        return { opened: false, action: selection.action, expeditionId: selectedId };
      }

      if (!selectedId) {
        return { opened: false, reason: "selection-cancelled" };
      }

      selected = summaries.find(
        (entry) => entry.expeditionId === selectedId
      ) ?? null;
    }

    if (!selected) {
      if (game.user?.isGM && summaries.length === 0) return await createExpedition();
      ui.notifications.warn("Expédition : aucun manifeste sauvegardé.");
      return { opened: false, reason: "no-manifest" };
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

  return Object.freeze({ version: 3, open, createExpedition, deleteExpedition, pack, start, returnToWeb });
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
