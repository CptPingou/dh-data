/**
 * Pure logistics-phase primitives.
 *
 * This module deliberately does not depend on Foundry.
 *
 * Manifest lifecycle and logistics phase are separate concepts:
 *
 * manifest.phase:
 *   prepared | in_session | returned
 *
 * logistics phase:
 *   field
 *   field-extraction
 *   arc-extraction
 */

export const EXPEDITION_LOGISTICS_PHASES = Object.freeze({
  FIELD: "field",
  FIELD_EXTRACTION: "field-extraction",
  ARC_EXTRACTION: "arc-extraction",
});

const LOGISTICS_PHASE_SET = new Set(
  Object.values(EXPEDITION_LOGISTICS_PHASES)
);

export const EXPEDITION_LOGISTICS_PHASE_PRESENTATION =
  Object.freeze({
    "field": Object.freeze({
      label: "Terrain",
      description:
        "Collecte et circulation locale pendant la chasse.",
      rules: Object.freeze([
        "Sac \u2194 Sol",
        "Sac \u2194 Sac",
      ]),
    }),

    "field-extraction": Object.freeze({
      label: "Extraction terrain",
      description:
        "Les chasseurs s\u00e9curisent leur r\u00e9colte au FOB.",
      rules: Object.freeze([
        "Sac \u2194 Sol",
        "Sac \u2194 Sac",
        "Sac \u2194 FOB",
      ]),
    }),

    "arc-extraction": Object.freeze({
      label: "Extraction d\u2019arc",
      description:
        "Les ressources s\u00e9curis\u00e9es quittent le FOB avec la Caravane.",
      rules: Object.freeze([
        "FOB \u2192 Caravane",
      ]),
    }),
  });

export const EXPEDITION_CONTAINER_ROLES = Object.freeze({
  BACKPACK: "backpack",
  GROUND: "ground",
  FOB: "fob",
  CARAVAN: "caravan",
  BASE: "base",
});

function normalizeString(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

export function normalizeLogisticsPhase(
  value,
  fallback = null
) {
  const normalized = normalizeString(value);

  if (normalized === "arc-logistics") {
    return EXPEDITION_LOGISTICS_PHASES.FIELD_EXTRACTION;
  }

  if (normalized === "returned") {
    return EXPEDITION_LOGISTICS_PHASES.ARC_EXTRACTION;
  }

  if (LOGISTICS_PHASE_SET.has(normalized)) {
    return normalized;
  }

  return fallback;
}

export function isLogisticsPhase(value) {
  return normalizeLogisticsPhase(value) !== null;
}

export function normalizeContainerRole(
  value,
  fallback = null
) {
  const normalized = normalizeString(value);

  if (
    Object.values(
      EXPEDITION_CONTAINER_ROLES
    ).includes(normalized)
  ) {
    return normalized;
  }

  return fallback;
}

/**
 * Directional transfer matrix.
 *
 * This answers only:
 * "Is this source -> destination direction meaningful
 *  during this logistics phase?"
 *
 * It deliberately does NOT decide:
 * - viewer permissions;
 * - ownership;
 * - item/container compatibility;
 * - capacity;
 * - quantity;
 * - stack limits;
 * - Foundry document access.
 */
const TRANSFER_DIRECTIONS = Object.freeze({
  [EXPEDITION_LOGISTICS_PHASES.FIELD]: Object.freeze([
    Object.freeze(["backpack", "ground"]),
    Object.freeze(["ground", "backpack"]),
    Object.freeze(["backpack", "backpack"]),
  ]),

  [EXPEDITION_LOGISTICS_PHASES.FIELD_EXTRACTION]: Object.freeze([
    Object.freeze(["backpack", "ground"]),
    Object.freeze(["ground", "backpack"]),
    Object.freeze(["backpack", "backpack"]),
    Object.freeze(["backpack", "fob"]),
    Object.freeze(["fob", "backpack"]),
  ]),

  [EXPEDITION_LOGISTICS_PHASES.ARC_EXTRACTION]: Object.freeze([
    Object.freeze(["fob", "caravan"]),
  ]),
});

export function logisticsTransferDirections(
  phase
) {
  const normalized =
    normalizeLogisticsPhase(phase);

  if (!normalized) return [];

  return TRANSFER_DIRECTIONS[normalized] ?? [];
}

export function logisticsDirectionAllowed({
  phase,
  sourceRole,
  destinationRole,
} = {}) {
  const normalizedPhase =
    normalizeLogisticsPhase(phase);

  const source =
    normalizeContainerRole(sourceRole);

  const destination =
    normalizeContainerRole(destinationRole);

  if (
    !normalizedPhase ||
    !source ||
    !destination
  ) {
    return false;
  }

  if (source === destination) {
    return source ===
      EXPEDITION_CONTAINER_ROLES.BACKPACK &&
      logisticsTransferDirections(
        normalizedPhase
      ).some(
        ([from, to]) =>
          from === source &&
          to === destination
      );
  }

  return logisticsTransferDirections(
    normalizedPhase
  ).some(
    ([from, to]) =>
      from === source &&
      to === destination
  );
}

/**
 * Resolve the effective logistics phase for a manifest.
 *
 * Explicit logistics state wins when present.
 *
 * Legacy/current manifests without logistics metadata remain compatible:
 * - returned   -> arc-extraction
 * - in_session -> field
 * - prepared   -> field
 *
 * This does not mutate the manifest.
 */
export function resolveManifestLogisticsPhase(
  manifest,
  fallback = EXPEDITION_LOGISTICS_PHASES.FIELD
) {
  const explicit =
    normalizeLogisticsPhase(
      manifest?.logistics?.phase,
      null
    );

  if (explicit) {
    return explicit;
  }

  const lifecycle =
    normalizeString(manifest?.phase);

  if (lifecycle === "returned") {
    return EXPEDITION_LOGISTICS_PHASES.ARC_EXTRACTION;
  }

  if (
    lifecycle === "prepared" ||
    lifecycle === "in_session"
  ) {
    return EXPEDITION_LOGISTICS_PHASES.FIELD;
  }

  return normalizeLogisticsPhase(
    fallback,
    EXPEDITION_LOGISTICS_PHASES.FIELD
  );
}

export const expeditionLogisticsPhaseApi =
  Object.freeze({
    version: 1,

    phases: EXPEDITION_LOGISTICS_PHASES,
    containerRoles: EXPEDITION_CONTAINER_ROLES,

    normalizeLogisticsPhase,
    resolveManifestLogisticsPhase,
    isLogisticsPhase,
    normalizeContainerRole,
    logisticsTransferDirections,
    logisticsDirectionAllowed,
  });
