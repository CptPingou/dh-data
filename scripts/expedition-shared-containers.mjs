const MODULE_ID = "daggerheart-campaign-toolkit";

export const SHARED_CONTAINER_SPECS = Object.freeze([
  Object.freeze({
    containerId: "ground",
    name: "Sol",
    role: "ground",
    slots: 12,
    playerAccess: true,
  }),
  Object.freeze({
    containerId: "fob",
    name: "FOB",
    role: "fob",
    slots: 24,
    playerAccess: false,
  }),
  ]);

export function retireLegacySharedCaravanContainer(
  manifest
) {
  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    return {
      changed: false,
      removed: 0,
      removedEntries: 0,
    };
  }

  manifest.containers ??= [];

  const referencedByComponent =
    (manifest?.caravan?.components ?? [])
      .some(
        (component) =>
          component?.containerId ===
          "caravan"
      );

  if (referencedByComponent) {
    throw new Error(
      "Legacy caravan container is referenced by an installed caravan component"
    );
  }

  const legacy =
    manifest.containers.filter(
      (container) =>
        container?.containerId ===
        "caravan"
    );

  if (!legacy.length) {
    return {
      changed: false,
      removed: 0,
      removedEntries: 0,
    };
  }

  const removedEntries =
    legacy.reduce(
      (total, container) =>
        total +
        (
          Array.isArray(
            container?.contents
          )
            ? container.contents.length
            : 0
        ),
      0
    );

  manifest.containers =
    manifest.containers.filter(
      (container) =>
        container?.containerId !==
        "caravan"
    );

  return {
    changed: true,
    removed: legacy.length,
    removedEntries,
  };
}

export function buildSharedContainer(manifest, spec) {
  return {
    containerId: spec.containerId,
    type: "caravan",
    name: spec.name,
    scope: "expedition",
    holderRef: {
      kind: "expedition",
      id: manifest.expeditionId,
    },
    capacity: {
      slots: spec.slots,
    },
    materialStorage: spec.materialStorage ? structuredClone(spec.materialStorage) : undefined,
    rules: [],
    contents: [],
    presentation: {
      playerRole: spec.role,
      playerAccess: spec.playerAccess,
    },
  };
}

export async function ensureSharedContainers(
  api,
  manifest,
  {
    broadcastBackpackAccessChange,
  } = {}
) {
  if (!game.user?.isGM) {
    return { green: false, reason: "not-gm", changed: false };
  }

  manifest.containers ??= [];

  const retiredLegacyCaravan =
    retireLegacySharedCaravanContainer(
      manifest
    );


  const byId = new Map(
    manifest.containers
      .filter((container) => container?.containerId)
      .map((container) => [container.containerId, container])
  );

  const created = [];
  let metadataChanged =
    retiredLegacyCaravan.changed;

  for (const spec of SHARED_CONTAINER_SPECS) {
    let container = byId.get(spec.containerId);

    if (!container) {
      container = buildSharedContainer(manifest, spec);
      manifest.containers.push(container);
      byId.set(container.containerId, container);
      created.push(container.containerId);
      continue;
    }

    // Never overwrite existing content, capacity or name.
    // Migrate legacy physical inventory fields to abstract capacity.
    if (Object.prototype.hasOwnProperty.call(container, "layout")) {
      delete container.layout;
      metadataChanged = true;
    }

    for (const entry of container.contents ?? []) {
      if (Object.prototype.hasOwnProperty.call(entry, "slotId")) {
        delete entry.slotId;
        metadataChanged = true;
      }
    }

    container.presentation ??= {};

    if (!container.presentation.playerRole) {
      container.presentation.playerRole = spec.role;
      metadataChanged = true;
    }

    if (container.presentation.playerAccess == null) {
      container.presentation.playerAccess = spec.playerAccess;
      metadataChanged = true;
    }

    if (spec.materialStorage && JSON.stringify(container.materialStorage ?? null) !== JSON.stringify(spec.materialStorage)) {
      container.materialStorage = structuredClone(spec.materialStorage);
      metadataChanged = true;
    }
  }

  if (!created.length && !metadataChanged) {
    return {
      green: true,
      changed: false,
      created: [],
    };
  }

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;

  const validation = api.expeditionManifest.validate?.(manifest);

  if (validation && validation.green === false) {
    throw new Error(
      `Manifest invalide après création des conteneurs partagés : ${(validation.errors ?? []).join("; ")}`
    );
  }

  await api.expeditionManifest.save(manifest);

  if (typeof broadcastBackpackAccessChange === "function") {
    broadcastBackpackAccessChange(manifest, null);
  }

  Hooks.callAll(`${MODULE_ID}.expeditionChanged`, {
    manifest,
    reason: "shared-containers-bootstrap",
    created,
  });

  return {
    green: true,
    changed: true,
    created,
  };
}
