import assert from 'node:assert/strict';
import { registerWorldInfusionsSetting, artificerInfusionApi as inf } from '../scripts/artificer-infusion-runtime.mjs';
const SCOPE = 'daggerheart-campaign-toolkit';
let data, seq = 0;
globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => `inf-${++seq}` } };
const settings = new Map();
function actor(id, name, level, itemNames, isArtificer = false) {
  const flags = {};
  const a = { id, uuid:`Actor.${id}`, name, system:{levelData:{level:{current:level}}}, flags,
    getFlag:(scope,key)=>scope===SCOPE ? flags[key] : undefined,
    items:itemNames.map(([iid,n,type])=>({id:iid,name:n,type,flags:{[SCOPE]:{sourceId:''}}})), };
  if (isArtificer) a.items.push({id:'class',type:'class',flags:{[SCOPE]:{sourceId:'homebrew.artificer.class.artificer'}}});
  a.items.get = id => a.items.find(i=>i.id===id);
  return a;
}
const arti = actor('arti','Artificier',1,[['wand','Baguette','weapon']],true);
const ally = actor('ally','Porteur',1,[['armor','Armure','armor'],['gun','Fusil','weapon']]);
arti.flags.artificerInfusions = {entries:[{id:'legacy-id',targetActorUuid:ally.uuid,itemId:'gun',itemName:'Fusil',order:3,createdAt:100}],nextOrder:4,preventionUsed:[]};
globalThis.game = { user:{isGM:true}, actors:{ contents:[arti,ally],get(id){return this.contents.find(a=>a.id===id);}}, settings:{
  settings,register(scope,key,opt){settings.set(`${scope}.${key}`,opt);data=structuredClone(opt.default);},
  get(scope,key){assert.equal(`${scope}.${key}`,`${SCOPE}.activeInfusions`);return structuredClone(data);},
  async set(scope,key,value){assert.equal(`${scope}.${key}`,`${SCOPE}.activeInfusions`);data=structuredClone(value);},
}};
registerWorldInfusionsSetting();
assert.equal(inf.status().used,0);
const migration = await inf.migrateLegacyInfusions({confirmed:true});
assert.equal(migration.imported,1);
assert.equal(inf.status().entries[0].id,'legacy-id');
assert.equal((await inf.migrateLegacyInfusions({confirmed:true})).imported,0);
await inf.add(arti,ally,'armor');
assert.equal(inf.status(arti).used,2);
assert.equal(inf.newestForRecipient(ally).itemId,'armor');
// Creator document can disappear entirely from game.actors: resolution uses world state.
game.actors.contents = [ally];
assert.equal(inf.status().used,2);
const outcome = await inf.resolveCriticalDamage(ally,{confirmedCriticalDamage:true,dieResult:1});
assert.equal(outcome.consequence,'infusion-lost');
assert.equal(inf.status().used,1);
const prevention = await inf.resolveCriticalDamage(ally,{confirmedCriticalDamage:true,dieResult:2,prevent:true,confirmedHopeSpent:true});
assert.equal(prevention.consequence,'prevented');
await assert.rejects(inf.resolveCriticalDamage(ally,{confirmedCriticalDamage:true,dieResult:2,prevent:true,confirmedHopeSpent:true}),/déjà utilisée/);
await inf.startNewSession({confirmed:true});
assert.equal(inf.status().preventionUsed.length,0);
await inf.clearAtLongRest({confirmed:true});
assert.equal(inf.status().used,0);
// Entirely virtual maker: no artificer Actor at creation either.
await inf.addWorld({creatorKey:'atelier:giovanni',creatorName:'Giovanni',sourceLevel:1,targetActorUuid:ally.uuid,itemId:'armor'});
assert.equal(inf.status('atelier:giovanni').used,1);
assert.equal(inf.status('atelier:giovanni').capacity,2);
console.log('P2.11d.3d TESTS GREEN — migration, persistence mondiale, Artificier supprimé du répertoire, incident, prévention, session, repos.');
