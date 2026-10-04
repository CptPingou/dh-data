import { validateMaterialKnowledge } from "./crafting-schema.mjs";

import {
  PROPERTY_KNOWLEDGE_STATUSES,
  normalizePropertyKnowledgeStatus,
  propertyKnowledgeProjection as projectPropertyKnowledgeStatus,
} from "./crafting-knowledge-status.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const SETTING_KEY = "materialKnowledge";
const SCHEMA_VERSION = 1;

const clone = (value) => value == null ? value : (globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "mh.material-knowledge.world",
    actorKnowledge: {},
    partyKnowledge: { scope: "party", materials: {} },
  };
}

function actorKey(actor) {
  const key = actor?.uuid ?? null;
  if (!key || !/^Actor\.[^.]+$/.test(key)) throw new Error("A permanent Foundry Actor is required.");
  return key;
}

function assertGm() {
  if (!game.user?.isGM) throw new Error("Material knowledge mutation is currently GM-authoritative.");
}

function assertRegistered() {
  if (!game.settings?.settings?.has?.(`${MODULE_ID}.${SETTING_KEY}`)) {
    throw new Error("Material knowledge setting is unavailable; restart Foundry after deploying the Toolkit.");
  }
}

function normalize(raw) {
  const state = raw && typeof raw === "object" ? clone(raw) : emptyState();
  state.schemaVersion = SCHEMA_VERSION;
  state.id = state.id || "mh.material-knowledge.world";
  state.actorKnowledge = state.actorKnowledge && typeof state.actorKnowledge === "object" ? state.actorKnowledge : {};
  state.partyKnowledge = state.partyKnowledge && typeof state.partyKnowledge === "object" ? state.partyKnowledge : { scope: "party", materials: {} };
  state.partyKnowledge.scope = "party";
  state.partyKnowledge.materials = state.partyKnowledge.materials && typeof state.partyKnowledge.materials === "object" ? state.partyKnowledge.materials : {};
  for (const actor of Object.values(state.actorKnowledge)) {
    actor.materials = actor?.materials && typeof actor.materials === "object" ? actor.materials : {};
  }
  validateMaterialKnowledge(state);
  return state;
}

export function registerMaterialKnowledgeSetting() {
  if (game.settings.settings.has(`${MODULE_ID}.${SETTING_KEY}`)) return;
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Connaissance des matériaux",
    hint: "Découvertes personnelles et documentation collective des matériaux de chasse.",
    scope: "world",
    config: false,
    type: Object,
    default: emptyState(),
    restricted: false,
  });
}

function readState() {
  assertRegistered();
  return normalize(game.settings.get(MODULE_ID, SETTING_KEY));
}

async function writeState(state) {
  assertGm();
  const normalized = normalize(state);
  await game.settings.set(MODULE_ID, SETTING_KEY, normalized);
  return normalized;
}

function actorEntry(state, actor, { create = false } = {}) {
  const key = actorKey(actor);
  if (!state.actorKnowledge[key] && create) state.actorKnowledge[key] = { materials: {} };
  return state.actorKnowledge[key] ?? null;
}

function materialEntry(materials, materialId, propertyKey, { create = false } = {}) {
  if (!materials[materialId] && create) materials[materialId] = { [propertyKey]: {} };
  const entry = materials[materialId] ?? null;
  if (entry && (!entry[propertyKey] || typeof entry[propertyKey] !== "object") && create) entry[propertyKey] = {};
  return entry;
}

async function resolveProperty(materialsApi, materialId, propertyId) {
  const material = await materialsApi.get(materialId);
  if (!material) throw new Error(`Unknown material: ${materialId}.`);
  if (!material.research?.discoverable) throw new Error(`${material.name} is not research-discoverable.`);
  const properties = material.material?.properties;
  const hasProperty = Array.isArray(properties)
    ? properties.includes(propertyId)
    : Boolean(properties && typeof properties === "object" && Number(properties[propertyId]) > 0);
  if (!hasProperty) throw new Error(`${propertyId} is not a property of ${material.name}.`);
  return material;
}

