import {
  buildCraftingKnowledgeGraph
} from "./crafting-knowledge-graph.mjs";

import {
  projectKnowledgeGraph,
  projectKnowledgeMaterial,
  projectKnowledgeProperty,
  projectKnowledgeCreature,
  projectKnowledgeRecipe
} from "./crafting-knowledge-projection.mjs";

function requireActor(actor) {
  if (
    !actor?.uuid ||
    !/^Actor\.[^.]+$/.test(
      actor.uuid
    )
  ) {
    throw new Error(
      "A permanent Foundry Actor is required for knowledge projection."
    );
  }

  return actor;
}

export function createCraftingKnowledgeBrowserApi({
  materialsApi,
  craftingApi,
  knowledgeApi,
} = {}) {
  if (
    !materialsApi?.list ||
    !materialsApi?.loadProperties
  ) {
    throw new Error(
      "craftingMaterials API is required."
    );
  }

  if (!craftingApi?.listRecipes) {
    throw new Error(
      "crafting API with listRecipes is required."
    );
  }

  if (!knowledgeApi?.propertyStatus) {
    throw new Error(
      "craftingKnowledge propertyStatus API is required."
    );
  }

  async function sourceGraph() {
    const [
      materials,
      propertyCatalog,
      recipes,
    ] =
      await Promise.all([
        materialsApi.list(),
        materialsApi.loadProperties(),
        craftingApi.listRecipes(),
      ]);

    return buildCraftingKnowledgeGraph({
      materials:
        Array.isArray(materials)
          ? materials
          : [],

      recipes:
        Array.isArray(recipes)
          ? recipes
          : [],

      properties:
        Array.isArray(
          propertyCatalog?.properties
        )
          ? propertyCatalog.properties
          : [],
    });
  }

  function resolverFor(actor) {
    requireActor(actor);

    return (
      materialId,
      propertyId
    ) =>
      knowledgeApi.propertyStatus(
        actor,
        materialId,
        propertyId
      );
  }

  async function project(actor) {
    const graph =
      await sourceGraph();

    return projectKnowledgeGraph(
      graph,
      {
        statusResolver:
          resolverFor(actor),
      }
    );
  }

  async function material(
    actor,
    materialId
  ) {
    const graph =
      await sourceGraph();

    return projectKnowledgeMaterial(
      graph,
      materialId,
      {
        statusResolver:
          resolverFor(actor),
      }
    );
  }

  async function property(
    actor,
    propertyId
  ) {
    const graph =
      await sourceGraph();

    return projectKnowledgeProperty(
      graph,
      propertyId,
      {
        statusResolver:
          resolverFor(actor),
      }
    );
  }

  async function creature(
    actor,
    creatureId
  ) {
    const graph =
      await sourceGraph();

    return projectKnowledgeCreature(
      graph,
      creatureId,
      {
        statusResolver:
          resolverFor(actor),
      }
    );
  }

  async function recipe(
    actor,
    recipeId
  ) {
    const graph =
      await sourceGraph();

    return projectKnowledgeRecipe(
      graph,
      recipeId,
      {
        statusResolver:
          resolverFor(actor),
      }
    );
  }

  return Object.freeze({
    project,
    material,
    property,
    creature,
    recipe,
  });
}
