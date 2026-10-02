const clone = (value) =>
  value == null
    ? value
    : globalThis.structuredClone
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

function actorKey(viewer) {
  if (typeof viewer === "string") return viewer;

  return (
    viewer?.actorUuid ??
    viewer?.actor?.uuid ??
    viewer?.uuid ??
    null
  );
}

function materialIds(personal, documented) {
  return [
    ...new Set([
      ...Object.keys(personal ?? {}),
      ...Object.keys(documented ?? {}),
    ]),
  ];
}

export function projectMaterialKnowledge(
  knowledgeState,
  {
    viewer = null,
  } = {}
) {
  const state =
    knowledgeState && typeof knowledgeState === "object"
      ? knowledgeState
      : {};

  const key = actorKey(viewer);

  const personalMaterials =
    key
      ? state.actorKnowledge?.[key]?.materials ?? {}
      : {};

  const documentedMaterials =
    state.partyKnowledge?.materials ?? {};

  const materials = {};

  for (const materialId of materialIds(
    personalMaterials,
    documentedMaterials
  )) {
    const personal =
      personalMaterials?.[materialId]?.discoveredProperties ?? {};

    const documented =
      documentedMaterials?.[materialId]?.documentedProperties ?? {};

    const properties = [
      ...new Set([
        ...Object.keys(documented),
        ...Object.keys(personal),
      ]),
    ];

    materials[materialId] = {
      materialId,
      properties,
      personal: clone(personal),
      documented: clone(documented),
    };
  }

  return {
    schemaVersion: 1,
    kind: "material-knowledge-projection",
    viewer: {
      actorUuid: key,
    },
    materials,
  };
}

export function materialKnowledgeForLibrary(
  knowledgeProjection
) {
  return clone(knowledgeProjection?.materials ?? {});
}
