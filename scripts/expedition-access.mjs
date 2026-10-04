export const EXPEDITION_ACCESS_SCHEMA =
  "daggerheart-campaign-toolkit/expedition-access@1";

export const EXPEDITION_ACCESS_ZONES =
  Object.freeze([
    "ground",
    "fob",
    "caravan",
  ]);

const ZONE_SET =
  new Set(
    EXPEDITION_ACCESS_ZONES
  );

function clone(value) {
  if (value == null) {
    return value;
  }

  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(
        JSON.stringify(value)
      );
}

function cleanId(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export function normalizeZoneAccess(
  input = {}
) {
  const transfer =
    input?.transfer === true;

  return {
    view:
      transfer ||
      input?.view === true,

    transfer,
  };
}

export function normalizeCharacterAccess(
  input = {}
) {
  return {
    ground:
      normalizeZoneAccess(
        input?.ground
      ),

    fob:
      normalizeZoneAccess(
        input?.fob
      ),

    caravan:
      normalizeZoneAccess(
        input?.caravan
      ),
  };
}

export function normalizeExpeditionAccess(
  input = {},
  {
    characterIds = [],
  } = {}
) {
  const sourceCharacters =
    input?.characters &&
    typeof input.characters ===
      "object" &&
    !Array.isArray(
      input.characters
    )
      ? input.characters
      : {};

  const ids =
    [
      ...new Set(
        characterIds
          .map(cleanId)
          .filter(Boolean)
      ),
    ];

  const characters = {};

  for (const characterId of ids) {
    characters[characterId] =
      normalizeCharacterAccess(
        sourceCharacters[
          characterId
        ]
      );
  }

  return {
    schema:
      EXPEDITION_ACCESS_SCHEMA,

    characters,
  };
}

export function validateExpeditionAccess(
  input,
  {
    characterIds = [],
  } = {}
) {
  const errors = [];

  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      green: false,
      errors: [
        "access must be an object",
      ],
    };
  }

  if (
    input.schema !==
    EXPEDITION_ACCESS_SCHEMA
  ) {
    errors.push(
      "access.schema must be " +
      EXPEDITION_ACCESS_SCHEMA
    );
  }

  if (
    !input.characters ||
    typeof input.characters !==
      "object" ||
    Array.isArray(
      input.characters
    )
  ) {
    errors.push(
      "access.characters must be an object"
    );

    return {
      green:
        errors.length === 0,
      errors,
    };
  }

  const expected =
    new Set(
      characterIds
        .map(cleanId)
        .filter(Boolean)
    );

  for (
    const [
      characterId,
      access,
    ]
    of Object.entries(
      input.characters
    )
  ) {
    if (!expected.has(characterId)) {
      errors.push(
        "access references unknown character " +
        characterId
      );

      continue;
    }

    for (
      const zone of
      EXPEDITION_ACCESS_ZONES
    ) {
      const rule =
        access?.[zone];

      if (
        !rule ||
        typeof rule !== "object" ||
        Array.isArray(rule)
      ) {
        errors.push(
          "access " +
          characterId +
          "." +
          zone +
          " must be an object"
        );

        continue;
      }

      if (
        typeof rule.view !==
          "boolean" ||
        typeof rule.transfer !==
          "boolean"
      ) {
        errors.push(
          "access " +
          characterId +
          "." +
          zone +
          " requires boolean view and transfer"
        );
      }

      if (
        rule.transfer === true &&
        rule.view !== true
      ) {
        errors.push(
          "access " +
          characterId +
          "." +
          zone +
          " transfer requires view"
        );
      }
    }
  }

  for (const characterId of expected) {
    if (
      !Object.prototype
        .hasOwnProperty.call(
          input.characters,
          characterId
        )
    ) {
      errors.push(
        "access missing character " +
        characterId
      );
    }
  }

  return {
    green:
      errors.length === 0,
    errors,
  };
}

export function expeditionCharacterAccess(
  manifest,
  characterId
) {
  const id =
    cleanId(characterId);

  if (!id) {
    return null;
  }

  return manifest?.access
    ?.characters?.[id] ??
    null;
}

export function updateCharacterZoneAccess(
  input,
  {
    characterId,
    zone,
    view = false,
    transfer = false,
  } = {}
) {
  const id =
    cleanId(characterId);

  if (!id) {
    throw new Error(
      "characterId is required"
    );
  }

  if (!ZONE_SET.has(zone)) {
    throw new Error(
      "unknown access zone " +
      String(zone ?? "")
    );
  }

  const next =
    clone(input) ?? {
      schema:
        EXPEDITION_ACCESS_SCHEMA,
      characters: {},
    };

  next.schema =
    EXPEDITION_ACCESS_SCHEMA;

  next.characters ??= {};

  const current =
    normalizeCharacterAccess(
      next.characters[id]
    );

  current[zone] =
    normalizeZoneAccess({
      view,
      transfer,
    });

  next.characters[id] =
    current;

  return next;
}

export function characterCanViewZone(
  manifest,
  characterId,
  zone
) {
  if (!ZONE_SET.has(zone)) {
    return false;
  }

  return (
    expeditionCharacterAccess(
      manifest,
      characterId
    )?.[zone]?.view === true
  );
}

export function characterCanTransferZone(
  manifest,
  characterId,
  zone
) {
  if (!ZONE_SET.has(zone)) {
    return false;
  }

  return (
    expeditionCharacterAccess(
      manifest,
      characterId
    )?.[zone]
      ?.transfer === true
  );
}

export const expeditionAccessApi =
  Object.freeze({
    schema:
      EXPEDITION_ACCESS_SCHEMA,

    zones:
      EXPEDITION_ACCESS_ZONES,

    normalize:
      normalizeExpeditionAccess,

    normalizeCharacter:
      normalizeCharacterAccess,

    normalizeZone:
      normalizeZoneAccess,

    validate:
      validateExpeditionAccess,

    character:
      expeditionCharacterAccess,

    update:
      updateCharacterZoneAccess,

    canView:
      characterCanViewZone,

    canTransfer:
      characterCanTransferZone,
  });
