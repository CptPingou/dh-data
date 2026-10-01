#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(resolve(root,p),'utf8'));
const loot = await readJson('data/homebrew/monster-hunter/dh-loot.json');
const catalog = await readJson('data/weapon-augments/motherboard.json');
const index = await readJson('data/source-index.json');

const components = loot.filter(x => x?.flags?.['daggerheart-campaign-toolkit']?.lootCategory === 'crafting-component');
if (components.length !== 19) throw new Error(`Expected 19 crafting components, found ${components.length}`);

const aliasOwner = new Map();
for (const item of components) {
  if (item.type !== 'loot') throw new Error(`${item.name}: expected type loot`);
  if (item.system?.quantity !== 1) throw new Error(`${item.name}: default quantity must be 1`);
  if (typeof item._id !== 'string' || item._id.length !== 16 || !/^[A-Za-z0-9]+$/.test(item._id)) {
    throw new Error(`${item.name}: invalid 16-char Foundry ID ${item._id}`);
  }
  const flags = item.flags?.['daggerheart-campaign-toolkit'];
  const crafting = flags?.crafting;
  if (!crafting?.resourceId) throw new Error(`${item.name}: missing crafting.resourceId`);
  if (!Array.isArray(crafting.aliases) || crafting.aliases.length < 1) throw new Error(`${item.name}: missing aliases`);
  if (flags.canonicalSourceId !== `homebrew.monster-hunter.crafting.${crafting.resourceId}`) {
    throw new Error(`${item.name}: canonical source mismatch`);
  }
  for (const alias of crafting.aliases) {
    if (aliasOwner.has(alias)) throw new Error(`Alias ${alias} owned by both ${aliasOwner.get(alias)} and ${item.name}`);
    aliasOwner.set(alias, item.name);
  }
}

const recipeResources = new Set();
for (const augment of catalog.augments ?? []) {
  for (const ingredient of augment.recipe ?? []) recipeResources.add(ingredient.resource);
}
const missing = [...recipeResources].filter(r => !aliasOwner.has(r));
if (missing.length) throw new Error(`Recipe resources without compendium item: ${missing.join(', ')}`);

const mh = index.origins?.homebrew?.namespaces?.['monster-hunter'];
if (mh?.packs?.['dh-loot']?.count !== loot.length) throw new Error('source-index dh-loot count mismatch');
if (index.total !== 1137) throw new Error(`Expected autonomous total 1137, found ${index.total}`);

console.log('P2.12i.1 TESTS GREEN: 19 standard crafting components cover every Motherboard recipe resource alias; dh-loot=21; autonomous total=1137.');
