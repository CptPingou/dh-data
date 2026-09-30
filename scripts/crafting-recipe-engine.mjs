import { validateMaterial, validateRecipe } from "./crafting-schema.mjs";

function matches(material, match) {
  if (match.materialId !== undefined && material.id !== match.materialId) return false;
  if (match.family !== undefined && material.material.family !== match.family) return false;
  if (match.property !== undefined && !material.material.properties.includes(match.property)) return false;
  if (match.minimumQuality !== undefined && material.material.quality < match.minimumQuality) return false;
  return true;
}

export function materialMatchesRequirement(material, requirement) {
  validateMaterial(material);
  if (!requirement || typeof requirement !== "object" || !requirement.match) throw new Error("requirement is invalid.");
  return matches(material, requirement.match);
}

export function allocateRecipe(recipe, inventory, materialCatalog) {
  validateRecipe(recipe);
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

  // Expand requirements into unit demands, then solve the allocation globally.
  // The most constrained units are tried first so polyvalent materials are not
  // consumed prematurely by generic requirements.
  const demands = recipe.requirements.flatMap((requirement) =>
    Array.from({ length: requirement.units }, () => ({
      requirementId: requirement.id,
      candidates: materialCatalog
        .filter((material) => (available.get(material.id) ?? 0) > 0 && matches(material, requirement.match))
        .map((material) => material.id),
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
    // Produce deterministic diagnostics without pretending a partial plan is craftable.
    const missing = recipe.requirements.map((requirement) => {
      const compatibleUnits = inventory.reduce((sum, stack) => {
        const material = byId.get(stack.materialId);
        return sum + (matches(material, requirement.match) ? stack.quantity : 0);
      }, 0);
      return { requirementId: requirement.id, missingUnits: Math.max(0, requirement.units - compatibleUnits) };
    }).filter((entry) => entry.missingUnits > 0);

    return { green: false, recipeId: recipe.id, allocations: [], missing: missing.length ? missing : [{ requirementId: "allocation-conflict", missingUnits: 1 }] };
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
