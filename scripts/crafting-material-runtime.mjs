import { materialPropertyIds, validateMaterialCatalog, validatePropertyCatalog } from "./crafting-schema.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const MATERIAL_CATALOG_REGISTRY_URL =
  `modules/${MODULE_ID}/data/crafting/material-catalogs.json`;
const PROPERTIES_URL = `modules/${MODULE_ID}/data/crafting/properties.json`;
let registryCache = null;
const catalogCache = new Map();
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

export async function loadMaterialCatalogRegistry({ force = false } = {}) {
  if (registryCache && !force) return registryCache;

  const response = await fetch(
    MATERIAL_CATALOG_REGISTRY_URL,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load material catalog registry (${response.status}).`,
    );
  }

  const registry = await response.json();

  if (
    registry?.schemaVersion !== 1 ||
    !registry?.defaultCatalog ||
    !Array.isArray(registry?.catalogs)
  ) {
    throw new Error("Invalid material catalog registry.");
  }

  registryCache = registry;
  return registry;
}

export async function loadMaterialCatalog(
  {
    force = false,
    catalogId = null,
  } = {},
) {
  const registry = await loadMaterialCatalogRegistry({ force });

  const resolvedCatalogId =
    catalogId ?? registry.defaultCatalog;

  const registryEntry = registry.catalogs.find(
    (entry) => entry.id === resolvedCatalogId,
  );

  if (!registryEntry) {
    throw new Error(
      `Unknown material catalog: ${resolvedCatalogId}.`,
    );
  }

  if (!force && catalogCache.has(resolvedCatalogId)) {
    return catalogCache.get(resolvedCatalogId);
  }

  const path = String(registryEntry.path ?? "")
    .replace(/^data\//, "");

  if (!path) {
    throw new Error(
      `Material catalog path missing: ${resolvedCatalogId}.`,
    );
  }

  const url =
    `modules/${MODULE_ID}/data/${path}`;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Unable to load material catalog ${resolvedCatalogId} (${response.status}).`,
    );
  }

  const catalog = await response.json();

  validateMaterialCatalog(catalog);

  if (catalog.id !== registryEntry.id) {
    throw new Error(
      `Material catalog id mismatch: expected ${registryEntry.id}, got ${catalog.id}.`,
    );
  }

  if (catalog.namespace !== registryEntry.namespace) {
    throw new Error(
      `Material catalog namespace mismatch: ${registryEntry.id}.`,
    );
  }

  if (catalog.kind !== registryEntry.kind) {
    throw new Error(
      `Material catalog kind mismatch: ${registryEntry.id}.`,
    );
  }

  const propertyCatalog = await loadPropertyCatalog({ force });
  const knownProperties = new Set(
    propertyCatalog.properties.map((entry) => entry.id),
  );

  for (const material of catalog.materials) {
    for (const propertyId of materialPropertyIds(material)) {
      if (!knownProperties.has(propertyId)) {
        throw new Error(
          `Unknown material property ${propertyId} on ${material.id}.`,
        );
      }
    }
  }

  catalogCache.set(resolvedCatalogId, catalog);
  return catalog;
}

export async function loadMaterialCatalogs({ force = false } = {}) {
  const registry = await loadMaterialCatalogRegistry({ force });

  const catalogs = [];

  for (const entry of registry.catalogs) {
    catalogs.push(
      await loadMaterialCatalog({
        catalogId: entry.id,
        force,
      }),
    );
  }

  return catalogs;
}

export async function resolveMaterialDefinition(
  materialId,
  { force = false } = {},
) {
  const catalogs = await loadMaterialCatalogs({ force });

  let resolved = null;

  for (const catalog of catalogs) {
    const material =
      catalog.materials.find((entry) => entry.id === materialId) ?? null;

    if (!material) continue;

    if (resolved) {
      throw new Error(
        `Duplicate material id across catalogs: ${materialId}.`,
      );
    }

    resolved = {
      catalog,
      material,
    };
  }

  if (!resolved) return null;

  return clone(resolved);
}

export async function listMaterialDefinitions() {
  const catalogs = await loadMaterialCatalogs();

  const definitions = [];
  const ids = new Set();

  for (const catalog of catalogs) {
    for (const material of catalog.materials) {
      if (ids.has(material.id)) {
        throw new Error(
          `Duplicate material id across catalogs: ${material.id}.`,
        );
      }

      ids.add(material.id);
      definitions.push(material);
    }
  }

  return clone(definitions);
}

export async function getMaterialDefinition(materialId) {
  const resolved = await resolveMaterialDefinition(materialId);
  return resolved ? clone(resolved.material) : null;
}

export function materialItemData(
  material,
  {
    quantity = 1,
    catalog = null,
  } = {},
) {
  positiveQuantity(quantity);

  if (!material?.id || !material?.name) {
    throw new Error("A validated material definition is required.");
  }

  const namespace =
    typeof catalog?.namespace === "string" && catalog.namespace.trim()
      ? catalog.namespace.trim()
      : null;

  return {
    name: material.name,
    type: "loot",
    img: typeof material.img === "string" && material.img.trim()
      ? material.img.trim()
      : "icons/svg/item-bag.svg",
    system: {
      description: "",
      quantity,
      attribution: {
        source: namespace ?? "Homebrew",
        page: null,
        artist: "",
      },
      gmNotes: "",
      actions: {},
    },
    effects: [],
    flags: {
      [MODULE_ID]: {
        sourceId: material.id,
        canonicalSourceId: material.id,
        sourceNamespace: namespace,
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
  const resolved = await resolveMaterialDefinition(materialId);

  if (!resolved) {
    throw new Error(`Unknown material: ${materialId}.`);
  }

  const { catalog, material } = resolved;

  const existing = listActorMaterials(actor).find((entry) => entry.materialId === materialId && material.inventory.stackable);
  if (existing?.item?.update) {
    const nextQuantity = existing.quantity + quantity;
    await existing.item.update({ "system.quantity": nextQuantity });
    return { green: true, operation: "stack", materialId, quantity, total: nextQuantity, item: existing.item };
  }

  const created = await actor.createEmbeddedDocuments("Item", [materialItemData(material, { quantity, catalog })]);
  const item = created?.[0] ?? null;
  return { green: Boolean(item), operation: "create", materialId, quantity, total: quantity, item };
}

export async function materialRuntimeStatus(actor = null) {
  const registry = await loadMaterialCatalogRegistry();
  const catalogs = await loadMaterialCatalogs();
  const definitions = await listMaterialDefinitions();
  const materials = actor ? listActorMaterials(actor) : [];

  return {
    green: true,
    catalogId: registry.defaultCatalog,
    catalogIds: catalogs.map((catalog) => catalog.id),
    catalogs: catalogs.length,
    definitions: definitions.length,
    actorUuid: actor?.uuid ?? null,
    actorStacks: materials.length,
    actorUnits: materials.reduce((sum, entry) => sum + entry.quantity, 0),
  };
}

export const craftingMaterialsApi = Object.freeze({
  load: loadMaterialCatalog,
  loadAll: loadMaterialCatalogs,
  resolve: resolveMaterialDefinition,
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
