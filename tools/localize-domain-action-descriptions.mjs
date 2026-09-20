import fs from "node:fs";
import path from "node:path";
const FILE=path.join(process.cwd(),"data","core","fr","dh-domain-cards.json");
function english(v){if(typeof v!=="string"||!v.trim())return false;const s=v.replace(/<[^>]*>/g," ").toLowerCase();const m=[/\\bthe\\b/,/\\byou\\b/,/\\byour\\b/,/\\bcan\\b/,/\\bwhen\\b/,/\\bwith\\b/,/\\bfrom\\b/,/\\band\\b/,/\\bafter\\b/,/\\btarget\\b/,/\\bdamage\\b/,/\\bhit point\\b/,/\\broll\\b/];return m.reduce((n,r)=>n+(r.test(s)?1:0),0)>=3;}
const cards=JSON.parse(fs.readFileSync(FILE,"utf8").replace(/^\\uFEFF/,""));
if(!Array.isArray(cards))throw new Error("Tableau JSON attendu");
let actions=0,before=0,replaced=0;const touched=[];
for(const card of cards){let n=0;for(const action of Object.values(card?.system?.actions??{})){actions++;if(!english(action?.description))continue;before++;const fr=card?.system?.description;if(typeof fr!=="string"||!fr.trim())throw new Error(`Description FR absente: ${card?.name}`);action.description=fr;replaced++;n++;}if(n){const f=card?.flags?.["daggerheart-campaign-toolkit"];if(f){const p=Array.isArray(f.localizedPaths)?f.localizedPaths:[];if(!p.includes("system.actions.*.description"))f.localizedPaths=[...p,"system.actions.*.description"];}touched.push({id:card._id,name:card.name,actions:n});}}
const remaining=[];for(const card of cards)for(const action of Object.values(card?.system?.actions??{}))if(english(action?.description))remaining.push({card:card.name,action:action.name});
if(remaining.length){console.error(remaining);throw new Error(`${remaining.length} descriptions anglaises restantes`);}
fs.writeFileSync(FILE,JSON.stringify(cards,null,2)+"\\n","utf8");
console.table(touched);console.log({cards:cards.length,actions,englishBefore:before,replaced,englishRemaining:0});
