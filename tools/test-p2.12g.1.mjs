import assert from "node:assert/strict";
import { createCraftingRuntimeApi } from "../scripts/crafting-runtime.mjs";

globalThis.game = { user: { isGM: true } };
const material = { id:"mh.tetsucabra.fang", name:"Croc", material:{properties:["rigid","impact"]}, research:{discoverable:true,specimen:{required:true,consumed:false}} };
const itemRef = { snapshot:{ flags:{"daggerheart-campaign-toolkit":{material:{materialId:material.id}}}}, lifecycle:{state:"active"} };
const manifest = { expeditionId:"hunt-1", containers:[
  {containerId:"fob", presentation:{playerRole:"fob"}, contents:[{entryId:"fang-1",quantity:1,itemRef}]},
  {containerId:"caravan", presentation:{playerRole:"caravan"}, contents:[]}
]};
let discoverArgs=null;
const api=createCraftingRuntimeApi({
 materialsApi:{list:async()=>[material],get:async id=>id===material.id?material:null},
 knowledgeApi:{effective:()=>({properties:[]}),discover:async args=>(discoverArgs=args,{green:true,changed:true,actorUuid:args.actor.uuid,materialId:args.materialId,propertyId:args.propertyId})},
 manifestApi:{consume:()=>({changed:true}),validate:()=>({green:true})},
 persistenceApi:{load:async id=>id==="hunt-1"?structuredClone(manifest):null,save:async()=>({green:true})},
 weaponAugmentStateApi:{craft:async()=>({})}
});
const actor={uuid:"Actor.researcher",name:"Researcher"};
const before=JSON.stringify(manifest);
const ok=await api.researchMaterialProperty({actor,materialId:material.id,propertyId:"rigid",expeditionId:"hunt-1"});
assert.equal(ok.green,true); assert.equal(ok.specimenQuantity,1); assert.equal(ok.specimenConsumed,false);
assert.equal(discoverArgs.specimenQuantity,1); assert.equal(discoverArgs.source.containerId,"fob"); assert.equal(JSON.stringify(manifest),before);
const wrong=await api.researchMaterialProperty({actor,materialId:material.id,propertyId:"rigid",expeditionId:"hunt-1",containerId:"caravan"});
assert.equal(wrong.green,false); assert.equal(wrong.reason,"research-container-not-fob");
const noSpec=structuredClone(manifest); noSpec.containers[0].contents=[];
const api2=createCraftingRuntimeApi({materialsApi:{list:async()=>[material],get:async()=>material},knowledgeApi:{effective:()=>({properties:[]}),discover:async()=>{throw Error("must not discover")}},manifestApi:{consume:()=>({changed:true}),validate:()=>({green:true})},persistenceApi:{load:async()=>noSpec,save:async()=>{}},weaponAugmentStateApi:{craft:async()=>({})}});
const missing=await api2.researchMaterialProperty({actor,materialId:material.id,propertyId:"rigid",expeditionId:"hunt-1"});
assert.equal(missing.green,false); assert.equal(missing.reason,"research-specimen-required");
const badProp=await api.researchMaterialProperty({actor,materialId:material.id,propertyId:"electric",expeditionId:"hunt-1"});
assert.equal(badProp.green,false); assert.equal(badProp.reason,"material-property-not-found");
console.log("P2.12g.1 TESTS GREEN: FOB specimen gates research; discovery is non-consuming; wrong container/missing specimen/unknown property rejected.");
