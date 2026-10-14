/** P3.4c.3 — Générateur de scénario de test à partir d'un export Foundry frais r16.
 * Usage: node tools/p34c3-make-test.mjs examples/P3.4b-transfer-test-drag-drop-r16.json
 * Aucune interaction avec Foundry. Ne modifie jamais le fichier source.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
const input=process.argv[2];
if (!input) {console.error('Usage: node tools/p34c3-make-test.mjs <export-r16.json>');process.exit(2);}
const source=resolve(input);
const data=JSON.parse(readFileSync(source,'utf8'));
function ensure(ok,msg){if(!ok)throw new Error('ABANDON (aucun fichier écrit) : '+msg);}
ensure(data.schema==='dhct.expedition-transfer@1','schéma inattendu');
ensure(data.expeditionId==='test-drag-drop','expédition inattendue');
ensure(data.revision===16,'révision attendue 16 : exporter de nouveau le monde APRÈS le premier import');
ensure(data.authority==='web' && ['prepared','returned'].includes(data.phase),'autorité/phase incompatibles');
ensure(data.metadata?.exampleOnly!==true,'fichier exemple interdit');
ensure(data.characters?.length===4,'quatre PJ attendus');
const ch=name=>{const x=data.characters.find(c=>c.name===name);ensure(x,`PJ ${name} introuvable`);return x;};
const test2=ch('test2'),porteur=ch('Porteur'),arti=ch('00arti');
ensure(test2.backpack.contents.length===1,'sac test2 différent du scénario de référence');
const clay=test2.backpack.contents[0];
ensure(clay.sourceId==='srd-2.0.consumable.core-15-morphing-clay' && clay.foundryItemUuid?.startsWith('Compendium.'),'référence argile absente');
ensure(!porteur.backpack.contents.some(x=>x.entryId==='p34c3-clay-porte-1'),'entrée de test déjà présente');
const newItem=structuredClone(clay);newItem.entryId='p34c3-clay-porte-1';newItem.quantity=1;
porteur.backpack.contents.push(newItem);
const chest=data.caravan?.containers?.find(c=>c.containerId==='caravan-cargo-05-chest');
ensure(chest?.contents?.length===1 && chest.contents[0].sourceId==='dhct.currency.handful','coffre différent du scénario de référence');
ensure(chest.contents[0].quantity===1,'quantité coffre attendue 1');
chest.contents[0].quantity=2;
const mats=arti.materialKnowledge?.materials;
ensure(mats?.['mh.vespoid.wing']?.discoveredProperties,'connaissance 00arti absente');
const props=mats['mh.vespoid.wing'].discoveredProperties;
ensure(!props.conductive,'propriété conductive déjà connue : scénario non applicable');
props.conductive={discoveredAt:Date.now(),source:{type:'gm-research-status'}};
const revelation=data.research?.revelations?.find(r=>r.researchId==='dhakaan');
ensure(revelation && revelation.status==='discovered','révélation dhakaan introuvable ou différente');
ensure(revelation.title==='test','titre révélation différent du scénario de référence');
revelation.title='test — validation P3.4c.3';
ensure(!revelation.grantedTags.includes('dhakaan.p34c3-verified'),'tag de test déjà présent');
revelation.grantedTags.push('dhakaan.p34c3-verified');
// Ne pas toucher à revision, phase, authority ni à la politique FOB.
// La révision d'import sera incrémentée par Foundry après vérification.
data.metadata={...data.metadata,exporter:'P3.4c.3-fixture-from-fresh-export',testScenario:'P3.4c.3',warnings:[...(data.metadata?.warnings??[]),'Fichier de test généré : ne jamais importer dans le monde principal.']};
const dest=join(dirname(source),`P3.4c3-test-${data.expeditionId}-r${data.revision}.json`);
ensure(dest!==source,'ne jamais écraser la source');
writeFileSync(dest,JSON.stringify(data,null,2)+'\n','utf8');
console.log('SCENARIO CRÉÉ :',dest);
console.table([
 {type:'backpack-add',target:'Porteur',detail:'Argile métamorphe x1'},
 {type:'caravan-quantity',target:'caravan-cargo-05-chest',detail:'Poignée de pièces x1 → x2'},
 {type:'knowledge-add',target:'00arti / mh.vespoid.wing',detail:'conductive'},
 {type:'revelation-update',target:'dhakaan',detail:'titre + tag dhakaan.p34c3-verified'}
]);
