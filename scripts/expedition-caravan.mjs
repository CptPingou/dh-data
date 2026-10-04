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
      nonEmpty(component?.name)
        ? component.name.trim()
        : (
            nonEmpty(component?.id)
              ? component.id.trim()
              : "Composant"
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

    asset: {
      src:
        assetSource,
    },

    components,

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

  if (
    !Array.isArray(
      caravan.components
    )
  ) {
    errors.push(
      "caravan.components must be an array"
    );
  } else {
    const ids =
      new Set();

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
        ids.has(component.id)
      ) {
        errors.push(
          "duplicate caravan component id " +
          component.id
        );
      } else {
        ids.add(component.id);
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

  normalizeComponent:
    normalizeCaravanComponent,

  normalizeLayout:
    normalizeCaravanLayout,

  normalizeHp:
    normalizeCaravanHp,
};
