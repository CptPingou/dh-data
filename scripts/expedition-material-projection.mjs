const clone = (value) =>
  value == null
    ? value
    : globalThis.structuredClone
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

function propertyMap(propertyCatalog) {
  return new Map(
    (propertyCatalog?.properties ?? []).map((property) => [
      property.id,
      property,
    ])
  );
}

function knownPropertyIds(knowledge, materialId) {
  const effective =
    knowledge?.[materialId] ??
    knowledge?.materials?.[materialId] ??
    null;

  if (!effective) return new Set();

  if (Array.isArray(effective.properties)) {
    return new Set(effective.properties);
  }

  const personal =
    effective.discoveredProperties ??
    effective.personal ??
    {};

  const documented =
    effective.documentedProperties ??
    effective.documented ??
    {};

  return new Set([
    ...Object.keys(personal),
    ...Object.keys(documented),
  ]);
}

function inventoryQuantity(inventory, materialId) {
  if (Array.isArray(inventory)) {
    return inventory
      .filter((entry) => entry?.materialId === materialId)
      .reduce(
        (sum, entry) => sum + Math.max(0, Number(entry?.quantity) || 0),
        0
      );
  }

  return Math.max(
    0,
    Number(inventory?.[materialId]?.quantity ?? inventory?.[materialId]) || 0
  );
}

function projectKnownProperty(propertyId, tier, definitions) {
  const definition = definitions.get(propertyId);

  return {
    known: true,
    propertyId,
    label: definition?.label ?? propertyId,
    category: definition?.category ?? null,
    description: definition?.description ?? null,
    tierKnown: true,
    tier: Number(tier) || null,
  };
}

function projectUnknownProperty() {
  return {
    known: false,
    propertyId: null,
    label: null,
    category: null,
    description: null,
    tierKnown: false,
    tier: null,
  };
}

export function projectMaterial(
  material,
  {
    propertyCatalog,
    knowledge = {},
    inventory = [],
  } = {}
) {
  if (!material?.id) {
    throw new Error("Material projection requires material.id.");
  }

  const definitions = propertyMap(propertyCatalog);
  const known = knownPropertyIds(knowledge, material.id);

  const rawProperties =
    material?.material?.properties &&
    typeof material.material.properties === "object"
      ? material.material.properties
      : {};

  const properties = [];

  for (const [propertyId, tier] of Object.entries(rawProperties)) {
    if (known.has(propertyId)) {
      properties.push(
        projectKnownProperty(propertyId, tier, definitions)
      );
    } else {
      properties.push(projectUnknownProperty());
    }
  }

  const knownCount =
    properties.filter((property) => property.known).length;

  const totalCount = properties.length;

  return {
    schemaVersion: 1,
    materialId: material.id,
    name: material.name ?? material.id,
    img: material.img ?? null,

    family: material.material?.family ?? null,
    quality: material.material?.quality ?? null,

    source: {
      type: material.source?.type ?? null,
      creatureId: material.source?.creatureId ?? null,
      anatomy: material.source?.anatomy ?? null,
    },

    inventory: {
      quantity: inventoryQuantity(inventory, material.id),
      available: inventoryQuantity(inventory, material.id) > 0,
      stackable: material.inventory?.stackable === true,
      containerClass: material.inventory?.containerClass ?? null,
    },

    research: {
      discoverable: material.research?.discoverable === true,
      knownProperties: knownCount,
      unknownProperties: totalCount - knownCount,
      totalProperties: totalCount,
      complete: totalCount > 0 && knownCount === totalCount,
      progress:
        totalCount > 0
          ? knownCount / totalCount
          : 1,
    },

    properties,
  };
}

export function projectMaterialLibrary({
  materials = [],
  propertyCatalog = null,
  knowledge = {},
  inventory = [],
} = {}) {
  const projected = materials.map((material) =>
    projectMaterial(material, {
      propertyCatalog,
      knowledge,
      inventory,
    })
  );

  return {
    schemaVersion: 1,
    kind: "material-library-projection",
    materials: projected,
  };
}

export function filterMaterialLibrary(
  projection,
  {
    creatureId = null,
    family = null,
    propertyId = null,
    minTier = null,
    researchState = null,
    availableOnly = false,
  } = {}
) {
  return (projection?.materials ?? []).filter((material) => {
    if (
      creatureId &&
      material.source?.creatureId !== creatureId
    ) {
      return false;
    }

    if (
      family &&
      material.family !== family
    ) {
      return false;
    }

    if (
      availableOnly &&
      !material.inventory?.available
    ) {
      return false;
    }

    if (researchState === "complete" && !material.research?.complete) {
      return false;
    }

    if (
      researchState === "partial" &&
      (
        material.research?.knownProperties <= 0 ||
        material.research?.complete
      )
    ) {
      return false;
    }

    if (
      researchState === "unknown" &&
      material.research?.knownProperties !== 0
    ) {
      return false;
    }

    if (propertyId) {
      const match = material.properties.some(
        (property) =>
          property.known &&
          property.propertyId === propertyId &&
          (
            minTier == null ||
            (
              property.tierKnown &&
              Number(property.tier) >= Number(minTier)
            )
          )
      );

      if (!match) return false;
    }

    return true;
  });
}
