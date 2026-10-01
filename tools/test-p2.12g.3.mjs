import assert from "node:assert/strict";
import { buildResearchStationModel, isEligibleResearchActor, listOwnedResearchActors } from "../scripts/crafting-research-station.mjs";

const owner = { id:"user-1" };
const character = { id:"character", uuid:"Actor.character", documentName:"Actor", type:"character", testUserPermission(user, level){ return user === owner && level === "OWNER"; } };
const adversary = { id:"adversary", uuid:"Actor.adversary", documentName:"Actor", type:"adversary", testUserPermission(){ return true; } };
const party = { id:"party", uuid:"Actor.party", documentName:"Actor", type:"party", testUserPermission(){ return true; } };
globalThis.game = { i18n:{lang:"fr"}, user:owner, actors:[character, adversary, party] };
assert.equal(isEligibleResearchActor(character, owner), true);
assert.equal(isEligibleResearchActor(adversary, owner), false);
assert.equal(isEligibleResearchActor(party, owner), false);
assert.deepEqual(listOwnedResearchActors(owner).map((entry) => entry.id), ["character"]);
const actor = { uuid:"Actor.researcher" };
const manifest = {
  expeditionId:"mh-home-test",
  containers:[{
    containerId:"fob",
    presentation:{playerRole:"fob"},
    contents:[{
      quantity:1,
      itemRef:{
        sourceId:"mh.tetsucabra.fang",
        snapshot:{flags:{"daggerheart-campaign-toolkit":{material:{materialId:"mh.tetsucabra.fang"}}}},
        lifecycle:{state:"active"},
      },
    }],
  }],
};
const api = {
  expeditionManifest:{ async load(id){ return id === "mh-home-test" ? structuredClone(manifest) : null; } },
  craftingMaterials:{ async get(id){ return id === "mh.tetsucabra.fang" ? { id, name:"Croc de Tetsucabra", research:{discoverable:true}, material:{properties:["rigid","piercing","impact"]} } : null; } },
  craftingKnowledge:{
    personal(){ return { piercing:{discoveredAt:1} }; },
    documented(){ return { rigid:{documentedAt:1} }; },
  },
};
const model = await buildResearchStationModel({ api, actor, expeditionId:"mh-home-test", containerId:"fob" });
assert.equal(model.green, true);
assert.equal(model.materials.length, 1);
assert.equal(model.materials[0].quantity, 1);
const [rigid,piercing,impact] = model.materials[0].properties;
assert.equal(rigid.documented, true);
assert.equal(rigid.action, null);
assert.equal(piercing.personal, true);
assert.equal(piercing.action, "document");
assert.equal(impact.label, "Propriété inconnue 3");
assert.equal(impact.action, "research");
console.log("P2.12g.3 TESTS GREEN: research candidates are owned character actors only; FOB station model lists specimens; collective/personal/unknown properties map to documented/document/research states without exposing unknown labels.");
