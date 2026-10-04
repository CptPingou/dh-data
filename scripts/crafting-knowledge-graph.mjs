function clone(value) {
  if (value == null) return value;

  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(
        JSON.stringify(value)
      );
}

function materialPropertyIds(
  material
) {
  const properties =
    material?.material?.properties;

  if (
    Array.isArray(properties)
  ) {
    return [
      ...new Set(
        properties.filter(
          (id) =>
            typeof id === "string" &&
            id.trim()
        )
      )
    ];
  }

  if (
    properties &&
    typeof properties === "object"
  ) {
    return Object.entries(
      properties
    )
      .filter(
        ([id, value]) =>
          typeof id === "string" &&
          id.trim() &&
          Number(value) > 0
      )
      .map(
        ([id]) =>
          id
      );
  }

  return [];
}

function recipePropertyRequirements(
  recipe
) {
  return (
    Array.isArray(
      recipe?.requirements
    )
      ? recipe.requirements
      : []
  )
    .map(
      (requirement) => ({
        requirementId:
          requirement?.id ?? null,

        propertyId:
          requirement
            ?.match
            ?.property ?? null,

        value:
          Number(
            requirement?.value
          ) || 0,
      })
    )
    .filter(
      (requirement) =>
        typeof requirement
          .propertyId ===
          "string" &&
        requirement
          .propertyId
          .trim()
    );
}

function creatureSource(
  material
) {
  if (
    material?.source?.type !==
    "creature"
  ) {
    return null;
  }

  const creatureId =
    typeof material
      ?.source
      ?.creatureId ===
      "string"
      ? material.source
          .creatureId
          .trim()
      : "";

  if (!creatureId) {
    return null;
  }

  return {
    creatureId,

    anatomy:
      typeof material
        ?.source
        ?.anatomy ===
        "string"
        ? material.source
            .anatomy
            .trim()
        : "",
  };
}

export function buildCraftingKnowledgeGraph({
  materials = [],
  recipes = [],
  properties = [],
} = {}) {
  const materialNodes =
    new Map();

  const recipeNodes =
    new Map();

  const propertyNodes =
    new Map();

  const creatureNodes =
    new Map();

  for (
    const property
    of properties
  ) {
    const id =
      typeof property?.id ===
      "string"
        ? property.id.trim()
        : "";

    if (!id) continue;

    propertyNodes.set(
      id,
      {
        id,

        label:
          property.label ?? id,

        description:
          property.description ?? "",

        category:
          property.category ?? null,

        materialIds:
          [],

        recipeIds:
          [],
      }
    );
  }

  const ensureProperty =
    (propertyId) => {
      if (
        !propertyNodes.has(
          propertyId
        )
      ) {
        propertyNodes.set(
          propertyId,
          {
            id:
              propertyId,

            label:
              propertyId,

            description:
              "",

            category:
              null,

            materialIds:
              [],

            recipeIds:
              [],
          }
        );
      }

      return propertyNodes.get(
        propertyId
      );
    };

  for (
    const material
    of materials
  ) {
    const materialId =
      typeof material?.id ===
      "string"
        ? material.id.trim()
        : "";

    if (!materialId) {
      continue;
    }

    const propertyIds =
      materialPropertyIds(
        material
      );

    const source =
      creatureSource(
        material
      );

    materialNodes.set(
      materialId,
      {
        id:
          materialId,

        name:
          material.name ??
          materialId,

        propertyIds:
          [...propertyIds],

        creatureId:
          source?.creatureId ??
          null,

        anatomy:
          source?.anatomy ??
          null,

        source:
          clone(
            material.source ??
            null
          ),
      }
    );

    for (
      const propertyId
      of propertyIds
    ) {
      const property =
        ensureProperty(
          propertyId
        );

      if (
        !property.materialIds
          .includes(materialId)
      ) {
        property.materialIds.push(
          materialId
        );
      }
    }

    if (source) {
      if (
        !creatureNodes.has(
          source.creatureId
        )
      ) {
        creatureNodes.set(
          source.creatureId,
          {
            id:
              source.creatureId,

            materialIds:
              [],
          }
        );
      }

      const creature =
        creatureNodes.get(
          source.creatureId
        );

      if (
        !creature.materialIds
          .includes(materialId)
      ) {
        creature.materialIds.push(
          materialId
        );
      }
    }
  }

  for (
    const recipe
    of recipes
  ) {
    const recipeId =
      typeof recipe?.id ===
      "string"
        ? recipe.id.trim()
        : "";

    if (!recipeId) {
      continue;
    }

    const requirements =
      recipePropertyRequirements(
        recipe
      );

    const propertyIds = [
      ...new Set(
        requirements.map(
          (entry) =>
            entry.propertyId
        )
      ),
    ];

    recipeNodes.set(
      recipeId,
      {
        id:
          recipeId,

        name:
          recipe.name ??
          recipeId,

        propertyIds,

        requirements:
          clone(
            requirements
          ),

        output:
          clone(
            recipe.output ??
            null
          ),
      }
    );

    for (
      const propertyId
      of propertyIds
    ) {
      const property =
        ensureProperty(
          propertyId
        );

      if (
        !property.recipeIds
          .includes(recipeId)
      ) {
        property.recipeIds.push(
          recipeId
        );
      }
    }
  }

  const sortIds =
    (values) =>
      values.sort(
        (a, b) =>
          String(a)
            .localeCompare(
              String(b)
            )
      );

  for (
    const node
    of propertyNodes.values()
  ) {
    sortIds(
      node.materialIds
    );

    sortIds(
      node.recipeIds
    );
  }

  for (
    const node
    of creatureNodes.values()
  ) {
    sortIds(
      node.materialIds
    );
  }

  return {
    materials:
      Object.fromEntries(
        materialNodes
      ),

    recipes:
      Object.fromEntries(
        recipeNodes
      ),

    properties:
      Object.fromEntries(
        propertyNodes
      ),

    creatures:
      Object.fromEntries(
        creatureNodes
      ),
  };
}

