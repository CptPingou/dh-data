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

  materials.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        game.i18n?.lang ?? "fr"
      )
  );

  const knowledgeProject =
    await api
      ?.craftingKnowledgeBrowser
      ?.project?.(
        actor,
        {
          includeInvisible:
            game.user?.isGM === true,
        }
      ) ??
    {
      materials: {},
      properties: {},
      creatures: {},
      recipes: {},
    };

  return {
    green: true,
    expeditionId,
    containerId,
    actorUuid: actor.uuid,
    materials,
    knowledgeProject,
  };
}


function researchStatusLabel(status) {
  switch (status) {
    case "invisible":
      return "Invisible";
    case "visible":
      return "Visible";
    case "discovered":
      return "D\u00e9couvert";
    case "shared":
      return "Partag\u00e9";
    default:
      return status ?? "Visible";
  }
}


function derivedKnowledgeStatus(statuses = []) {
  const normalized =
    statuses
      .filter(Boolean)
      .map(
        (status) =>
          String(status)
            .trim()
            .toLowerCase()
      );

  if (!normalized.length) {
    return "invisible";
  }

  if (
    normalized.every(
      (status) =>
        status === "shared"
    )
  ) {
    return "shared";
  }

  if (
    normalized.some(
      (status) =>
        status === "discovered" ||
        status === "shared"
    )
  ) {
    return "discovered";
  }

  if (
    normalized.some(
      (status) =>
        status === "visible"
    )
  ) {
    return "visible";
  }

  return "invisible";
}

function materialDerivedStatus(material) {
  return derivedKnowledgeStatus(
    (material?.properties ?? [])
      .map(
        (property) =>
          property?.status
      )
  );
}

function recipePropertyIds(recipe) {
  const ids =
    new Set();

  for (
    const entry
    of recipe?.properties ??
      recipe?.requirements ??
      []
  ) {
    const id =
      entry?.id ??
      entry?.propertyId ??
      entry?.match?.property ??
      null;

    if (id) {
      ids.add(id);
    }
  }

  return [...ids];
}

function recipeDerivedStatus(
  recipe,
  project
) {
  const statuses = [];

  for (
    const propertyId
    of recipePropertyIds(recipe)
  ) {
    const property =
      project?.properties?.[
        propertyId
      ];

    if (!property) {
      continue;
    }

    /*
     * Une propri?t? peut exister sur plusieurs mat?riaux.
     * Le statut de la propri?t? globale est d?riv? de ses
     * occurrences mat?riau+propri?t?.
     */
    const materialStatuses =
      (property.materials ?? [])
        .flatMap(
          (material) =>
            (
              material?.properties ??
              []
            )
              .filter(
                (entry) =>
                  entry?.id ===
                  propertyId
              )
              .map(
                (entry) =>
                  entry?.status
              )
        );

    statuses.push(
      derivedKnowledgeStatus(
        materialStatuses
      )
    );
  }

  return derivedKnowledgeStatus(
    statuses
  );
}

function researchStatusOptions(status) {
  return [
    ["invisible", "Invisible"],
    ["visible", "Visible"],
    ["discovered", "D\u00e9couvert"],
    ["shared", "Partag\u00e9"],
  ]
    .map(
      ([value, label]) =>
        '<option value="' +
        esc(value) +
        '"' +
        (
          status === value
            ? " selected"
            : ""
        ) +
        ">" +
        esc(label) +
        "</option>"
    )
    .join("");
}

