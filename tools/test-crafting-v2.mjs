import assert from 'node:assert/strict';
import { validateMaterialCatalog, validatePropertyCatalog, validateRecipeCatalog } from '../scripts/crafting-schema.mjs';
import { allocateRecipe } from '../scripts/crafting-recipe-engine.mjs';

const properties = {
  schemaVersion: 2,
  id: 'mh.material-properties.test',
  properties: [
    { id: 'rigid', label: 'Rigide' },
    { id: 'flexible', label: 'Souple' },
    { id: 'conductive', label: 'Conducteur' },
  ],
};
validatePropertyCatalog(properties);

const materials = {
  schemaVersion: 2,
  id: 'mh.materials.test',
  materials: [
    {
      id: 'mh.test.hide', name: 'Cuir test',
      material: { family: 'tegument', quality: 2, properties: { rigid: 4, flexible: 2 } },
      inventory: { stackable: true, containerClass: 'soft-material' },
      research: { discoverable: true, specimen: { required: true, consumed: false } },
      source: { type: 'creature' },
    },
    {
      id: 'mh.test.gland', name: 'Glande test',
      material: { family: 'organ', quality: 1, properties: { conductive: 3 } },
      inventory: { stackable: true, containerClass: 'organ' },
      research: { discoverable: true, specimen: { required: true, consumed: false } },
      source: { type: 'creature' },
    },
  ],
};
validateMaterialCatalog(materials);

const recipes = {
  schemaVersion: 2,
  id: 'mh.recipes.test',
  recipes: [{
    id: 'craft.test', name: 'Test', mode: 'property-budget',
    output: { type: 'weaponAugment', id: 'motherboard.test' },
    requirements: [
      { id: 'need-rigid', value: 4, match: { property: 'rigid' } },
      { id: 'need-flex', value: 2, match: { property: 'flexible' } },
      { id: 'need-conductive', value: 6, match: { property: 'conductive' } },
    ],
  }],
};
validateRecipeCatalog(recipes);

const result = allocateRecipe(recipes.recipes[0], [
  { materialId: 'mh.test.hide', quantity: 2 },
  { materialId: 'mh.test.gland', quantity: 2 },
], materials.materials);

assert.equal(result.green, true);
assert.equal(result.totalUnits, 3);
assert.deepEqual(result.allocations, [
  { materialId: 'mh.test.gland', quantity: 2 },
  { materialId: 'mh.test.hide', quantity: 1 },
]);
console.log('CRAFTING V2 TESTS GREEN', result);
