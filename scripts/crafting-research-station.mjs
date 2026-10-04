const MODULE_ID = "daggerheart-campaign-toolkit";

const activeResearchStationRefreshers =
  new Set();

let researchKnowledgeRefreshHookInstalled =
  false;

function installResearchKnowledgeRefreshHook() {
  if (
    researchKnowledgeRefreshHookInstalled ||
    !globalThis.Hooks?.on
  ) {
    return;
  }

  researchKnowledgeRefreshHookInstalled =
    true;

  globalThis.Hooks.on(
    "updateSetting",
    (setting) => {
      const key =
        String(
          setting?.key ??
          setting?._source?.key ??
          ""
        );

      if (
        key !==
        MODULE_ID +
          ".materialKnowledge"
      ) {
        return;
      }

      for (
        const refresh
        of [
          ...activeResearchStationRefreshers
        ]
      ) {
        Promise.resolve(
          refresh()
        ).catch(
          (error) => {
            console.error(
              MODULE_ID +
                " | research station live refresh failed",
              error
            );
          }
        );
      }
    }
  );
}


function esc(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function materialData(entry) { return entry?.itemRef?.snapshot?.flags?.[MODULE_ID]?.material ?? null; }
export function isEligibleResearchActor(actor, user = game.user) {
  return Boolean(
    actor?.documentName === "Actor" &&
    actor?.type === "character" &&
    actor.testUserPermission?.(user, "OWNER") === true
  );
}

export function listOwnedResearchActors(user = game.user) {
  return [...(game.actors ?? [])].filter((actor) => isEligibleResearchActor(actor, user));
}

export async function buildResearchStationModel({
  api,
  actor,
  expeditionId,
} = {}) {
  if (
    !api?.expeditionManifest?.load ||
    !api?.craftingMaterials?.get ||
    !api?.craftingKnowledge?.propertyStatus ||
    !api?.craftingKnowledge?.setPropertyStatus ||
    !api?.crafting?.resolveFobCraftContainerId
  ) {
    return {
      green: false,
      reason:
        "research-station-api-unavailable",
    };
  }
  if (!actor?.uuid) return { green:false, reason:"research-actor-required" };
  const manifest = await api.expeditionManifest.load(expeditionId);
  if (!manifest) return { green:false, reason:"expedition-not-found" };
  const containerId =
    api.crafting
      .resolveFobCraftContainerId(
        manifest
      );

  if (!containerId) {
    return {
      green: false,
      reason:
        "fob-storage-unavailable",
    };
  }

  const container =
    manifest.containers?.find(
      (candidate) =>
        candidate.containerId ===
        containerId
    ) ??
    null;

  if (!container) {
    return {
      green: false,
      reason:
        "fob-storage-unavailable",
    };
  }

  const byMaterial = new Map();
  for (const entry of container.contents ?? []) {
    const data = materialData(entry);
    const materialId = data?.materialId ?? entry?.itemRef?.sourceId ?? null;
    const quantity = Number(entry?.quantity) || 0;
    if (!materialId || quantity <= 0 || ["consumed","deleted"].includes(entry?.itemRef?.lifecycle?.state)) continue;
    byMaterial.set(materialId, (byMaterial.get(materialId) ?? 0) + quantity);
  }

  const materials = [];

  for (
    const [materialId, quantity]
    of byMaterial
  ) {
    const definition =
      await api.craftingMaterials
        .get(materialId);

    if (
      !definition
        ?.research
        ?.discoverable
    ) {
      continue;
    }

    const rawProperties =
      definition.material?.properties ?? {};

    const propertyIds =
      Array.isArray(rawProperties)
        ? rawProperties
        : Object.keys(rawProperties);

    const properties = [];

    for (
      let index = 0;
      index < propertyIds.length;
      index += 1
    ) {
      const propertyId =
        propertyIds[index];

      const status =
        api.craftingKnowledge
          .propertyStatus(
            actor,
            materialId,
            propertyId
          );

      if (
        !game.user?.isGM &&
        status === "invisible"
      ) {
        continue;
      }

      const propertyDefinition =
        await api.craftingMaterials
          .property?.(
            propertyId
          );

      const revealed =
        status === "discovered" ||
        status === "shared";

      properties.push({
        propertyId,

        value:
          Array.isArray(rawProperties)
            ? 1
            : Number(
                rawProperties[propertyId]
              ) || 0,

        label:
          revealed ||
          game.user?.isGM
            ? propertyDefinition?.label ??
              propertyId
            : "Propri\u00e9t\u00e9 inconnue " +
              String(index + 1),

        description:
          revealed
            ? propertyDefinition?.description ??
              ""
            : "",

        status,

        discovered:
          revealed,

        shared:
          status === "shared",
      });
    }

    materials.push({
      materialId,

      name:
        definition.name ??
        materialId,

      quantity,
      properties,
    });
  }

  materials.sort((a,b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "fr"));
  return { green:true, expeditionId, containerId, actorUuid:actor.uuid, materials };
}

function content(
  model,
  actors,
  actorId
) {
  const options =
    actors
      .map(
        (actor) =>
          '<option value="' +
          esc(actor.id) +
          '" ' +
          (
            actor.id === actorId
              ? "selected"
              : ""
          ) +
          ">" +
          esc(actor.name) +
          "</option>"
      )
      .join("");

  const statusLabels = {
    invisible:
      "Invisible",

    visible:
      "Visible",

    discovered:
      "D\u00e9couvert",

    shared:
      "Partag\u00e9",
  };

  const statusOptions =
    (current) =>
      Object.entries(
        statusLabels
      )
        .map(
          ([value, label]) =>
            '<option value="' +
            esc(value) +
            '" ' +
            (
              value === current
                ? "selected"
                : ""
            ) +
            ">" +
            esc(label) +
            "</option>"
        )
        .join("");

  const rows =
    model.materials
      .map(
        (material) => {
          const propertyRows =
            material.properties
              .map(
                (property) => {
                  const suffix =
                    property.status ===
                    "shared"
                      ? " \u00b7 partag\u00e9e"
                      : property.status ===
                        "discovered"
                        ? " \u00b7 d\u00e9couverte"
                        : property.status ===
                          "visible"
                          ? " \u00b7 indice"
                          : game.user?.isGM
                            ? " \u00b7 invisible"
                            : "";

                  const control =
                    game.user?.isGM
                      ? '<select ' +
                        'data-dct-knowledge-status ' +
                        'data-material-id="' +
                        esc(material.materialId) +
                        '" ' +
                        'data-property-id="' +
                        esc(property.propertyId) +
                        '" ' +
                        'aria-label="\u00c9tat de connaissance">' +
                        statusOptions(
                          property.status
                        ) +
                        "</select>"
                      : "";

                  return (
                    '<div style="' +
                    "display:grid;" +
                    "grid-template-columns:1fr auto;" +
                    "gap:.6rem;" +
                    "align-items:center;" +
                    "padding:.4rem 0;" +
                    "border-top:1px solid var(--color-border-light-2)" +
                    '">' +
                    "<span>" +
                    esc(property.label) +
                    suffix +
                    "</span>" +
                    control +
                    "</div>"
                  );
                }
              )
              .join("");

          return (
            '<section class="dct-research-material" style="' +
            "border:1px solid var(--color-border-light-2);" +
            "border-radius:6px;" +
            "padding:.65rem;" +
            "margin:.5rem 0" +
            '">' +
            '<header style="' +
            "display:flex;" +
            "justify-content:space-between;" +
            "gap:1rem" +
            '">' +
            "<strong>" +
            esc(material.name) +
            "</strong>" +
            "<span>\u00d7" +
            esc(material.quantity) +
            "</span>" +
            "</header>" +
            "<div>" +
            propertyRows +
            "</div>" +
            "</section>"
          );
        }
      )
      .join("");

  const gmHelp =
    game.user?.isGM
      ? " Le MJ contr\u00f4le directement leur \u00e9tat."
      : "";

  return (
    '<div class="dct-research-station">' +
    "<p><label><strong>Chercheur :</strong> " +
    '<select data-dct-research-actor>' +
    options +
    "</select>" +
    "</label></p>" +
    '<p style="opacity:.75">' +
    "Les propri\u00e9t\u00e9s visibles sont des indices encore " +
    "inexploitables. Les propri\u00e9t\u00e9s d\u00e9couvertes peuvent " +
    "\u00eatre utilis\u00e9es et parcourues dans la recherche." +
    gmHelp +
    "</p>" +
    '<div data-dct-research-materials>' +
    (
      rows ||
      "<p>Aucun mat\u00e9riau de recherche connu \u00e0 la FOB.</p>"
    ) +
    "</div>" +
    "</div>"
  );
}

export async function openCraftingResearchStation({
  expeditionId,
  actor = null,
} = {}) {
  const api = game.modules.get(MODULE_ID)?.api;
  const actors = listOwnedResearchActors();
  const preferredActor = actor ?? game.user?.character ?? null;
  const selectedActor = isEligibleResearchActor(preferredActor) ? preferredActor : (actors[0] ?? null);
  if (!selectedActor) return { green:false, reason:"no-owned-research-actor" };
  const model = await buildResearchStationModel({
    api,
    actor: selectedActor,
    expeditionId,
  });
  if (!model.green) return model;
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) throw new Error("Campaign Toolkit | DialogV2 unavailable");
  const dialog = new DialogV2({ window:{ title:"Station de recherche" }, content:content(model, actors, selectedActor.id), buttons:[{action:"close",label:"Fermer",default:true}] });
  await dialog.render(true);
  const root = dialog.element;
  if (!root) return dialog;

  const refresh = async () => {
    const actorId = root.querySelector("[data-dct-research-actor]")?.value;
    const currentActor = actors.find((candidate) => candidate.id === actorId) ?? selectedActor;
    const next = await buildResearchStationModel({
      api,
      actor: currentActor,
      expeditionId,
    });
    const body = root.querySelector(".window-content");
    if (body && next.green) body.innerHTML = content(next, actors, currentActor.id);
  };

  installResearchKnowledgeRefreshHook();

  let remoteRefreshRunning =
    false;

  const refreshFromKnowledgeChange =
    async () => {
      if (!root.isConnected) {
        activeResearchStationRefreshers
          .delete(
            refreshFromKnowledgeChange
          );

        return;
      }

      if (remoteRefreshRunning) {
        return;
      }

      remoteRefreshRunning =
        true;

      try {
        await refresh();
      } finally {
        remoteRefreshRunning =
          false;
      }
    };

  activeResearchStationRefreshers
    .add(
      refreshFromKnowledgeChange
    );

  root.addEventListener(
    "change",
    async (event) => {
      if (
        event.target?.matches?.(
          "[data-dct-research-actor]"
        )
      ) {
        await refresh();
        return;
      }

      const select =
        event.target?.closest?.(
          "[data-dct-knowledge-status]"
        );

      if (!select) {
        return;
      }

      if (!game.user?.isGM) {
        return;
      }

      const actorId =
        root.querySelector(
          "[data-dct-research-actor]"
        )?.value;

      const currentActor =
        actors.find(
          (candidate) =>
            candidate.id === actorId
        ) ?? null;

      if (!currentActor) {
        return;
      }

      select.disabled = true;

      try {
        const result =
          await api.craftingKnowledge
            .setPropertyStatus({
              actor:
                currentActor,

              materialId:
                select.dataset
                  .materialId,

              propertyId:
                select.dataset
                  .propertyId,

              status:
                select.value,

              source: {
                type:
                  "gm-research-status",
              },
            });

        if (!result?.green) {
          ui.notifications?.warn(
            "Centre d??tude : modification refus?e."
          );
        }

        await refresh();
      } catch (error) {
        console.error(
          `${MODULE_ID} | research knowledge status failed`,
          error
        );

        ui.notifications?.error(
          `Centre d??tude : ${error?.message ?? "modification impossible"}`
        );

        await refresh();
      } finally {
        if (select.isConnected) {
          select.disabled = false;
        }
      }
    }
  );

  return dialog;
}

export const craftingResearchStationApi = Object.freeze({ buildModel:buildResearchStationModel, open:openCraftingResearchStation });
