import assert from 'node:assert/strict';
import { artificerInfusionApi as inf } from '../scripts/artificer-infusion-runtime.mjs';
const SCOPE = 'daggerheart-campaign-toolkit';
let seq = 0;
globalThis.foundry = { utils: { randomID: () => `test-${++seq}` } };
function actor(id, name, items, level = 1) {
  const flags = {};
  const doc = {
    id, uuid:`Actor.${id}`, name,
    system:{levelData:{level:{current:level}}},
    items: [...items],
    getFlag:(scope,key) => scope === SCOPE ? flags[key] : undefined,
    setFlag: async (scope,key,value) => {
      assert.equal(scope,SCOPE);
      flags[key] = structuredClone(value);
    },
    flags,
  };
  doc.items.get = id => doc.items.find(x => x.id === id);
  return doc;
}
const artificer = actor('artificer','Artificier', [
  {id:'class',type:'class',flags:{[SCOPE]:{sourceId:'homebrew.artificer.class.artificer'}}},
  {id:'wand',type:'weapon',name:'Baguette'},
]);
const ally = actor('ally','Allié',[{id:'armor',type:'armor',name:'Armure'}]);
const other = actor('other','Autre',[{id:'armor',type:'armor',name:'Armure B'}]);
globalThis.game = { actors:{ get: id => [artificer,ally,other].find(a => a.id === id) ?? null } };
assert.equal(inf.status(artificer).capacity,2);
assert.equal(inf.eligibleItems(ally).length,1);
await inf.add(artificer,'wand');
await inf.add(artificer,ally,'armor');
let rows = inf.status(artificer).entries;
assert.equal(rows[0].targetActorUuid,artificer.uuid);
assert.equal(rows[1].targetActorUuid,ally.uuid);
assert.equal(rows[1].currentActorName,'Allié');
assert.equal(rows[1].currentItemName,'Armure');
assert.equal(inf.newest(artificer).order,2);
assert.equal(artificer.flags.artificerInfusions.entries.length,2);
assert.equal(ally.flags.artificerInfusions,undefined);
await assert.rejects(inf.add(artificer,other,'armor'), /Capacité/);
await inf.remove(artificer,rows[0].id);
await assert.rejects(inf.add(artificer,ally,'armor'), /déjà une Infusion/);
await inf.add(artificer,other.uuid,'armor');
assert.equal(inf.newest(artificer).targetActorUuid,other.uuid);
assert.equal(inf.newest(artificer).order,3);
// Missing target keeps slot occupied and never silently transfers target to owner.
globalThis.game.actors.get = id => [artificer,other].find(a => a.id === id) ?? null;
rows = inf.status(artificer).entries;
assert.equal(rows[0].targetActorExists,false);
assert.equal(rows[0].itemExists,false);
assert.equal(inf.status(artificer).used,2);
await assert.rejects(inf.clearAtLongRest(artificer), /confirmed:true/);
// Legacy V1 records with no actor UUID still resolve to owner and keep IDs/orders.
await artificer.setFlag(SCOPE,'artificerInfusions', {version:1, entries:[{id:'legacy',itemId:'wand',itemName:'Baguette',order:7,createdAt:123}],nextOrder:8});
rows = inf.status(artificer).entries;
assert.equal(rows[0].id,'legacy');
assert.equal(rows[0].targetActorUuid,artificer.uuid);
assert.equal(rows[0].itemExists,true);
assert.equal(inf.status(artificer).nextOrder,8);
await inf.clearAtLongRest(artificer,{confirmed:true});
assert.equal(inf.status(artificer).used,0);
console.log('P2.11d.3b: 19 assertions / scénarios GREEN (simulation isolée)');
