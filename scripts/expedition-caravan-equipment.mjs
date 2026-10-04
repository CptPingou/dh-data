const clone = (value) =>
  value == null
    ? value
    : (
        globalThis.structuredClone
          ? structuredClone(value)
          : JSON.parse(
              JSON.stringify(value)
            )
      );

function nonEmpty(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

export const CARAVAN_EQUIPMENT_CATALOG =
  Object.freeze([
    Object.freeze({
      id:
        "chest",

      type:
        "storage-chest",

      name:
        "Coffre",

      hp: Object.freeze({
        value: 10,
        max: 10,
      }),

      storage:
        true,
    }),

    Object.freeze({
      id:
        "barrel",

      type:
        "storage-barrel",

      name:
        "Tonneau",

      hp: Object.freeze({
        value: 10,
        max: 10,
      }),

      storage:
        true,
    }),

    Object.freeze({
      id:
        "stretcher",

      type:
        "stretcher",

      name:
        "Civi\u00e8re",

      hp: Object.freeze({
        value: 10,
        max: 10,
      }),

      storage:
        false,
    }),
  ]);

export function caravanEquipmentDefinition(
  definitionId
) {
  const id =
    String(
      definitionId ?? ""
    ).trim();

  return (
    CARAVAN_EQUIPMENT_CATALOG
      .find(
        (definition) =>
          definition.id === id
      ) ??
    null
  );
}

export function createCaravanEquipmentComponent(
  definitionId,
  {
    componentId = null,
    name = null,
    containerId = null,
    state = {},
  } = {}
) {
  const definition =
    caravanEquipmentDefinition(
      definitionId
    );

  if (!definition) {
    throw new Error(
      "Unknown caravan equipment definition " +
      String(definitionId)
    );
  }

  const resolvedComponentId =
    nonEmpty(componentId)
      ? componentId.trim()
      : null;

  if (!resolvedComponentId) {
    throw new Error(
      "Caravan equipment componentId is required"
    );
  }

  const resolvedContainerId =
    nonEmpty(containerId)
      ? containerId.trim()
      : null;

  if (
    !definition.storage &&
    resolvedContainerId
  ) {
    throw new Error(
      "Non-storage caravan equipment cannot reference a container"
    );
  }

  return {
    id:
      resolvedComponentId,

    type:
      definition.type,

    name:
      nonEmpty(name)
        ? name.trim()
        : definition.name,

    hp:
      clone(
        definition.hp
      ),

    containerId:
      resolvedContainerId,

    /*
     * Cargo placement is represented by
     * caravan.cargoSlots[].layout.
     *
     * The component still carries a normalized
     * placeholder layout for compatibility with
     * the caravan component schema.
     */
    layout: {
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
      rotation: 0,
    },

    state: {
      ...clone(state),
      equipmentDefinitionId:
        definition.id,
    },
  };
}

export function installCaravanComponentInSlot(
  caravan,
  {
    slotId,
    component,
  } = {}
) {
  if (
    !caravan ||
    typeof caravan !== "object" ||
    Array.isArray(caravan)
  ) {
    throw new Error(
      "Caravan is required"
    );
  }

  if (
    !component ||
    typeof component !== "object" ||
    Array.isArray(component) ||
    !nonEmpty(component.id)
  ) {
    throw new Error(
      "Caravan component is required"
    );
  }

  const next =
    clone(caravan);

  const slot =
    (next.cargoSlots ?? [])
      .find(
        (candidate) =>
          candidate.id === slotId
      );

  if (!slot) {
    throw new Error(
      "Unknown caravan cargo slot " +
      String(slotId)
    );
  }

  if (slot.componentId) {
    throw new Error(
      "Caravan cargo slot " +
      slotId +
      " is already occupied"
    );
  }

  const existingComponent =
    (next.components ?? [])
      .find(
        (candidate) =>
          candidate.id ===
          component.id
      );

  if (existingComponent) {
    throw new Error(
      "Caravan component id already exists " +
      component.id
    );
  }

  const alreadyAssigned =
    (next.cargoSlots ?? [])
      .some(
        (candidate) =>
          candidate.componentId ===
          component.id
      );

  if (alreadyAssigned) {
    throw new Error(
      "Caravan component " +
      component.id +
      " is already installed"
    );
  }

  next.components ??= [];

  next.components.push(
    clone(component)
  );

  slot.componentId =
    component.id;

  return {
    caravan:
      next,

    component:
      clone(component),

    slotId:
      slot.id,
  };
}

export function removeCaravanComponentFromSlot(
  caravan,
  {
    slotId,
  } = {}
) {
  if (
    !caravan ||
    typeof caravan !== "object" ||
    Array.isArray(caravan)
  ) {
    throw new Error(
      "Caravan is required"
    );
  }

  const next =
    clone(caravan);

  const slot =
    (next.cargoSlots ?? [])
      .find(
        (candidate) =>
          candidate.id === slotId
      );

  if (!slot) {
    throw new Error(
      "Unknown caravan cargo slot " +
      String(slotId)
    );
  }

  if (!slot.componentId) {
    return {
      changed:
        false,

      reason:
        "cargo-slot-empty",

      caravan:
        next,

      component:
        null,

      slotId:
        slot.id,
    };
  }

  const componentId =
    slot.componentId;

  const component =
    (next.components ?? [])
      .find(
        (candidate) =>
          candidate.id ===
          componentId
      ) ?? null;

  slot.componentId =
    null;

  next.components =
    (next.components ?? [])
      .filter(
        (candidate) =>
          candidate.id !==
          componentId
      );

  return {
    changed:
      true,

    reason:
      null,

    caravan:
      next,

    component:
      clone(component),

    slotId:
      slot.id,
  };
}

export const expeditionCaravanEquipment = {
  catalog:
    CARAVAN_EQUIPMENT_CATALOG,

  definition:
    caravanEquipmentDefinition,

  createComponent:
    createCaravanEquipmentComponent,

  install:
    installCaravanComponentInSlot,

  remove:
    removeCaravanComponentFromSlot,
};
