import assert from 'node:assert/strict';
import {registerWorldInfusionsSetting, artificerInfusionApi as inf} from '../scripts/artificer-infusion-runtime.mjs';
const SCOPE='daggerheart-campaign-toolkit';
let data, seq=0;
globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>`inf-${++seq}`}};
const settings=new Map();
function actor(id,name,items){
 const a={id,uuid:`Actor.${id}`,name,items:items.map(([iid,n,type])=>({id:iid,name:n,type}))};
 a.items.get=id=>a.items.find(i=>i.id===id);return a;
}
const holder=actor('holder','Porteur',[['gun','Fusil','weapon'],['ammo','Billes','item'],['shield','Bouclier','armor']]);
const ally=actor('ally','Allié',[['armor','Armure','armor']]);
globalThis.game={user:{isGM:true},actors:{contents:[holder,ally],get(id){return this.contents.find(a=>a.id===id);}},settings:{settings,
 register(scope,key,opt){settings.set(`${scope}.${key}`,opt);data=structuredClone(opt.default);},
 get(){return structuredClone(data);}, async set(scope,key,value){assert.equal(`${scope}.${key}`,`${SCOPE}.activeInfusions`);data=structuredClone(value);},}};
registerWorldInfusionsSetting();
assert.equal(inf.version,'P2.11d.3e');
await inf.addWorld({creatorKey:'atelier:a',creatorName:'A (virtuel)',sourceLevel:1,targetActorUuid:holder.uuid,itemId:'gun'});
await inf.addWorld({creatorKey:'atelier:b',creatorName:'B (virtuel)',sourceLevel:1,targetActorUuid:holder.uuid,itemId:'ammo'});
await inf.addWorld({creatorKey:'atelier:a',creatorName:'A (virtuel)',sourceLevel:1,targetActorUuid:ally.uuid,itemId:'armor'});
assert.equal(inf.status().used,3);
assert.equal(inf.newestForRecipient(holder).itemName,'Billes');
// One incident, exactly one world mutation, newest recipient infusion lost (not newest creator).
const incident={confirmedCriticalDamage:true,dieResult:1,incidentKey:'test-critical-001'};
const outcome=await inf.resolveCriticalDamage(holder,incident);
assert.equal(outcome.consequence,'infusion-lost');
assert.equal(outcome.itemName,'Billes');
assert.equal(inf.status().used,2);
await assert.rejects(inf.resolveCriticalDamage(holder,incident),/déjà été traité/);
assert.equal(inf.status().used,2);
// Manual HP/Stress: no Actor updates or invented automation.
let x=await inf.resolveCriticalDamage(holder,{confirmedCriticalDamage:true,dieResult:2,incidentKey:'test-critical-002'});
assert.equal(x.consequence,'mark-1-hp-manually');assert.equal(x.manualSheetChangeRequired,true);
x=await inf.resolveCriticalDamage(holder,{confirmedCriticalDamage:true,dieResult:3,incidentKey:'test-critical-003'});
assert.equal(x.consequence,'mark-1-stress-manually');
assert.equal(inf.status().used,2);
// Prevention is based on recipient; neither creator has an Actor.
x=await inf.resolveCriticalDamage(holder,{confirmedCriticalDamage:true,dieResult:1,incidentKey:'test-critical-004',prevent:true,confirmedHopeSpent:true});
assert.equal(x.consequence,'prevented');assert.equal(inf.status().used,2);
await assert.rejects(inf.resolveCriticalDamage(holder,{confirmedCriticalDamage:true,dieResult:1,incidentKey:'test-critical-005',prevent:true,confirmedHopeSpent:true}),/déjà utilisée/);
await assert.rejects(inf.clearForRecipientAtLongRest(holder),/confirmé/);
// Long rest scoped to holder: Ally's item survives even if created by the same workshop.
const rest=await inf.clearForRecipientAtLongRest(holder,{confirmed:true});
assert.equal(rest.expiredCount,1);assert.equal(inf.status().used,1);
assert.equal(inf.status().entries[0].targetActorUuid,ally.uuid);
const prev=inf.status().sessionIndex;
await inf.startNewSession({confirmed:true});
assert.equal(inf.status().sessionIndex,prev+1);
assert.deepEqual(inf.status().preventionUsed,[]);
assert.deepEqual(data.processedIncidentKeys,[]);
// Re-add, then world/group long rest fully expires the remaining world entries.
await inf.addWorld({creatorKey:'atelier:b',creatorName:'B (virtuel)',sourceLevel:1,targetActorUuid:holder.uuid,itemId:'shield'});
assert.equal(inf.status().used,2);
await inf.clearAtLongRest({confirmed:true});
assert.equal(inf.status().used,0);
// World mutation permission contract.
game.user.isGM=false;
await assert.rejects(inf.addWorld({creatorKey:'atelier:b',creatorName:'B',sourceLevel:1,targetActorUuid:holder.uuid,itemId:'gun'}),/réservée au MJ/);
console.log('P2.11d.3e TESTS GREEN: creators virtuels, incident (1/2/3), anti-double, prévention, repos ciblé, session, repos collectif, permission MJ.');
