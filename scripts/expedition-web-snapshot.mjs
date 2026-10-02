const clone = (value) =>
  value == null
    ? value
    : globalThis.structuredClone
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

function requiredText(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `Web snapshot requires ${label}.`
    );
  }

  return value;
}

function optionalText(value) {
  return (
    typeof value === "string" &&
    value.trim()
  )
    ? value
    : null;
}

export function createExpeditionWebSnapshot({
  campaignId,
  expeditionId,
  generatedAt,
  viewer = {},
  capabilities = null,
  inventory = null,
  materials = null,
  knowledge = null,
  workshop = null,
} = {}) {
  const resolvedGeneratedAt =
    generatedAt instanceof Date
      ? generatedAt.toISOString()
      : requiredText(
          generatedAt,
          "generatedAt"
        );

  return {
    schemaVersion: 1,
    kind: "expedition-web-snapshot",

    campaignId:
      requiredText(
        campaignId,
        "campaignId"
      ),

    expeditionId:
      requiredText(
        expeditionId,
        "expeditionId"
      ),

    generatedAt:
      resolvedGeneratedAt,

    viewer: {
      scope:
        optionalText(viewer.scope) ??
        "player",

      characterId:
        optionalText(
          viewer.characterId
        ),
    },

    capabilities:
      clone(capabilities),

    data: {
      inventory:
        clone(inventory),

      materials:
        clone(materials),

      knowledge:
        clone(knowledge),

      workshop:
        clone(workshop),
    },
  };
}

export function serializeExpeditionWebSnapshot(
  snapshot,
  {
    pretty = true,
  } = {}
) {
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot?.kind !==
      "expedition-web-snapshot"
  ) {
    throw new Error(
      "Invalid expedition web snapshot."
    );
  }

  return JSON.stringify(
    snapshot,
    null,
    pretty ? 2 : 0
  );
}
