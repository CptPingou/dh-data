const MODULE_ID = "daggerheart-campaign-toolkit";
const ARTIFICER_CLASS_SOURCE_ID = "homebrew.artificer.class.artificer";
export const HUNT_ARTISAN_CARD_SOURCE_ID = "monster-hunter.hunt.MHARTISANT000001";

function toolkitApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function isArtificer(actor) {
  if (!actor || actor.documentName !== "Actor") return false;

  return actor.items.some((item) => {
    if (item.type !== "class") return false;

    return (
      item.flags?.[MODULE_ID]?.sourceId === ARTIFICER_CLASS_SOURCE_ID
    );
  });
}

export function isHuntArtisanCard(item) {
  if (!item || item.documentName === "Actor" || item.type !== "domainCard") return false;

  const flags = item.flags?.[MODULE_ID] ?? {};
  return (
    flags.canonicalSourceId === HUNT_ARTISAN_CARD_SOURCE_ID ||
    flags.sourceId === HUNT_ARTISAN_CARD_SOURCE_ID ||
    (item.id ?? item._id) === "MHARTISANT000001"
  );
}

export function hasHuntArtisanCard(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") return false;
  return actor.items.some((item) => isHuntArtisanCard(item));
}

function weaponState(api, weapon) {
  return api?.weaponAugmentState?.get?.(weapon) ?? null;
}

function craftedIds(state) {
  return new Set(
    Array.isArray(state?.state?.crafted)
      ? state.state.crafted
      : [],
  );
}

function installedIds(state) {
  return new Set(
    Array.isArray(state?.state?.installed)
      ? state.state.installed
      : [],
  );
}

function requiredTier(augment) {
  return augment?.precompile?.primitive === "tier"
    ? Number(augment.precompile.minimum ?? 1)
    : 1;
}

function propertyLabel(propertyId, propertyLabels = new Map()) {
  return propertyLabels.get(propertyId) ?? propertyId;
}

function recipeRequirementLabel(requirement, propertyLabels = new Map()) {
  const units = Number(requirement?.units ?? requirement?.value ?? 0);
  const match = requirement?.match ?? {};

  if (typeof match.property === "string" && match.property) {
    return `${propertyLabel(match.property, propertyLabels)} : ${units}`;
  }

  if (typeof match.materialId === "string" && match.materialId) {
    return `${match.materialId} : ${units}`;
  }

  if (typeof match.family === "string" && match.family) {
    const quality = Number(match.minimumQuality);
    return Number.isFinite(quality)
      ? `${match.family} (qualité ≥ ${quality}) : ${units}`
      : `${match.family} : ${units}`;
  }

  return `${requirement?.id ?? "besoin"} : ${units}`;
}

function recipeLabel(recipe, propertyLabels = new Map()) {
  if (!Array.isArray(recipe?.requirements) || recipe.requirements.length === 0) {
    return "";
  }

  return recipe.requirements
    .map((requirement) => recipeRequirementLabel(requirement, propertyLabels))
    .join(" · ");
}

function workshopFailureLabel(response) {
  if (response?.reason === "insufficient-materials") {
    return "Matériaux biologiques insuffisants";
  }

  if (
    response?.reason ===
    "fob-storage-unavailable"
  ) {
    return "Zone de d?p?t FOB indisponible";
  }

  return response?.reason ?? "raison inconnue";
}

export function listHuntWeapons({
  crafter = null,
  api = toolkitApi(),
} = {}) {
  if (!crafter || crafter.documentName !== "Actor") {
    return {
      green: false,
      reason: "crafter-required",
      crafter: null,
      weapons: [],
    };
  }

  if (!hasHuntArtisanCard(crafter)) {
    return {
      green: false,
      reason: "crafter-missing-hunt-artisan-card",
      crafter: crafter.uuid,
      weapons: [],
    };
  }

  if (!api?.weaponAugmentState?.get) {
    return {
      green: false,
      reason: "weapon-augment-api-unavailable",
      crafter: crafter.uuid,
      weapons: [],
    };
  }

  const weapons = [];

  for (const actor of game.actors ?? []) {
    for (const weapon of actor.items.filter(
      (item) => item.type === "weapon",
    )) {
      const state = weaponState(api, weapon);

      if (!state?.green || !state?.initialized) continue;

      weapons.push({
        actorId: actor.id,
        actorUuid: actor.uuid,
        actorName: actor.name,

        weaponId: weapon.id,
        weaponUuid: weapon.uuid,
        weaponName: weapon.name,

        slots: Number(state.slots ?? 0),
        availableSlots: Number(state.availableSlots ?? 0),
        craftedCount: Number(state.craftedCount ?? 0),
        installedCount: Number(state.installedCount ?? 0),

        ownedByCurrentUser: Boolean(actor.isOwner),
      });
    }
  }

  weapons.sort((a, b) => {
    const actorCompare = a.actorName.localeCompare(
      b.actorName,
      game.i18n?.lang ?? "fr",
    );

    if (actorCompare !== 0) return actorCompare;

    return a.weaponName.localeCompare(
      b.weaponName,
      game.i18n?.lang ?? "fr",
    );
  });

  return {
    green: true,
    reason: "ok",
    crafter: crafter.uuid,
    weapons,
  };
}

