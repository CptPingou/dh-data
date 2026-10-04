import { materialPropertyIds, recipeMode, validateRecipeCatalog } from "./crafting-schema.mjs";
import { allocateRecipe } from "./crafting-recipe-engine.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";

const clone = (value) => value == null ? value : (globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const RECIPE_CATALOG_REGISTRY_URL =
  `modules/${MODULE_ID}/data/crafting/recipe-catalogs.json`;

let recipeRegistryCache = null;
const recipeCatalogCache = new Map();

export async function loadCraftingRecipeCatalogRegistry(
  { force = false } = {},
) {
  if (recipeRegistryCache && !force) {
    return clone(recipeRegistryCache);
  }

  const response = await fetch(
    RECIPE_CATALOG_REGISTRY_URL,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load crafting recipe catalog registry (${response.status}).`,
    );
  }

  const registry = await response.json();

  if (registry?.schemaVersion !== 1) {
    throw new Error(
      "Crafting recipe catalog registry schemaVersion must be 1.",
    );
  }

  if (
    typeof registry?.id !== "string" ||
    !registry.id.trim()
  ) {
    throw new Error(
      "Crafting recipe catalog registry id is required.",
    );
  }

  if (
    typeof registry?.defaultCatalog !== "string" ||
    !registry.defaultCatalog.trim()
  ) {
    throw new Error(
      "Crafting recipe catalog registry defaultCatalog is required.",
    );
  }

  if (!Array.isArray(registry?.catalogs)) {
    throw new Error(
      "Crafting recipe catalog registry catalogs must be an array.",
    );
  }

  const ids = new Set();

  for (const entry of registry.catalogs) {
    for (const field of ["id", "namespace", "kind", "path"]) {
      if (
        typeof entry?.[field] !== "string" ||
        !entry[field].trim()
      ) {
        throw new Error(
          `Crafting recipe catalog registry entry ${field} is required.`,
        );
      }
    }

    if (entry.kind !== "recipe-catalog") {
      throw new Error(
        `Recipe catalog registry entry ${entry.id} must use kind "recipe-catalog".`,
      );
    }

    if (ids.has(entry.id)) {
      throw new Error(
        `Duplicate recipe catalog id: ${entry.id}.`,
      );
    }

    ids.add(entry.id);
  }

  if (!ids.has(registry.defaultCatalog)) {
    throw new Error(
      `Unknown default recipe catalog: ${registry.defaultCatalog}.`,
    );
  }

  recipeRegistryCache = clone(registry);
  return clone(recipeRegistryCache);
}

export async function loadCraftingRecipeCatalog(
  {
    force = false,
    catalogId = null,
  } = {},
) {
  const registry =
    await loadCraftingRecipeCatalogRegistry({ force });

  const resolvedCatalogId =
    catalogId ?? registry.defaultCatalog;

  const entry =
    registry.catalogs.find(
      (candidate) => candidate.id === resolvedCatalogId,
    ) ?? null;

  if (!entry) {
    throw new Error(
      `Unknown crafting recipe catalog: ${resolvedCatalogId}.`,
    );
  }

  if (!force && recipeCatalogCache.has(resolvedCatalogId)) {
    return clone(
      recipeCatalogCache.get(resolvedCatalogId),
    );
  }

  const relativePath =
    entry.path.replace(/^data\//, "");

  const url =
    `modules/${MODULE_ID}/data/${relativePath}`;

  const response = await fetch(
    url,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load crafting recipe catalog ${resolvedCatalogId} (${response.status}).`,
    );
  }

  const catalog = await response.json();

  validateRecipeCatalog(catalog);

  for (const field of ["id", "namespace", "kind"]) {
    if (catalog[field] !== entry[field]) {
      throw new Error(
        `Recipe catalog ${resolvedCatalogId} ${field} does not match registry.`,
      );
    }
  }

  recipeCatalogCache.set(
    resolvedCatalogId,
    clone(catalog),
  );

  return clone(catalog);
}

export async function loadCraftingRecipeCatalogs(
  { force = false } = {},
) {
  const registry =
    await loadCraftingRecipeCatalogRegistry({ force });

  const catalogs = [];

  for (const entry of registry.catalogs) {
    catalogs.push(
      await loadCraftingRecipeCatalog({
        catalogId: entry.id,
        force,
      }),
    );
  }

  return catalogs;
}

