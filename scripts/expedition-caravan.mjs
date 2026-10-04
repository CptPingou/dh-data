const CARAVAN_SCHEMA =
  "daggerheart-campaign-toolkit/expedition-caravan@1";

const clone = (value) =>
  value == null
    ? value
    : JSON.parse(JSON.stringify(value));

const nonEmpty = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const finiteNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const normalizedCoordinate = (
  value,
  fallback = 0
) => {
  const number =
    finiteNumber(
      value,
      fallback
    );

  return Math.min(
    1,
    Math.max(0, number)
  );
};

export function normalizeCaravanHp(
  hp = {}
) {
  const max =
    Math.max(
      0,
      Math.floor(
        finiteNumber(
          hp?.max,
          0
        )
      )
    );

  const value =
    Math.min(
      max,
      Math.max(
        0,
        Math.floor(
          finiteNumber(
            hp?.value,
            max
          )
        )
      )
    );

  return {
    value,
    max,
  };
}

export function normalizeCaravanLayout(
  layout = {}
) {
  return {
    x:
      normalizedCoordinate(
        layout?.x,
        0
      ),

    y:
      normalizedCoordinate(
        layout?.y,
        0
      ),

    width:
      normalizedCoordinate(
        layout?.width,
        0.1
      ),

    height:
      normalizedCoordinate(
        layout?.height,
        0.1
      ),

    rotation:
      finiteNumber(
        layout?.rotation,
        0
      ),
  };
}

const CANONICAL_WHEEL_NAMES =
  Object.freeze({
    "wheel-front-left":
      "Roue avant gauche",

    "wheel-front-right":
      "Roue avant droite",

    "wheel-rear-left":
      "Roue arri\u00e8re gauche",

    "wheel-rear-right":
      "Roue arri\u00e8re droite",
  });

function canonicalCaravanComponentName(
  component
) {
  const id =
    nonEmpty(component?.id)
      ? component.id.trim()
      : "";

  return (
    CANONICAL_WHEEL_NAMES[id] ??
    (
      nonEmpty(component?.name)
        ? component.name.trim()
        : (
            id ||
            "Composant"
          )
    )
  );
}

export function normalizeCaravanComponent(
  component = {}
) {
  return {
    id:
      nonEmpty(component?.id)
        ? component.id.trim()
        : "",

    type:
      nonEmpty(component?.type)
        ? component.type.trim()
        : "generic",

    name:
      canonicalCaravanComponentName(
        component
      ),

    hp:
      normalizeCaravanHp(
        component?.hp
      ),

    containerId:
      nonEmpty(
        component?.containerId
      )
        ? component.containerId.trim()
        : null,

    layout:
      normalizeCaravanLayout(
        component?.layout
      ),

    state:
      component?.state &&
      typeof component.state ===
        "object" &&
      !Array.isArray(
        component.state
      )
        ? clone(component.state)
        : {},
  };
}

export function normalizeCaravanCargoSlot(
  slot = {}
) {
  return {
    id:
      nonEmpty(slot?.id)
        ? slot.id.trim()
        : "",

    name:
      nonEmpty(slot?.name)
        ? slot.name.trim()
        : (
            nonEmpty(slot?.id)
              ? slot.id.trim()
              : "Emplacement cargo"
          ),

    componentId:
      nonEmpty(
        slot?.componentId
      )
        ? slot.componentId.trim()
        : null,

    layout:
      normalizeCaravanLayout(
        slot?.layout
      ),

    state:
      slot?.state &&
      typeof slot.state ===
        "object" &&
      !Array.isArray(
        slot.state
      )
        ? clone(slot.state)
        : {},
  };
}

