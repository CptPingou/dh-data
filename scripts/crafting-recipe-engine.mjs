import {
  materialPropertyValue,
  recipeMode,
  validateMaterial,
  validateRecipe,
} from "./crafting-schema.mjs";

function legacyMatches(material, match) {
  if (match.materialId !== undefined && material.id !== match.materialId) return false;
  if (match.family !== undefined && material.material.family !== match.family) return false;
  if (match.property !== undefined && materialPropertyValue(material, match.property) <= 0) return false;
  if (match.minimumQuality !== undefined && material.material.quality < match.minimumQuality) return false;
  return true;
}

function budgetContribution(material, requirement) {
  const match = requirement.match;
  if (match.materialId !== undefined && material.id !== match.materialId) return 0;
  if (match.family !== undefined && material.material.family !== match.family) return 0;
  if (match.minimumQuality !== undefined && material.material.quality < match.minimumQuality) return 0;
  return materialPropertyValue(material, match.property);
}

export function materialMatchesRequirement(material, requirement) {
  validateMaterial(material);
  if (!requirement || typeof requirement !== "object" || !requirement.match) throw new Error("requirement is invalid.");
  if (requirement.value !== undefined) return budgetContribution(material, requirement) > 0;
  return legacyMatches(material, requirement.match);
}

export function allocatePropertyBudgetRecipe(recipe, inventory, materialCatalog) {
  validateRecipe(recipe);
  if (recipeMode(recipe) !== "property-budget")
    throw new Error(`Recipe ${recipe.id} is not a property-budget recipe.`);
  if (!Array.isArray(inventory) || !Array.isArray(materialCatalog))
    throw new Error("Invalid inventory or material catalog.");

  const byId = new Map();
  for (const material of materialCatalog) {
    validateMaterial(material);
    byId.set(material.id, material);
  }

  const stacks = inventory
    .map(stack => {
      if (!stack || typeof stack.materialId !== "string" ||
          !Number.isSafeInteger(stack.quantity) || stack.quantity < 0)
        throw new Error("Invalid inventory material stack.");
      const material = byId.get(stack.materialId);
      if (!material)
        throw new Error(`Unknown inventory material: ${stack.materialId}.`);
      return { materialId: stack.materialId, quantity: stack.quantity, material };
    })
    .filter(stack => stack.quantity > 0)
    .sort((a, b) => a.materialId.localeCompare(b.materialId));

  const requirements = recipe.requirements;
  const missing = requirements.map(requirement => {
    const availableValue = stacks.reduce(
      (max, stack) => Math.max(max, budgetContribution(stack.material, requirement)), 0
    );
    return {
      requirementId: requirement.id,
      propertyId: requirement.match.property,
      requiredValue: requirement.value,
      availableValue,
      missingValue: Math.max(0, requirement.value - availableValue),
    };
  }).filter(entry => entry.missingValue > 0);

  if (missing.length)
    return {
      green: false,
      reason: "insufficient-property-threshold",
      recipeId: recipe.id,
      allocations: [],
      missing,
    };

  // Une unité d'un matériau peut couvrir plusieurs propriétés.
  // Recherche de la combinaison avec le moins d'unités consommées.
  const candidates = stacks.filter(stack =>
    requirements.some(requirement =>
      budgetContribution(stack.material, requirement) >= requirement.value
    )
  );

  let best = null;

  function search(index, chosen, covered) {
    if (covered.every(Boolean)) {
      if (!best || chosen.length < best.length)
        best = [...chosen];
      return;
    }

    if (index >= candidates.length) return;
    if (best && chosen.length >= best.length) return;

    const stack = candidates[index];
    const nextCovered = requirements.map((requirement, i) =>
      covered[i] ||
      budgetContribution(stack.material, requirement) >= requirement.value
    );

    search(index + 1, [...chosen, stack], nextCovered);
    search(index + 1, chosen, covered);
  }

  search(0, [], requirements.map(() => false));

  if (!best)
    return {
      green: false,
      reason: "property-allocation-conflict",
      recipeId: recipe.id,
      allocations: [],
      missing: [],
    };

  const allocations = best.map(stack => ({
    materialId: stack.materialId,
    quantity: 1,
  }));

  const achieved = requirements.map(requirement => ({
    requirementId: requirement.id,
    propertyId: requirement.match.property,
    requiredValue: requirement.value,
    achievedValue: best.reduce(
      (max, stack) => Math.max(max, budgetContribution(stack.material, requirement)), 0
    ),
  }));

  return {
    green: true,
    recipeId: recipe.id,
    allocations,
    achieved,
    totalUnits: allocations.length,
    missing: [],
  };
}
export function allocateRecipe(recipe, inventory, materialCatalog) {
  validateRecipe(recipe);
  if (recipeMode(recipe) === "property-budget") return allocatePropertyBudgetRecipe(recipe, inventory, materialCatalog);
  if (!Array.isArray(inventory)) throw new Error("inventory must be an array.");
  if (!Array.isArray(materialCatalog)) throw new Error("materialCatalog must be an array.");

  const byId = new Map();
  for (const material of materialCatalog) { validateMaterial(material); byId.set(material.id, material); }
  const available = new Map();
  for (const stack of inventory) {
    if (!stack || typeof stack.materialId !== "string" || !Number.isInteger(stack.quantity) || stack.quantity < 0) throw new Error("Invalid inventory material stack.");
    if (!byId.has(stack.materialId)) throw new Error(`Unknown inventory material: ${stack.materialId}.`);
    available.set(stack.materialId, (available.get(stack.materialId) ?? 0) + stack.quantity);
  }

  const demands = recipe.requirements.flatMap((requirement) =>
    Array.from({ length: requirement.units }, () => ({
      requirementId: requirement.id,
      candidates: materialCatalog.filter((material) => (available.get(material.id) ?? 0) > 0 && legacyMatches(material, requirement.match)).map((material) => material.id),
    })),
  ).sort((a, b) => a.candidates.length - b.candidates.length);

  const chosen = [];
  function solve(index) {
    if (index >= demands.length) return true;
    const demand = demands[index];
    for (const materialId of demand.candidates) {
      const quantity = available.get(materialId) ?? 0;
      if (quantity <= 0) continue;
      available.set(materialId, quantity - 1);
      chosen.push({ requirementId: demand.requirementId, materialId });
      if (solve(index + 1)) return true;
      chosen.pop();
      available.set(materialId, quantity);
    }
    return false;
  }

  if (!solve(0)) {
    const missing = recipe.requirements.map((requirement) => {
      const compatibleUnits = inventory.reduce((sum, stack) => {
        const material = byId.get(stack.materialId);
        return sum + (legacyMatches(material, requirement.match) ? stack.quantity : 0);
      }, 0);
      return { requirementId: requirement.id, missingUnits: Math.max(0, requirement.units - compatibleUnits) };
    }).filter((entry) => entry.missingUnits > 0);
    return { green: false, reason: "insufficient-materials", recipeId: recipe.id, allocations: [], missing: missing.length ? missing : [{ requirementId: "allocation-conflict", missingUnits: 1 }] };
  }

  const grouped = new Map();
  for (const entry of chosen) {
    const key = `${entry.requirementId}\u0000${entry.materialId}`;
    const current = grouped.get(key) ?? { requirementId: entry.requirementId, materialId: entry.materialId, quantity: 0 };
    current.quantity += 1;
    grouped.set(key, current);
  }
  return { green: true, recipeId: recipe.id, allocations: [...grouped.values()], missing: [] };
}

