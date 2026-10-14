/* P3.4c.2 — IMPORT CONTRÔLÉ (copie du monde uniquement pour le premier essai).
 * Exécuter dans la console F12 en MJ. Pas de dépendance au runtime du Toolkit.
 * Préflight strict, backup téléchargeable, confirmation, écritures séquentielles,
 * rollback best effort. Ne garantit PAS une transaction atomique multi-client.
 */
(async () => {
  'use strict';
  const MODULE = 'daggerheart-campaign-toolkit';
  const EXPEDITION_ID = 'test-drag-drop'; // Modifier pour une autre expédition.
  const K = { manifests: 'expeditionManifests', material: 'materialKnowledge', research: 'researchKnowledge' };
  const deep = x => structuredClone(x);
  const json = x => JSON.stringify(x);
  const problems = [], warnings = [], changes = [];
  const fail = msg => problems.push(msg);
  const requireCondition = (condition, message) => { if (!condition) fail(message); };
  const download = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const pick = () => new Promise(resolve => {
    const input = document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    document.body.append(input); input.addEventListener('change', () => {const f=input.files?.[0]; input.remove(); resolve(f??null);},{once:true}); input.click();
  });
  if (!game.user?.isGM) return console.error('P3.4c.2 : compte MJ requis');
  if (window.__dhctP34c2Busy) return console.error('P3.4c.2 : import déjà en cours sur ce client');
  window.__dhctP34c2Busy = true;
  try {
    const file = await pick(); if (!file) return;
    let transfer;
    try {transfer=JSON.parse(await file.text());} catch(e) {return console.error('JSON invalide',e);}
    const snapshot = () => ({
      manifests: deep(game.settings.get(MODULE,K.manifests)),
      material: deep(game.settings.get(MODULE,K.material)),
      research: deep(game.settings.get(MODULE,K.research))
    });
    const before = snapshot();
    const manifest = before.manifests?.[EXPEDITION_ID];
    requireCondition(transfer?.schema === 'dhct.expedition-transfer@1','Schéma incorrect');
    requireCondition(transfer?.metadata?.exampleOnly !== true,'Fichier exemple interdit');
    requireCondition(transfer?.expeditionId === EXPEDITION_ID,'Expédition incorrecte');
    requireCondition(manifest && transfer?.revision === manifest.revision,'Révision obsolète ou expédition absente');
    requireCondition(manifest && transfer?.authority === manifest.authority && transfer?.authority === 'web','Autorité web requise');
    requireCondition(manifest && transfer?.phase === manifest.phase && ['prepared','returned'].includes(manifest.phase),'Phase incompatible');
    requireCondition(before.material?.schemaVersion === 1 && before.research?.schemaVersion === 3,'Registres incompatibles');
    const policy = {fobStock:'reset-on-import',groundInventory:'excluded',narrativeTopics:'web-only',characterSheets:'excluded',infusions:'excluded',weaponAugments:'excluded'};
    for (const [key,value] of Object.entries(policy)) requireCondition(transfer?.transferPolicy?.[key]===value,`Politique incorrecte ${key}`);
    const chars = transfer?.characters;
    requireCondition(Array.isArray(chars) && chars.length>0,'Personnages absents');
    const ids = new Set((chars??[]).map(c=>c.characterId));
    const localChars = manifest?.characters??[];
    requireCondition(ids.size===(chars??[]).length && ids.size===localChars.length && localChars.every(c=>ids.has(c.characterId)),'Composition des PJ incohérente');
    requireCondition(transfer?.research?.partyMaterialKnowledge?.scope==='party' && !Object.keys(transfer?.research?.partyMaterialKnowledge?.materials??{}).length,'Connaissances party non vides ou mal formées : import bloqué');
    const localContainers = new Map((manifest?.containers??[]).map(c=>[c.containerId,c]));
    const cargo = transfer?.caravan?.containers??[];
    const structure = transfer?.caravan?.structure;
    const linked = (structure?.components??[]).map(c=>c.containerId).filter(Boolean).sort();
    requireCondition(Array.isArray(cargo) && json(linked)===json(cargo.map(c=>c.containerId).sort()),'Conteneurs caravane incohérents');
    const incoming = [...(chars??[]).map(c=>c.backpack),...cargo];
    requireCondition(incoming.every(Boolean),'Sac manquant');
    requireCondition(new Set(incoming.map(c=>c?.containerId)).size===incoming.length,'Conteneur dupliqué');
    const nextManifest=deep(manifest??{}), nextMaterial=deep(before.material), nextResearch=deep(before.research);
    const targetContainers = new Map((nextManifest.containers??[]).map(c=>[c.containerId,c]));
    const actors = new Map();
    for (const c of chars??[]) {
      const local=localChars.find(l=>l.characterId===c.characterId);
      const uuid=local?.foundryActorUuid;
      requireCondition(!!uuid && uuid===c.foundryActorUuid,`Actor UUID incorrect ${c.characterId}`);
      if (uuid) requireCondition(!!(await fromUuid(uuid).catch(()=>null)),`Actor absent ${uuid}`);
      requireCondition(c.materialKnowledgeCoverage==='captured' && !!c.materialKnowledge?.materials,`Connaissances incomplètes ${c.characterId}`);
      requireCondition(c.backpack?.containerId === (manifest?.containers??[]).find(x=>x.holderRef?.id===c.characterId && x.type==='backpack')?.containerId,`Sac incompatible ${c.characterId}`);
      if (uuid) {
        actors.set(c.characterId,uuid);
        if (json(nextMaterial.actorKnowledge?.[uuid]??{materials:{}})!==json(c.materialKnowledge)) changes.push({type:'knowledge',characterId:c.characterId});
        nextMaterial.actorKnowledge ??= {};
        nextMaterial.actorKnowledge[uuid]=deep(c.materialKnowledge);
      }
    }
    // Résolution : entrée déjà existante de même sourceId, sinon compendium UUID contrôlé.
    // Aucun objet inventé à partir d'un simple display.
    for (const input of incoming) {
      const target=targetContainers.get(input.containerId);
      requireCondition(!!target,`Conteneur inexistant ${input.containerId}`);
      if (!target) continue;
      requireCondition(Array.isArray(input.contents),'Contents invalides '+input.containerId);
      const entries=[];
      const entryIds=new Set();
      for (const item of input.contents??[]) {
        requireCondition(!!item.entryId && !entryIds.has(item.entryId),`entryId invalide ${input.containerId}`); entryIds.add(item.entryId);
        requireCondition(!!item.sourceId && Number.isSafeInteger(item.quantity) && item.quantity>=1,`Objet invalide ${input.containerId}/${item.entryId}`);
        let ref=(target.contents??[]).find(e=>e.entryId===item.entryId && e.itemRef?.sourceId===item.sourceId)?.itemRef;
        if (!ref) {
          if (!item.foundryItemUuid?.startsWith('Compendium.')) {fail(`UUID compendium obligatoire pour nouvel objet ${item.sourceId}`);continue;}
          const doc=await fromUuid(item.foundryItemUuid).catch(()=>null);
          const actualId=doc?.getFlag?.(MODULE,'sourceId') ?? doc?.getFlag?.(MODULE,'canonicalSourceId');
          if (!doc || actualId!==item.sourceId) {fail(`Source introuvable/incohérente ${item.sourceId}`);continue;}
          const snap=doc.toObject();
          ref={kind:'foundry-item',uuid:doc.uuid,sourceId:item.sourceId,name:doc.name,type:doc.type,img:doc.img,snapshot:snap,lifecycle:{version:1,state:'active',revision:1}};
        }
        entries.push({entryId:item.entryId,itemRef:deep(ref),quantity:item.quantity});
      }
      if (json(target.contents)!==json(entries) || json(target.capacity)!==json(input.capacity) || json(target.storageProfile)!==json(input.storageProfile) || json(target.materialStorage??null)!==json(input.materialStorage??null)) changes.push({type:'container',containerId:input.containerId});
      target.contents=entries;
      target.capacity=deep(input.capacity);
      target.storageProfile=deep(input.storageProfile);
      if (input.materialStorage!==null && input.materialStorage!==undefined) target.materialStorage=deep(input.materialStorage);
      else delete target.materialStorage;
    }
    requireCondition(!!structure && Array.isArray(structure.components) && Array.isArray(structure.cargoSlots),'Structure caravane invalide');
    if (structure && json(nextManifest.caravan)!==json(structure)) changes.push({type:'caravan'});
    nextManifest.caravan=deep(structure);
    const fob=targetContainers.get('fob');
    requireCondition(!!fob,'Conteneur FOB introuvable');
    const fobCount=fob?.contents?.length??0;
    if (fobCount) changes.push({type:'fob-reset',entries:fobCount,destructive:true});
    if (fob) fob.contents=[];
    // Ne jamais supprimer les révélations globales absentes du transfert.
    const localRevelations=new Map((nextResearch.revelations??[]).map(r=>[r.id,r]));
    for (const r of transfer?.research?.revelations??[]) {
      requireCondition(!!r.id && Array.isArray(r.discoveredBy) && Array.isArray(r.sharedWith),'Révélation invalide');
      const beneficiaries=[...(r.discoveredBy??[]),...(r.sharedWith??[])];
      requireCondition(beneficiaries.every(id=>actors.has(id)),'Révélation avec bénéficiaire externe '+r.id);
      const convert=ids=>ids.map(id=>actors.get(id));
      const existing=localRevelations.get(r.id);
      if (existing) {
        // Protection des révélations globales partagées ou liées à d'autres PJ.
        const external=[...(existing.discoveredBy??[]),...(existing.sharedWith??[])].some(uuid=>uuid!=='party' && ![...actors.values()].includes(uuid));
        requireCondition(!external && !(existing.sharedWith??[]).includes('party'),`Révélation globale ambiguë ${r.id}`);
      }
      const updated={...deep(r),discoveredBy:convert(r.discoveredBy??[]),sharedWith:convert(r.sharedWith??[])};
      if (json(existing)!==json(updated)) changes.push({type:existing?'revelation-update':'revelation-add',id:r.id});
      localRevelations.set(r.id,updated);
    }
    nextResearch.revelations=[...localRevelations.values()];
    if (json(nextResearch.revelations)!==json(before.research.revelations)) nextResearch.revision=(nextResearch.revision??0)+1;
    nextManifest.revision=manifest?.revision+1;
    const afterManifests=deep(before.manifests); afterManifests[EXPEDITION_ID]=nextManifest;
    const report={schema:'dhct.p34c2-preflight@1',expeditionId:EXPEDITION_ID,file:file.name,errors:problems,warnings,changes,revisionBefore:manifest?.revision,revisionAfter:nextManifest.revision};
    console.group('P3.4c.2 PRÉFLIGHT — aucune écriture'); console.table(changes); console.table(problems.map(message=>({message}))); console.log(report); console.groupEnd();
    if (problems.length) {console.error('IMPORT BLOQUÉ — aucune écriture');return report;}
    // Backup complet des trois settings, y compris les données hors expédition.
    const backup={schema:'dhct.p34c2-backup@1',expeditionId:EXPEDITION_ID,createdAt:new Date().toISOString(),settings:before};
    download(backup,`P3.4c2-BACKUP-${EXPEDITION_ID}-r${manifest.revision}.json`);
    warnings.push('Vérifier que le backup a bien été téléchargé AVANT de confirmer.');
    const phrase=`IMPORT ${EXPEDITION_ID} R${manifest.revision}`;
    const answer=window.prompt(`SAUVEGARDE TÉLÉCHARGÉE ? Vérifie sa présence.\n${changes.length} changements, dont ${fobCount} entrée(s) FOB supprimée(s).\nSur une COPIE DU MONDE, saisir exactement :\n${phrase}`);
    if (answer!==phrase) {console.warn('Import annulé, aucune écriture');return report;}
    // Recheck juste avant application : fail closed sur toute modification concurrente visible.
    if (json(snapshot())!==json(before)) {console.error('Import annulé : état Foundry modifié depuis le préflight');return report;}
    const completed=[];
    try {
      await game.settings.set(MODULE,K.material,nextMaterial); completed.push(K.material);
      await game.settings.set(MODULE,K.research,nextResearch); completed.push(K.research);
      await game.settings.set(MODULE,K.manifests,afterManifests); completed.push(K.manifests);
      const check=snapshot();
      if (json(check.manifests)!==json(afterManifests) || json(check.material)!==json(nextMaterial) || json(check.research)!==json(nextResearch)) throw new Error('Vérification post-écriture incorrecte');
      console.info('P3.4c.2 IMPORT APPLIQUÉ ET VÉRIFIÉ', {revision:nextManifest.revision,changes});
      return {...report,applied:true,verified:true};
    } catch(e) {
      console.error('ÉCHEC IMPORT — rollback best effort en cours',e);
      const failures=[];
      for (const [key,data] of [[K.manifests,before.manifests],[K.research,before.research],[K.material,before.material]]) {
        if (!completed.includes(key)) continue;
        try {await game.settings.set(MODULE,key,data);} catch(err){failures.push(`${key}: ${err.message}`);}
      }
      console.error('Rollback terminé ; contrôler le monde et conserver le backup', {failures});
      return {...report,applied:false,rollbackFailures:failures,error:String(e)};
    }
  } catch(e) {console.error('P3.4c.2 erreur inattendue (vérifier les données avant nouvelle tentative)',e);}
  finally {window.__dhctP34c2Busy=false;}
})();
