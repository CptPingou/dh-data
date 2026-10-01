import {
  materialPropertyValue,
  recipeMode,
  validateMaterial,
  validateRecipe,
} from "./crafting-schema.mjs";

export function allocateExactResourceRecipe(recipe, inventory) {
  validateRecipe(recipe);
  if (!Array.isArray(inventory)) throw new Error("inventory must be an array.");

  const available = new Map();
  for (const stack of inventory) {
    if (!stack || typeof stack.resourceId !== "string" || !stack.resourceId.trim() || !Number.isInteger(stack.quantity) || stack.quantity < 0) {
      throw new Error("Invalid inventory crafting-resource stack.");
    }
    available.set(stack.resourceId, (available.get(stack.resourceId) ?? 0) + stack.quantity);
  }

  const allocations = [];
  const missing = [];
  for (const requirement of recipe.requirements) {
    const resourceId = requirement?.match?.resourceId;
    if (typeof resourceId !== "string" || !resourceId.trim()) throw new Error(`Recipe ${recipe.id} is not an exact-resource recipe.`);
    const quantity = available.get(resourceId) ?? 0;
    if (quantity < requirement.units) {
      missing.push({ requirementId: requirement.id, resourceId, requiredUnits: requirement.units, availableUnits: quantity, missingUnits: requirement.units - quantity });
      continue;
    }
    allocations.push({ requirementId: requirement.id, resourceId, quantity: requirement.units });
  }

  if (missing.length) return { green: false, reason: "insufficient-components", recipeId: recipe.id, allocations: [], missing };
  return { green: true, recipeId: recipe.id, allocations, missing: [] };
}

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
  if (recipeMode(recipe) !== "property-budget") throw new Error(`Recipe ${recipe.id} is not a property-budget recipe.`);
  if (!Array.isArray(inventory)) throw new Error("inventory must be an array.");
  if (!Array.isArray(materialCatalog)) throw new Error("materialCatalog must be an array.");

  const byId = new Map();
  for (const material of materialCatalog) {
    validateMaterial(material);
    byId.set(material.id, material);
  }

  const stacks = inventory
    .map((stack) => {
      if (!stack || typeof stack.materialId !== "string" || !Number.isInteger(stack.quantity) || stack.quantity < 0) throw new Error("Invalid inventory material stack.");
      const material = byId.get(stack.materialId);
      if (!material) throw new Error(`Unknown inventory material: ${stack.materialId}.`);
      return { materialId: stack.materialId, quantity: stack.quantity, material };
    })
    .filter((stack) => stack.quantity > 0)
    .sort((a, b) => a.materialId.localeCompare(b.materialId));

  const requirements = recipe.requirements.map((requirement) => ({
    id: requirement.id,
    target: requirement.value,
    requirement,
  }));

  const contributions = stacks.map((stack) => requirements.map(({ requirement }) => budgetContribution(stack.material, requirement)));

  const missing = requirements.map((req, reqIndex) => {
    const availableValue = stacks.reduce((sum, stack, stackIndex) => sum + contributions[stackIndex][reqIndex] * stack.quantity, 0);
    return {
      requirementId: req.id,
      propertyId: req.requirement.match.property,
      requiredValue: req.target,
      availableValue,
      missingValue: Math.max(0, req.target - availableValue),
    };
  }).filter((entry) => entry.missingValue > 0);

  if (missing.length) {
    return { green: false, reason: "insufficient-property-budget", recipeId: recipe.id, allocations: [], missing };
  }

  const memo = new Map();
  function solve(index, remaining) {
    if (remaining.every((value) => value <= 0)) return { units: 0, counts: Array(stacks.length).fill(0) };
    if (index >= stacks.length) return null;

    const key = `${index}|${remaining.map((value) => Math.max(0, value)).join(",")}`;
    if (memo.has(key)) return memo.get(key);

    const stack = stacks[index];
    const vector = contributions[index];
    const useful = vector.some((value, reqIndex) => value > 0 && remaining[reqIndex] > 0);
    const maxUseful = useful
      ? Math.min(
          stack.quantity,
          Math.max(...remaining.map((value, reqIndex) => vector[reqIndex] > 0 ? Math.ceil(Math.max(0, value) / vector[reqIndex]) : 0)),
        )
      : 0;

    let best = null;
    for (let count = 0; count <= maxUseful; count += 1) {
      const nextRemaining = remaining.map((value, reqIndex) => Math.max(0, value - vector[reqIndex] * count));
      const tail = solve(index + 1, nextRemaining);
      if (!tail) continue;
      const candidate = { units: count + tail.units, counts: [...tail.counts] };
      candidate.counts[index] = count;
      if (!best || candidate.units < best.units) best = candidate;
    }

    memo.set(key, best);
    return best;
  }

  const solution = solve(0, requirements.map((req) => req.target));
  if (!solution) {
    return { green: false, reason: "property-allocation-conflict", recipeId: recipe.id, allocations: [], missing: [{ requirementId: "allocation-conflict", missingValue: 1 }] };
  }

  const allocations = stacks
    .map((stack, index) => ({ materialId: stack.materialId, quantity: solution.counts[index] ?? 0 }))
    .filter((entry) => entry.quantity > 0);

  const achieved = requirements.map((req, reqIndex) => ({
    requirementId: req.id,
    propertyId: req.requirement.match.property,
    requiredValue: req.target,
    achievedValue: allocations.reduce((sum, allocation) => {
      const stackIndex = stacks.findIndex((stack) => stack.materialId === allocation.materialId);
      return sum + contributions[stackIndex][reqIndex] * allocation.quantity;
    }, 0),
  }));

  return { green: true, recipeId: recipe.id, allocations, achieved, totalUnits: solution.units, missing: [] };
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
