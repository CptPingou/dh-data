const clone = (value) =>
  value == null
    ? value
    : globalThis.structuredClone
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

function flag(value) {
  return value === true;
}

function requirementProjection(
  requirement,
  plan
) {
  const requirementId =
    requirement?.id ?? null;

  const missing =
    (plan?.missing ?? []).find(
      (entry) =>
        entry?.requirementId ===
        requirementId
    ) ?? null;

  const achieved =
    (plan?.achieved ?? []).find(
      (entry) =>
        entry?.requirementId ===
        requirementId
    ) ?? null;

  const propertyId =
    requirement?.match?.property ?? null;

  const requiredValue =
    Number.isFinite(requirement?.value)
      ? requirement.value
      : null;

  const requiredUnits =
    Number.isInteger(requirement?.units)
      ? requirement.units
      : null;

  return {
    requirementId,
    propertyId,

    match: {
      family:
        requirement?.match?.family ?? null,

      minimumQuality:
        Number.isFinite(
          requirement?.match?.minimumQuality
        )
          ? requirement.match.minimumQuality
          : null,
    },

    requiredValue,
    requiredUnits,

    achievedValue:
      Number.isFinite(achieved?.achievedValue)
        ? achieved.achievedValue
        : null,

    availableValue:
      Number.isFinite(missing?.availableValue)
        ? missing.availableValue
        : null,

    missingValue:
      Number.isFinite(missing?.missingValue)
        ? missing.missingValue
        : null,

    missingUnits:
      Number.isFinite(missing?.missingUnits)
        ? missing.missingUnits
        : null,

    satisfied:
      plan?.green === true ||
      (
        missing == null &&
        plan != null
      ),
  };
}

export function projectWorkshopRecipe(
  recipe,
  {
    plan = null,
    capabilities = {},
  } = {}
) {
  if (!recipe?.id) {
    throw new Error(
      "Workshop recipe projection requires recipe.id."
    );
  }

  const canView =
    flag(capabilities.view);

  if (!canView) {
    return null;
  }

  const planned =
    plan != null;

  const craftable =
    planned &&
    plan.green === true;

  return {
    recipeId: recipe.id,
    name: recipe.name ?? recipe.id,
    mode: recipe.mode ?? null,

    output: {
      type: recipe.output?.type ?? null,
      id: recipe.output?.id ?? null,
    },

    requirements:
      (recipe.requirements ?? []).map(
        (requirement) =>
          requirementProjection(
            requirement,
            plan
          )
      ),

    planning: {
      planned,
      green: planned
        ? plan.green === true
        : null,

      reason:
        plan?.reason ?? null,

      totalUnits:
        Number.isFinite(plan?.totalUnits)
          ? plan.totalUnits
          : null,

      allocations:
        clone(plan?.allocations ?? []),

      missing:
        clone(plan?.missing ?? []),
    },

    capabilities: {
      view: true,

      craft:
        flag(capabilities.craft) &&
        craftable,
    },
  };
}

export function projectWorkshop({
  recipes = [],
  plans = {},
  capabilities = {},
} = {}) {
  const projectedRecipes = [];

  for (const recipe of recipes ?? []) {
    const projected =
      projectWorkshopRecipe(recipe, {
        plan:
          plans?.[recipe?.id] ?? null,

        capabilities,
      });

    if (projected) {
      projectedRecipes.push(projected);
    }
  }

  return {
    schemaVersion: 1,
    kind: "expedition-workshop-projection",

    capabilities: {
      view: flag(capabilities.view),
      craft: flag(capabilities.craft),
    },

    recipes: projectedRecipes,
  };
}
