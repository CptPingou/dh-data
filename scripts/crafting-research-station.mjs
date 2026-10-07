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
            ".materialKnowledge" &&
        key !==
          MODULE_ID +
            ".craftingResearchQueue"
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
    !api?.craftingResearchQueue?.status ||
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
  const researchQueueState =
    api.craftingResearchQueue
      .status();

  const researchQueue =
    researchQueueState?.queue ??
    [];


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

      const queuePosition =
        researchQueue.findIndex(
          (entry) =>
            entry.actorUuid ===
              actor.uuid &&
            entry.materialId ===
              materialId &&
            entry.propertyId ===
              propertyId &&
            entry.expeditionId ===
              expeditionId
        );

      const queuedEntry =
        queuePosition >= 0
          ? researchQueue[
              queuePosition
            ]
          : null;

      const queued =
        Boolean(queuedEntry);

      const canResearch =
        status === "visible" &&
        !queued;

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

        queued,

        queuePosition:
          queued
            ? queuePosition
            : null,

        queueProgress:
          queued
            ? Number(
                queuedEntry?.progress
              ) || 0
            : null,

        queueTurnsRequired:
          queued
            ? Number(
                queuedEntry
                  ?.turnsRequired
              ) || 1
            : null,

        canResearch,
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
                    property.queued
                      ? property.queuePosition === 0
                        ? " \u00b7 recherche active (" +
                          String(
                            property.queueProgress
                          ) +
                          "/" +
                          String(
                            property.queueTurnsRequired
                          ) +
                          ")"
                        : " \u00b7 en file (" +
                          String(
                            property.queuePosition + 1
                          ) +
                          ")"
                      : property.status ===
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

                  const researchControl =
                    property.canResearch
                      ? '<button ' +
                        'type="button" ' +
                        'data-dct-research-action="research" ' +
                        'data-material-id="' +
                        esc(material.materialId) +
                        '" ' +
                        'data-property-id="' +
                        esc(property.propertyId) +
                        '" ' +
                        'data-container-id="' +
                        esc(model.containerId) +
                        '">' +
                        "Mettre en recherche" +
                        "</button>"
                      : "";

                  const gmStatusControl =
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

                  const control =
                    researchControl ||
                    gmStatusControl
                      ? '<div style="' +
                        "display:flex;" +
                        "gap:.4rem;" +
                        "align-items:center" +
                        '">' +
                        researchControl +
                        gmStatusControl +
                        "</div>"
                      : "";

                  const propertyLabel =
                    property.discovered
                      ? '<button ' +
                        'type="button" ' +
                        'data-dct-open-property="' +
                        esc(property.propertyId) +
                        '" ' +
                        'style="' +
                          "padding:0;" +
                          "border:0;" +
                          "background:none;" +
                          "text-align:left;" +
                          "cursor:pointer;" +
                          "text-decoration:underline" +
                        '">' +
                        esc(property.label) +
                        suffix +
                        "</button>"
                      : "<span>" +
                        esc(property.label) +
                        suffix +
                        "</span>";

                  return (
                    '<div style="' +
                    "display:grid;" +
                    "grid-template-columns:1fr auto;" +
                    "gap:.6rem;" +
                    "align-items:center;" +
                    "padding:.4rem 0;" +
                    "border-top:1px solid var(--color-border-light-2)" +
                    '">' +
                    propertyLabel +
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

function knowledgeCreatureLabel(
  creatureId
) {
  const raw =
    String(
      creatureId ?? ""
    )
      .split(".")
      .filter(Boolean)
      .at(-1) ?? "";

  if (!raw) {
    return "Cr\u00e9ature";
  }

  return (
    raw.charAt(0).toUpperCase() +
    raw.slice(1)
  );
}

function knowledgeDialogRoot(
  dialog
) {
  return dialog?.element instanceof HTMLElement
    ? dialog.element
    : null;
}

function installKnowledgeNavigation(
  root,
  {
    api,
    actor,
  } = {}
) {
  if (!(root instanceof HTMLElement)) {
    return;
  }

  root.addEventListener(
    "click",
    async (event) => {
      const target =
        event.target?.closest?.(
          [
            "[data-dct-open-property]",
            "[data-dct-open-material]",
            "[data-dct-open-recipe]",
            "[data-dct-open-creature]",
          ].join(",")
        );

      if (!target) {
        return;
      }

      try {
        const propertyId =
          target.dataset
            .dctOpenProperty;

        if (propertyId) {
          await openPropertyKnowledgeDialog({
            api,
            actor,
            propertyId,
          });

          return;
        }

        const materialId =
          target.dataset
            .dctOpenMaterial;

        if (materialId) {
          await openMaterialKnowledgeDialog({
            api,
            actor,
            materialId,
          });

          return;
        }

        const recipeId =
          target.dataset
            .dctOpenRecipe;

        if (recipeId) {
          await openRecipeKnowledgeDialog({
            api,
            actor,
            recipeId,
          });

          return;
        }

        const creatureId =
          target.dataset
            .dctOpenCreature;

        if (creatureId) {
          await openCreatureKnowledgeDialog({
            api,
            actor,
            creatureId,
          });
        }
      } catch (error) {
        console.error(
          MODULE_ID +
            " | knowledge navigation failed",
          error
        );

        ui.notifications?.error(
          "Centre d'\u00e9tude : " +
          (
            error?.message ??
            "navigation impossible"
          )
        );
      }
    }
  );
}

async function openMaterialKnowledgeDialog({
  api,
  actor,
  materialId,
} = {}) {
  const model =
    await api
      ?.craftingKnowledgeBrowser
      ?.material?.(
        actor,
        materialId
      );

  if (!model) {
    ui.notifications?.warn(
      "Cette partie n'est pas encore consultable."
    );

    return {
      green: false,
      reason: "material-not-visible",
    };
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (!DialogV2) {
    throw new Error(
      "Campaign Toolkit | DialogV2 unavailable"
    );
  }

  const properties =
    (model.properties ?? [])
      .map(
        (property) => {
          if (!property?.id) {
            return (
              "<li>Indice non identifi\u00e9</li>"
            );
          }

          return (
            "<li>" +
            '<button type="button" ' +
            'data-dct-open-property="' +
            esc(property.id) +
            '">' +
            esc(
              property.label ??
              property.id
            ) +
            "</button>" +
            (
              property.description
                ? "<br><small>" +
                  esc(
                    property.description
                  ) +
                  "</small>"
                : ""
            ) +
            "</li>"
          );
        }
      )
      .join("");

  const creature =
    model.creatureId
      ? '<p><strong>Origine :</strong> ' +
        '<button type="button" ' +
        'data-dct-open-creature="' +
        esc(model.creatureId) +
        '">' +
        esc(
          knowledgeCreatureLabel(
            model.creatureId
          )
        ) +
        "</button></p>"
      : "";

  const content =
    '<div class="dct-knowledge-material">' +
      creature +
      (
        model.anatomy
          ? "<p><strong>Partie anatomique :</strong> " +
            esc(model.anatomy) +
            "</p>"
          : ""
      ) +
      "<h3>Propri\u00e9t\u00e9s connues</h3>" +
      (
        properties
          ? "<ul>" +
            properties +
            "</ul>"
          : "<p>Aucune propri\u00e9t\u00e9 connue.</p>"
      ) +
    "</div>";

  const dialog =
    new DialogV2({
      window: {
        title:
          model.name ??
          model.id,
      },

      content,

      buttons: [
        {
          action: "close",
          label: "Fermer",
          default: true,
        },
      ],
    });

  await dialog.render(true);

  installKnowledgeNavigation(
    knowledgeDialogRoot(dialog),
    {
      api,
      actor,
    }
  );

  return {
    green: true,
    dialog,
    materialId: model.id,
  };
}

async function openCreatureKnowledgeDialog({
  api,
  actor,
  creatureId,
} = {}) {
  const model =
    await api
      ?.craftingKnowledgeBrowser
      ?.creature?.(
        actor,
        creatureId
      );

  if (!model) {
    ui.notifications?.warn(
      "Cette cr\u00e9ature n'est pas encore consultable."
    );

    return {
      green: false,
      reason: "creature-not-visible",
    };
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (!DialogV2) {
    throw new Error(
      "Campaign Toolkit | DialogV2 unavailable"
    );
  }

  const materials =
    (model.materials ?? [])
      .map(
        (material) =>
          "<li>" +
          '<button type="button" ' +
          'data-dct-open-material="' +
          esc(material.id) +
          '">' +
          esc(
            material.name ??
            material.id
          ) +
          "</button>" +
          "</li>"
      )
      .join("");

  const content =
    '<div class="dct-knowledge-creature">' +
      "<h3>Parties connues</h3>" +
      (
        materials
          ? "<ul>" +
            materials +
            "</ul>"
          : "<p>Aucune partie connue.</p>"
      ) +
    "</div>";

  const dialog =
    new DialogV2({
      window: {
        title:
          knowledgeCreatureLabel(
            model.id
          ),
      },

      content,

      buttons: [
        {
          action: "close",
          label: "Fermer",
          default: true,
        },
      ],
    });

  await dialog.render(true);

  installKnowledgeNavigation(
    knowledgeDialogRoot(dialog),
    {
      api,
      actor,
    }
  );

  return {
    green: true,
    dialog,
    creatureId: model.id,
  };
}

async function openRecipeKnowledgeDialog({
  api,
  actor,
  recipeId,
} = {}) {
  const model =
    await api
      ?.craftingKnowledgeBrowser
      ?.recipe?.(
        actor,
        recipeId
      );

  if (!model) {
    ui.notifications?.warn(
      "Cette recette n'est pas encore consultable."
    );

    return {
      green: false,
      reason: "recipe-not-visible",
    };
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (!DialogV2) {
    throw new Error(
      "Campaign Toolkit | DialogV2 unavailable"
    );
  }

  let outputDefinition =
    null;

  if (
    model.output?.type ===
      "weaponAugment" &&
    model.output?.id &&
    api?.weaponAugments?.get
  ) {
    try {
      outputDefinition =
        await api.weaponAugments.get(
          model.output.id
        );
    } catch {
      outputDefinition =
        null;
    }
  }

  const effect =
    outputDefinition?.description
      ? "<p><strong>Effet :</strong> " +
        esc(
          outputDefinition.description
        ) +
        "</p>"
      : "";

  const requirements =
    (model.requirements ?? [])
      .map(
        (requirement) =>
          "<li>" +
          '<button type="button" ' +
          'data-dct-open-property="' +
          esc(
            requirement.propertyId
          ) +
          '">' +
          esc(
            requirement.label ??
            requirement.propertyId
          ) +
          "</button>" +
          " : " +
          esc(
            requirement.value
          ) +
          "</li>"
      )
      .join("");

  const compatible =
    new Map();

  for (
    const property
    of model.properties ?? []
  ) {
    for (
      const material
      of property.materials ?? []
    ) {
      if (material?.id) {
        compatible.set(
          material.id,
          material
        );
      }
    }
  }

  const materials =
    [
      ...compatible.values()
    ]
      .map(
        (material) =>
          "<li>" +
          '<button type="button" ' +
          'data-dct-open-material="' +
          esc(material.id) +
          '">' +
          esc(
            material.name ??
            material.id
          ) +
          "</button>" +
          "</li>"
      )
      .join("");

  const content =
    '<div class="dct-knowledge-recipe">' +
      effect +
      "<h3>Propri\u00e9t\u00e9s requises connues</h3>" +
      (
        requirements
          ? "<ul>" +
            requirements +
            "</ul>"
          : "<p>Aucune exigence connue.</p>"
      ) +
      "<h3>Parties compatibles connues</h3>" +
      (
        materials
          ? "<ul>" +
            materials +
            "</ul>"
          : "<p>Aucune partie compatible connue.</p>"
      ) +
    "</div>";

  const dialog =
    new DialogV2({
      window: {
        title:
          model.name ??
          model.id,
      },

      content,

      buttons: [
        {
          action: "close",
          label: "Fermer",
          default: true,
        },
      ],
    });

  await dialog.render(true);

  installKnowledgeNavigation(
    knowledgeDialogRoot(dialog),
    {
      api,
      actor,
    }
  );

  return {
    green: true,
    dialog,
    recipeId: model.id,
  };
}

async function openPropertyKnowledgeDialog({
  api,
  actor,
  propertyId,
} = {}) {
  if (
    !api?.craftingKnowledgeBrowser?.property
  ) {
    throw new Error(
      "Knowledge browser API unavailable."
    );
  }

  const model =
    await api.craftingKnowledgeBrowser
      .property(
        actor,
        propertyId
      );

  if (!model) {
    ui.notifications?.warn(
      "Cette propri\u00e9t\u00e9 n'est pas encore consultable."
    );

    return {
      green: false,
      reason: "property-not-visible",
    };
  }

  const DialogV2 =
    foundry?.applications?.api
      ?.DialogV2;

  if (!DialogV2) {
    throw new Error(
      "Campaign Toolkit | DialogV2 unavailable"
    );
  }

  const materials =
    (model.materials ?? [])
      .map(
        (material) =>
          "<li>" +
          '<button type="button" ' +
          'data-dct-open-material="' +
          esc(material.id) +
          '">' +
          esc(
            material.name ??
            material.id
          ) +
          "</button>" +
          "</li>"
      )
      .join("");

  const recipeRows = [];

  for (
    const recipeSummary
    of model.recipes ?? []
  ) {
    const recipe =
      await api
        .craftingKnowledgeBrowser
        .recipe(
          actor,
          recipeSummary.id
        );

    if (!recipe) {
      continue;
    }

    let outputDefinition =
      null;

    if (
      recipe.output?.type ===
        "weaponAugment" &&
      recipe.output?.id &&
      api?.weaponAugments?.get
    ) {
      try {
        outputDefinition =
          await api.weaponAugments.get(
            recipe.output.id
          );
      } catch {
        outputDefinition =
          null;
      }
    }

    const effect =
      outputDefinition?.description
        ? '<p style="' +
          "margin:.25rem 0 .4rem 0" +
          '">' +
          "<strong>Effet :</strong> " +
          esc(
            outputDefinition.description
          ) +
          "</p>"
        : "";

    const requirementRows =
      (recipe.requirements ?? [])
        .map(
          (requirement) =>
            "<li>" +
            esc(
              requirement.label ??
              requirement.propertyId
            ) +
            " : " +
            esc(
              requirement.value
            ) +
            "</li>"
        )
        .join("");

    const requirements =
      requirementRows
        ? '<div style="' +
          "margin-top:.35rem" +
          '">' +
          "<strong>Propri\u00e9t\u00e9s requises connues</strong>" +
          "<ul>" +
          requirementRows +
          "</ul>" +
          "</div>"
        : "";

    recipeRows.push(
      '<li style="' +
        "margin-bottom:.75rem" +
      '">' +
        '<button type="button" ' +
        'data-dct-open-recipe="' +
        esc(recipe.id) +
        '">' +
        "<strong>" +
        esc(
          recipe.name ??
          recipe.id
        ) +
        "</strong>" +
        "</button>" +
        effect +
        requirements +
      "</li>"
    );
  }

  const recipes =
    recipeRows.join("");

  const description =
    model.description
      ? "<p>" +
        esc(model.description) +
        "</p>"
      : "";

  const content =
    '<div class="dct-knowledge-property">' +
      description +
      '<div style="' +
        "display:grid;" +
        "grid-template-columns:minmax(0,1fr) minmax(0,1fr);" +
        "gap:1rem;" +
        "align-items:start" +
      '">' +

        "<section>" +
          "<h3>Parties connues</h3>" +
          (
            materials
              ? "<ul>" +
                materials +
                "</ul>"
              : "<p>Aucune partie connue.</p>"
          ) +
        "</section>" +

        "<section>" +
          "<h3>Recettes d\u00e9pendantes</h3>" +
          (
            recipes
              ? "<ul>" +
                recipes +
                "</ul>"
              : "<p>Aucune recette connue.</p>"
          ) +
        "</section>" +

      "</div>" +
    "</div>";

  const dialog =
    new DialogV2({
      window: {
        title:
          model.label ??
          model.id,
      },

      content,

      buttons: [
        {
          action: "close",
          label: "Fermer",
          default: true,
        },
      ],
    });

  await dialog.render(true);

  installKnowledgeNavigation(
    knowledgeDialogRoot(dialog),
    {
      api,
      actor,
    }
  );

  return {
    green: true,
    dialog,
    propertyId: model.id,
  };
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

  root.addEventListener(
    "click",
    async (event) => {
      const button =
        event.target?.closest?.(
          "[data-dct-research-action]"
        );

      if (!button) {
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
        ) ?? selectedActor;

      if (!currentActor) {
        return;
      }

      button.disabled = true;

      try {
        const result =
          await api
            .craftingResearchAuthority
            .request({
              actor:
                currentActor,

              operation:
                "research",

              materialId:
                button.dataset
                  .materialId,

              propertyId:
                button.dataset
                  .propertyId,

              expeditionId,

              containerId:
                button.dataset
                  .containerId,
            });

        if (!result?.green) {
          ui.notifications?.warn(
            "Centre d'\u00e9tude : " +
            (
              result?.reason ??
              "recherche refus\u00e9e"
            )
          );
        } else {
          ui.notifications?.info(
            "Recherche ajout\u00e9e \u00e0 la file."
          );
        }

        await refresh();
      } catch (error) {
        console.error(
          MODULE_ID +
            " | research queue action failed",
          error
        );

        ui.notifications?.error(
          "Centre d'\u00e9tude : " +
          (
            error?.message ??
            "mise en recherche impossible"
          )
        );

        await refresh();
      } finally {
        if (button.isConnected) {
          button.disabled = false;
        }
      }
    }
  );

  root.addEventListener(
    "click",
    async (event) => {
      const button =
        event.target?.closest?.(
          "[data-dct-open-property]"
        );

      if (!button) {
        return;
      }

      const propertyId =
        button.dataset
          .dctOpenProperty;

      if (!propertyId) {
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
        ) ?? selectedActor;

      try {
        await openPropertyKnowledgeDialog({
          api,
          actor:
            currentActor,
          propertyId,
        });
      } catch (error) {
        console.error(
          MODULE_ID +
            " | property knowledge dialog failed",
          error
        );

        ui.notifications?.error(
          "Centre d'\u00e9tude : " +
          (
            error?.message ??
            "ouverture impossible"
          )
        );
      }
    }
  );

  return dialog;
}

export const craftingResearchStationApi = Object.freeze({ buildModel:buildResearchStationModel, open:openCraftingResearchStation });