export function propertyKnowledgeRelations(
  graph,
  propertyId
) {
  const property =
    graph?.properties
      ?.[propertyId];

  if (!property) {
    return null;
  }

  return {
    property:
      clone(property),

    materials:
      property.materialIds
        .map(
          (id) =>
            graph.materials?.[
              id
            ] ?? null
        )
        .filter(Boolean)
        .map(clone),

    recipes:
      property.recipeIds
        .map(
          (id) =>
            graph.recipes?.[
              id
            ] ?? null
        )
        .filter(Boolean)
        .map(clone),
  };
}

export function materialKnowledgeRelations(
  graph,
  materialId
) {
  const material =
    graph?.materials
      ?.[materialId];

  if (!material) {
    return null;
  }

  return {
    material:
      clone(material),

    creature:
      material.creatureId
        ? clone(
            graph.creatures?.[
              material.creatureId
            ] ?? null
          )
        : null,

    properties:
      material.propertyIds
        .map(
          (id) =>
            graph.properties?.[
              id
            ] ?? null
        )
        .filter(Boolean)
        .map(clone),
  };
}

export function creatureKnowledgeRelations(
  graph,
  creatureId
) {
  const creature =
    graph?.creatures
      ?.[creatureId];

  if (!creature) {
    return null;
  }

  return {
    creature:
      clone(creature),

    materials:
      creature.materialIds
        .map(
          (id) =>
            graph.materials?.[
              id
            ] ?? null
        )
        .filter(Boolean)
        .map(clone),
  };
}

export function recipeKnowledgeRelations(
  graph,
  recipeId
) {
  const recipe =
    graph?.recipes
      ?.[recipeId];

  if (!recipe) {
    return null;
  }

  return {
    recipe:
      clone(recipe),

    properties:
      recipe.propertyIds
        .map(
          (id) =>
            graph.properties?.[
              id
            ] ?? null
        )
        .filter(Boolean)
        .map(clone),
  };
}

export const craftingKnowledgeGraphApi =
  Object.freeze({
    build:
      buildCraftingKnowledgeGraph,

    property:
      propertyKnowledgeRelations,

    material:
      materialKnowledgeRelations,

    creature:
      creatureKnowledgeRelations,

    recipe:
      recipeKnowledgeRelations,
  });
