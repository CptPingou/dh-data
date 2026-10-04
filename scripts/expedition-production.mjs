const PRODUCTION_SCHEMA =
  "daggerheart-campaign-toolkit/expedition-production@1";

const PRODUCTION_STATUSES =
  Object.freeze([
    "idle",
    "ready",
    "active",
    "blocked",
    "complete",
  ]);

function clone(value) {
  if (value == null) return value;

  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function nonEmpty(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function nonNegativeInteger(
  value,
  fallback = 0
) {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0
  ) {
    return fallback;
  }

  return Math.floor(numeric);
}

function positiveInteger(
  value,
  fallback = 1
) {
  const numeric =
    nonNegativeInteger(
      value,
      fallback
    );

  return numeric > 0
    ? numeric
    : fallback;
}

function normalizeReferences(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter(
      (value) =>
        value &&
        typeof value === "object"
    )
    .map(clone);
}

export function normalizeProductionState(
  production = {}
) {
  const steps =
    positiveInteger(
      production?.steps,
      1
    );

  const progress =
    Math.min(
      steps,
      nonNegativeInteger(
        production?.progress,
        0
      )
    );

  let status =
    PRODUCTION_STATUSES.includes(
      production?.status
    )
      ? production.status
      : "idle";

  if (progress >= steps) {
    status = "complete";
  }

  return {
    schema: PRODUCTION_SCHEMA,

    id:
      nonEmpty(production?.id)
        ? production.id.trim()
        : null,

    recipeId:
      nonEmpty(production?.recipeId)
        ? production.recipeId.trim()
        : null,

    status,

    progress,
    steps,

    workers:
      Array.isArray(production?.workers)
        ? [
            ...new Set(
              production.workers
                .filter(nonEmpty)
                .map((value) =>
                  value.trim()
                )
            ),
          ]
        : [],

    inputs:
      normalizeReferences(
        production?.inputs
      ),

    outputs:
      normalizeReferences(
        production?.outputs
      ),

    state:
      production?.state &&
      typeof production.state === "object" &&
      !Array.isArray(production.state)
        ? clone(production.state)
        : {},
  };
}

export function validateProductionState(
  input
) {
  const production =
    normalizeProductionState(input);

  const errors = [];

  if (!production.id) {
    errors.push(
      "production.id is required"
    );
  }

  if (
    production.status !== "idle" &&
    !production.recipeId
  ) {
    errors.push(
      "active production requires recipeId"
    );
  }

  return {
    green: errors.length === 0,
    errors,
    production,
  };
}

export function advanceProduction(
  input,
  {
    steps = 1,
  } = {}
) {
  const validation =
    validateProductionState(input);

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  const production =
    clone(validation.production);

  if (
    production.status === "blocked" ||
    production.status === "complete"
  ) {
    return production;
  }

  const increment =
    nonNegativeInteger(
      steps,
      0
    );

  production.progress =
    Math.min(
      production.steps,
      production.progress + increment
    );

  production.status =
    production.progress >=
    production.steps
      ? "complete"
      : "active";

  return production;
}

export function serializeProductionState(
  production
) {
  const validation =
    validateProductionState(
      production
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return JSON.stringify(
    validation.production,
    null,
    2
  );
}

export function parseProductionState(
  json
) {
  const parsed =
    typeof json === "string"
      ? JSON.parse(json)
      : clone(json);

  const validation =
    validateProductionState(
      parsed
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return validation.production;
}

export const expeditionProductionApi =
  Object.freeze({
    normalize:
      normalizeProductionState,
    validate:
      validateProductionState,
    advance:
      advanceProduction,
    serialize:
      serializeProductionState,
    parse:
      parseProductionState,
  });