export function normalizeExpeditionCaravan(
  caravan = {}
) {
  const components =
    Array.isArray(
      caravan?.components
    )
      ? caravan.components.map(
          normalizeCaravanComponent
        )
      : [];

  const cargoSlots =
    Array.isArray(
      caravan?.cargoSlots
    )
      ? caravan.cargoSlots.map(
          normalizeCaravanCargoSlot
        )
      : [];

  const assetSource =
    nonEmpty(
      caravan?.asset?.src
    )
      ? caravan.asset.src.trim()
      : null;

  return {
    schema:
      CARAVAN_SCHEMA,

    id:
      nonEmpty(caravan?.id)
        ? caravan.id.trim()
        : "caravan",

    name:
      nonEmpty(caravan?.name)
        ? caravan.name.trim()
        : "Caravane",

    locationRef:
      nonEmpty(
        caravan?.locationRef
      )
        ? caravan.locationRef.trim()
        : null,

    asset: {
      src:
        assetSource,
    },

    components,

    cargoSlots,

    state:
      caravan?.state &&
      typeof caravan.state ===
        "object" &&
      !Array.isArray(
        caravan.state
      )
        ? clone(caravan.state)
        : {},
  };
}

export function validateExpeditionCaravan(
  caravan,
  {
    containerIds = null,
  } = {}
) {
  const errors = [];

  if (
    !caravan ||
    typeof caravan !== "object" ||
    Array.isArray(caravan)
  ) {
    return {
      green: false,
      errors: [
        "caravan must be an object",
      ],
    };
  }

  if (
    caravan.schema !==
    CARAVAN_SCHEMA
  ) {
    errors.push(
      "caravan.schema must be " +
      CARAVAN_SCHEMA
    );
  }

  if (!nonEmpty(caravan.id)) {
    errors.push(
      "caravan.id is required"
    );
  }

  if (!nonEmpty(caravan.name)) {
    errors.push(
      "caravan.name is required"
    );
  }

  if (
    caravan.locationRef != null &&
    !nonEmpty(
      caravan.locationRef
    )
  ) {
    errors.push(
      "caravan.locationRef must be a non-empty string or null"
    );
  }

  if (
    !caravan.asset ||
    typeof caravan.asset !==
      "object" ||
    Array.isArray(
      caravan.asset
    )
  ) {
    errors.push(
      "caravan.asset must be an object"
    );
  } else if (
    caravan.asset.src != null &&
    !nonEmpty(
      caravan.asset.src
    )
  ) {
    errors.push(
      "caravan.asset.src must be a non-empty string or null"
    );
  }

  const componentIds =
    new Set();

  if (
    !Array.isArray(
      caravan.components
    )
  ) {
    errors.push(
      "caravan.components must be an array"
    );
  } else {

    for (
      const component of
      caravan.components
    ) {
      if (
        !component ||
        typeof component !==
          "object" ||
        Array.isArray(component)
      ) {
        errors.push(
          "caravan component must be an object"
        );
        continue;
      }

      if (
        !nonEmpty(component.id)
      ) {
        errors.push(
          "caravan component id is required"
        );
      } else if (
        componentIds.has(component.id)
      ) {
        errors.push(
          "duplicate caravan component id " +
          component.id
        );
      } else {
        componentIds.add(component.id);
      }

      if (
        !nonEmpty(component.type)
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": type is required"
        );
      }

      if (
        !nonEmpty(component.name)
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": name is required"
        );
      }

      const hp =
        component.hp;

      if (
        !hp ||
        !Number.isInteger(
          hp.value
        ) ||
        !Number.isInteger(
          hp.max
        ) ||
        hp.value < 0 ||
        hp.max < 0 ||
        hp.value > hp.max
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": invalid hp"
        );
      }

      if (
        component.containerId != null &&
        !nonEmpty(
          component.containerId
        )
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": containerId must be a non-empty string or null"
        );
      }

      if (
        component.containerId != null &&
        containerIds instanceof Set &&
        !containerIds.has(
          component.containerId
        )
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": unknown containerId " +
          component.containerId
        );
      }

      const layout =
        component.layout;

      if (
        !layout ||
        typeof layout !==
          "object" ||
        Array.isArray(layout)
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": layout must be an object"
        );
      } else {
        for (
          const key of [
            "x",
            "y",
            "width",
            "height",
          ]
        ) {
          if (
            typeof layout[key] !==
              "number" ||
            !Number.isFinite(
              layout[key]
            ) ||
            layout[key] < 0 ||
            layout[key] > 1
          ) {
            errors.push(
              "caravan component " +
              component.id +
              ": layout." +
              key +
              " must be between 0 and 1"
            );
          }
        }

        if (
          typeof layout.rotation !==
            "number" ||
          !Number.isFinite(
            layout.rotation
          )
        ) {
          errors.push(
            "caravan component " +
            component.id +
            ": layout.rotation must be finite"
          );
        }
      }

      if (
        !component.state ||
        typeof component.state !==
          "object" ||
        Array.isArray(
          component.state
        )
      ) {
        errors.push(
          "caravan component " +
          component.id +
          ": state must be an object"
        );
      }
    }
  }

  if (
    !Array.isArray(
      caravan.cargoSlots
    )
  ) {
    errors.push(
      "caravan.cargoSlots must be an array"
    );
  } else {
    const slotIds =
      new Set();

    const assignedComponents =
      new Set();

    for (
      const slot of
      caravan.cargoSlots
    ) {
      if (
        !slot ||
        typeof slot !== "object" ||
        Array.isArray(slot)
      ) {
        errors.push(
          "caravan cargo slot must be an object"
        );
        continue;
      }

      if (!nonEmpty(slot.id)) {
        errors.push(
          "caravan cargo slot id is required"
        );
      } else if (
        slotIds.has(slot.id)
      ) {
        errors.push(
          "duplicate caravan cargo slot id " +
          slot.id
        );
      } else {
        slotIds.add(slot.id);
      }

      if (!nonEmpty(slot.name)) {
        errors.push(
          "caravan cargo slot " +
          slot.id +
          ": name is required"
        );
      }

      if (
        slot.componentId != null
      ) {
        if (
          !nonEmpty(
            slot.componentId
          )
        ) {
          errors.push(
            "caravan cargo slot " +
            slot.id +
            ": componentId must be a non-empty string or null"
          );
        } else if (
          !componentIds.has(
            slot.componentId
          )
        ) {
          errors.push(
            "caravan cargo slot " +
            slot.id +
            ": unknown componentId " +
            slot.componentId
          );
        } else if (
          assignedComponents.has(
            slot.componentId
          )
        ) {
          errors.push(
            "caravan component " +
            slot.componentId +
            " cannot occupy multiple cargo slots"
          );
        } else {
          assignedComponents.add(
            slot.componentId
          );
        }
      }

      const layout =
        slot.layout;

      if (
        !layout ||
        typeof layout !==
          "object" ||
        Array.isArray(layout)
      ) {
        errors.push(
          "caravan cargo slot " +
          slot.id +
          ": layout must be an object"
        );
      } else {
        for (
          const key of [
            "x",
            "y",
            "width",
            "height",
          ]
        ) {
          if (
            typeof layout[key] !==
              "number" ||
            !Number.isFinite(
              layout[key]
            ) ||
            layout[key] < 0 ||
            layout[key] > 1
          ) {
            errors.push(
              "caravan cargo slot " +
              slot.id +
              ": layout." +
              key +
              " must be between 0 and 1"
            );
          }
        }

        if (
          typeof layout.rotation !==
            "number" ||
          !Number.isFinite(
            layout.rotation
          )
        ) {
          errors.push(
            "caravan cargo slot " +
            slot.id +
            ": layout.rotation must be finite"
          );
        }
      }

      if (
        !slot.state ||
        typeof slot.state !==
          "object" ||
        Array.isArray(
          slot.state
        )
      ) {
        errors.push(
          "caravan cargo slot " +
          slot.id +
          ": state must be an object"
        );
      }
    }
  }

  if (
    !caravan.state ||
    typeof caravan.state !==
      "object" ||
    Array.isArray(
      caravan.state
    )
  ) {
    errors.push(
      "caravan.state must be an object"
    );
  }

  return {
    green:
      errors.length === 0,
    errors,
  };
}

