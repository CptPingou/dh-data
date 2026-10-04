import {
  normalizeProductionState,
} from "./expedition-production.mjs";

const COMPONENT_SCHEMA =
  "daggerheart-campaign-toolkit/expedition-component@1";

const SLOT_TYPES = Object.freeze([
  "character",
  "recipe",
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

export function normalizeComponentHp(
  hp = {}
) {
  const max =
    nonNegativeInteger(
      hp?.max,
      0
    );

  const value =
    Math.min(
      max,
      nonNegativeInteger(
        hp?.value,
        max
      )
    );

  return {
    value,
    max,
  };
}

export function normalizeComponentSlot(
  slot = {}
) {
  const type =
    SLOT_TYPES.includes(slot?.type)
      ? slot.type
      : null;

  if (!nonEmpty(slot?.id) || !type) {
    return null;
  }

  return {
    id: slot.id.trim(),
    type,
    occupantId:
      nonEmpty(slot?.occupantId)
        ? slot.occupantId.trim()
        : null,
    recipeId:
      nonEmpty(slot?.recipeId)
        ? slot.recipeId.trim()
        : null,
  };
}

export function normalizeExpeditionComponent(
  component = {}
) {
  const slots =
    Array.isArray(component?.slots)
      ? component.slots
          .map(normalizeComponentSlot)
          .filter(Boolean)
      : [];

  const capabilities =
    Array.isArray(component?.capabilities)
      ? [
          ...new Set(
            component.capabilities
              .filter(nonEmpty)
              .map((value) =>
                value.trim()
              )
          ),
        ]
      : [];

  const productions =
    Array.isArray(component?.productions)
      ? component.productions.map(
          normalizeProductionState
        )
      : [];

  return {
    schema: COMPONENT_SCHEMA,

    id:
      nonEmpty(component?.id)
        ? component.id.trim()
        : null,

    type:
      nonEmpty(component?.type)
        ? component.type.trim()
        : "component",

    name:
      nonEmpty(component?.name)
        ? component.name.trim()
        : null,

    hp:
      normalizeComponentHp(
        component?.hp
      ),

    containerId:
      nonEmpty(component?.containerId)
        ? component.containerId.trim()
        : null,

    slots,

    capabilities,

    productions,

    state:
      component?.state &&
      typeof component.state === "object" &&
      !Array.isArray(component.state)
        ? clone(component.state)
        : {},
  };
}

export function validateExpeditionComponent(
  input
) {
  const component =
    normalizeExpeditionComponent(input);

  const errors = [];

  if (!component.id) {
    errors.push(
      "component.id is required"
    );
  }

  const productionIds =
    component.productions
      .map(
        (production) =>
          production.id
      )
      .filter(Boolean);

  const duplicateProductions =
    productionIds.filter(
      (id, index) =>
        productionIds.indexOf(id) !==
        index
    );

  if (duplicateProductions.length) {
    errors.push(
      "duplicate component production id: " +
      [...new Set(
        duplicateProductions
      )].join(", ")
    );
  }

  for (
    const production of
    component.productions
  ) {
    if (!production.id) {
      errors.push(
        "component production.id is required"
      );
    }

    if (
      production.status !== "idle" &&
      !production.recipeId
    ) {
      errors.push(
        "component production " +
        (production.id ?? "?") +
        ": active production requires recipeId"
      );
    }
  }

  const slotIds =
    component.slots.map(
      (slot) => slot.id
    );

  const duplicates =
    slotIds.filter(
      (id, index) =>
        slotIds.indexOf(id) !== index
    );

  if (duplicates.length > 0) {
    errors.push(
      "duplicate component slot id: " +
      [...new Set(duplicates)].join(", ")
    );
  }

  return {
    green: errors.length === 0,
    errors,
    component,
  };
}

export function serializeExpeditionComponent(
  component
) {
  const validation =
    validateExpeditionComponent(
      component
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return JSON.stringify(
    validation.component,
    null,
    2
  );
}

export function parseExpeditionComponent(
  json
) {
  const parsed =
    typeof json === "string"
      ? JSON.parse(json)
      : clone(json);

  const validation =
    validateExpeditionComponent(
      parsed
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return validation.component;
}

export const expeditionComponentApi =
  Object.freeze({
    normalizeHp:
      normalizeComponentHp,
    normalizeSlot:
      normalizeComponentSlot,
    normalize:
      normalizeExpeditionComponent,
    validate:
      validateExpeditionComponent,
    serialize:
      serializeExpeditionComponent,
    parse:
      parseExpeditionComponent,
  });