function weaponRow(entry) {
  const ownership = entry.ownedByCurrentUser
    ? `<span style="opacity:.65;font-size:.85em">Votre personnage</span>`
    : `<span style="opacity:.65;font-size:.85em">Autre personnage</span>`;

  return `
    <div
      class="dct-hunt-weapon-row"
      style="
        display:grid;
        grid-template-columns:1fr auto;
        gap:.75rem;
        align-items:center;
        padding:.55rem 0;
        border-bottom:1px solid var(--color-border-light-2);
      "
    >
      <div>
        <strong>${escapeHtml(entry.weaponName)}</strong>

        <div style="opacity:.8">
          ${escapeHtml(entry.actorName)}
        </div>

        <div style="opacity:.7;font-size:.85em">
          ${entry.installedCount}/${entry.slots} emplacements utilisés
          · ${entry.craftedCount} augmentation(s) fabriquée(s)
        </div>

        ${ownership}
      </div>

      <button
        type="button"
        data-dct-hunt-weapon="${escapeHtml(entry.weaponUuid)}"
      >
        Sélectionner
      </button>
    </div>
  `;
}

function workshopContent(crafter, result) {
  const rows = result.weapons.map(weaponRow).join("");

  return `
    <div class="dct-hunt-weapon-workshop">
      <p>
        <strong>Artisan :</strong>
        ${escapeHtml(crafter.name)}
      </p>

      <p style="opacity:.8">
        Sélectionnez une arme de chasse déjà initialisée.
      </p>

      <div class="dct-hunt-weapon-list">
        ${rows || "<p>Aucune arme de chasse disponible.</p>"}
      </div>
    </div>
  `;
}

function augmentRow({
  augment,
  crafted,
  installed,
  biologicalRecipe = null,
  propertyLabels = new Map(),
  expeditionAvailable = false,
  queuedEntry = null,
}) {
  let action = "craft";
  let label = "Fabriquer";

  if (installed) {
    action = "uninstall";
    label = "Désinstaller";
  } else if (crafted) {
    action = "install";
    label = "Installer";
  }

  const queued =
    Boolean(queuedEntry);

  const queueProgress =
    queued
      ? `${queuedEntry.progress}/${queuedEntry.turnsRequired}`
      : null;

  const queueReady =
    queued &&
    Number(queuedEntry.progress) >=
      Number(queuedEntry.turnsRequired);

  const status =
    installed
      ? "Installé"
      : crafted
        ? "Fabriqué"
        : queued
          ? queueReady
            ? "Prêt à finaliser"
            : `En fabrication · ${queueProgress} tour(s)`
          : "À fabriquer";

  const tier =
    requiredTier(augment);

  const craftBlocked =
    action === "craft" &&
    (
      queued ||
      !biologicalRecipe ||
      !expeditionAvailable
    );

  if (
    action === "craft" &&
    queued
  ) {
    label =
      queueReady
        ? "Prêt à finaliser"
        : `En fabrication ${queueProgress}`;
  }

  if (
    action === "craft" &&
    !queued &&
    !biologicalRecipe
  ) {
    label =
      "Recette à migrer";
  }

  if (
    action === "craft" &&
    !queued &&
    biologicalRecipe &&
    !expeditionAvailable
  ) {
    label =
      "Expédition requise";
  }

  if (
    action === "craft" &&
    !queued &&
    biologicalRecipe &&
    expeditionAvailable
  ) {
    label =
      "Mettre en fabrication";
  }

  return `
    <div
      class="dct-hunt-augment-row"
      style="
        display:grid;
        grid-template-columns:1fr auto;
        gap:.75rem;
        align-items:center;
        padding:.65rem 0;
        border-bottom:1px solid var(--color-border-light-2);
      "
    >
      <div>
        <div>
          <strong>${escapeHtml(augment.name)}</strong>

          <span style="opacity:.65;font-size:.85em">
            — Tier ${tier}
          </span>
        </div>

        <div style="margin-top:.2rem">
          ${escapeHtml(augment.description)}
        </div>

        <div style="opacity:.65;font-size:.85em;margin-top:.2rem">
          ${escapeHtml(recipeLabel(biologicalRecipe, propertyLabels))}
        </div>

        <div style="opacity:.8;font-size:.85em;margin-top:.2rem">
          ${status}
        </div>
      </div>

      <button
        type="button"
        data-dct-augment-action="${action}"
        data-dct-augment-id="${escapeHtml(augment.id)}"
        ${craftBlocked ? "disabled" : ""}
      >
        ${label}
      </button>
    </div>
  `;
}