export function createDefaultExpeditionCaravan({
  id = "caravan",
  name = "Caravane",
  assetSrc = null,
  locationRef = null,
} = {}) {
  return normalizeExpeditionCaravan({
    id,
    name,
    locationRef,

    asset: {
      src:
        nonEmpty(assetSrc)
          ? assetSrc.trim()
          : null,
    },

    components: [
      {
        id:
          "wheel-front-left",
        type:
          "wheel",
        name:
          "Roue avant gauche",
        hp: {
          value: 10,
          max: 10,
        },
        containerId: null,
        layout: {
          x: 0.12,
          y: 0.16,
          width: 0.10,
          height: 0.12,
          rotation: 0,
        },
        state: {},
      },

      {
        id:
          "wheel-front-right",
        type:
          "wheel",
        name:
          "Roue avant droite",
        hp: {
          value: 10,
          max: 10,
        },
        containerId: null,
        layout: {
          x: 0.78,
          y: 0.16,
          width: 0.10,
          height: 0.12,
          rotation: 0,
        },
        state: {},
      },

      {
        id:
          "wheel-rear-left",
        type:
          "wheel",
        name:
          "Roue arri\u00e8re gauche",
        hp: {
          value: 10,
          max: 10,
        },
        containerId: null,
        layout: {
          x: 0.12,
          y: 0.74,
          width: 0.10,
          height: 0.12,
          rotation: 0,
        },
        state: {},
      },

      {
        id:
          "wheel-rear-right",
        type:
          "wheel",
        name:
          "Roue arri\u00e8re droite",
        hp: {
          value: 10,
          max: 10,
        },
        containerId: null,
        layout: {
          x: 0.78,
          y: 0.74,
          width: 0.10,
          height: 0.12,
          rotation: 0,
        },
        state: {},
      },
    ],

    cargoSlots: [
      {
        id: "cargo-01",
        name: "Cargo 01",
        componentId: null,
        layout: {
          x: 0.25,
          y: 0.31,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-02",
        name: "Cargo 02",
        componentId: null,
        layout: {
          x: 0.38,
          y: 0.31,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-03",
        name: "Cargo 03",
        componentId: null,
        layout: {
          x: 0.51,
          y: 0.31,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-04",
        name: "Cargo 04",
        componentId: null,
        layout: {
          x: 0.64,
          y: 0.31,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-05",
        name: "Cargo 05",
        componentId: null,
        layout: {
          x: 0.25,
          y: 0.54,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-06",
        name: "Cargo 06",
        componentId: null,
        layout: {
          x: 0.38,
          y: 0.54,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-07",
        name: "Cargo 07",
        componentId: null,
        layout: {
          x: 0.51,
          y: 0.54,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
      {
        id: "cargo-08",
        name: "Cargo 08",
        componentId: null,
        layout: {
          x: 0.64,
          y: 0.54,
          width: 0.11,
          height: 0.14,
          rotation: 0,
        },
      },
    ],

    state: {},
  });
}

export function serializeExpeditionCaravan(
  caravan
) {
  const normalized =
    normalizeExpeditionCaravan(
      caravan
    );

  const validation =
    validateExpeditionCaravan(
      normalized
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return JSON.stringify(
    normalized
  );
}

export function parseExpeditionCaravan(
  serialized
) {
  const value =
    typeof serialized ===
      "string"
      ? JSON.parse(serialized)
      : clone(serialized);

  const normalized =
    normalizeExpeditionCaravan(
      value
    );

  const validation =
    validateExpeditionCaravan(
      normalized
    );

  if (!validation.green) {
    throw new Error(
      validation.errors.join("; ")
    );
  }

  return normalized;
}

export const expeditionCaravan = {
  schema:
    CARAVAN_SCHEMA,

  normalize:
    normalizeExpeditionCaravan,

  validate:
    validateExpeditionCaravan,

  serialize:
    serializeExpeditionCaravan,

  parse:
    parseExpeditionCaravan,

  createDefault:
    createDefaultExpeditionCaravan,

  normalizeComponent:
    normalizeCaravanComponent,

  normalizeCargoSlot:
    normalizeCaravanCargoSlot,

  normalizeLayout:
    normalizeCaravanLayout,

  normalizeHp:
    normalizeCaravanHp,
};