export async function listCraftingRecipes() {
  const catalogs =
    await loadCraftingRecipeCatalogs();

  const recipes = [];
  const ids = new Set();

  for (const catalog of catalogs) {
    for (const recipe of catalog.recipes) {
      if (ids.has(recipe.id)) {
        throw new Error(
          `Duplicate crafting recipe id across catalogs: ${recipe.id}.`,
        );
      }

      ids.add(recipe.id);
      recipes.push(clone(recipe));
    }
  }

  return recipes;
}

export async function resolveCraftingRecipe(
  recipeId,
  { force = false } = {},
) {
  const catalogs =
    await loadCraftingRecipeCatalogs({ force });

  let resolved = null;

  for (const catalog of catalogs) {
    const recipe =
      catalog.recipes.find(
        (entry) => entry.id === recipeId,
      ) ?? null;

    if (!recipe) continue;

    if (resolved) {
      throw new Error(
        `Duplicate crafting recipe id across catalogs: ${recipeId}.`,
      );
    }

    resolved = {
      catalog,
      recipe,
    };
  }

  return clone(resolved);
}

export async function getCraftingRecipe(
  recipeId,
) {
  const resolved =
    await resolveCraftingRecipe(recipeId);

  return clone(resolved?.recipe ?? null);
}

export async function getCraftingRecipeForOutput(
  outputType,
  outputId,
) {
  const catalogs =
    await loadCraftingRecipeCatalogs();

  let resolved = null;

  for (const catalog of catalogs) {
    const matches = catalog.recipes.filter(
      (recipe) =>
        recipe.output?.type === outputType &&
        recipe.output?.id === outputId,
    );

    for (const recipe of matches) {
      if (resolved) {
        throw new Error(
          `Duplicate crafting recipe output: ${outputType}/${outputId}.`,
        );
      }

      resolved = recipe;
    }
  }

  return clone(resolved);
}

function materialData(entry) {
  return entry?.itemRef?.snapshot?.flags?.[MODULE_ID]?.material ?? null;
}

export function containerInventory(container) {
  const totals = new Map();
  for (const entry of container?.contents ?? []) {
    const materialId = materialData(entry)?.materialId;
    const quantity = Number(entry?.quantity) || 0;
    if (!materialId || quantity <= 0) continue;
    totals.set(materialId, (totals.get(materialId) ?? 0) + quantity);
  }
  return [...totals].map(([materialId, quantity]) => ({ materialId, quantity }));
}

export function resolveFobCraftContainerId(
  manifest
) {
  const containerId =
    String(
      manifest?.fob
        ?.storageContainerId ??
      ""
    ).trim();

  if (!containerId) {
    return null;
  }

  const exists =
    (
      manifest?.containers ??
      []
    ).some(
      (container) =>
        container?.containerId ===
        containerId
    );

  return exists
    ? containerId
    : null;
}

export function knownMaterialDefinition(material, knowledgeApi, crafter) {
  const known = new Set(knowledgeApi.effective(crafter, material.id)?.properties ?? []);
  const copy = clone(material);
  const rawProperties = copy.material?.properties;
  if (Array.isArray(rawProperties)) {
    copy.material.properties = rawProperties.filter((property) => known.has(property));
    if (copy.material.properties.length === 0) copy.material.properties = ["__unknown__"];
  } else {
    copy.material.properties = Object.fromEntries(
      Object.entries(rawProperties ?? {}).filter(([propertyId]) => known.has(propertyId))
    );
    if (Object.keys(copy.material.properties).length === 0) copy.material.properties = { "__unknown__": 1 };
  }
  return copy;
}

function consumeAllocationFromContainer(manifestApi, manifest, containerId, allocations) {
  const required = new Map();
  for (const allocation of allocations) {
    required.set(allocation.materialId, (required.get(allocation.materialId) ?? 0) + allocation.quantity);
  }

  const container = manifest.containers.find((candidate) => candidate.containerId === containerId);
  if (!container) throw new Error(`Unknown crafting container: ${containerId}.`);

  const consumed = [];
  for (const [materialId, total] of required) {
    let remaining = total;
    const entries = [...(container.contents ?? [])].filter((entry) => materialData(entry)?.materialId === materialId);
    for (const entry of entries) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, Number(entry.quantity) || 0);
      if (quantity <= 0) continue;
      const result = manifestApi.consume(manifest, {
        containerId,
        entryId: entry.entryId,
        quantity,
        note: "Craft biologique",
      });
      if (!result.changed) throw new Error(result.reason ?? `Unable to consume ${materialId}.`);
      consumed.push({ materialId, entryId: entry.entryId, quantity });
      remaining -= quantity;
    }
    if (remaining > 0) throw new Error(`Allocation drift for ${materialId}: ${remaining} unit(s) missing.`);
  }
  return consumed;
}