async function renderAugmentManager({
  crafter,
  weapon,
  api,
}) {
  const state = api.weaponAugmentState.get(weapon);
  const augments = await api.weaponAugments.list();
  const expeditions = await api.expeditionManifest?.list?.() ?? [];
  const expeditionOptions = expeditions
    .map((entry) => {
      const id = String(entry?.expeditionId ?? "").trim();
      if (!id) return "";
      const phase = entry?.phase ? ` — ${entry.phase}` : "";
      return `<option value="${escapeHtml(id)}">${escapeHtml(id + phase)}</option>`;
    })
    .filter(Boolean)
    .join("");

  const crafted = craftedIds(state);
  const installed = installedIds(state);

  const craftQueue =
    api.craftingCraftQueue
      ?.status?.()
      ?.queue ?? [];

  const propertyCatalog = await api.craftingMaterials?.loadProperties?.() ?? null;
  const propertyEntries = Array.isArray(propertyCatalog?.properties)
    ? propertyCatalog.properties
    : Array.isArray(propertyCatalog)
      ? propertyCatalog
      : [];

  const propertyLabels = new Map(
    propertyEntries
      .filter((entry) => entry?.id)
      .map((entry) => [
        entry.id,
        entry.label ?? entry.name ?? entry.id,
      ]),
  );

  const recipePairs = await Promise.all(
    augments.map(async (augment) => [
      augment.id,
      await api.crafting?.recipeForOutput?.("weaponAugment", augment.id) ?? null,
    ]),
  );
  const recipes = new Map(recipePairs);

  const rows = augments
    .map((augment) =>
      augmentRow({
        augment,
        crafted: crafted.has(augment.id),
        installed: installed.has(augment.id),
        biologicalRecipe: recipes.get(augment.id),
        propertyLabels,
        expeditionAvailable: Boolean(expeditionOptions),

        queuedEntry:
          craftQueue.find(
            (entry) =>
              entry.actorUuid === crafter.uuid &&
              entry.weaponUuid === weapon.uuid &&
              entry.augmentId === augment.id
          ) ?? null,
      }),
    )
    .join("");

  return `
    <div
      class="dct-hunt-augment-manager"
      data-weapon-uuid="${escapeHtml(weapon.uuid)}"
    >
      <p>
        <strong>${escapeHtml(weapon.name)}</strong>
        —
        ${escapeHtml(weapon.parent?.name ?? "Personnage")}
      </p>

      <p>
        <strong>Artisan :</strong>
        ${escapeHtml(crafter.name)}
      </p>

      <p style="opacity:.8">
        Emplacements :
        ${state.installedCount}/${state.slots} utilisés
        ·
        ${state.availableSlots} disponible(s)
      </p>

      <p>
        <label>
          <strong>Expédition de craft :</strong>
          <select data-dct-crafting-expedition ${expeditionOptions ? "" : "disabled"}>
            ${expeditionOptions || '<option value="">Aucune expédition disponible</option>'}
          </select>
        </label>
        <span style="opacity:.65;font-size:.85em"> · stock : d?p?t FOB</span>
      </p>

      <p>
        <button
          type="button"
          data-dct-workshop-back
        >
          ← Choisir une autre arme
        </button>
      </p>

      <div>
        ${rows || "<p>Aucune augmentation disponible.</p>"}
      </div>
    </div>
  `;
}

