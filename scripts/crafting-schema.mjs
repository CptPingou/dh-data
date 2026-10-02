const MATERIAL_FAMILIES = new Set(["osseous", "tegument", "structure", "organ", "fluid", "fiber", "mineral", "vegetal"]);
const QUALITY_MIN = 1;
const QUALITY_MAX = 4;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}
function positiveInt(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return value;
}
function uniqueTextArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const out = value.map((entry, i) => text(entry, `${label}[${i}]`));
  if (new Set(out).size !== out.length) throw new Error(`${label} must not contain duplicates.`);
  return out;
}
function schemaVersion(value, label, supported = [1, 2]) {
  object(value, label);
  if (!supported.includes(value.schemaVersion)) {
    throw new Error(`${label} schemaVersion must be one of: ${supported.join(", ")}.`);
  }
  return value.schemaVersion;
}

export function materialPropertyEntries(material) {
  const properties = material?.material?.properties;
  if (Array.isArray(properties)) {
    return properties.map((id) => [id, 1]);
  }
  if (properties && typeof properties === "object") {
    return Object.entries(properties);
  }
  return [];
}

export function materialPropertyIds(material) {
  return materialPropertyEntries(material).map(([id]) => id);
}

export function materialPropertyValue(material, propertyId) {
  const properties = material?.material?.properties;
  if (Array.isArray(properties)) return properties.includes(propertyId) ? 1 : 0;
  const value = Number(properties?.[propertyId] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function validatePropertyCatalog(catalog) {
  schemaVersion(catalog, "Property catalog", [2]);
  text(catalog.id, "Property catalog id");
  if (!Array.isArray(catalog.properties)) throw new Error("Property catalog properties must be an array.");
  const ids = new Set();
  for (const property of catalog.properties) {
    object(property, "property");
    text(property.id, "property.id");
    text(property.label, `${property.id}.label`);
    if (property.category !== undefined) text(property.category, `${property.id}.category`);
    if (property.description !== undefined && typeof property.description !== "string") {
      throw new Error(`${property.id}.description must be a string.`);
    }
    if (ids.has(property.id)) throw new Error(`Duplicate property id: ${property.id}.`);
    ids.add(property.id);
  }
  return { green: true, catalogId: catalog.id, properties: catalog.properties.length };
}

export function validateMaterial(material, { schema = null } = {}) {
  object(material, "material"); text(material.id, "material.id"); text(material.name, "material.name");
  object(material.material, `${material.id}.material`);
  if (!MATERIAL_FAMILIES.has(material.material.family)) throw new Error(`${material.id}.material.family is unsupported.`);
  if (!Number.isInteger(material.material.quality) || material.material.quality < QUALITY_MIN || material.material.quality > QUALITY_MAX) throw new Error(`${material.id}.material.quality must be 1..4.`);

  const properties = material.material.properties;
  if (schema === 2 || (!Array.isArray(properties) && properties && typeof properties === "object")) {
    object(properties, `${material.id}.material.properties`);
    const entries = Object.entries(properties);
    if (entries.length === 0) throw new Error(`${material.id}.material.properties must be non-empty.`);
    for (const [propertyId, value] of entries) {
      text(propertyId, `${material.id}.material.properties key`);
      positiveInt(value, `${material.id}.material.properties.${propertyId}`);
    }
  } else {
    uniqueTextArray(properties, `${material.id}.material.properties`);
  }

  object(material.inventory, `${material.id}.inventory`);
  if (typeof material.inventory.stackable !== "boolean") throw new Error(`${material.id}.inventory.stackable must be boolean.`);
  text(material.inventory.containerClass, `${material.id}.inventory.containerClass`);
  object(material.research, `${material.id}.research`);
  if (typeof material.research.discoverable !== "boolean") throw new Error(`${material.id}.research.discoverable must be boolean.`);
  object(material.research.specimen, `${material.id}.research.specimen`);
  if (typeof material.research.specimen.required !== "boolean" || typeof material.research.specimen.consumed !== "boolean") throw new Error(`${material.id}.research.specimen flags must be boolean.`);
  object(material.source, `${material.id}.source`); text(material.source.type, `${material.id}.source.type`);
  return { green: true, id: material.id, quality: material.material.quality, properties: materialPropertyIds(material).length };
}

export function validateMaterialCatalog(catalog) {
  const version = schemaVersion(catalog, "Material catalog", [1, 2, 3]);
  text(catalog.id, "Material catalog id");

  if (version >= 3) {
    text(catalog.namespace, "Material catalog namespace");

    if (catalog.kind !== "material-catalog") {
      throw new Error(
        'Material catalog kind must be "material-catalog" for schemaVersion 3.',
      );
    }
  }

  if (!Array.isArray(catalog.materials)) {
    throw new Error("Material catalog materials must be an array.");
  }
  const ids = new Set();
  for (const material of catalog.materials) {
    validateMaterial(material, { schema: version });
    if (ids.has(material.id)) throw new Error(`Duplicate material id: ${material.id}.`);
    ids.add(material.id);
  }
  return { green: true, schemaVersion: version, catalogId: catalog.id, materials: catalog.materials.length };
}

function validateLegacyRequirement(recipe, requirement, ids) {
  object(requirement, `${recipe.id}.requirement`); text(requirement.id, `${recipe.id}.requirement.id`); positiveInt(requirement.units, `${recipe.id}.${requirement.id}.units`); object(requirement.match, `${recipe.id}.${requirement.id}.match`);
  if (ids.has(requirement.id)) throw new Error(`Duplicate requirement id: ${requirement.id}.`); ids.add(requirement.id);
  const match = requirement.match;
  const selectors = [match.resourceId, match.materialId, match.family, match.property].filter((v) => v !== undefined);
  if (selectors.length === 0) throw new Error(`${recipe.id}.${requirement.id}.match needs resourceId, materialId, family, or property.`);
  if (match.resourceId !== undefined) {
    text(match.resourceId, `${recipe.id}.${requirement.id}.match.resourceId`);
    if (!match.resourceId.startsWith("mh.crafting.")) throw new Error(`${recipe.id}.${requirement.id}.match.resourceId must use the mh.crafting.* namespace.`);
    if (selectors.length !== 1) throw new Error(`${recipe.id}.${requirement.id}.match.resourceId cannot be mixed with biological selectors yet.`);
    if (match.minimumQuality !== undefined) throw new Error(`${recipe.id}.${requirement.id}.match.minimumQuality is not supported for exact crafting resources.`);
  }
  if (match.materialId !== undefined) text(match.materialId, `${recipe.id}.${requirement.id}.match.materialId`);
  if (match.family !== undefined && !MATERIAL_FAMILIES.has(match.family)) throw new Error(`${recipe.id}.${requirement.id}.match.family is unsupported.`);
  if (match.property !== undefined) text(match.property, `${recipe.id}.${requirement.id}.match.property`);
  if (match.resourceId === undefined && match.minimumQuality !== undefined && (!Number.isInteger(match.minimumQuality) || match.minimumQuality < QUALITY_MIN || match.minimumQuality > QUALITY_MAX)) throw new Error(`${recipe.id}.${requirement.id}.match.minimumQuality must be 1..4.`);
}

function validatePropertyBudgetRequirement(recipe, requirement, ids) {
  object(requirement, `${recipe.id}.requirement`);
  text(requirement.id, `${recipe.id}.requirement.id`);
  positiveInt(requirement.value, `${recipe.id}.${requirement.id}.value`);
  object(requirement.match, `${recipe.id}.${requirement.id}.match`);
  text(requirement.match.property, `${recipe.id}.${requirement.id}.match.property`);
  if (ids.has(requirement.id)) throw new Error(`Duplicate requirement id: ${requirement.id}.`);
  ids.add(requirement.id);
  if (requirement.match.resourceId !== undefined) throw new Error(`${recipe.id}.${requirement.id} property-budget requirements cannot use resourceId.`);
  if (requirement.match.materialId !== undefined) text(requirement.match.materialId, `${recipe.id}.${requirement.id}.match.materialId`);
  if (requirement.match.family !== undefined && !MATERIAL_FAMILIES.has(requirement.match.family)) throw new Error(`${recipe.id}.${requirement.id}.match.family is unsupported.`);
  if (requirement.match.minimumQuality !== undefined && (!Number.isInteger(requirement.match.minimumQuality) || requirement.match.minimumQuality < QUALITY_MIN || requirement.match.minimumQuality > QUALITY_MAX)) throw new Error(`${recipe.id}.${requirement.id}.match.minimumQuality must be 1..4.`);
}

export function recipeMode(recipe) {
  if (recipe?.mode === "property-budget") return "property-budget";
  if (Array.isArray(recipe?.requirements) && recipe.requirements.length > 0 && recipe.requirements.every((requirement) => typeof requirement?.match?.resourceId === "string")) return "exact-resource";
  return "legacy-biological";
}

export function validateRecipe(recipe) {
  object(recipe, "recipe"); text(recipe.id, "recipe.id"); text(recipe.name, "recipe.name"); object(recipe.output, `${recipe.id}.output`); text(recipe.output.type, `${recipe.id}.output.type`); text(recipe.output.id, `${recipe.id}.output.id`);
  if (!Array.isArray(recipe.requirements) || recipe.requirements.length === 0) throw new Error(`${recipe.id}.requirements must be non-empty.`);
  const ids = new Set();
  const mode = recipeMode(recipe);
  for (const requirement of recipe.requirements) {
    if (mode === "property-budget") validatePropertyBudgetRequirement(recipe, requirement, ids);
    else validateLegacyRequirement(recipe, requirement, ids);
  }
  return { green: true, id: recipe.id, mode, requirements: recipe.requirements.length };
}

export function validateRecipeCatalog(catalog) {
  const version = schemaVersion(catalog, "Recipe catalog", [1, 2]); text(catalog.id, "Recipe catalog id");
  if (!Array.isArray(catalog.recipes)) throw new Error("Recipe catalog recipes must be an array.");
  const ids = new Set();
  for (const recipe of catalog.recipes) {
    validateRecipe(recipe);
    if (ids.has(recipe.id)) throw new Error(`Duplicate recipe id: ${recipe.id}.`);
    ids.add(recipe.id);
  }
  return { green: true, schemaVersion: version, catalogId: catalog.id, recipes: catalog.recipes.length };
}

export function validateContainer(container) {
  object(container, "container"); text(container.id, "container.id"); text(container.name, "container.name"); object(container.container, `${container.id}.container`); uniqueTextArray(container.container.accepts, `${container.id}.container.accepts`); positiveInt(container.container.slots, `${container.id}.container.slots`); positiveInt(container.container.stackLimit, `${container.id}.container.stackLimit`);
  return { green: true, id: container.id, slots: container.container.slots, stackLimit: container.container.stackLimit };
}

export function validateContainerCatalog(catalog) {
  schemaVersion(catalog, "Container catalog", [1]); text(catalog.id, "Container catalog id"); if (!Array.isArray(catalog.containers)) throw new Error("Container catalog containers must be an array.");
  const ids = new Set(); for (const container of catalog.containers) { validateContainer(container); if (ids.has(container.id)) throw new Error(`Duplicate container id: ${container.id}.`); ids.add(container.id); }
  return { green: true, catalogId: catalog.id, containers: catalog.containers.length };
}

export function validateMaterialKnowledge(data) {
  schemaVersion(data, "Material knowledge", [1]); text(data.id, "Material knowledge id"); object(data.actorKnowledge, "actorKnowledge"); object(data.partyKnowledge, "partyKnowledge");
  if (data.partyKnowledge.scope !== "party") throw new Error("partyKnowledge.scope must be party."); object(data.partyKnowledge.materials, "partyKnowledge.materials");
  for (const [actorId, actor] of Object.entries(data.actorKnowledge)) { text(actorId, "actorKnowledge actor id"); object(actor, actorId); object(actor.materials, `${actorId}.materials`); for (const [materialId, entry] of Object.entries(actor.materials)) { text(materialId, "knowledge material id"); object(entry, materialId); object(entry.discoveredProperties, `${materialId}.discoveredProperties`); } }
  for (const [materialId, entry] of Object.entries(data.partyKnowledge.materials)) { text(materialId, "party material id"); object(entry, materialId); object(entry.documentedProperties, `${materialId}.documentedProperties`); }
  return { green: true, id: data.id, actors: Object.keys(data.actorKnowledge).length, documentedMaterials: Object.keys(data.partyKnowledge.materials).length };
}