export function createCraftingKnowledgeApi(materialsApi, { now = () => Date.now() } = {}) {
  if (!materialsApi?.get || !materialsApi?.actorQuantity) throw new Error("craftingMaterials API is required.");

  function personal(actor, materialId = null) {
    const state = readState();
    const materials = actorEntry(state, actor)?.materials ?? {};
    if (!materialId) return clone(materials);
    return clone(materials[materialId]?.discoveredProperties ?? {});
  }

  function documented(materialId = null) {
    const materials = readState().partyKnowledge.materials;
    if (!materialId) return clone(materials);
    return clone(materials[materialId]?.documentedProperties ?? {});
  }

  function effective(actor, materialId) {
    const personalProperties = personal(actor, materialId);
    const documentedProperties = documented(materialId);
    const propertyIds = [...new Set([...Object.keys(documentedProperties), ...Object.keys(personalProperties)])];
    return {
      materialId,
      properties: propertyIds,
      personal: personalProperties,
      documented: documentedProperties,
    };
  }

  function propertyStatus(
    actor,
    materialId,
    propertyId
  ) {
    const state =
      readState();

    const partyEntry =
      state.partyKnowledge
        .materials?.[materialId];

    if (
      partyEntry
        ?.documentedProperties
        ?.[propertyId]
    ) {
      return (
        PROPERTY_KNOWLEDGE_STATUSES.SHARED
      );
    }

    const actorMaterials =
      actorEntry(
        state,
        actor
      )?.materials ?? {};

    const actorMaterial =
      actorMaterials[
        materialId
      ];

    if (
      actorMaterial
        ?.discoveredProperties
        ?.[propertyId]
    ) {
      return (
        PROPERTY_KNOWLEDGE_STATUSES.DISCOVERED
      );
    }

    const explicit =
      normalizePropertyKnowledgeStatus(
        actorMaterial
          ?.propertyStatuses
          ?.[propertyId]
          ?.status
      );

    if (
      explicit ===
      PROPERTY_KNOWLEDGE_STATUSES.VISIBLE
    ) {
      return explicit;
    }

    return (
      PROPERTY_KNOWLEDGE_STATUSES.INVISIBLE
    );
  }

  function propertyProjection(
    actor,
    materialId,
    propertyId
  ) {
    return projectPropertyKnowledgeStatus(
      propertyStatus(
        actor,
        materialId,
        propertyId
      )
    );
  }

  async function setPropertyStatus({
    actor,
    materialId,
    propertyId,
    status,
    source = {
      type:
        "gm-status",
    },
  } = {}) {
    assertGm();

    await resolveProperty(
      materialsApi,
      materialId,
      propertyId
    );

    /*
     * actorKey also guarantees that the status is
     * attached to a permanent Foundry actor.
     */
    actorKey(actor);

    const target =
      normalizePropertyKnowledgeStatus(
        status
      );

    const state =
      readState();

    const actorMaterials =
      actorEntry(
        state,
        actor,
        {
          create:
            true,
        }
      ).materials;

    const actorMaterial =
      materialEntry(
        actorMaterials,
        materialId,
        "discoveredProperties",
        {
          create:
            true,
        }
      );

    actorMaterial.propertyStatuses =
      actorMaterial.propertyStatuses &&
      typeof actorMaterial
        .propertyStatuses ===
        "object"
        ? actorMaterial.propertyStatuses
        : {};

    const partyMaterials =
      state.partyKnowledge
        .materials;

    const partyMaterial =
      materialEntry(
        partyMaterials,
        materialId,
        "documentedProperties",
        {
          create:
            true,
        }
      );

    /*
     * Moving away from SHARED removes only the
     * collective publication. Other actors keep
     * their own personal discoveries.
     */
    if (
      target !==
      PROPERTY_KNOWLEDGE_STATUSES.SHARED
    ) {
      delete (
        partyMaterial
          .documentedProperties[
            propertyId
          ]
      );
    }

    if (
      target ===
      PROPERTY_KNOWLEDGE_STATUSES.INVISIBLE
    ) {
      delete (
        actorMaterial
          .discoveredProperties[
            propertyId
          ]
      );

      delete (
        actorMaterial
          .propertyStatuses[
            propertyId
          ]
      );
    }

    if (
      target ===
      PROPERTY_KNOWLEDGE_STATUSES.VISIBLE
    ) {
      delete (
        actorMaterial
          .discoveredProperties[
            propertyId
          ]
      );

      actorMaterial
        .propertyStatuses[
          propertyId
        ] = {
          status:
            PROPERTY_KNOWLEDGE_STATUSES.VISIBLE,

          revealedAt:
            now(),

          source:
            clone(
              source ?? {
                type:
                  "unknown",
              }
            ),
        };
    }

    if (
      target ===
      PROPERTY_KNOWLEDGE_STATUSES.DISCOVERED
    ) {
      delete (
        actorMaterial
          .propertyStatuses[
            propertyId
          ]
      );

      actorMaterial
        .discoveredProperties[
          propertyId
        ] = {
          discoveredAt:
            now(),

          source:
            clone(
              source ?? {
                type:
                  "unknown",
              }
            ),
        };
    }

    if (
      target ===
      PROPERTY_KNOWLEDGE_STATUSES.SHARED
    ) {
      delete (
        actorMaterial
          .propertyStatuses[
            propertyId
          ]
      );

      actorMaterial
        .discoveredProperties[
          propertyId
        ] ??= {
          discoveredAt:
            now(),

          source:
            clone(
              source ?? {
                type:
                  "unknown",
              }
            ),
        };

      partyMaterial
        .documentedProperties[
          propertyId
        ] = {
          documentedAt:
            now(),

          documentedBy:
            actor.uuid,
        };
    }

    await writeState(
      state
    );

    return {
      green:
        true,

      changed:
        true,

      actorUuid:
        actor.uuid,

      materialId,
      propertyId,

      status:
        propertyStatus(
          actor,
          materialId,
          propertyId
        ),
    };
  }

  async function discoverMaterialProperty({ actor, materialId, propertyId, source = { type: "research-station" }, specimenQuantity = null } = {}) {
    assertGm();
    const material = await resolveProperty(materialsApi, materialId, propertyId);
    const specimen = material.research?.specimen ?? { required: false, consumed: false };
    const availableSpecimens = specimenQuantity == null
      ? materialsApi.actorQuantity(actor, materialId)
      : Math.max(0, Number(specimenQuantity) || 0);
    if (specimen.required && availableSpecimens < 1) {
      throw new Error(`A specimen of ${material.name} is required for discovery.`);
    }
    if (specimen.consumed) throw new Error("Consumed research specimens are not implemented in v1.");

    const state = readState();
    const actorMaterials = actorEntry(state, actor, { create: true }).materials;
    const entry = materialEntry(actorMaterials, materialId, "discoveredProperties", { create: true });
    const existing = entry.discoveredProperties[propertyId];
    if (existing) return { green: true, changed: false, actorUuid: actor.uuid, materialId, propertyId, discovery: clone(existing) };

    const discovery = { discoveredAt: now(), source: clone(source ?? { type: "unknown" }) };
    entry.discoveredProperties[propertyId] = discovery;
    await writeState(state);
    return { green: true, changed: true, actorUuid: actor.uuid, materialId, propertyId, discovery: clone(discovery), specimenConsumed: false };
  }

  async function documentMaterialProperty({ actor, materialId, propertyId } = {}) {
    assertGm();
    await resolveProperty(materialsApi, materialId, propertyId);
    const state = readState();
    const actorMaterials = actorEntry(state, actor)?.materials ?? {};
    if (!actorMaterials[materialId]?.discoveredProperties?.[propertyId]) {
      throw new Error(`${actor.name ?? actor.uuid} has not personally discovered ${propertyId} on ${materialId}.`);
    }

    const partyMaterials = state.partyKnowledge.materials;
    const entry = materialEntry(partyMaterials, materialId, "documentedProperties", { create: true });
    const existing = entry.documentedProperties[propertyId];
    if (existing) return { green: true, changed: false, materialId, propertyId, documentation: clone(existing) };

    const documentation = { documentedAt: now(), documentedBy: actor.uuid };
    entry.documentedProperties[propertyId] = documentation;
    await writeState(state);
    return { green: true, changed: true, materialId, propertyId, documentation: clone(documentation) };
  }

  function status(actor = null) {
    const state = readState();
    const documentedMaterials = Object.keys(state.partyKnowledge.materials).length;
    const documentedProperties = Object.values(state.partyKnowledge.materials).reduce((sum, entry) => sum + Object.keys(entry.documentedProperties ?? {}).length, 0);
    const personalMaterials = actor ? Object.keys(actorEntry(state, actor)?.materials ?? {}).length : null;
    const personalProperties = actor ? Object.values(actorEntry(state, actor)?.materials ?? {}).reduce((sum, entry) => sum + Object.keys(entry.discoveredProperties ?? {}).length, 0) : null;
    return { green: true, storage: "world", actorUuid: actor?.uuid ?? null, personalMaterials, personalProperties, documentedMaterials, documentedProperties };
  }

  return Object.freeze({
    personal,
    documented,
    effective,

    propertyStatus,
    propertyProjection,
    setPropertyStatus,

    discoverMaterialProperty,
    discover: discoverMaterialProperty,
    documentMaterialProperty,
    document: documentMaterialProperty,
    status,
  });
}
