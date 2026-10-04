import {
  normalizeExpeditionComponent,
  validateExpeditionComponent,
} from "./expedition-component.mjs";

const FOB_SCHEMA =
  "daggerheart-campaign-toolkit/expedition-fob@1";

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

function positiveInteger(
  value,
  fallback = 1
) {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric < 1
  ) {
    return fallback;
  }

  return Math.floor(numeric);
}

export function normalizeFobSlot(
  slot = {}
) {
  return {
    id:
      nonEmpty(slot?.id)
        ? slot.id.trim()
        : null,

    componentId:
      nonEmpty(slot?.componentId)
        ? slot.componentId.trim()
        : null,

    enabled:
      slot?.enabled !== false,

    state:
      slot?.state &&
      typeof slot.state === "object" &&
      !Array.isArray(slot.state)
        ? clone(slot.state)
        : {},
  };
}

export function normalizeExpeditionFob(
  fob = {}
) {
  let components =
    Array.isArray(fob?.components)
      ? fob.components.map(
          normalizeExpeditionComponent
        )
      : [];

  let slots =
    Array.isArray(fob?.slots)
      ? fob.slots.map(
          normalizeFobSlot
        )
      : [];

  /*
   * Canonical FOB workshop card.
   * It owns no storage: research reads the
   * canonical FOB deposit.
   */
  const studyCenterId =
    "study-center";

  if (
    !components.some(
      (component) =>
        component?.id ===
        studyCenterId
    )
  ) {
    components = [
      ...components,

      normalizeExpeditionComponent({
        id:
          studyCenterId,

        type:
          "workshop",

        name:
          "Centre d\u2019\u00e9tude",

        hp: {
          value: 1,
          max: 1,
        },

        containerId:
          null,

        slots:
          [],

        capabilities: [
          "research",
        ],

        productions:
          [],

        state: {
          cardKind:
            "study-center",
        },
      }),
    ];
  }

  if (
    !slots.some(
      (slot) =>
        slot?.componentId ===
        studyCenterId
    )
  ) {
    const usedSlotIds =
      new Set(
        slots
          .map(
            (slot) =>
              slot?.id
          )
          .filter(Boolean)
      );

    let slotId =
      "study-center-slot";

    let suffix = 2;

    while (
      usedSlotIds.has(slotId)
    ) {
      slotId =
        "study-center-slot-" +
        suffix;

      suffix += 1;
    }

    slots = [
      ...slots,

      normalizeFobSlot({
        id:
          slotId,

        componentId:
          studyCenterId,

        enabled:
          true,

        state: {},
      }),
    ];
  }

  return {
    schema: FOB_SCHEMA,

    id:
      nonEmpty(fob?.id)
        ? fob.id.trim()
        : "fob",

    name:
      nonEmpty(fob?.name)
        ? fob.name.trim()
        : "FOB",

    locationRef:
      nonEmpty(
        fob?.locationRef
      )
        ? fob.locationRef.trim()
        : null,

    storageContainerId:
      nonEmpty(
        fob?.storageContainerId
      )
        ? fob.storageContainerId.trim()
        : null,

    slotCount:
      Math.max(
        positiveInteger(
          fob?.slotCount,
          1
        ),
        slots.length
      ),

    slots,

    components,

    state:
      fob?.state &&
      typeof fob.state === "object" &&
      !Array.isArray(fob.state)
        ? clone(fob.state)
        : {},
  };
}

export function validateExpeditionFob(
  input,
  {
    containerIds = null,
  } = {}
) {
  const fob =
    normalizeExpeditionFob(input);

  const errors = [];

  if (
    fob.locationRef != null &&
    !nonEmpty(
      fob.locationRef
    )
  ) {
    errors.push(
      "fob.locationRef must be a non-empty string or null"
    );
  }

  if (!fob.storageContainerId) {
    errors.push(
      "fob.storageContainerId is required"
    );
  }

  if (
    containerIds &&
    !containerIds.has(
      fob.storageContainerId
    )
  ) {
    errors.push(
      "unknown FOB storage container " +
      fob.storageContainerId
    );
  }

  const componentIds =
    fob.components
      .map((component) => component.id)
      .filter(Boolean);

  const duplicateComponents =
    componentIds.filter(
      (id, index) =>
        componentIds.indexOf(id) !== index
    );

  if (duplicateComponents.length) {
    errors.push(
      "duplicate FOB component id: " +
      [...new Set(
        duplicateComponents
      )].join(", ")
    );
  }

  for (const component of fob.components) {
    const validation =
      validateExpeditionComponent(
        component
      );

    if (!validation.green) {
      for (
        const error of validation.errors
      ) {
        errors.push(
          "component " +
          (component.id ?? "?") +
          ": " +
          error
        );
      }
    }

    if (
      component.containerId &&
      containerIds &&
      !containerIds.has(
        component.containerId
      )
    ) {
      errors.push(
        "component " +
        component.id +
        ": unknown container " +
        component.containerId
      );
    }
  }

  const slotIds =
    fob.slots
      .map((slot) => slot.id)
      .filter(Boolean);

  const duplicateSlots =
    slotIds.filter(
      (id, index) =>
        slotIds.indexOf(id) !== index
    );

  if (duplicateSlots.length) {
    errors.push(
      "duplicate FOB slot id: " +
      [...new Set(
        duplicateSlots
      )].join(", ")
    );
  }

  for (const slot of fob.slots) {
    if (!slot.id) {
      errors.push(
        "FOB slot.id is required"
      );
    }

    if (
      slot.componentId &&
      !componentIds.includes(
        slot.componentId
      )
    ) {
      errors.push(
        "FOB slot " +
        (slot.id ?? "?") +
        ": unknown component " +
        slot.componentId
      );
    }
  }

  if (
    fob.slots.length >
    fob.slotCount
  ) {
    errors.push(
      "FOB slots exceed slotCount"
    );
  }

  return {
    green: errors.length === 0,
    errors,
    fob,
  };
}

export function serializeExpeditionFob(
  fob,
  options = {}
) {
  const validation =
    validateExpeditionFob(
      fob,
      options
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return JSON.stringify(
    validation.fob,
    null,
    2
  );
}

export function parseExpeditionFob(
  json,
  options = {}
) {
  const parsed =
    typeof json === "string"
      ? JSON.parse(json)
      : clone(json);

  const validation =
    validateExpeditionFob(
      parsed,
      options
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return validation.fob;
}

export const expeditionFobApi =
  Object.freeze({
    normalizeSlot:
      normalizeFobSlot,
    normalize:
      normalizeExpeditionFob,
    validate:
      validateExpeditionFob,
    serialize:
      serializeExpeditionFob,
    parse:
      parseExpeditionFob,
  });
