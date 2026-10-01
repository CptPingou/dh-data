import { materialPropertyIds, validateMaterialCatalog, validatePropertyCatalog } from "./crafting-schema.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const MATERIALS_URL = `modules/${MODULE_ID}/data/crafting/materials.json`;
const PROPERTIES_URL = `modules/${MODULE_ID}/data/crafting/properties.json`;
let cache = null;
let propertyCache = null;

function clone(value) { return value == null ? value : structuredClone(value); }
function positiveQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Material quantity must be a positive integer.");
  return quantity;
}
function materialFlags(material) {
  return {
    materialId: material.id,
    family: material.material.family,
    quality: material.material.quality,
    properties: clone(material.material.properties),
    containerClass: material.inventory.containerClass,
    stackable: material.inventory.stackable,
  };
}
function flagData(item) { return item?.flags?.[MODULE_ID]?.material ?? null; }

export async function loadPropertyCatalog({ force = false } = {}) {
  if (propertyCache && !force) return clone(propertyCache);
  const response = await fetch(PROPERTIES_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load material property catalog (${response.status}).`);
  const catalog = await response.json();
  validatePropertyCatalog(catalog);
  propertyCache = clone(catalog);
  return clone(propertyCache);
}

export async function getPropertyDefinition(propertyId) {
  const catalog = await loadPropertyCatalog();
  return clone(catalog.properties.find((entry) => entry.id === propertyId) ?? null);
}

export async function loadMaterialCatalog({ force = false } = {}) {
  if (cache && !force) return cache;
  const response = await fetch(MATERIALS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load material catalog (${response.status}).`);
  const catalog = await response.json();
  validateMaterialCatalog(catalog);
  const propertyCatalog = await loadPropertyCatalog({ force });
  const knownProperties = new Set(propertyCatalog.properties.map((entry) => entry.id));
  for (const material of catalog.materials) {
    for (const propertyId of materialPropertyIds(material)) {
      if (!knownProperties.has(propertyId)) throw new Error(`Unknown material property ${propertyId} on ${material.id}.`);
    }
  }
  cache = catalog;
  return catalog;
}

export async function listMaterialDefinitions() {
  const catalog = await loadMaterialCatalog();
  return clone(catalog.materials);
}

export async function getMaterialDefinition(materialId) {
  const catalog = await loadMaterialCatalog();
  return clone(catalog.materials.find((entry) => entry.id === materialId) ?? null);
}

export function materialItemData(material, { quantity = 1 } = {}) {
  positiveQuantity(quantity);
  if (!material?.id || !material?.name) throw new Error("A validated material definition is required.");
  return {
    name: material.name,
    type: "loot",
    system: {
      description: `<p>Matériau de chasse.</p>`,
      quantity,
      attribution: { source: "Monster Hunter Daggerheart", page: null, artist: "" },
      gmNotes: "",
      actions: {},
    },
    effects: [],
    flags: {
      [MODULE_ID]: {
        sourceId: material.id,
        canonicalSourceId: material.id,
        contentOwner: MODULE_ID,
        contentOrigin: "homebrew",
        kind: "material",
        material: materialFlags(material),
      },
    },
  };
}

export function isMaterialItem(item) { return Boolean(flagData(item)?.materialId); }
export function materialIdOf(item) { return flagData(item)?.materialId ?? null; }
export function materialQuantityOf(item) {
  const quantity = item?.system?.quantity;
  if (Number.isFinite(quantity)) return Math.max(0, Number(quantity));
  if (Number.isFinite(quantity?.value)) return Math.max(0, Number(quantity.value));
  return 1;
}

export function listActorMaterials(actor) {
  if (!actor?.items) return [];
  return Array.from(actor.items)
    .filter(isMaterialItem)
    .map((item) => ({
      item,
      itemId: item.id ?? item._id ?? null,
      materialId: materialIdOf(item),
      name: item.name ?? null,
      quantity: materialQuantityOf(item),
      family: flagData(item)?.family ?? null,
      quality: flagData(item)?.quality ?? null,
      properties: clone(flagData(item)?.properties ?? []),
      containerClass: flagData(item)?.containerClass ?? null,
    }));
}

export function actorMaterialQuantity(actor, materialId) {
  return listActorMaterials(actor)
    .filter((entry) => entry.materialId === materialId)
    .reduce((sum, entry) => sum + entry.quantity, 0);
}

export async function grantMaterial(actor, materialId, quantity = 1) {
  if (!actor?.createEmbeddedDocuments) throw new Error("A Foundry Actor document is required.");
  quantity = positiveQuantity(quantity);
  const material = await getMaterialDefinition(materialId);
  if (!material) throw new Error(`Unknown material: ${materialId}.`);

  const existing = listActorMaterials(actor).find((entry) => entry.materialId === materialId && material.inventory.stackable);
  if (existing?.item?.update) {
    const nextQuantity = existing.quantity + quantity;
    await existing.item.update({ "system.quantity": nextQuantity });
    return { green: true, operation: "stack", materialId, quantity, total: nextQuantity, item: existing.item };
  }

  const created = await actor.createEmbeddedDocuments("Item", [materialItemData(material, { quantity })]);
  const item = created?.[0] ?? null;
  return { green: Boolean(item), operation: "create", materialId, quantity, total: quantity, item };
}

export async function materialRuntimeStatus(actor = null) {
  const catalog = await loadMaterialCatalog();
  const materials = actor ? listActorMaterials(actor) : [];
  return {
    green: true,
    catalogId: catalog.id,
    definitions: catalog.materials.length,
    actorUuid: actor?.uuid ?? null,
    actorStacks: materials.length,
    actorUnits: materials.reduce((sum, entry) => sum + entry.quantity, 0),
  };
}

export const craftingMaterialsApi = Object.freeze({
  load: loadMaterialCatalog,
  loadProperties: loadPropertyCatalog,
  property: getPropertyDefinition,
  list: listMaterialDefinitions,
  get: getMaterialDefinition,
  itemData: materialItemData,
  isItem: isMaterialItem,
  materialIdOf,
  quantityOf: materialQuantityOf,
  listActor: listActorMaterials,
  actorQuantity: actorMaterialQuantity,
  grant: grantMaterial,
  status: materialRuntimeStatus,
});
