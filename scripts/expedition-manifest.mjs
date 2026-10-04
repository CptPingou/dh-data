import {
  containerStorageCapacity,
  resolveEffectiveStorageProfile,
} from "./expedition-storage.mjs";

import {
  normalizeExpeditionFob,
  validateExpeditionFob,
} from "./expedition-fob.mjs";
import {
  createDefaultExpeditionCaravan,
  normalizeExpeditionCaravan,
  validateExpeditionCaravan,
} from "./expedition-caravan.mjs";
import {
  containerProfileAcceptsEntry,
  normalizeContainerStorageProfile,
} from "./expedition-container-profile.mjs";
import {
  normalizeExpeditionAccess,
  validateExpeditionAccess,
} from "./expedition-access.mjs";

export const EXPEDITION_MANIFEST_SCHEMA = "daggerheart-campaign-toolkit/expedition-manifest@2";
export const EXPEDITION_MANIFEST_SCHEMA_V1 = "daggerheart-campaign-toolkit/expedition-manifest@1";

const PHASES = new Set(["prepared", "in_session", "returned"]);
const AUTHORITIES = new Set(["web", "foundry"]);
// P2.10c.1: the container primitive is generic, but only these concrete types are defined/tested for now.
const CONTAINER_TYPES = new Set(["backpack", "caravan"]);
const SCOPES = new Set(["personal", "party", "expedition"]);
const HOLDER_KINDS = new Set(["character", "party", "expedition"]);
const LEDGER_KINDS = new Set(["consumed", "acquired", "transferred", "lost"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function duplicates(values) {
  const seen = new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function migrateExpeditionManifestV1(manifest) {
  if (manifest?.schema !== EXPEDITION_MANIFEST_SCHEMA_V1) return clone(manifest);
  const migrated = clone(manifest);
  migrated.schema = EXPEDITION_MANIFEST_SCHEMA;
  migrated.characters = (migrated.characters ?? []).map(({ containerIds: _legacyContainerIds, ...character }) => character);
  migrated.containers = (migrated.containers ?? []).map((container) => {
    const { ownerCharacterId, ...rest } = container;
    if (container.scope === "character") {
      return {
        ...rest,
        scope: "personal",
        holderRef: { kind: "character", id: ownerCharacterId },
      };
    }
    return {
      ...rest,
      scope: container.scope === "party" ? "party" : container.scope,
      holderRef: container.scope === "party" ? { kind: "party", id: "party" } : null,
    };
  });
  migrated.metadata = { ...(migrated.metadata ?? {}), migratedFrom: EXPEDITION_MANIFEST_SCHEMA_V1 };
  return migrated;
}

export function normalizeExpeditionManifest(manifest) {
  const normalized =
    manifest?.schema === EXPEDITION_MANIFEST_SCHEMA_V1
      ? migrateExpeditionManifestV1(manifest)
      : clone(manifest);

  const logisticsPhase =
    normalized?.logistics?.phase;

  if (logisticsPhase === "arc-logistics") {
    normalized.logistics.phase =
      "field-extraction";
  } else if (logisticsPhase === "returned") {
    normalized.logistics.phase =
      "arc-extraction";
  }

  if (normalized?.fob != null) {
    normalized.fob =
      normalizeExpeditionFob(
        normalized.fob
      );
  }

  if (normalized?.caravan != null) {
    normalized.caravan =
      normalizeExpeditionCaravan(
        normalized.caravan
      );
  } else {
    normalized.caravan =
      createDefaultExpeditionCaravan({
        id: "caravan",
        name: "Caravane",
      });
  }

  normalized.access =
    normalizeExpeditionAccess(
      normalized?.access,
      {
        characterIds:
          (
            normalized?.characters ??
            []
          )
            .map(
              (character) =>
                character
                  ?.characterId
            )
            .filter(nonEmpty),
      }
    );

  return normalized;
}

export function validateExpeditionManifest(input) {
  const legacyLogisticsPhase =
    input?.logistics?.phase === "arc-logistics" ||
    input?.logistics?.phase === "returned";

  const migrated =
    input?.schema === EXPEDITION_MANIFEST_SCHEMA_V1 ||
    legacyLogisticsPhase;

  const manifest = normalizeExpeditionManifest(input);
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { green: false, migrated, errors: ["manifest must be an object"] };
  }

  if (manifest.schema !== EXPEDITION_MANIFEST_SCHEMA) errors.push(`schema must be ${EXPEDITION_MANIFEST_SCHEMA}`);
  if (!nonEmpty(manifest.expeditionId)) errors.push("expeditionId is required");
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) errors.push("revision must be an integer >= 1");
  if (!PHASES.has(manifest.phase)) errors.push("phase must be prepared, in_session or returned");

  const logisticsPhase =
    manifest?.logistics?.phase;

  if (
    logisticsPhase != null &&
    ![
      "field",
      "field-extraction",
      "arc-extraction",
    ].includes(logisticsPhase)
  ) {
    errors.push(
      "logistics.phase must be field, field-extraction or arc-extraction"
    );
  }

  if (!AUTHORITIES.has(manifest.authority)) errors.push("authority must be web or foundry");
  if (!Array.isArray(manifest.characters)) errors.push("characters must be an array");
  if (!Array.isArray(manifest.containers)) errors.push("containers must be an array");
  if (!Array.isArray(manifest.ledger)) errors.push("ledger must be an array");
  if (errors.length) return { green: false, migrated, errors };

  const characterIds = manifest.characters.map((c) => c?.characterId).filter(nonEmpty);
  const containerIds = manifest.containers.map((c) => c?.containerId).filter(nonEmpty);
  const duplicateCharacters = [...new Set(duplicates(characterIds))];
  const duplicateContainers = [...new Set(duplicates(containerIds))];
  if (duplicateCharacters.length) errors.push(`duplicate characterId: ${duplicateCharacters.join(", ")}`);
  if (duplicateContainers.length) errors.push(`duplicate containerId: ${duplicateContainers.join(", ")}`);

  const characterSet = new Set(characterIds);
  const containerSet = new Set(containerIds);

  const accessValidation =
    validateExpeditionAccess(
      manifest.access,
      {
        characterIds,
      }
    );

  if (!accessValidation.green) {
    for (
      const error of
      accessValidation.errors
    ) {
      errors.push(
        "access: " + error
      );
    }
  }

  if (manifest.fob != null) {
    const fobValidation =
      validateExpeditionFob(
        manifest.fob,
        {
          containerIds: containerSet,
        }
      );

    if (!fobValidation.green) {
      for (
        const error of
        fobValidation.errors
      ) {
        errors.push(
          "fob: " + error
        );
      }
    }
  }

  if (manifest.caravan != null) {
    const caravanValidation =
      validateExpeditionCaravan(
        manifest.caravan,
        {
          containerIds: containerSet,
        }
      );

    if (!caravanValidation.green) {
      for (
        const error of
        caravanValidation.errors
      ) {
        errors.push(
          "caravan: " + error
        );
      }
    }
  }

  for (const character of manifest.characters) {
    if (!nonEmpty(character?.characterId)) errors.push("character.characterId is required");
    if (!nonEmpty(character?.name)) errors.push(`character ${character?.characterId ?? "?"}: name is required`);
  }

  for (const container of manifest.containers) {
    const id = container?.containerId ?? "?";
    if (!nonEmpty(container?.containerId)) errors.push("container.containerId is required");
    if (!CONTAINER_TYPES.has(container?.type)) errors.push(`container ${id}: invalid type`);
    if (!nonEmpty(container?.name)) errors.push(`container ${id}: name is required`);
    if (!SCOPES.has(container?.scope)) errors.push(`container ${id}: invalid scope`);
    if (!container?.holderRef || !HOLDER_KINDS.has(container.holderRef.kind) || !nonEmpty(container.holderRef.id)) {
      errors.push(`container ${id}: holderRef requires a valid kind and id`);
    } else {
      if (container.scope === "personal" && container.holderRef.kind !== "character") errors.push(`container ${id}: personal scope requires character holderRef`);
      if (container.scope === "party" && container.holderRef.kind !== "party") errors.push(`container ${id}: party scope requires party holderRef`);
      if (container.scope === "expedition" && container.holderRef.kind !== "expedition") errors.push(`container ${id}: expedition scope requires expedition holderRef`);
      if (container.holderRef.kind === "character" && !characterSet.has(container.holderRef.id)) errors.push(`container ${id}: unknown character holder ${container.holderRef.id}`);
      if (container.holderRef.kind === "expedition" && container.holderRef.id !== manifest.expeditionId) errors.push(`container ${id}: expedition holder must reference ${manifest.expeditionId}`);
    }
    if (!Number.isInteger(container?.capacity?.slots) || container.capacity.slots < 0) errors.push(`container ${id}: capacity.slots must be >= 0`);
    if (!Array.isArray(container?.rules)) errors.push(`container ${id}: rules must be an array`);
    if (!Array.isArray(container?.contents)) errors.push(`container ${id}: contents must be an array`);

    if (container?.storageProfile != null) {
      if (
        !container.storageProfile ||
        typeof container.storageProfile !== "object" ||
        Array.isArray(container.storageProfile)
      ) {
        errors.push(
          `container ${id}: storageProfile must be an object`
        );
      } else {
        const profile =
          normalizeContainerStorageProfile(
            container.storageProfile
          );

        if (
          container.storageProfile.accepts != null &&
          (
            !Array.isArray(
              container.storageProfile.accepts
            ) ||
            container.storageProfile.accepts.some(
              (value) =>
                !nonEmpty(value)
            )
          )
        ) {
          errors.push(
            `container ${id}: storageProfile.accepts must be an array of non-empty strings`
          );
        }

        if (
          container.storageProfile.stackLimit != null &&
          (
            !Number.isInteger(
              container.storageProfile.stackLimit
            ) ||
            container.storageProfile.stackLimit < 1
          )
        ) {
          errors.push(
            `container ${id}: storageProfile.stackLimit must be >= 1`
          );
        }

        if (
          container.storageProfile.mergeStacks != null &&
          typeof container.storageProfile.mergeStacks !==
            "boolean"
        ) {
          errors.push(
            `container ${id}: storageProfile.mergeStacks must be a boolean`
          );
        }

        if (
          profile.accepts.length !==
          (
            Array.isArray(
              container.storageProfile.accepts
            )
              ? [
                  ...new Set(
                    container.storageProfile.accepts
                      .filter(nonEmpty)
                      .map(
                        (value) =>
                          value.trim()
                      )
                  ),
                ].length
              : 0
          )
        ) {
          errors.push(
            `container ${id}: storageProfile.accepts contains invalid values`
          );
        }
      }
    }

    if (container?.materialStorage != null) {
      if (!container.materialStorage || typeof container.materialStorage !== "object" || Array.isArray(container.materialStorage)) {
        errors.push(`container ${id}: materialStorage must be an object`);
      } else {
        if (!Array.isArray(container.materialStorage.accepts) || container.materialStorage.accepts.some((value) => !nonEmpty(value))) {
          errors.push(`container ${id}: materialStorage.accepts must be an array of non-empty strings`);
        }
        if (!Number.isInteger(container.materialStorage.stackLimit) || container.materialStorage.stackLimit < 1) {
          errors.push(`container ${id}: materialStorage.stackLimit must be >= 1`);
        }
        if (container.materialStorage.mergeStacks != null && typeof container.materialStorage.mergeStacks !== "boolean") {
          errors.push(`container ${id}: materialStorage.mergeStacks must be a boolean`);
        }
      }
    }
    if (container?.presentation != null) {
      if (!container.presentation || typeof container.presentation !== "object" || Array.isArray(container.presentation)) {
        errors.push(`container ${id}: presentation must be an object`);
      } else {
        for (const key of ["icon", "background", "frame", "slotBackground"]) {
          if (container.presentation[key] != null && !nonEmpty(container.presentation[key])) {
            errors.push(`container ${id}: presentation.${key} must be a non-empty string`);
          }
        }
      }
    }

    for (const entry of container?.contents ?? []) {
      if (!nonEmpty(entry?.entryId)) errors.push(`container ${id}: entryId is required`);
      if (!nonEmpty(entry?.itemRef?.sourceId)) errors.push(`container ${id}/${entry?.entryId ?? "?"}: itemRef.sourceId is required`);
      if (!nonEmpty(entry?.itemRef?.name)) errors.push(`container ${id}/${entry?.entryId ?? "?"}: itemRef.name is required`);
      const lifecycleState = entry?.itemRef?.lifecycle?.state ?? "legacy";
      const terminalLifecycle =
        lifecycleState === "consumed" || lifecycleState === "deleted";
      const minimumQuantity = terminalLifecycle ? 0 : 1;
      if (
        !Number.isInteger(entry?.quantity) ||
        entry.quantity < minimumQuantity
      ) {
        errors.push(
          `container ${id}/${entry?.entryId ?? "?"}: quantity must be >= ${minimumQuantity}`
        );
      }
    }
  }

  for (const event of manifest.ledger) {
    if (!nonEmpty(event?.eventId)) errors.push("ledger eventId is required");
    if (!LEDGER_KINDS.has(event?.kind)) errors.push(`ledger ${event?.eventId ?? "?"}: invalid kind`);
    if (!nonEmpty(event?.itemRef?.sourceId)) errors.push(`ledger ${event?.eventId ?? "?"}: itemRef.sourceId is required`);
    if (!Number.isInteger(event?.quantity) || event.quantity < 1) errors.push(`ledger ${event?.eventId ?? "?"}: quantity must be >= 1`);
    for (const key of ["fromContainerId", "toContainerId"]) {
      if (event?.[key] != null && !containerSet.has(event[key])) errors.push(`ledger ${event.eventId}: unknown ${key} ${event[key]}`);
    }
  }

  return {
    green: errors.length === 0,
    migrated,
    schema: manifest.schema,
    expeditionId: manifest.expeditionId,
    revision: manifest.revision,
    phase: manifest.phase,
    authority: manifest.authority,
    characters: manifest.characters.length,
    containers: manifest.containers.length,
    personalContainers: manifest.containers.filter((c) => c.scope === "personal").length,
    partyContainers: manifest.containers.filter((c) => c.scope === "party").length,
    expeditionContainers: manifest.containers.filter((c) => c.scope === "expedition").length,
    backpacks: manifest.containers.filter((c) => c.type === "backpack").length,
    caravans: manifest.containers.filter((c) => c.type === "caravan").length,
    entries: manifest.containers.reduce((sum, c) => sum + (c.contents?.length ?? 0), 0),
    ledgerEntries: manifest.ledger.length,
    errors,
  };
}

function stackSnapshotKey(itemRef) {
  const snapshot = itemRef?.snapshot;

  if (
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    return null;
  }

  const normalized = clone(snapshot);

  delete normalized._id;
  delete normalized._stats;
  delete normalized.sort;
  delete normalized.folder;

  if (
    normalized.system &&
    typeof normalized.system === "object"
  ) {
    delete normalized.system.quantity;
    delete normalized.system.amount;
  }

  return JSON.stringify(normalized);
}

function entriesShareStackIdentity(
  left,
  right
) {
  if (
    left?.itemRef?.sourceId !==
    right?.itemRef?.sourceId
  ) {
    return false;
  }

  const leftKey =
    stackSnapshotKey(
      left?.itemRef
    );

  const rightKey =
    stackSnapshotKey(
      right?.itemRef
    );

  return (
    leftKey != null &&
    rightKey != null &&
    leftKey === rightKey
  );
}

function legacyMaterialStorageAdapter(
  container
) {
  const policy =
    container?.materialStorage;

  if (
    !policy ||
    typeof policy !== "object" ||
    Array.isArray(policy)
  ) {
    return null;
  }

  return {
    accepts:
      Array.isArray(policy.accepts)
        ? policy.accepts
        : [],

    stackLimit:
      Number(policy.stackLimit),

    mergeStacks:
      policy.mergeStacks !== false,

    splitOversize:
      policy.mergeStacks === false,
  };
}

function materialStorageData(entry) {
  const material = entry?.itemRef?.snapshot?.flags?.["daggerheart-campaign-toolkit"]?.material;
  if (!material?.materialId || !material?.containerClass) return null;
  return {
    materialId: material.materialId,
    containerClass: material.containerClass,
    stackable: material.stackable !== false,
  };
}

function legacyMaterialStorageRuleResult(container, entry, { additionalQuantity = null } = {}) {
  const material = materialStorageData(entry);
  if (!material) return { green: true, material: null };

  const policy =
    legacyMaterialStorageAdapter(
      container
    );

  if (!policy) {
    return {
      green: true,
      material,
      unmanaged: true,
    };
  }

  const accepts = Array.isArray(policy.accepts) ? policy.accepts : [];
  if (accepts.length && !accepts.includes(material.containerClass)) {
    return {
      green: false,
      reason: `${container.name} ne peut pas contenir ${material.containerClass}`,
      code: "material-container-class-rejected",
    };
  }

  const stackLimit = Number(policy.stackLimit);
  if (Number.isInteger(stackLimit) && stackLimit > 0) {
    const quantity = additionalQuantity == null
      ? Math.max(1, Number(entry?.quantity) || 1)
      : Math.max(1, Number(additionalQuantity) || 1);
    if (quantity > stackLimit) {
      return {
        green: false,
        reason: `${container.name} limite ce type de matériau à ${stackLimit} unité(s) par stack`,
        code: "material-stack-limit-exceeded",
        stackLimit,
        quantity,
      };
    }
  }

  return {
    green: true,
    material,
    stackLimit: Number.isInteger(stackLimit) ? stackLimit : null,
    mergeStacks: policy.mergeStacks !== false,
  };
}

function legacyMaterialMergeTarget(container, entry) {
  const policy =
    legacyMaterialStorageAdapter(
      container
    );

  if (
    !policy ||
    !policy.mergeStacks
  ) {
    return null;
  }
  const material = materialStorageData(entry);
  if (!material?.materialId) return null;
  return (container.contents ?? []).find((candidate) =>
    candidate !== entry &&
    materialStorageData(candidate)?.materialId === material.materialId &&
    Number(candidate?.quantity) > 0
  ) ?? null;
}

function storageProfileRuleResult(
  container,
  entry
) {
  if (
    !container?.storageProfile ||
    typeof container.storageProfile !== "object" ||
    Array.isArray(container.storageProfile)
  ) {
    return {
      green: true,
      managed: false,
    };
  }

  const result =
    containerProfileAcceptsEntry(
      container.storageProfile,
      entry
    );

  if (!result.green) {
    return {
      green: false,
      reason:
        container.name +
        " ne peut pas contenir cet objet",
      code:
        result.code ??
        "container-class-rejected",
      classes:
        result.classes ?? [],
      acceptedClasses:
        result.acceptedClasses ?? [],
    };
  }

  return {
    green: true,
    managed: true,
    profile:
      normalizeContainerStorageProfile(
        container.storageProfile
      ),
    classes:
      result.classes ?? [],
  };
}

function storageProfileMergeTarget(
  container,
  entry
) {
  if (
    !container?.storageProfile ||
    typeof container.storageProfile !== "object" ||
    Array.isArray(container.storageProfile)
  ) {
    return null;
  }

  const profile =
    normalizeContainerStorageProfile(
      container.storageProfile
    );

  if (!profile.mergeStacks) {
    return null;
  }

  return (
    container.contents ?? []
  ).find(
    (candidate) =>
      candidate !== entry &&
      Number(candidate?.quantity) > 0 &&
      entriesShareStackIdentity(
        candidate,
        entry
      )
  ) ?? null;
}

function transferRuleResult(container, entry) {
  for (const rule of container?.rules ?? []) {
    if (!rule || rule.enabled === false) continue;
    if (rule.ruleId === "deny-source" && nonEmpty(rule.sourceId) && rule.sourceId === entry?.itemRef?.sourceId) {
      return { green: false, reason: rule.message ?? `Objet refusé par ${container.name}` };
    }
    if (rule.ruleId === "allow-source-prefix" && nonEmpty(rule.prefix) && !String(entry?.itemRef?.sourceId ?? "").startsWith(rule.prefix)) {
      return { green: false, reason: rule.message ?? `Objet incompatible avec ${container.name}` };
    }
  }
  return { green: true };
}

export function canTransferExpeditionEntry(manifest, {
  entryId,
  fromContainerId,
  toContainerId,
} = {}) {
  if (!manifest || typeof manifest !== "object") return { green: false, reason: "manifest is required" };
  if (!nonEmpty(entryId) || !nonEmpty(fromContainerId) || !nonEmpty(toContainerId)) {
    return { green: false, reason: "entryId, fromContainerId and toContainerId are required" };
  }

  const from = manifest.containers?.find((container) => container.containerId === fromContainerId);
  const to = manifest.containers?.find((container) => container.containerId === toContainerId);
  if (!from) return { green: false, reason: `unknown source container ${fromContainerId}` };
  if (!to) return { green: false, reason: `unknown destination container ${toContainerId}` };

  const entry = (from.contents ?? []).find((candidate) => candidate.entryId === entryId);
  if (!entry) return { green: false, reason: `unknown entry ${entryId} in ${fromContainerId}` };

  const sameContainer =
    fromContainerId === toContainerId;

  // Abstract capacity has no physical slot position.
  if (sameContainer) {
    return {
      green: false,
      reason: "same-container",
    };
  }

  const rule = transferRuleResult(to, entry);
  if (!rule.green) return rule;

  const genericStorageRule =
    storageProfileRuleResult(
      to,
      entry
    );

  if (!genericStorageRule.green) {
    return genericStorageRule;
  }

  const materialRule =
    genericStorageRule.managed
      ? {
          green: true,
        }
      : legacyMaterialStorageRuleResult(
          to,
          entry
        );

  if (!materialRule.green) {
    return materialRule;
  }

  const mergeTarget =
    genericStorageRule.managed
      ? storageProfileMergeTarget(
          to,
          entry
        )
      : legacyMaterialMergeTarget(
          to,
          entry
        );

  if (mergeTarget) {
    const nextQuantity =
      Math.max(1, Number(mergeTarget.quantity) || 1) +
      Math.max(1, Number(entry.quantity) || 1);

    const mergeRule =
      genericStorageRule.managed
        ? storageProfileRuleResult(
            to,
            mergeTarget
          )
        : legacyMaterialStorageRuleResult(
            to,
            mergeTarget,
            {
              additionalQuantity:
                nextQuantity,
            }
          );

    if (!mergeRule.green) {
      return mergeRule;
    }

    const capacity = containerStorageCapacity(to, {
      resolveStorage: resolveEffectiveStorageProfile,
    });

    const beforeMerge = {
      ...mergeTarget,
      quantity: Math.max(1, Number(mergeTarget.quantity) || 1),
    };

    const afterMerge = {
      ...mergeTarget,
      quantity: nextQuantity,
    };

    const beforeSlots = containerStorageCapacity(
      {
        capacity: { slots: Number.MAX_SAFE_INTEGER },
        storageProfile:
          to?.storageProfile ?? null,
        contents: [beforeMerge],
      },
      {
        resolveStorage: resolveEffectiveStorageProfile,
      }
    ).used;

    const afterSlots = containerStorageCapacity(
      {
        capacity: { slots: Number.MAX_SAFE_INTEGER },
        storageProfile:
          to?.storageProfile ?? null,
        contents: [afterMerge],
      },
      {
        resolveStorage: resolveEffectiveStorageProfile,
      }
    ).used;

    const additionalSlots =
      Math.max(0, afterSlots - beforeSlots);

    if (capacity.used + additionalSlots > capacity.slots) {
      return {
        green: false,
        reason: `${to.name} est plein (${capacity.used}/${capacity.slots} slots, +${additionalSlots} requis)`,
        code: "container-capacity-exceeded",
        capacity,
        incomingSlots: additionalSlots,
      };
    }

    return {
      green: true,
      entry,
      from,
      to,
      mergeTarget,
    };
  }

  const capacity = containerStorageCapacity(to, {
    resolveStorage: resolveEffectiveStorageProfile,
  });

  const incomingSlots = containerStorageCapacity(
    {
      capacity: { slots: Number.MAX_SAFE_INTEGER },
      storageProfile:
        to?.storageProfile ?? null,
      contents: [entry],
    },
    {
      resolveStorage: resolveEffectiveStorageProfile,
    }
  ).used;

  if (capacity.used + incomingSlots > capacity.slots) {
    return {
      green: false,
      reason: `${to.name} est plein (${capacity.used}/${capacity.slots} slots, +${incomingSlots} requis)`,
      code: "container-capacity-exceeded",
      capacity,
      incomingSlots,
    };
  }

  return {
    green: true,
    entry,
    from,
    to,
  };
}

export function transferExpeditionEntry(manifest, {
  entryId,
  fromContainerId,
  toContainerId,
  quantity = null,
} = {}) {
  const from =
    manifest?.containers?.find(
      (container) =>
        container.containerId === fromContainerId
    );

  const sourceEntry =
    from?.contents?.find(
      (candidate) =>
        candidate.entryId === entryId
    );

  if (!sourceEntry) {
    return {
      moved: false,
      reason: `unknown entry ${entryId} in ${fromContainerId}`,
      manifest,
    };
  }

  const available =
    Math.max(
      1,
      Number(sourceEntry.quantity) || 1
    );

  const requested =
    quantity == null
      ? available
      : Math.max(
          1,
          Math.floor(Number(quantity) || 1)
        );

  if (requested > available) {
    return {
      moved: false,
      reason:
        `quantity ${requested} exceeds available ${available}`,
      manifest,
    };
  }

  const partial = requested < available;

  if (!partial) {
    const check =
      canTransferExpeditionEntry(
        manifest,
        {
          entryId,
          fromContainerId,
          toContainerId,
        }
      );

    if (!check.green) {
      return {
        moved: false,
        reason: check.reason,
        manifest,
      };
    }

    const {
      entry,
      from,
      to,
      mergeTarget = null,
    } = check;

    const index =
      from.contents.findIndex(
        (candidate) =>
          candidate.entryId === entryId
      );

    from.contents.splice(index, 1);

    if (mergeTarget) {
      mergeTarget.quantity =
        Math.max(
          1,
          Number(mergeTarget.quantity) || 1
        ) +
        available;
    } else {
      to.contents ??= [];
      to.contents.push(entry);
    }

    manifest.revision =
      Math.max(
        1,
        Number(manifest.revision) || 1
      ) + 1;

    let ledgerEvent = null;

    if (
      fromContainerId !== toContainerId
    ) {
      ledgerEvent =
        appendExpeditionLedgerEvent(
          manifest,
          {
            kind: "transferred",
            entryId: entry.entryId,
            itemRef: entry.itemRef,
            quantity: available,
            fromContainerId,
            toContainerId,
          }
        );
    }

    return {
      moved: true,
      merged: Boolean(mergeTarget),
      partial: false,
      quantity: available,
      remaining: 0,
      entryId,
      fromContainerId,
      toContainerId,
      ledgerEvent,
      manifest,
    };
  }

  if (fromContainerId === toContainerId) {
    return {
      moved: false,
      reason:
        "partial same-container transfer is unsupported",
      manifest,
    };
  }

  const snapshot = clone(manifest);

  const stagedEntry = clone(sourceEntry);
  stagedEntry.quantity = requested;

  const sourceIndex =
    from.contents.findIndex(
      (candidate) =>
        candidate.entryId === entryId
    );

  from.contents[sourceIndex] = stagedEntry;

  const check =
    canTransferExpeditionEntry(
      manifest,
      {
        entryId,
        fromContainerId,
        toContainerId,
      }
    );

  from.contents[sourceIndex] = sourceEntry;

  if (!check.green) {
    return {
      moved: false,
      reason: check.reason,
      manifest,
    };
  }

  try {
    const to = check.to;
    const mergeTarget =
      check.mergeTarget ?? null;

    sourceEntry.quantity =
      available - requested;

    if (mergeTarget) {
      mergeTarget.quantity =
        Math.max(
          1,
          Number(mergeTarget.quantity) || 1
        ) +
        requested;
    } else {
      const movedEntry = clone(sourceEntry);

      movedEntry.entryId =
        nextEntryId(
          manifest,
          movedEntry.itemRef
        );

      movedEntry.quantity = requested;

      to.contents ??= [];
      to.contents.push(movedEntry);
    }

    manifest.revision =
      Math.max(
        1,
        Number(manifest.revision) || 1
      ) + 1;

    const ledgerEvent =
      appendExpeditionLedgerEvent(
        manifest,
        {
          kind: "transferred",
          entryId,
          itemRef: sourceEntry.itemRef,
          quantity: requested,
          fromContainerId,
          toContainerId,
        }
      );

    return {
      moved: true,
      merged: Boolean(mergeTarget),
      partial: true,
      quantity: requested,
      remaining:
        available - requested,
      entryId,
      fromContainerId,
      toContainerId,
      ledgerEvent,
      manifest,
    };
  } catch (error) {
    for (const key of Object.keys(manifest)) {
      delete manifest[key];
    }

    Object.assign(manifest, snapshot);

    return {
      moved: false,
      reason:
        error?.message ??
        "partial-transfer-failed",
      manifest,
    };
  }
}

export function appendExpeditionLedgerEvent(manifest, {
  kind,
  entryId = null,
  itemRef = null,
  quantity = 1,
  fromContainerId = null,
  toContainerId = null,
  fromRef = null,
  toRef = null,
  note = null,
} = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest is required");
  if (!LEDGER_KINDS.has(kind)) throw new Error(`unsupported ledger kind ${kind}`);

  manifest.ledger ??= [];
  const event = {
    eventId: globalThis.crypto?.randomUUID?.() ?? `ledger-${Date.now()}-${manifest.ledger.length + 1}`,
    kind,
    entryId: nonEmpty(entryId) ? entryId : null,
    itemRef: itemRef && typeof itemRef === "object" ? clone(itemRef) : null,
    quantity: Math.max(1, Number(quantity) || 1),
    fromContainerId: nonEmpty(fromContainerId) ? fromContainerId : null,
    toContainerId: nonEmpty(toContainerId) ? toContainerId : null,
    fromRef: fromRef && typeof fromRef === "object" ? clone(fromRef) : null,
    toRef: toRef && typeof toRef === "object" ? clone(toRef) : null,
    note: nonEmpty(note) ? note : null,
    at: new Date().toISOString(),
  };
  manifest.ledger.push(event);
  return event;
}

export function expeditionLedgerSummary(manifest) {
  const events = manifest?.ledger ?? [];
  const byKind = Object.fromEntries(LEDGER_KINDS.map((kind) => [kind, 0]));
  for (const event of events) {
    if (event && LEDGER_KINDS.has(event.kind)) byKind[event.kind] += 1;
  }
  return { total: events.length, byKind };
}


function findContainerOrThrow(manifest, containerId) {
  const container = (manifest?.containers ?? []).find((candidate) => candidate.containerId === containerId);
  if (!container) throw new Error(`unknown container ${containerId}`);
  return container;
}

function findEntryOrThrow(container, entryId) {
  const index = (container?.contents ?? []).findIndex((candidate) => candidate.entryId === entryId);
  if (index < 0) throw new Error(`unknown entry ${entryId} in ${container?.containerId ?? "container"}`);
  return { entry: container.contents[index], index };
}

function nextEntryId(manifest, itemRef) {
  const base = String(itemRef?.sourceId ?? itemRef?.name ?? "entry")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "entry";
  const used = new Set((manifest?.containers ?? []).flatMap((c) => (c.contents ?? []).map((e) => e.entryId)));
  let i = 1;
  let candidate = `${base}-${i}`;
  while (used.has(candidate)) candidate = `${base}-${++i}`;
  return candidate;
}

export function acquireExpeditionEntry(manifest, {
  containerId,
  itemRef,
  quantity = 1,
  entryId = null,
  note = null,
} = {}) {
  const container = findContainerOrThrow(manifest, containerId);
  const qty = Math.max(1, Number(quantity) || 1);

  // P2.12d.1: non-merging material storage represents physical stacks/slots.
  // Split a multi-unit acquisition into stack-sized entries atomically instead
  // of rejecting the whole request because a single staged entry is too large.
  const materialProbe = { itemRef: itemRef && typeof itemRef === "object" ? clone(itemRef) : {}, quantity: 1 };
  const material =
    materialStorageData(
      materialProbe
    );

  const legacyPolicy =
    legacyMaterialStorageAdapter(
      container
    );

  const stackLimit =
    Number(
      legacyPolicy?.stackLimit
    );

  if (
    material &&
    legacyPolicy?.splitOversize === true &&
    Number.isInteger(stackLimit) &&
    stackLimit > 0 &&
    qty > stackLimit
  ) {
    const snapshot = clone(manifest);
    const entries = [];
    const ledgerEvents = [];
    let remaining = qty;
    let first = true;

    while (remaining > 0) {
      const chunk = Math.min(stackLimit, remaining);
      const result = acquireExpeditionEntry(manifest, {
        containerId,
        itemRef,
        quantity: chunk,
        entryId: first ? entryId : null,
        note,
      });

      if (!result.acquired) {
        for (const key of Object.keys(manifest)) delete manifest[key];
        Object.assign(manifest, snapshot);
        return {
          acquired: false,
          reason: result.reason,
          code: result.code ?? null,
          manifest,
        };
      }

      entries.push(result.entry);
      if (result.ledgerEvent) ledgerEvents.push(result.ledgerEvent);
      remaining -= chunk;
      first = false;
    }

    return {
      acquired: true,
      split: true,
      entries,
      entry: entries[0] ?? null,
      ledgerEvents,
      ledgerEvent: ledgerEvents[0] ?? null,
      manifest,
    };
  }
  const candidate = {
    entryId: nonEmpty(entryId) ? entryId : nextEntryId(manifest, itemRef),
    itemRef: itemRef && typeof itemRef === "object" ? clone(itemRef) : {},
    quantity: qty,
  };

  const genericStorageRule =
    storageProfileRuleResult(
      container,
      candidate
    );

  if (!genericStorageRule.green) {
    return {
      acquired: false,
      reason: genericStorageRule.reason,
      code: genericStorageRule.code ?? null,
      manifest,
    };
  }

  const genericManaged =
    genericStorageRule.managed === true;

  const genericProfile =
    genericManaged
      ? normalizeContainerStorageProfile(
          container.storageProfile
        )
      : null;

  const existingStack =
    genericManaged
      ? (
          genericProfile.mergeStacks
            ? (
                container.contents ?? []
              ).find(
                (existing) =>
                  Number(existing?.quantity) > 0 &&
                  entriesShareStackIdentity(
                    existing,
                    candidate
                  )
              ) ?? null
            : null
        )
      : (
          legacyMaterialStorageAdapter(
            container
          )?.mergeStacks === false
            ? null
            : (
                container.contents ?? []
              ).find(
                (existing) =>
                  Number(existing?.quantity) > 0 &&
                  entriesShareStackIdentity(
                    existing,
                    candidate
                  )
              ) ?? null
        );

  if (existingStack) {
    const nextQuantity =
      Math.max(
        1,
        Number(existingStack.quantity) || 1
      ) + qty;

    if (genericManaged) {
      const tempId =
        "__expedition-acquire-merge__";

      const stagedCandidate =
        clone(candidate);

      const temp = {
        containerId: tempId,
        type: "virtual",
        scope: "expedition",
        capacity: {
          slots:
            Number.MAX_SAFE_INTEGER,
        },
        rules: [],
        contents: [
          stagedCandidate,
        ],
      };

      manifest.containers.push(temp);

      let preflight;

      try {
        preflight =
          canTransferExpeditionEntry(
            manifest,
            {
              entryId:
                stagedCandidate.entryId,
              fromContainerId:
                tempId,
              toContainerId:
                containerId,
            }
          );
      } finally {
        manifest.containers.pop();
      }

      if (!preflight.green) {
        return {
          acquired: false,
          reason: preflight.reason,
          code:
            preflight.code ?? null,
          manifest,
        };
      }

      if (
        preflight.mergeTarget !==
        existingStack
      ) {
        return {
          acquired: false,
          reason:
            "generic acquisition merge target mismatch",
          code:
            "acquisition-merge-target-mismatch",
          manifest,
        };
      }
    } else {
      const materialRule =
        legacyMaterialStorageRuleResult(
          container,
          existingStack,
          {
            additionalQuantity:
              nextQuantity,
          }
        );

      if (!materialRule.green) {
        return {
          acquired: false,
          reason:
            materialRule.reason,
          code:
            materialRule.code,
          manifest,
        };
      }
    }

    existingStack.quantity =
      nextQuantity;

    manifest.revision =
      Math.max(
        1,
        Number(manifest.revision) || 1
      ) + 1;

    const ledgerEvent =
      appendExpeditionLedgerEvent(
        manifest,
        {
          kind: "acquired",
          entryId:
            existingStack.entryId,
          itemRef:
            existingStack.itemRef,
          quantity: qty,
          toContainerId:
            containerId,
          note,
        }
      );

    return {
      acquired: true,
      merged: true,
      entry: existingStack,
      ledgerEvent,
      manifest,
    };
  }
  // Reuse the same capacity/rule preflight as transfers by staging a temporary source.
  const tempId = "__expedition-acquire__";
  const stagedCandidate = clone(candidate);
  const temp = { containerId: tempId, type: "virtual", scope: "expedition", capacity: { slots: 1 }, rules: [], contents: [stagedCandidate] };
  manifest.containers.push(temp);
  let preflight;
  try {
    preflight = canTransferExpeditionEntry(manifest, {
      entryId: candidate.entryId,
      fromContainerId: tempId,
      toContainerId: containerId,
    });
  } finally {
    manifest.containers.pop();
  }
  if (!preflight.green) return { acquired: false, reason: preflight.reason, code: preflight.code ?? null, manifest };

  candidate.quantity = qty;
  container.contents ??= [];
  container.contents.push(candidate);
  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
  const ledgerEvent = appendExpeditionLedgerEvent(manifest, {
    kind: "acquired",
    entryId: candidate.entryId,
    itemRef: candidate.itemRef,
    quantity: qty,
    toContainerId: containerId,
    note,
  });
  return { acquired: true, entry: candidate, ledgerEvent, manifest };
}

function removeExpeditionQuantity(manifest, {
  kind,
  containerId,
  entryId,
  quantity = 1,
  note = null,
} = {}) {
  const container = findContainerOrThrow(manifest, containerId);
  const { entry, index } = findEntryOrThrow(container, entryId);
  const available = Math.max(1, Number(entry.quantity) || 1);
  const qty = Math.max(1, Number(quantity) || 1);
  if (qty > available) {
    return { changed: false, reason: `quantity ${qty} exceeds available ${available}`, manifest };
  }

  const itemRef = clone(entry.itemRef ?? {});
  if (qty === available) container.contents.splice(index, 1);
  else entry.quantity = available - qty;

  manifest.revision = Math.max(1, Number(manifest.revision) || 1) + 1;
  const ledgerEvent = appendExpeditionLedgerEvent(manifest, {
    kind,
    entryId,
    itemRef,
    quantity: qty,
    fromContainerId: containerId,
    note,
  });
  return { changed: true, removedEntry: qty === available, remaining: available - qty, ledgerEvent, manifest };
}

export function consumeExpeditionEntry(manifest, options = {}) {
  return removeExpeditionQuantity(manifest, { ...options, kind: "consumed" });
}

export function loseExpeditionEntry(manifest, options = {}) {
  return removeExpeditionQuantity(manifest, { ...options, kind: "lost" });
}


export function createEmptyExpeditionManifest({ expeditionId = "new-expedition" } = {}) {
  return {
    schema: EXPEDITION_MANIFEST_SCHEMA,
    expeditionId,
    revision: 1,
    phase: "prepared",
    logistics: {
      phase: "field",
    },
    authority: "web",
    characters: [],
    containers: [],
    access:
      normalizeExpeditionAccess(
        null,
        {
          characterIds: [],
        }
      ),
    fob: null,
    caravan:
      createDefaultExpeditionCaravan({
        id: "caravan",
        name: "Caravane",
      }),
    ledger: [],
    metadata: {},
  };
}

export function extractExpeditionEntry(manifest, { containerId, entryId, quantity = 1 } = {}) {
  const container = (manifest?.containers ?? []).find(c => c.containerId === containerId);
  if (!container) return { changed: false, reason: "container-not-found", manifest };
  const index = (container.contents ?? []).findIndex(e => e.entryId === entryId);
  if (index < 0) return { changed: false, reason: "entry-not-found", manifest };
  const entry = container.contents[index];
  const available = Math.max(1, Number(entry.quantity) || 1);
  const qty = Math.max(1, Number(quantity) || 1);
  if (qty > available) return { changed: false, reason: "quantity-exceeds-entry", manifest };
  const snapshot = clone(entry);
  const remaining = available - qty;
  if (remaining) entry.quantity = remaining; else container.contents.splice(index, 1);
  manifest.revision = Math.max(0, Number(manifest.revision) || 0) + 1;
  return { changed: true, manifest, entry: snapshot, quantity: qty, remaining, removedEntry: remaining === 0 };
}

export const expeditionManifestApi = Object.freeze({
  version: 2,
  schema: EXPEDITION_MANIFEST_SCHEMA,
  previousSchema: EXPEDITION_MANIFEST_SCHEMA_V1,
  validate: validateExpeditionManifest,
  normalize: normalizeExpeditionManifest,
  migrateV1: migrateExpeditionManifestV1,
  createEmpty: createEmptyExpeditionManifest,
  canTransfer: canTransferExpeditionEntry,
  transfer: transferExpeditionEntry,
  appendLedger: appendExpeditionLedgerEvent,
  ledgerSummary: expeditionLedgerSummary,
  acquire: acquireExpeditionEntry,
  extract: extractExpeditionEntry,
  consume: consumeExpeditionEntry,
  lose: loseExpeditionEntry,
});

