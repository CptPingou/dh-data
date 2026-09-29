import assert from 'node:assert/strict';
import { artificerInfusionApi as inf } from '../scripts/artificer-infusion-runtime.mjs';
const SCOPE = 'daggerheart-campaign-toolkit';
let seq = 0;
globalThis.foundry = { utils: { randomID: () => `test-${++seq}`, deepClone: structuredClone } };
function actor(id, name, items, level = 1) {
  const flags = {};
  const doc = {
    id, uuid:`Actor.${id}`, name,
    system:{levelData:{level:{current:level}}}, items:[...items],
    getFlag:(scope,key) => scope === SCOPE ? flags[key] : undefined,
    setFlag:async(scope,key,val) => { assert.equal(scope,SCOPE); flags[key]=structuredClone(val); },
    flags,
  };
  doc.items.get = key => doc.items.find(x => x.id === key);
  return doc;
}
const artificer = actor('arti','Artificier',[
  {id:'class',type:'class',flags:{[SCOPE]:{sourceId:'homebrew.artificer.class.artificer'}}},
  {id:'wand',type:'weapon',name:'Baguette'},
]);
const ally = actor('ally','Porteur',[{id:'a',type:'armor',name:'Armure'},{id:'w',type:'weapon',name:'Fusil'}]);
globalThis.game = { actors:{get:id=>[artificer,ally].find(x=>x.id===id)??null} };
await inf.add(artificer,ally,'a');
await inf.add(artificer,ally,'w');
assert.equal(inf.status(artificer).used,2);
assert.equal(inf.newestForRecipient(artificer,ally).itemId,'w');
await assert.rejects(inf.resolveCriticalDamage(artificer,ally,{dieResult:1}),/Confirmer/);
await assert.rejects(inf.resolveCriticalDamage(artificer,ally,{confirmedCriticalDamage:true,dieResult:0}),/1d6/);
await assert.rejects(inf.resolveCriticalDamage(artificer,ally,{confirmedCriticalDamage:true,dieResult:2,prevent:true}),/dépenser 1 Espoir/);
assert.equal(inf.status(artificer).used,2);
// Artificer PLAYER is offline: no user / controlled token needed, just Actor directory.
const h = await inf.resolveCriticalDamage(artificer,ally.uuid,{
 confirmedCriticalDamage:true,dieResult:1,prevent:true,confirmedHopeSpent:true,
});
assert.equal(h.consequence,'prevented');
assert.equal(inf.status(artificer).used,2);
assert.deepEqual(inf.status(artificer).preventionUsed,[ally.uuid]);
await assert.rejects(inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:2,prevent:true,confirmedHopeSpent:true,
}),/déjà utilisée/);
const hp = await inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:2,
});
assert.equal(hp.consequence,'mark-1-hp-manually');
assert.equal(hp.manualSheetChangeRequired,true);
assert.equal(inf.status(artificer).used,2);
const stress = await inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:3,
});
assert.equal(stress.consequence,'mark-1-stress-manually');
assert.equal(inf.status(artificer).used,2);
const none = await inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:6,
});
assert.equal(none.consequence,'none');
const loss = await inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:1,
});
assert.equal(loss.itemName,'Fusil');
assert.equal(loss.consequence,'infusion-lost');
assert.equal(inf.status(artificer).used,1);
assert.equal(inf.newestForRecipient(artificer,ally).itemId,'a');
// Session is explicit and does not destroy remaining infusion.
await assert.rejects(inf.startNewSession(artificer),/confirmer/);
await inf.startNewSession(artificer,{confirmed:true});
assert.deepEqual(inf.status(artificer).preventionUsed,[]);
assert.equal(inf.status(artificer).used,1);
assert.equal(inf.status(artificer).sessionIndex,2);
await inf.resolveCriticalDamage(artificer,ally,{
 confirmedCriticalDamage:true,dieResult:4,prevent:true,confirmedHopeSpent:true,
});
assert.deepEqual(inf.status(artificer).preventionUsed,[ally.uuid]);
// Long rest expires all, even equipment of an absent ally.
await assert.rejects(inf.clearAtLongRest(artificer),/confirmed:true/);
await inf.clearAtLongRest(artificer,{confirmed:true});
assert.equal(inf.status(artificer).used,0);
assert.equal(inf.status(artificer).nextOrder,3);
console.log('P2.11d.3c GREEN — offline Artificer, critical 1-6, Hope prevention, session reset, long rest, legacy API');
