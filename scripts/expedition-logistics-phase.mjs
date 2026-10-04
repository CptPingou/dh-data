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

    normalizeLogisticsPhase,
    resolveManifestLogisticsPhase,
    isLogisticsPhase,
  });