function researchSquareCard({
  type,
  id,
  name,
  subtitle = "",
  status = null,
  materialId = null,
  propertyId = null,
  focus = false,
} = {}) {
  const isGm =
    Boolean(game.user?.isGM);

  const openAttribute =
    type === "material"
      ? 'data-dct-open-material="' +
        esc(id) +
        '"'
      : type === "property"
        ? 'data-dct-open-property="' +
          esc(id) +
          '"'
        : type === "recipe"
          ? 'data-dct-open-recipe="' +
            esc(id) +
            '"'
          : "";

  const statusEditor =
    (
      isGm &&
      type === "property" &&
      materialId &&
      propertyId
    )
      ? (
          '<label class="dct-research-card__status">' +
          '<span>Statut</span>' +
          '<select ' +
          'data-dct-knowledge-status ' +
          'data-material-id="' +
          esc(materialId) +
          '" ' +
          'data-property-id="' +
          esc(propertyId) +
          '">' +
          researchStatusOptions(status) +
          "</select>" +
          "</label>"
        )
      : (
          isGm && status
            ? (
                '<span class="dct-research-card__status-badge" ' +
                'data-status="' +
                esc(status) +
                '">' +
                esc(
                  researchStatusLabel(
                    status
                  )
                ) +
                "</span>"
              )
            : ""
        );

  return (
    '<article class="dct-research-card' +
    (
      focus
        ? " dct-research-card--focus"
        : ""
    ) +
    '" data-research-kind="' +
    esc(type) +
    '">' +

      '<button type="button" ' +
      'class="dct-research-card__open" ' +
      openAttribute +
      ">" +

        '<strong class="dct-research-card__title">' +
        esc(name ?? id) +
        "</strong>" +

        (
          subtitle
            ? (
                '<span class="dct-research-card__subtitle">' +
                esc(subtitle) +
                "</span>"
              )
            : ""
        ) +

      "</button>" +

      statusEditor +

    "</article>"
  );
}

function researchRelationGrid(
  cards,
  emptyLabel
) {
  return (
    '<div class="dct-research-grid">' +
    (
      cards.length
        ? cards.join("")
        : (
            "<p>" +
            esc(emptyLabel) +
            "</p>"
          )
    ) +
    "</div>"
  );
}

