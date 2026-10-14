/** Web adapter, pure functions. No Foundry API, database or automatic authority switch. */
export const SCHEMA = 'dhct.expedition-transfer@1';
export function assertEnvelope(x) {
  if (!x || x.schema !== SCHEMA || typeof x.expeditionId !== 'string' || !Number.isSafeInteger(x.revision) || x.revision < 0 || !Array.isArray(x.characters) || !x.caravan || !x.research) throw new Error('Enveloppe de transfert invalide');
  if (x.metadata?.exampleOnly === true) throw new Error('Exemple non importable');
  return x;
}
export function cloneTransfer(x) { return structuredClone(assertEnvelope(x)); }
export function toWebView(x) {
  const t=assertEnvelope(x);
  return {
    expeditionId:t.expeditionId, revision:t.revision, authority:t.authority, phase:t.phase,
    characters:t.characters.map(c=>({id:c.characterId,name:c.name,backpack:c.backpack,materialKnowledge:c.materialKnowledge})),
    caravan:t.caravan, partyMaterialKnowledge:t.research.partyMaterialKnowledge,
    revelations:t.research.revelations, transferPolicy:t.transferPolicy
  };
}
/** Prepare a web-edited candidate without advancing the revision. Server should persist with CAS. */
export function editCandidate(original, edit, expectedRevision) {
  const copy=cloneTransfer(original);
  if(copy.revision!==expectedRevision) throw new Error(`Conflit de révision: attendu ${expectedRevision}, actuel ${copy.revision}`);
  if(copy.authority!=='web') throw new Error('Édition web interdite: autorité non web');
  const immutable={schema:copy.schema,expeditionId:copy.expeditionId,revision:copy.revision,authority:copy.authority};
  edit(copy);
  for(const [k,v] of Object.entries(immutable)) if(copy[k]!==v) throw new Error(`Champ protégé modifié: ${k}`);
  return copy;
}
/** Stable IDs for UI keys; do not use array positions as persistent identities. */
export function inventoryRows(x) {
 const t=assertEnvelope(x), out=[];
 for(const c of t.characters) for(const e of c.backpack.contents) out.push({ownerType:'character',ownerId:c.characterId,containerId:c.backpack.containerId,...e});
 for(const c of t.caravan.containers) for(const e of c.contents) out.push({ownerType:'caravan',ownerId:t.expeditionId,containerId:c.containerId,...e});
 return out;
}
