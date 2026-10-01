import fs from 'node:fs';
import assert from 'node:assert/strict';

const loaderPath = new URL('../scripts/autonomous-source-loader.mjs', import.meta.url);
const source = fs.readFileSync(loaderPath, 'utf8');

assert.ok(source.includes('/(?:^|\\.)originItem\\.(?:itemPath|actionIndex)$/'),
  'loader must restrict omitted-null normalization to originItem.itemPath/actionIndex');
assert.match(source, /value === null/,
  'loader must only tolerate omitted originItem keys when source value is null');
assert.match(source, /hasRuntimeKey\s*&&\s*sourceValueIsPreserved/,
  'all other missing action fields must remain strict');

function sourceValueIsPreserved(runtime, authored, path = '') {
  if (Array.isArray(authored)) {
    if (!Array.isArray(runtime) || runtime.length !== authored.length) return false;
    return authored.every((value, index) =>
      sourceValueIsPreserved(runtime[index], value, `${path}[${index}]`)
    );
  }

  if (authored !== null && typeof authored === 'object') {
    if (runtime === null || typeof runtime !== 'object' || Array.isArray(runtime)) return false;
    return Object.entries(authored).every(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;
      const hasRuntimeKey = Object.prototype.hasOwnProperty.call(runtime, key);
      if (
        !hasRuntimeKey &&
        value === null &&
        /(?:^|\.)originItem\.(?:itemPath|actionIndex)$/.test(childPath)
      ) return true;
      return hasRuntimeKey && sourceValueIsPreserved(runtime[key], value, childPath);
    });
  }
  return Object.is(runtime, authored);
}

const authored = {
  MHARTWORKACT0001: {
    originItem: {
      type: 'itemCollection',
      itemPath: null,
      actionIndex: null,
    },
  },
};
const hydrated = {
  MHARTWORKACT0001: {
    originItem: {
      type: 'itemCollection',
    },
  },
};
assert.equal(sourceValueIsPreserved(hydrated, authored), true,
  'null optional originItem keys omitted by Foundryborne must compare GREEN');

const realDifference = structuredClone(authored);
realDifference.MHARTWORKACT0001.originItem.type = 'different';
assert.equal(sourceValueIsPreserved(hydrated, realDifference), false,
  'real action divergences must remain RED');

const nonNullMissing = structuredClone(authored);
nonNullMissing.MHARTWORKACT0001.originItem.itemPath = 'system.actions';
assert.equal(sourceValueIsPreserved(hydrated, nonNullMissing), false,
  'non-null missing originItem.itemPath must remain RED');

console.log('P2.12h.2c TESTS GREEN: omitted null originItem.itemPath/actionIndex normalize cleanly; real action differences remain strict.');
