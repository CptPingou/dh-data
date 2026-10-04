import {
  EXPEDITION_LOGISTICS_PHASES,
  resolveManifestLogisticsPhase,
} from "./expedition-logistics-phase.mjs";

export function normalizeExpeditionLocationRef(
  value
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const clean =
    value.trim();

  return clean.length
    ? clean
    : null;
}

export function expeditionLocationsMatch(
  fob,
  caravan
) {
  const fobLocationRef =
    normalizeExpeditionLocationRef(
      fob?.locationRef
    );

  const caravanLocationRef =
    normalizeExpeditionLocationRef(
      caravan?.locationRef
    );

  return Boolean(
    fobLocationRef &&
    caravanLocationRef &&
    fobLocationRef ===
      caravanLocationRef
  );
}

export function resolvePlayerLogisticsVisibility(
  manifest
) {
  const phase =
    resolveManifestLogisticsPhase(
      manifest
    );

  const fobLocationRef =
    normalizeExpeditionLocationRef(
      manifest?.fob?.locationRef
    );

  const caravanLocationRef =
    normalizeExpeditionLocationRef(
      manifest?.caravan?.locationRef
    );

  const outsideField =
    phase !==
      EXPEDITION_LOGISTICS_PHASES
        .FIELD;

  const fob =
    Boolean(
      outsideField &&
      manifest?.fob
    );

  const sameLocation =
    expeditionLocationsMatch(
      manifest?.fob,
      manifest?.caravan
    );

  const caravan =
    Boolean(
      fob &&
      manifest?.caravan &&
      sameLocation
    );

  return {
    phase,

    fob,

    caravan,

    sameLocation,

    fobLocationRef,

    caravanLocationRef,
  };
}

export const expeditionLogisticsVisibility = {
  normalizeLocationRef:
    normalizeExpeditionLocationRef,

  locationsMatch:
    expeditionLocationsMatch,

  resolvePlayer:
    resolvePlayerLogisticsVisibility,
};
