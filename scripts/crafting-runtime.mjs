import { validateRecipeCatalog } from "./crafting-schema.mjs";
import { allocateExactResourceRecipe, allocateRecipe } from "./crafting-recipe-engine.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const RECIPES_URL = `modules/${MODULE_ID}/data/crafting/recipes.json`;
let recipeCache = null;

const clone = (value) => value == null ? value : (globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

export async function loadCraftingRecipeCatalog({ force = false } = {}) {
  if (recipeCache && !force) return clone(recipeCache);
  const response = await fetch(RECIPES_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load crafting recipe catalog (${response.status}).`);
  const catalog = await response.json();
  validateRecipeCatalog(catalog);
  recipeCache = clone(catalog);
  return clone(recipeCache);
}

export async function getCraftingRecipeForOutput(outputType, outputId) {
  const catalog = await loadCraftingRecipeCatalog();
  return clone(catalog.recipes.find((recipe) => recipe.output?.type === outputType && recipe.output?.id === outputId) ?? null);
}

function materialData(entry) {
  return entry?.itemRef?.snapshot?.flags?.[MODULE_ID]?.material ?? null;
}

function craftingResourceData(entry) {
  return entry?.itemRef?.snapshot?.flags?.[MODULE_ID]?.crafting ?? null;
}

function canonicalCraftingResourceId(value) {
  const id = String(value ?? "").trim();
  if (!id) return null;
  return id.startsWith("mh.crafting.") ? id : `mh.crafting.${id}`;
}

function containerCraftingResourceInventory(container) {
  const totals = new Map();
  for (const entry of container?.contents ?? []) {
    const crafting = craftingResourceData(entry);
    const resourceId = canonicalCraftingResourceId(crafting?.resourceId);
    const quantity = Number(entry?.quantity) || 0;
    if (!resourceId || quantity <= 0) continue;
    totals.set(resourceId, (totals.get(resourceId) ?? 0) + quantity);
  }
  return [...totals].map(([resourceId, quantity]) => ({ resourceId, quantity }));
}

function containerInventory(container) {
  const totals = new Map();
  for (const entry of container?.contents ?? []) {
    const materialId = materialData(entry)?.materialId;
    const quantity = Number(entry?.quantity) || 0;
    if (!materialId || quantity <= 0) continue;
    totals.set(materialId, (totals.get(materialId) ?? 0) + quantity);
  }
  return [...totals].map(([materialId, quantity]) => ({ materialId, quantity }));
}

function knownMaterialDefinition(material, knowledgeApi, crafter) {
  const known = new Set(knowledgeApi.effective(crafter, material.id)?.properties ?? []);
  const copy = clone(material);
  copy.material.properties = copy.material.properties.filter((property) => known.has(property));
  if (copy.material.properties.length === 0) copy.material.properties = ["__unknown__"];
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

function consumeExactResourceAllocationFromContainer(manifestApi, manifest, containerId, allocations) {
  const required = new Map();
  for (const allocation of allocations) {
    required.set(allocation.resourceId, (required.get(allocation.resourceId) ?? 0) + allocation.quantity);
  }

  const container = manifest.containers.find((candidate) => candidate.containerId === containerId);
  if (!container) throw new Error(`Unknown crafting container: ${containerId}.`);

  const consumed = [];
  for (const [resourceId, total] of required) {
    let remaining = total;
    const entries = [...(container.contents ?? [])].filter((entry) => {
      const crafting = craftingResourceData(entry);
      return canonicalCraftingResourceId(crafting?.resourceId) === resourceId;
    });

    for (const entry of entries) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, Number(entry.quantity) || 0);
      if (quantity <= 0) continue;
      const result = manifestApi.consume(manifest, {
        containerId,
        entryId: entry.entryId,
        quantity,
        note: `Craft atelier : ${resourceId}`,
      });
      if (!result.changed) throw new Error(result.reason ?? `Unable to consume ${resourceId}.`);
      consumed.push({ resourceId, entryId: entry.entryId, quantity });
      remaining -= quantity;
    }

    if (remaining > 0) throw new Error(`Allocation drift for ${resourceId}: ${remaining} unit(s) missing.`);
  }

  return consumed;
}

function isExactResourceRecipe(recipe) {
  return Array.isArray(recipe?.requirements)
    && recipe.requirements.length > 0
    && recipe.requirements.every((requirement) => typeof requirement?.match?.resourceId === "string");
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

    const role = String(container.presentation?.playerRole ?? "").trim().toLowerCase();
    if (containerId !== "fob" && role !== "fob") {
      return { green: false, reason: "research-container-not-fob", expeditionId, containerId };
    }

    const material = await materialsApi.get(materialId);
    if (!material) return { green: false, reason: "material-not-found", materialId };
    if (!material.research?.discoverable) return { green: false, reason: "material-not-research-discoverable", materialId };
    if (!material.material?.properties?.includes(propertyId)) {
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
    if (!material.material?.properties?.includes(propertyId)) {
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

  async function planWeaponAugment({ crafter, augmentId, expeditionId, containerId = "caravan" } = {}) {
    const recipe = await getCraftingRecipeForOutput("weaponAugment", augmentId);
    if (!recipe) return { green: false, reason: "biological-recipe-not-found", augmentId };
    const manifest = await persistenceApi.load(expeditionId);
    if (!manifest) return { green: false, reason: "expedition-not-found", expeditionId };
    const container = manifest.containers?.find((candidate) => candidate.containerId === containerId);
    if (!container) return { green: false, reason: "crafting-container-not-found", containerId };

    if (isExactResourceRecipe(recipe)) {
      const inventory = containerCraftingResourceInventory(container);
      const allocation = allocateExactResourceRecipe(recipe, inventory);
      return {
        ...allocation,
        recipeMode: "exact-resource",
        augmentId,
        expeditionId,
        containerId,
        recipe: clone(recipe),
        inventory,
      };
    }

    const definitions = await materialsApi.list();
    const knownDefinitions = definitions.map((material) => knownMaterialDefinition(material, knowledgeApi, crafter));
    const inventory = containerInventory(container);
    const allocation = allocateRecipe(recipe, inventory, knownDefinitions);
    return {
      ...allocation,
      recipeMode: "biological",
      augmentId,
      expeditionId,
      containerId,
      recipe: clone(recipe),
      inventory,
    };
  }

  async function craftWeaponAugment({ crafter, weapon, augmentId, expeditionId, containerId = "caravan" } = {}) {
    if (!game.user?.isGM) throw new Error("Biological craft mutation is GM-only.");
    const plan = await planWeaponAugment({ crafter, augmentId, expeditionId, containerId });
    if (!plan.green) return plan;

    const original = await persistenceApi.load(expeditionId);
    const working = clone(original);
    const consumed = plan.recipeMode === "exact-resource"
      ? consumeExactResourceAllocationFromContainer(manifestApi, working, containerId, plan.allocations)
      : consumeAllocationFromContainer(manifestApi, working, containerId, plan.allocations);
    const validation = manifestApi.validate(working);
    if (!validation.green) throw new Error(`Craft would create invalid expedition manifest: ${(validation.errors ?? []).join("; ")}`);

    await persistenceApi.save(working);
    try {
      const state = await weaponAugmentStateApi.craft(weapon, augmentId);
      return { green: true, operation: "craft", augmentId, expeditionId, containerId, allocations: plan.allocations, consumed, state };
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
    researchMaterialProperty,
    documentMaterialProperty,
    planWeaponAugment,
    craftWeaponAugment,
  });
}
