import assert from "node:assert/strict";

const preserved=(runtime,source,path="")=>{
 if(Array.isArray(source)){if(!Array.isArray(runtime)||runtime.length!==source.length)return false;return source.every((v,i)=>preserved(runtime[i],v,`${path}[${i}]`));}
 if(source!==null&&typeof source==="object"){
  if(runtime===null&&/(?:^|\.)damage(?:\.[^.]+)+\.valueAlt$/.test(path)) return true;
  if(runtime===null||typeof runtime!=="object"||Array.isArray(runtime))return false;
  return Object.entries(source).every(([k,v])=>Object.prototype.hasOwnProperty.call(runtime,k)&&preserved(runtime[k],v,path?`${path}.${k}`:k));
 }
 return Object.is(runtime,source);
};
const alt={bonus:null,custom:{enabled:false,formula:""},dice:"d6",flatMultiplier:1,multiplier:"flat"};
assert.equal(preserved(null,alt,"7ymu.damage.main.valueAlt"),true);
assert.equal(preserved(null,alt,"5sGM.damage.resources.stress.valueAlt"),true);
assert.equal(preserved(null,alt,"5sGM.cost.valueAlt"),false);
assert.equal(preserved({dice:"d8"},alt,"7ymu.damage.main.valueAlt"),false);
assert.equal(preserved("d8","d6","7ymu.damage.main.dice"),false);
console.log("P2.12h.1c TESTS GREEN: damage.*.valueAlt object->null hydration is tolerated; real action divergences remain strict.");
