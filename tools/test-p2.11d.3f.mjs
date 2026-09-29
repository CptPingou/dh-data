import assert from 'node:assert/strict';
import { registerWorldInfusionsSetting, artificerInfusionApi as inf } from '../scripts/artificer-infusion-runtime.mjs';
import { nativeLongRestRecipient, registerNativeLongRestInfusionBridge } from '../scripts/artificer-rest-bridge.mjs';
const SCOPE='daggerheart-campaign-toolkit';
let data, seq=0;
const settings=new Map(), events=new Map();
globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>`inf${String(++seq).padStart(13,'0')}`}};
function actor(id,name,itemId){const a={id,uuid:`Actor.${id}`,name,items:[{id:itemId,name:'Arme',type:'weapon'}]};a.items.get=x=>a.items.find(i=>i.id===x);return a;}
const holder=actor('aaaaaaaaaaaaaaaa','Porteur','gun'), ally=actor('bbbbbbbbbbbbbbbb','Allié','axe');
const gm={id:'GM1',active:true,isGM:true};
globalThis.game={user:gm,users:{contents:[gm]},actors:{contents:[holder,ally],get(id){return this.contents.find(a=>a.id===id);}}, settings:{settings,register(scope,key,opt){settings.set(`${scope}.${key}`,opt);data=structuredClone(opt.default);},get(){return structuredClone(data);},async set(scope,key,v){assert.equal(`${scope}.${key}`,`${SCOPE}.activeInfusions`);data=structuredClone(v);}}};
globalThis.Hooks={on(name,fn){events.set(name,fn);return name;},off(name){events.delete(name);}};
registerWorldInfusionsSetting();
assert.equal(inf.version,'P2.11d.3f');
await inf.addWorld({creatorKey:'atelier:a',sourceLevel:1,targetActorUuid:holder.uuid,itemId:'gun'});
await inf.addWorld({creatorKey:'atelier:b',sourceLevel:1,targetActorUuid:ally.uuid,itemId:'axe'});
const mk=(id,uuid=holder.uuid,path='longRest.moves.prepare',content='<div class="daggerheart chat downtime">rest</div>')=>({id,type:'base',content,speaker:{actor:uuid.slice(6)},system:{actor:uuid,moves:[{movePath:path}]}});
const committed=mk('RESTMESSAGE00001');
assert.equal(nativeLongRestRecipient(committed),holder.uuid);
assert.equal(nativeLongRestRecipient(mk('RESTMESSAGE00002',holder.uuid,'shortRest.moves.prepare')),null);
assert.equal(nativeLongRestRecipient(mk('RESTMESSAGE00003',holder.uuid,'longRest.moves.prepare','<div>unrelated</div>')),null);
assert.equal(nativeLongRestRecipient({...committed,speaker:{actor:ally.id}}),null);
assert.equal(nativeLongRestRecipient({...committed,system:{actor:holder.uuid,moves:[]}}),null);
assert.deepEqual(registerNativeLongRestInfusionBridge(),{installed:true,version:'P2.11d.3f'});
const emit=events.get('createChatMessage');
assert.ok(emit);
// A cancel has no confirmed chat card, and a short rest may emit its own card.
await emit(mk('RESTMESSAGE00004',holder.uuid,'shortRest.moves.prepare'));
assert.equal(inf.status().used,2);
await emit(committed);
// The bridge deliberately queues settings writes. Flush several microtasks.
for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(inf.status().used,1);
assert.equal(inf.status().entries[0].targetActorUuid,ally.uuid);
assert.deepEqual(data.processedRestMessageIds,['RESTMESSAGE00001']);
await emit(committed);
for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(inf.status().used,1);
assert.deepEqual(data.processedRestMessageIds,['RESTMESSAGE00001']);
// Re-invoke the actual persisted idempotence check directly too.
const duplicate=await inf.expireForNativeLongRest({messageId:'RESTMESSAGE00001',recipientUuid:holder.uuid});
assert.equal(duplicate.duplicate,true);
// A normal GM message must not clear the other character's infusion.
await emit(mk('RESTMESSAGE00005',ally.uuid,'shortRest.moves.work'));
for(let i=0;i<10;i++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(inf.status().used,1);
console.log('P2.11d.3f TESTS GREEN: strict native card, cancelled/no-event, short rest rejected, recipient only, persisted dedupe, second actor untouched.');
