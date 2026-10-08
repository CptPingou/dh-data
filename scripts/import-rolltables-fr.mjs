// DH FR RollTables: explicit, non-destructive sync to Toolkit compendium.
// GM console: const rt = await import('/modules/daggerheart-campaign-toolkit/scripts/import-rolltables-fr.mjs?v=2');
// await rt.preview(); await rt.syncPack();
const MODULE = 'daggerheart-campaign-toolkit';
const PACK_ID = `${MODULE}.dh-rolltables`;
const DATA_URL = `/modules/${MODULE}/data/core/fr/dh-rolltables-fr.json`;
const TABLE_IDS = Object.freeze({
  'DH FR — Consommables — Extension': 'DHFRConsumExtra1',
  'DH FR — Objets — Livre de base': 'DHFRLootCore0001',
  'DH FR — Objets — Extension': 'DHFRLootExtra001',
  'DH FR — Consommables — Livre de base': 'DHFRConsumCore01',
});
const ALTERNATIVES = ['2d12','3d12','4d12','5d12'];

async function validate() {
  if (!game.user?.isGM) throw new Error('Un compte MJ est requis.');
  const resp = await fetch(DATA_URL, {cache:'no-store'});
  if (!resp.ok) throw new Error(`Source inaccessible : ${DATA_URL} (${resp.status})`);
  const source = await resp.json();
  if (source.schemaVersion !== 1 || source.tables?.length !== 4) throw new Error('Schéma inattendu.');
  const itemPacks = ['dh-loot','dh-consumables'];
  const ids = new Map();
  for (const suffix of itemPacks) {
    const name = `${MODULE}.${suffix}`;
    const pack = game.packs.get(name);
    if (!pack) throw new Error(`Compendium Items absent : ${name}`);
    const index = await pack.getIndex();
    ids.set(name, new Set([...index].map(x => x._id)));
  }
  const seen = new Set();
  for (const table of source.tables) {
    if (!TABLE_IDS[table.name] || seen.has(table.name)) throw new Error(`Nom inconnu/dupliqué : ${table.name}`);
    seen.add(table.name);
    if (table.formula !== '1d12' || table.results?.length !== 60) throw new Error(`Structure incorrecte : ${table.name}`);
    const alts = Object.values(table.flags?.daggerheart?.altFormula ?? {}).map(x => x.formula).sort();
    if (JSON.stringify(alts) !== JSON.stringify([...ALTERNATIVES].sort())) throw new Error(`Formules incorrectes : ${table.name}`);
    for (const [i, result] of table.results.entries()) {
      const m = /^Compendium\.(daggerheart-campaign-toolkit\.dh-(?:loot|consumables))\.Item\.([A-Za-z0-9]+)$/.exec(result.documentUuid ?? '');
      if (!m || !ids.get(m[1])?.has(m[2])) throw new Error(`Référence brisée : ${table.name} #${i+1}`);
      const expected = table.name.includes('Consommables') ? `${MODULE}.dh-consumables` : `${MODULE}.dh-loot`;
      if (m[1] !== expected || result.range?.[0] !== i+1 || result.range?.[1] !== i+1) throw new Error(`Position/type incorrect : ${table.name} #${i+1}`);
    }
  }
  return source.tables;
}
function packRef() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) throw new Error(`Pack ${PACK_ID} absent. Ajouter sa déclaration à module.json, redémarrer Foundry puis recommencer.`);
  if (pack.documentName !== 'RollTable') throw new Error(`Type du pack incorrect : ${pack.documentName}`);
  return pack;
}
function toData(source) {
  const {flagsMeta, ...base} = source;
  return {
    ...base,
    _id: TABLE_IDS[source.name],
    flags: {
      ...base.flags,
      [MODULE]: {managed: true, source:'foundryborne-rolltables', originalName: flagsMeta?.sourceTable ?? null, version:2},
    },
  };
}
export async function preview() {
  const sources = await validate();
  const pack = packRef();
  const docs = await pack.getIndex();
  const present = new Set([...docs].map(x=>x._id));
  const rows = sources.map(x=>({table:x.name,entries:x.results.length,id:TABLE_IDS[x.name],status:present.has(TABLE_IDS[x.name])?'UPDATE':'CREATE'}));
  console.table(rows);
  return {green:true, rows};
}
export async function syncPack() {
  const sources = await validate();
  const pack = packRef();
  const rows = await preview();
  const existing = new Map((await pack.getDocuments()).map(x=>[x.id,x]));
  const unknown = sources.filter(x=>existing.has(TABLE_IDS[x.name]) && existing.get(TABLE_IDS[x.name]).name !== x.name);
  if (unknown.length) throw new Error(`Conflit d'ID : ${unknown.map(x=>x.name).join(', ')}`);
  if (pack.locked) {
    throw new Error(`Pack ${PACK_ID} verrouillé. Déverrouille-le temporairement via l'interface Compendiums, puis relance syncPack().`);
  }
  const created = [], updated = [];
  for (const source of sources) {
    const data = toData(source);
    const current = existing.get(data._id);
    if (current) {
      const original = current.getFlag(MODULE,'managed');
      if (original !== true) throw new Error(`Refus d'écraser une table non gérée : ${source.name}`);
      const {_id, ...changes} = data;
      await current.update(changes);
      updated.push(source.name);
    } else {
      await RollTable.create(data, {pack:PACK_ID, keepId:true});
      created.push(source.name);
    }
  }
  console.log('DH FR ROLLTABLE PACK SYNC', {green:true, created, updated});
  return {green:true, created, updated, preview:rows.rows};
}
// Keep old manual-world API for callers; no implicit world changes.
export async function install() {
  throw new Error('Import monde désactivé pour ce patch. Utiliser preview() puis syncPack() après déverrouillage du compendium.');
}