export async function openHuntWeaponWorkshop(crafter) {
  const api = toolkitApi();

  const result = listHuntWeapons({
    crafter,
    api,
  });

  if (!result.green) {
    ui.notifications?.warn(
      `Atelier d'armes de chasse : ${result.reason}`,
    );

    return result;
  }

  if (
    !api?.weaponAugments?.list
    || !api?.weaponAugmentAuthority?.request
  ) {
    throw new Error(
      "Campaign Toolkit | Weapon Augment APIs unavailable",
    );
  }

  const DialogV2 = foundry?.applications?.api?.DialogV2;

  if (!DialogV2) {
    throw new Error(
      "Campaign Toolkit | DialogV2 unavailable",
    );
  }

  const dialog = new DialogV2({
    window: {
      title: `Atelier d'armes de chasse — ${crafter.name}`,
    },

    content: workshopContent(crafter, result),

    buttons: [
      {
        action: "close",
        label: "Fermer",
        default: true,
      },
    ],
  });

  await dialog.render(true);

  const element = dialog.element;


  // P2.12l.4 workshop vertical scroll
  const workshopBody =
    element?.querySelector?.(
      ".window-content"
    );

  if (workshopBody instanceof HTMLElement) {
    workshopBody.style.overflowX =
      "hidden";
    workshopBody.style.overflowY =
      "auto";
    workshopBody.style.scrollbarGutter =
      "stable";
    workshopBody.style.maxHeight =
      "min(72vh, 760px)";
  }

if (!element) return dialog;

  let selectedWeapon = null;

  const showWeaponList = () => {
    const body = element.querySelector(".window-content");

    if (body) {
      body.innerHTML = workshopContent(crafter, result);
    }

    selectedWeapon = null;
  };

  const showAugments = async (weapon) => {
    const body = element.querySelector(".window-content");

    if (!body) return;

    body.innerHTML = await renderAugmentManager({
      crafter,
      weapon,
      api,
    });

    selectedWeapon = weapon;
  };

  element.addEventListener("click", async (event) => {
    const backButton = event.target.closest?.(
      "[data-dct-workshop-back]",
    );

    if (backButton) {
      showWeaponList();
      return;
    }

    const weaponButton = event.target.closest?.(
      "[data-dct-hunt-weapon]",
    );

    if (weaponButton) {
      const weapon = await fromUuid(
        weaponButton.dataset.dctHuntWeapon,
      );

      if (!weapon) {
        ui.notifications?.warn(
          "Arme de chasse introuvable.",
        );
        return;
      }

      await showAugments(weapon);
      return;
    }

    const augmentButton = event.target.closest?.(
      "[data-dct-augment-action]",
    );

    if (!augmentButton || !selectedWeapon) return;

    const operation =
      augmentButton.dataset.dctAugmentAction;

    const augmentId =
      augmentButton.dataset.dctAugmentId;

    augmentButton.disabled = true;

    try {
      const expeditionId = operation === "craft"
        ? element.querySelector("[data-dct-crafting-expedition]")?.value ?? null
        : null;

      let response;

      if (
        operation === "craft"
      ) {
        if (
          !api.craftingCraftQueue?.enqueue
        ) {
          response = {
            green: false,
            reason:
              "craft-queue-unavailable",
          };
        } else {
          response =
            await api.craftingCraftQueue
              .enqueue({
                actor:
                  crafter,

                weapon:
                  selectedWeapon,

                augmentId,

                expeditionId,
              });
        }
      } else {
        response =
          await api.weaponAugmentAuthority
            .request({
              crafter,
              weapon:
                selectedWeapon,
              operation,
              augmentId,
              expeditionId,
            });
      }

      console.info(
        `${MODULE_ID} | Hunt weapon workshop`,
        response,
      );

      if (!response?.green) {
        ui.notifications?.warn(
          `Modification impossible : ${workshopFailureLabel(response)}`,
        );
        return;
      }

      await showAugments(selectedWeapon);
    } catch (error) {
      console.error(
        `${MODULE_ID} | Hunt weapon workshop failed`,
        error,
      );

      ui.notifications?.error(
        `Atelier d'armes de chasse : ${error.message}`,
      );
    } finally {
      if (augmentButton.isConnected) {
        augmentButton.disabled = false;
      }
    }
  });

  return dialog;
}

export const weaponAugmentWorkshopApi = Object.freeze({
  list: listHuntWeapons,
  open: openHuntWeaponWorkshop,
});