function materialHasProperty(material, propertyId) {
  return materialPropertyIds(material).includes(propertyId);
}

function isResearchContainer(container) {
  const id = String(container?.containerId ?? "").trim().toLowerCase();
  const role = String(container?.presentation?.playerRole ?? "").trim().toLowerCase();
  return ["fob", "caravan"].includes(id) || ["fob", "caravan"].includes(role);
}

export function createCraftingRuntimeApi({ materialsApi, knowledgeApi, manifestApi, persistenceApi, weaponAugmentStateApi } = {}) {
  if (!materialsApi?.list || !materialsApi?.get) throw new Error("craftingMaterials API is required.");
  if (!knowledgeApi?.effective || !knowledgeApi?.discover) throw new Error("craftingKnowledge API is required.");
  if (!manifestApi?.consume || !manifestApi?.validate) throw new Error("expeditionManifest API is required.");
  if (!persistenceApi?.load || !persistenceApi?.save) throw new Error("expedition persistence API is required.");
  if (!weaponAugmentStateApi?.craft) throw new Error("weaponAugmentState API is required.");

  async function researchMaterialProperty({ actor, materialId, propertyId, expeditionId, containerId = "fob", source = "fob" } = {}) {
    if (!game.user?.isGM) throw new Error("Material research mutation is GM-only.");
    if (!actor?.uuid) return { green: false, reason: "research-actor-required" };
    if (!materialId) return { green: false, reason: "material-id-required" };
    if (!propertyId) return { green: false, reason: "property-id-required" };
    if (!expeditionId) return { green: false, reason: "expedition-id-required" };

    const manifest = await persistenceApi.load(expeditionId);
    if (!manifest) return { green: false, reason: "expedition-not-found", expeditionId };

    const container = manifest.containers?.find((candidate) => candidate.containerId === containerId);
    if (!container) return { green: false, reason: "research-container-not-found", expeditionId, containerId };

    if (!isResearchContainer(container)) {
      return { green: false, reason: "research-container-not-supported", expeditionId, containerId };
    }

    const material = await materialsApi.get(materialId);
    if (!material) return { green: false, reason: "material-not-found", materialId };
    if (!material.research?.discoverable) return { green: false, reason: "material-not-research-discoverable", materialId };
    if (!materialHasProperty(material, propertyId)) {
      return { green: false, reason: "material-property-not-found", materialId, propertyId };
    }

    const specimenEntries = (container.contents ?? []).filter((entry) =>
      materialData(entry)?.materialId === materialId &&
      Number(entry?.quantity) > 0 &&
      !["consumed", "deleted"].includes(entry?.itemRef?.lifecycle?.state)
    );
    const specimenQuantity = specimenEntries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const specimenRequired = material.research?.specimen?.required === true;
    if (specimenRequired && specimenQuantity < 1) {
      return { green: false, reason: "research-specimen-required", materialId, expeditionId, containerId };
    }
    if (material.research?.specimen?.consumed === true) {
      return { green: false, reason: "research-specimen-consumption-not-supported", materialId };
    }

    const discovery = await knowledgeApi.discover({
      actor,
      materialId,
      propertyId,
      specimenQuantity,
      source: { type: "research-station", location: source, expeditionId, containerId },
    });

    return {
      ...discovery,
      operation: "research-material-property",
      expeditionId,
      containerId,
      specimenQuantity,
      specimenConsumed: false,
    };
  }

  async function documentMaterialProperty({ actor, materialId, propertyId, expeditionId, containerId = "fob", source = "fob" } = {}) {
    if (!knowledgeApi?.document) throw new Error("craftingKnowledge document API is required.");
    if (!game.user?.isGM) throw new Error("Material documentation mutation is GM-only.");
    if (!actor?.uuid) return { green: false, reason: "documentation-actor-required" };
    if (!materialId) return { green: false, reason: "material-id-required" };
    if (!propertyId) return { green: false, reason: "property-id-required" };
    if (!expeditionId) return { green: false, reason: "expedition-id-required" };

    const manifest = await persistenceApi.load(expeditionId);
    if (!manifest) return { green: false, reason: "expedition-not-found", expeditionId };

    const container = manifest.containers?.find((candidate) => candidate.containerId === containerId);
    if (!container) return { green: false, reason: "documentation-container-not-found", expeditionId, containerId };

    const role = String(container.presentation?.playerRole ?? "").trim().toLowerCase();
    if (containerId !== "fob" && role !== "fob") {
      return { green: false, reason: "documentation-container-not-fob", expeditionId, containerId };
    }

    const material = await materialsApi.get(materialId);
    if (!material) return { green: false, reason: "material-not-found", materialId };
    if (!materialHasProperty(material, propertyId)) {
      return { green: false, reason: "material-property-not-found", materialId, propertyId };
    }

    const documentation = await knowledgeApi.document({ actor, materialId, propertyId });
    return {
      ...documentation,
      operation: "document-material-property",
      expeditionId,
      containerId,
      source,
      specimenRequired: false,
      specimenConsumed: false,
    };
  }

  async function planRecipe({
    crafter,
    recipeId,
    expeditionId,
  } = {}) {
    const recipe =
      await getCraftingRecipe(recipeId);

    if (!recipe) {
      return {
        green: false,
        reason: "recipe-not-found",
        recipeId,
      };
    }

    const manifest =
      await persistenceApi.load(expeditionId);

    if (!manifest) {
      return {
        green: false,
        reason: "expedition-not-found",
        expeditionId,
        recipeId,
      };
    }

    const containerId =
      resolveFobCraftContainerId(
        manifest
      );

    if (!containerId) {
      return {
        green: false,
        reason:
          "fob-storage-unavailable",
        expeditionId,
        recipeId,
        containerId: null,
      };
    }

    const container =
      manifest.containers?.find(
        (candidate) =>
          candidate.containerId ===
          containerId
      );

    if (!container) {
      return {
        green: false,
        reason:
          "fob-storage-unavailable",
        expeditionId,
        recipeId,
        containerId,
      };
    }

    const definitions =
      await materialsApi.list();

    const knownDefinitions =
      definitions.map(
        (material) =>
          knownMaterialDefinition(
            material,
            knowledgeApi,
            crafter
          )
      );

    const inventory =
      containerInventory(container);

    const allocation =
      allocateRecipe(
        recipe,
        inventory,
        knownDefinitions
      );

    return {
      ...allocation,

      recipeMode:
        recipeMode(recipe),

      expeditionId,
      containerId,

      recipe:
        clone(recipe),

      inventory,
    };
  }

  async function planWeaponAugment({
    crafter,
    augmentId,
    expeditionId,
  } = {}) {
    const recipe =
      await getCraftingRecipeForOutput(
        "weaponAugment",
        augmentId
      );

    if (!recipe) {
      return {
        green: false,
        reason: "biological-recipe-not-found",
        augmentId,
      };
    }

    const plan =
      await planRecipe({
        crafter,
        recipeId: recipe.id,
        expeditionId,
      });

    return {
      ...plan,
      augmentId,
    };
  }

  async function craftWeaponAugment({
    crafter,
    weapon,
    augmentId,
    expeditionId,
  } = {}) {
    if (!game.user?.isGM) throw new Error("Biological craft mutation is GM-only.");
    const plan =
      await planWeaponAugment({
        crafter,
        augmentId,
        expeditionId,
      });
    if (!plan.green) return plan;

    const original = await persistenceApi.load(expeditionId);
    const working = clone(original);
    const consumed =
      consumeAllocationFromContainer(
        manifestApi,
        working,
        plan.containerId,
        plan.allocations
      );
    const validation = manifestApi.validate(working);
    if (!validation.green) throw new Error(`Craft would create invalid expedition manifest: ${(validation.errors ?? []).join("; ")}`);

    await persistenceApi.save(working);
    try {
      const state = await weaponAugmentStateApi.craft(weapon, augmentId);
      return {
        green: true,
        operation: "craft",
        augmentId,
        expeditionId,
        containerId:
          plan.containerId,
        allocations:
          plan.allocations,
        consumed,
        state,
      };
    } catch (error) {
      try {
        await persistenceApi.save(original);
      } catch (rollbackError) {
        throw new Error(`Craft failed (${error.message}); material rollback also failed (${rollbackError.message}).`);
      }
      throw error;
    }
  }

  return Object.freeze({
    loadRecipes: loadCraftingRecipeCatalog,
    recipeForOutput: getCraftingRecipeForOutput,
    loadRecipeRegistry: loadCraftingRecipeCatalogRegistry,
    loadAllRecipes: loadCraftingRecipeCatalogs,
    listRecipes: listCraftingRecipes,
    getRecipe: getCraftingRecipe,
    resolveRecipe: resolveCraftingRecipe,
    researchMaterialProperty,
    documentMaterialProperty,
    planRecipe,
    planWeaponAugment,
    craftWeaponAugment,
  });
}