// Validate an explicit material choice against the current inventory and recipe.
// Unlike the automatic solver, this never silently substitutes materials.
export function validateRecipeSelection(recipe, inventory, materialCatalog, selection) {
  validateRecipe(recipe);
  if (!Array.isArray(selection) || !Array.isArray(inventory) || !Array.isArray(materialCatalog))
    return { green: false, reason: "craft-selection-invalid" };
  const catalog = new Map(materialCatalog.map(m => { validateMaterial(m); return [m.id, m]; }));
  const stock = new Map();
  for (const stack of inventory) {
    if (!stack || typeof stack.materialId !== "string" || !Number.isSafeInteger(stack.quantity) || stack.quantity < 0)
      return { green: false, reason: "craft-inventory-invalid" };
    stock.set(stack.materialId, (stock.get(stack.materialId) ?? 0) + stack.quantity);
  }
  const selected = new Map();
  for (const entry of selection) {
    if (!entry || typeof entry.materialId !== "string" || !Number.isSafeInteger(entry.quantity) || entry.quantity <= 0 || !catalog.has(entry.materialId))
      return { green: false, reason: "craft-selection-invalid" };
    selected.set(entry.materialId, (selected.get(entry.materialId) ?? 0) + entry.quantity);
  }
  for (const [id, quantity] of selected) {
    if (quantity > (stock.get(id) ?? 0)) return { green: false, reason: "craft-selection-stock-changed", materialId: id };
  }
  const allocations = [...selected].map(([materialId, quantity]) => ({ materialId, quantity }));
  if (recipeMode(recipe) === "property-budget") {
    const achieved = recipe.requirements.map(requirement => {
      const achievedValue = allocations.reduce((max, a) => Math.max(max, budgetContribution(catalog.get(a.materialId), requirement)), 0);
      return { requirementId: requirement.id, propertyId: requirement.match.property, requiredValue: requirement.value, achievedValue };
    });
    const missing = achieved.filter(a => a.achievedValue < a.requiredValue).map(a => ({ ...a, missingValue: a.requiredValue - a.achievedValue }));
    return missing.length ? { green: false, reason: "craft-selection-insufficient-properties", missing } :
      { green: true, recipeId: recipe.id, allocations, achieved, totalUnits: allocations.reduce((n,a) => n+a.quantity,0), missing: [] };
  }
  // Legacy recipes: allocate the chosen units across distinct requirement slots.
  const demands = recipe.requirements.flatMap(r => Array.from({length:r.units}, () => r));
  const remaining = new Map(selected);
  function solve(index) {
    if (index === demands.length) return true;
    for (const [id, count] of remaining) {
      if (count <= 0 || !legacyMatches(catalog.get(id), demands[index].match)) continue;
      remaining.set(id, count - 1);
      if (solve(index + 1)) return true;
      remaining.set(id, count);
    }
    return false;
  }
  if (allocations.reduce((n,a)=>n+a.quantity,0) !== demands.length || !solve(0))
    return { green: false, reason: "craft-selection-requirements-not-met" };
  return { green: true, recipeId: recipe.id, allocations, missing: [] };
}