function content(
  model,
  actors,
  selectedActorId,
  focus = null
) {
  const isGm =
    Boolean(game.user?.isGM);

  const project =
    model.knowledgeProject ?? {
      materials: {},
      properties: {},
      creatures: {},
      recipes: {},
    };

  const materials =
    Object.values(
      project.materials ?? {}
    )
      .sort(
        (a, b) =>
          String(
            a.name ?? a.id
          ).localeCompare(
            String(
              b.name ?? b.id
            ),
            game.i18n?.lang ??
              "fr"
          )
      );

  const properties =
    Object.values(
      project.properties ?? {}
    )
      .sort(
        (a, b) =>
          String(
            a.label ?? a.id
          ).localeCompare(
            String(
              b.label ?? b.id
            ),
            game.i18n?.lang ??
              "fr"
          )
      );

  const recipes =
    Object.values(
      project.recipes ?? {}
    )
      .sort(
        (a, b) =>
          String(
            a.name ?? a.id
          ).localeCompare(
            String(
              b.name ?? b.id
            ),
            game.i18n?.lang ??
              "fr"
          )
      );

  const options =
    actors
      .map(
        (actor) =>
          '<option value="' +
          esc(actor.id) +
          '"' +
          (
            actor.id ===
            selectedActorId
              ? " selected"
              : ""
          ) +
          ">" +
          esc(actor.name) +
          "</option>"
      )
      .join("");

  const materialCards =
    materials.map(
      (material) =>
        researchSquareCard({
          type: "material",
          id: material.id,
          name:
            material.name ??
            material.id,
          subtitle:
            material.creatureId
              ? "Mat\u00e9riau de chasse"
              : "",
          status:
            isGm
              ? materialDerivedStatus(
                  material
                )
              : null,
        })
    );

  const propertyCards =
    properties.map(
      (property) =>
        researchSquareCard({
          type: "property",
          id: property.id,
          name:
            property.label ??
            property.id,
          status:
            property.status ??
            null,
        })
    );

  const recipeCards =
    recipes.map(
      (recipe) =>
        researchSquareCard({
          type: "recipe",
          id: recipe.id,
          name:
            recipe.name ??
            recipe.id,
          subtitle: "Recette",
          status:
            isGm
              ? recipeDerivedStatus(
                  recipe,
                  project
                )
              : null,
        })
    );

  let focusHtml = "";
  let relatedSections = "";

  if (
    focus?.type === "material"
  ) {
    const material =
      project.materials?.[
        focus.id
      ] ??
      null;

    if (material) {
      focusHtml =
        researchSquareCard({
          type: "material",
          id: material.id,
          name:
            material.name ??
            material.id,
          subtitle:
            "Mat\u00e9riau de chasse",
          status:
            isGm
              ? materialDerivedStatus(
                  material
                )
              : null,
          focus: true,
        });

      const linkedProperties =
        (
          material.properties ??
          []
        )
          .map(
            (property) =>
              researchSquareCard({
                type: "property",
                id: property.id,
                name:
                  property.label ??
                  property.id,
                status:
                  property.status ??
                  null,
                materialId:
                  material.id,
                propertyId:
                  property.id,
              })
          );

      const linkedRecipeIds =
        new Set();

      for (
        const property
        of material.properties ?? []
      ) {
        const p =
          project.properties?.[
            property.id
          ];

        for (
          const recipeId
          of p?.recipeIds ?? []
        ) {
          linkedRecipeIds.add(
            recipeId
          );
        }
      }

      const linkedRecipes =
        [...linkedRecipeIds]
          .map(
            (recipeId) =>
              project.recipes?.[
                recipeId
              ]
          )
          .filter(Boolean)
          .map(
            (recipe) =>
              researchSquareCard({
                type: "recipe",
                id: recipe.id,
                name:
                  recipe.name ??
                  recipe.id,
                subtitle:
                  "Recette li\u00e9e",
                status:
                  isGm
                    ? recipeDerivedStatus(
                        recipe,
                        project
                      )
                    : null,
              })
          );

      relatedSections =
        '<section class="dct-research-related">' +
          '<h3>Propri\u00e9t\u00e9s li\u00e9es</h3>' +
          researchRelationGrid(
            linkedProperties,
            "Aucune propri\u00e9t\u00e9 li\u00e9e."
          ) +
        "</section>" +

        '<section class="dct-research-related">' +
          '<h3>Recettes li\u00e9es</h3>' +
          researchRelationGrid(
            linkedRecipes,
            "Aucune recette li\u00e9e."
          ) +
        "</section>";
    }
  }

  if (
    focus?.type === "property"
  ) {
    const property =
      project.properties?.[
        focus.id
      ] ??
      null;

    if (property) {
      focusHtml =
        researchSquareCard({
          type: "property",
          id: property.id,
          name:
            property.label ??
            property.id,
          subtitle:
            property.category ??
            "Propri\u00e9t\u00e9",
          status:
            property.status ??
            null,
          focus: true,
        });

      const linkedMaterials =
        (
          property.materials ??
          []
        )
          .map(
            (material) =>
              researchSquareCard({
                type: "material",
                id: material.id,
                name:
                  material.name ??
                  material.id,
                subtitle:
                  "Mat\u00e9riau li\u00e9",
              })
          );

      const linkedRecipes =
        (
          property.recipes ??
          []
        )
          .map(
            (recipe) =>
              researchSquareCard({
                type: "recipe",
                id: recipe.id,
                name:
                  recipe.name ??
                  recipe.id,
                subtitle:
                  "Recette li\u00e9e",
                status:
                  isGm
                    ? recipeDerivedStatus(
                        recipe,
                        project
                      )
                    : null,
              })
          );

      relatedSections =
        '<section class="dct-research-related">' +
          '<h3>Mat\u00e9riaux li\u00e9s</h3>' +
          researchRelationGrid(
            linkedMaterials,
            "Aucun mat\u00e9riau li\u00e9."
          ) +
        "</section>" +

        '<section class="dct-research-related">' +
          '<h3>Recettes li\u00e9es</h3>' +
          researchRelationGrid(
            linkedRecipes,
            "Aucune recette li\u00e9e."
          ) +
        "</section>";
    }
  }

  if (
    focus?.type === "recipe"
  ) {
    const recipe =
      project.recipes?.[
        focus.id
      ] ??
      null;

    if (recipe) {
      focusHtml =
        researchSquareCard({
          type: "recipe",
          id: recipe.id,
          name:
            recipe.name ??
            recipe.id,
          subtitle: "Recette",
          status:
            isGm
              ? recipeDerivedStatus(
                  recipe,
                  project
                )
              : null,
          focus: true,
        });

      const linkedProperties =
        (
          recipe.properties ??
          recipe.requirements ??
          []
        )
          .map(
            (entry) => {
              const propertyId =
                entry.id ??
                entry.propertyId ??
                entry.match?.property ??
                null;

              if (!propertyId) {
                return null;
              }

              const property =
                project.properties?.[
                  propertyId
                ];

              if (!property) {
                return null;
              }

              return researchSquareCard({
                type: "property",
                id: property.id,
                name:
                  property.label ??
                  property.id,
                status:
                  property.status ??
                  null,
              });
            }
          )
          .filter(Boolean);

      const compatibleMaterials =
        new Map();

      for (
        const propertyCard
        of (
          recipe.properties ??
          recipe.requirements ??
          []
        )
      ) {
        const propertyId =
          propertyCard.id ??
          propertyCard.propertyId ??
          propertyCard.match
            ?.property ??
          null;

        if (!propertyId) {
          continue;
        }

        const property =
          project.properties?.[
            propertyId
          ];

        for (
          const material
          of property?.materials ?? []
        ) {
          if (material?.id) {
            compatibleMaterials.set(
              material.id,
              material
            );
          }
        }
      }

      const linkedMaterials =
        [
          ...compatibleMaterials.values()
        ]
          .map(
            (material) =>
              researchSquareCard({
                type: "material",
                id: material.id,
                name:
                  material.name ??
                  material.id,
                subtitle:
                  "Mat\u00e9riau compatible",
              })
          );

      relatedSections =
        '<section class="dct-research-related">' +
          '<h3>Propri\u00e9t\u00e9s requises</h3>' +
          researchRelationGrid(
            linkedProperties,
            "Aucune propri\u00e9t\u00e9 requise connue."
          ) +
        "</section>" +

        '<section class="dct-research-related">' +
          '<h3>Mat\u00e9riaux compatibles</h3>' +
          researchRelationGrid(
            linkedMaterials,
            "Aucun mat\u00e9riau compatible connu."
          ) +
        "</section>";
    }
  }

  const gmHelp =
    isGm
      ? (
          '<p class="dct-research-gm-help">' +
          "<strong>Vue MJ :</strong> " +
          "les statuts de connaissance sont affich\u00e9s uniquement ici." +
          "</p>"
        )
      : "";

  return (
    '<div class="dct-research-station">' +

      '<style>' +

        '.dct-research-station{' +
          'display:grid;' +
          'gap:1rem;' +
        '}' +

        '.dct-research-toolbar{' +
          'display:flex;' +
          'align-items:center;' +
          'justify-content:space-between;' +
          'gap:1rem;' +
          'flex-wrap:wrap;' +
        '}' +

        '.dct-research-focus{' +
          'display:grid;' +
          'justify-items:center;' +
          'gap:.75rem;' +
          'padding:.9rem;' +
          'border:1px solid var(--color-border-light-2);' +
          'border-radius:8px;' +
          'background:rgba(0,0,0,.10);' +
        '}' +

        '.dct-research-focus[hidden]{' +
          'display:none;' +
        '}' +

        '.dct-research-zone,' +
        '.dct-research-related{' +
          'display:grid;' +
          'gap:.55rem;' +
          'width:100%;' +
        '}' +

        '.dct-research-zone h3,' +
        '.dct-research-related h3{' +
          'margin:0;' +
        '}' +

        '.dct-research-grid{' +
          'display:grid;' +
          'grid-template-columns:' +
            'repeat(auto-fill,minmax(128px,1fr));' +
          'gap:.65rem;' +
        '}' +

        '.dct-research-card{' +
          'min-width:0;' +
          'aspect-ratio:1/1;' +
          'display:flex;' +
          'flex-direction:column;' +
          'justify-content:space-between;' +
          'gap:.45rem;' +
          'padding:.55rem;' +
          'border:1px solid var(--color-border-light-2);' +
          'border-radius:8px;' +
          'background:rgba(255,255,255,.035);' +
          'overflow:hidden;' +
        '}' +

        '.dct-research-card--focus{' +
          'width:min(220px,100%);' +
          'aspect-ratio:1/1;' +
          'box-shadow:0 0 0 2px rgba(255,255,255,.10);' +
        '}' +

        '.dct-research-card__open{' +
          'flex:1;' +
          'display:flex;' +
          'flex-direction:column;' +
          'justify-content:center;' +
          'align-items:center;' +
          'gap:.35rem;' +
          'text-align:center;' +
          'border:0;' +
          'background:transparent;' +
          'padding:.35rem;' +
          'cursor:pointer;' +
        '}' +

        '.dct-research-card__title{' +
          'font-size:.95rem;' +
          'line-height:1.15;' +
        '}' +

        '.dct-research-card__subtitle{' +
          'font-size:.75rem;' +
          'opacity:.7;' +
        '}' +

        '.dct-research-card__status{' +
          'display:grid;' +
          'gap:.2rem;' +
          'font-size:.72rem;' +
        '}' +

        '.dct-research-card__status select{' +
          'width:100%;' +
        '}' +

        '.dct-research-card__status-badge{' +
          'display:block;' +
          'text-align:center;' +
          'font-weight:700;' +
          'font-size:.72rem;' +
          'padding:.25rem .35rem;' +
          'border-radius:999px;' +
          'background:rgba(255,255,255,.09);' +
        '}' +

        '.dct-research-gm-help{' +
          'margin:.2rem 0 0;' +
          'opacity:.8;' +
        '}' +

      '</style>' +

      '<div class="dct-research-toolbar">' +

        '<label>' +
          '<strong>Chercheur :</strong> ' +
          '<select data-dct-research-actor>' +
          options +
          '</select>' +
        '</label>' +

      '</div>' +

      gmHelp +

      '<section class="dct-research-focus"' +
      (
        focusHtml
          ? ""
          : " hidden"
      ) +
      '>' +

        (
          focusHtml
            ? (
                "<h2>Focus</h2>" +
                focusHtml +
                relatedSections
              )
            : ""
        ) +

      "</section>" +

      '<section class="dct-research-zone">' +
        '<h3>Mat\u00e9riaux de chasse</h3>' +
        researchRelationGrid(
          materialCards,
          "Aucun mat\u00e9riau de chasse connu."
        ) +
      "</section>" +

      '<section class="dct-research-zone">' +
        "<h3>Recettes</h3>" +
        researchRelationGrid(
          recipeCards,
          "Aucune recette connue."
        ) +
      "</section>" +

      '<section class="dct-research-zone">' +
        "<h3>Propri\u00e9t\u00e9s</h3>" +
        researchRelationGrid(
          propertyCards,
          "Aucune propri\u00e9t\u00e9 connue."
        ) +
      "</section>" +

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


  // P2.12l.4 research vertical scroll
  const researchBody =
    root.querySelector(".window-content");

  if (researchBody instanceof HTMLElement) {
    researchBody.style.overflowX =
      "hidden";
    researchBody.style.overflowY =
      "auto";
    researchBody.style.scrollbarGutter =
      "stable";
    researchBody.style.maxHeight =
      "min(72vh, 760px)";
  }

let currentFocus = null;

  const refresh = async ({
    focus = currentFocus,
  } = {}) => {
    const actorId =
      root.querySelector(
        "[data-dct-research-actor]"
      )?.value;

    const currentActor =
      actors.find(
        (candidate) =>
          candidate.id === actorId
      ) ??
      selectedActor;

    const next =
      await buildResearchStationModel({
        api,
        actor: currentActor,
        expeditionId,
      });

    const body =
      root.querySelector(
        ".window-content"
      );

    if (
      body &&
      next.green
    ) {
      currentFocus =
        focus ?? null;

      body.innerHTML =
        content(
          next,
          actors,
          currentActor.id,
          currentFocus
        );
    }
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
      const focusCard =
        event.target?.closest?.(
          [
            "[data-dct-open-material]",
            "[data-dct-open-property]",
            "[data-dct-open-recipe]",
          ].join(",")
        );

      if (focusCard) {
        event.preventDefault();
        event.stopPropagation();

        const type =
          focusCard.hasAttribute(
            "data-dct-open-material"
          )
            ? "material"
            : focusCard.hasAttribute(
                "data-dct-open-property"
              )
              ? "property"
              : "recipe";

        const id =
          focusCard.dataset
            .dctOpenMaterial ??
          focusCard.dataset
            .dctOpenProperty ??
          focusCard.dataset
            .dctOpenRecipe ??
          null;

        if (id) {
          await refresh({
            focus: {
              type,
              id,
            },
          });

          return;
        }
      }

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
