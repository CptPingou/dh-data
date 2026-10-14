/* Test local sans Foundry : node tools/test-p34b-offline.mjs <audit.json> <sortie.json> */
import fs from 'node:fs';
import vm from 'node:vm';
const [auditPath, outputPath] = process.argv.slice(2);
if (!auditPath || !outputPath) throw Error('Usage: node tools/test-p34b-offline.mjs audit.json sortie.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const original = fs.readFileSync(new URL('./p34b-export-foundry.js', import.meta.url), 'utf8');
const manifest = { schema: audit.sourceVersions.manifest, expeditionId: audit.expeditionId,
  revision: audit.manifestRevision, phase: audit.phase, authority: audit.authority,
  characters: audit.characters.map(c => ({ characterId: c.characterId, actorUuid: c.actorUuid, name: c.name })),
  containers: [...audit.inventory.backpacks, ...audit.inventory.caravanContainers], caravan: audit.inventory.caravanStructure };
const material = { schemaVersion: audit.sourceVersions.materialKnowledge,
  actorKnowledge: Object.fromEntries(audit.characters.filter(c => c.materialKnowledgePresent).map(c => [c.actorUuid, c.materialKnowledge])),
  partyKnowledge: audit.research.partyMaterialKnowledge };
const narrative = { schemaVersion: audit.sourceVersions.researchKnowledge, revelations: audit.research.revelations };
const settings = { expeditionManifests: { [audit.expeditionId]: manifest }, materialKnowledge: material, researchKnowledge: narrative };
let blob = null; const errors = [];
const context = { game: { user: { isGM: true }, settings: { get: (_, key) => settings[key] } },
  fromUuid: async uuid => ({ name: uuid }), Blob, URL: { createObjectURL: b => { blob = b; return 'blob:test'; }, revokeObjectURL: () => {} },
  document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
  setTimeout: () => {}, console: { log() {}, error: (...args) => errors.push(args) }, Date, Object, JSON, Map, Set };
await vm.runInNewContext(original, context);
if (errors.length) throw Error('Exporter blocked: ' + JSON.stringify(errors));
if (!blob) throw Error('No blob generated');
fs.writeFileSync(outputPath, await blob.text());
console.log('OFFLINE EXPORT OK', outputPath);
