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
function schemaV1(value, label) {
  object(value, label);
  if (value.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1.`);
}

export function validateMaterial(material) {
  object(material, "material"); text(material.id, "material.id"); text(material.name, "material.name");
  object(material.material, `${material.id}.material`);
  if (!MATERIAL_FAMILIES.has(material.material.family)) throw new Error(`${material.id}.material.family is unsupported.`);
  if (!Number.isInteger(material.material.quality) || material.material.quality < QUALITY_MIN || material.material.quality > QUALITY_MAX) throw new Error(`${material.id}.material.quality must be 1..4.`);
  uniqueTextArray(material.material.properties, `${material.id}.material.properties`);
  object(material.inventory, `${material.id}.inventory`);
  if (typeof material.inventory.stackable !== "boolean") throw new Error(`${material.id}.inventory.stackable must be boolean.`);
  text(material.inventory.containerClass, `${material.id}.inventory.containerClass`);
  object(material.research, `${material.id}.research`);
  if (typeof material.research.discoverable !== "boolean") throw new Error(`${material.id}.research.discoverable must be boolean.`);
  object(material.research.specimen, `${material.id}.research.specimen`);
  if (typeof material.research.specimen.required !== "boolean" || typeof material.research.specimen.consumed !== "boolean") throw new Error(`${material.id}.research.specimen flags must be boolean.`);
  object(material.source, `${material.id}.source`); text(material.source.type, `${material.id}.source.type`);
  return { green: true, id: material.id, quality: material.material.quality, properties: material.material.properties.length };
}

export function validateMaterialCatalog(catalog) {
  schemaV1(catalog, "Material catalog"); text(catalog.id, "Material catalog id");
  if (!Array.isArray(catalog.materials)) throw new Error("Material catalog materials must be an array.");
  const ids = new Set();
  for (const material of catalog.materials) { validateMaterial(material); if (ids.has(material.id)) throw new Error(`Duplicate material id: ${material.id}.`); ids.add(material.id); }
  return { green: true, catalogId: catalog.id, materials: catalog.materials.length };
}

export function validateRecipe(recipe) {
  object(recipe, "recipe"); text(recipe.id, "recipe.id"); text(recipe.name, "recipe.name"); object(recipe.output, `${recipe.id}.output`); text(recipe.output.type, `${recipe.id}.output.type`); text(recipe.output.id, `${recipe.id}.output.id`);
  if (!Array.isArray(recipe.requirements) || recipe.requirements.length === 0) throw new Error(`${recipe.id}.requirements must be non-empty.`);
  const ids = new Set();
  for (const requirement of recipe.requirements) {
    object(requirement, `${recipe.id}.requirement`); text(requirement.id, `${recipe.id}.requirement.id`); positiveInt(requirement.units, `${recipe.id}.${requirement.id}.units`); object(requirement.match, `${recipe.id}.${requirement.id}.match`);
    if (ids.has(requirement.id)) throw new Error(`Duplicate requirement id: ${requirement.id}.`); ids.add(requirement.id);
    const match = requirement.match;
    const selectors = [match.materialId, match.family, match.property].filter((v) => v !== undefined);
    if (selectors.length === 0) throw new Error(`${recipe.id}.${requirement.id}.match needs materialId, family, or property.`);
    if (match.materialId !== undefined) text(match.materialId, `${recipe.id}.${requirement.id}.match.materialId`);
    if (match.family !== undefined && !MATERIAL_FAMILIES.has(match.family)) throw new Error(`${recipe.id}.${requirement.id}.match.family is unsupported.`);
    if (match.property !== undefined) text(match.property, `${recipe.id}.${requirement.id}.match.property`);
    if (match.minimumQuality !== undefined && (!Number.isInteger(match.minimumQuality) || match.minimumQuality < QUALITY_MIN || match.minimumQuality > QUALITY_MAX)) throw new Error(`${recipe.id}.${requirement.id}.match.minimumQuality must be 1..4.`);
  }
  return { green: true, id: recipe.id, requirements: recipe.requirements.length };
}

export function validateRecipeCatalog(catalog) {
  schemaV1(catalog, "Recipe catalog"); text(catalog.id, "Recipe catalog id");
  if (!Array.isArray(catalog.recipes)) throw new Error("Recipe catalog recipes must be an array.");
  const ids = new Set(); for (const recipe of catalog.recipes) { validateRecipe(recipe); if (ids.has(recipe.id)) throw new Error(`Duplicate recipe id: ${recipe.id}.`); ids.add(recipe.id); }
  return { green: true, catalogId: catalog.id, recipes: catalog.recipes.length };
}

export function validateContainer(container) {
  object(container, "container"); text(container.id, "container.id"); text(container.name, "container.name"); object(container.container, `${container.id}.container`); uniqueTextArray(container.container.accepts, `${container.id}.container.accepts`); positiveInt(container.container.slots, `${container.id}.container.slots`); positiveInt(container.container.stackLimit, `${container.id}.container.stackLimit`);
  return { green: true, id: container.id, slots: container.container.slots, stackLimit: container.container.stackLimit };
}

export function validateContainerCatalog(catalog) {
  schemaV1(catalog, "Container catalog"); text(catalog.id, "Container catalog id"); if (!Array.isArray(catalog.containers)) throw new Error("Container catalog containers must be an array.");
  const ids = new Set(); for (const container of catalog.containers) { validateContainer(container); if (ids.has(container.id)) throw new Error(`Duplicate container id: ${container.id}.`); ids.add(container.id); }
  return { green: true, catalogId: catalog.id, containers: catalog.containers.length };
}

export function validateMaterialKnowledge(data) {
  schemaV1(data, "Material knowledge"); text(data.id, "Material knowledge id"); object(data.actorKnowledge, "actorKnowledge"); object(data.partyKnowledge, "partyKnowledge");
  if (data.partyKnowledge.scope !== "party") throw new Error("partyKnowledge.scope must be party."); object(data.partyKnowledge.materials, "partyKnowledge.materials");
  for (const [actorId, actor] of Object.entries(data.actorKnowledge)) { text(actorId, "actorKnowledge actor id"); object(actor, actorId); object(actor.materials, `${actorId}.materials`); for (const [materialId, entry] of Object.entries(actor.materials)) { text(materialId, "knowledge material id"); object(entry, materialId); object(entry.discoveredProperties, `${materialId}.discoveredProperties`); } }
  for (const [materialId, entry] of Object.entries(data.partyKnowledge.materials)) { text(materialId, "party material id"); object(entry, materialId); object(entry.documentedProperties, `${materialId}.documentedProperties`); }
  return { green: true, id: data.id, actors: Object.keys(data.actorKnowledge).length, documentedMaterials: Object.keys(data.partyKnowledge.materials).length };
}
