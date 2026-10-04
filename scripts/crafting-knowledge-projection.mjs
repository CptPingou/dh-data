import {
  propertyKnowledgeProjection
} from "./crafting-knowledge-status.mjs";

function clone(value) {
  if (value == null) return value;

  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(
        JSON.stringify(value)
      );
}

function statusOf(
  statusResolver,
  materialId,
  propertyId
) {
  if (
    typeof statusResolver !==
    "function"
  ) {
    return "invisible";
  }

  return statusResolver(
    materialId,
    propertyId
  );
}

function projectedPropertyOccurrence({
  property,
  materialId,
  statusResolver,
} = {}) {
  const projection =
    propertyKnowledgeProjection(
      statusOf(
        statusResolver,
        materialId,
        property?.id
      )
    );

  if (!projection.listed) {
    return null;
  }

  if (
    !projection.revealIdentity
  ) {
    /*
     * Deliberately do not expose:
     * - property id
     * - label
     * - category
     * - description
     *
     * "visible" only means that there is
     * something left to investigate.
     */
    return {
      status:
        projection.status,

      discovered:
        false,

      shared:
        false,
    };
  }

  return {
    id:
      property.id,

    label:
      property.label,

    description:
      property.description ?? "",

    category:
      property.category ?? null,

    status:
      projection.status,

    discovered:
      true,

    shared:
      projection.shared,

    navigable:
      projection.navigable,

    exploitable:
      projection.exploitable,
  };
}

export function projectKnowledgeMaterial(
  graph,
  materialId,
  {
    statusResolver,
  } = {}
) {
  const material =
    graph?.materials
      ?.[materialId];

  if (!material) {
    return null;
  }

  const properties = [];

  for (
    const propertyId
    of material.propertyIds ?? []
  ) {
    const property =
      graph.properties?.[
        propertyId
      ];

    if (!property) {
      continue;
    }

    const projected =
      projectedPropertyOccurrence({
        property,
        materialId,
        statusResolver,
      });

    if (projected) {
      properties.push(
        projected
      );
    }
  }

  /*
   * A material with no known clue at all does
   * not enter the research projection.
   */
  if (
    properties.length === 0
  ) {
    return null;
  }

  return {
    id:
      material.id,

    name:
      material.name,

    creatureId:
      material.creatureId ?? null,

    anatomy:
      material.anatomy ?? null,

    properties,
  };
}

export function projectKnowledgeProperty(
  graph,
  propertyId,
  {
    statusResolver,
  } = {}
) {
  const property =
    graph?.properties
      ?.[propertyId];

  if (!property) {
    return null;
  }

  /*
   * A property page exists only when at least
   * one occurrence has actually been discovered.
   */
  const discoveredMaterialIds =
    (property.materialIds ?? [])
      .filter(
        (materialId) => {
          const projection =
            propertyKnowledgeProjection(
              statusOf(
                statusResolver,
                materialId,
                propertyId
              )
            );

          return (
            projection
              .revealIdentity &&
            projection
              .navigable
          );
        }
      );

  if (
    discoveredMaterialIds.length ===
    0
  ) {
    return null;
  }

  const materials =
    discoveredMaterialIds
      .map(
        (materialId) =>
          projectKnowledgeMaterial(
            graph,
            materialId,
            {
              statusResolver,
            }
          )
      )
      .filter(Boolean);

  const recipes =
    (property.recipeIds ?? [])
      .map(
        (recipeId) =>
          graph.recipes?.[
            recipeId
          ] ?? null
      )
      .filter(Boolean)
      .map(
        (recipe) => ({
          id:
            recipe.id,

          name:
            recipe.name,

          output:
            clone(
              recipe.output ??
              null
            ),

          requirements:
            clone(
              recipe.requirements ??
              []
            ),
        })
      );

  return {
    id:
      property.id,

    label:
      property.label,

    description:
      property.description ?? "",

    category:
      property.category ?? null,

    materialIds:
      discoveredMaterialIds,

    recipeIds:
      recipes.map(
        (recipe) =>
          recipe.id
      ),

    materials,
    recipes,
  };
}

export function projectKnowledgeCreature(
  graph,
  creatureId,
  {
    statusResolver,
  } = {}
) {
  const creature =
    graph?.creatures
      ?.[creatureId];

  if (!creature) {
    return null;
  }

  const materials =
    (creature.materialIds ?? [])
      .map(
        (materialId) =>
          projectKnowledgeMaterial(
            graph,
            materialId,
            {
              statusResolver,
            }
          )
      )
      .filter(Boolean);

  if (
    materials.length === 0
  ) {
    return null;
  }

  return {
    id:
      creature.id,

    materialIds:
      materials.map(
        (material) =>
          material.id
      ),

    materials,
  };
}

export function projectKnowledgeRecipe(
  graph,
  recipeId,
  {
    statusResolver,
  } = {}
) {
  const recipe =
    graph?.recipes
      ?.[recipeId];

  if (!recipe) {
    return null;
  }

  const properties =
    (recipe.propertyIds ?? [])
      .map(
        (propertyId) =>
          projectKnowledgeProperty(
            graph,
            propertyId,
            {
              statusResolver,
            }
          )
      )
      .filter(Boolean);

  /*
   * Recipe navigation appears if at least one
   * required property is known.
   */
  if (
    properties.length === 0
  ) {
    return null;
  }

  return {
    id:
      recipe.id,

    name:
      recipe.name,

    output:
      clone(
        recipe.output ??
        null
      ),

    properties,
  };
}

export function projectKnowledgeGraph(
  graph,
  {
    statusResolver,
  } = {}
) {
  const materials = {};
  const properties = {};
  const creatures = {};
  const recipes = {};

  for (
    const materialId
    of Object.keys(
      graph?.materials ?? {}
    )
  ) {
    const projected =
      projectKnowledgeMaterial(
        graph,
        materialId,
        {
          statusResolver,
        }
      );

    if (projected) {
      materials[
        materialId
      ] = projected;
    }
  }

  for (
    const propertyId
    of Object.keys(
      graph?.properties ?? {}
    )
  ) {
    const projected =
      projectKnowledgeProperty(
        graph,
        propertyId,
        {
          statusResolver,
        }
      );

    if (projected) {
      properties[
        propertyId
      ] = projected;
    }
  }

  for (
    const creatureId
    of Object.keys(
      graph?.creatures ?? {}
    )
  ) {
    const projected =
      projectKnowledgeCreature(
        graph,
        creatureId,
        {
          statusResolver,
        }
      );

    if (projected) {
      creatures[
        creatureId
      ] = projected;
    }
  }

  for (
    const recipeId
    of Object.keys(
      graph?.recipes ?? {}
    )
  ) {
    const projected =
      projectKnowledgeRecipe(
        graph,
        recipeId,
        {
          statusResolver,
        }
      );

    if (projected) {
      recipes[
        recipeId
      ] = projected;
    }
  }

  return {
    materials,
    properties,
    creatures,
    recipes,
  };
}

export const craftingKnowledgeProjectionApi =
  Object.freeze({
    graph:
      projectKnowledgeGraph,

    material:
      projectKnowledgeMaterial,

    property:
      projectKnowledgeProperty,

    creature:
      projectKnowledgeCreature,

    recipe:
      projectKnowledgeRecipe,
  });
