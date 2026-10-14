/* P3.4c.1 — DRY RUN UNIQUEMENT. Coller dans la console F12, connecté MJ.
 * Aucun game.settings.set, update, create ou delete.
 */
(async () => {
  'use strict';
  const MODULE = 'daggerheart-campaign-toolkit';
  const EXPECTED_EXPEDITION = 'test-drag-drop'; // À adapter si nécessaire.
  if (!game.user?.isGM) { console.error('P3.4c: MJ requis'); return; }
  const pickFile = () => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.style.display = 'none'; document.body.append(input);
    input.addEventListener('change', () => { const f = input.files?.[0]; input.remove(); resolve(f ?? null); }, {once:true});
    input.click();
  });
  const file = await pickFile();
  if (!file) { console.warn('P3.4c: aucun fichier sélectionné'); return; }
  let transfer;
  try { transfer = JSON.parse(await file.text()); }
  catch (e) { console.error('P3.4c: JSON illisible', e); return; }
  const errors = [], warnings = [], changes = [], resolutions = [];
  const error = m => errors.push(m);
  const warn = m => warnings.push(m);
  const key = x => JSON.stringify(x);
  const byId = arr => new Map((arr ?? []).map(x => [x.containerId, x]));
  if (transfer?.schema !== 'dhct.expedition-transfer@1') error('Schéma de transfert incorrect');
  if (transfer?.metadata?.exampleOnly) error('Fichier exemple interdit');
  if (transfer?.expeditionId !== EXPECTED_EXPEDITION) error('Expédition inattendue');
  const policy = transfer?.transferPolicy ?? {};
  for (const [k,v] of Object.entries({fobStock:'reset-on-import',groundInventory:'excluded',narrativeTopics:'web-only',characterSheets:'excluded',infusions:'excluded',weaponAugments:'excluded'}))
    if (policy[k] !== v) error(`Politique incompatible ${k}`);
  let manifests, material, narrative;
  try {
    manifests = game.settings.get(MODULE, 'expeditionManifests');
    material = game.settings.get(MODULE, 'materialKnowledge');
    narrative = game.settings.get(MODULE, 'researchKnowledge');
  } catch (e) { console.error('P3.4c: settings indisponibles',e); return; }
  const current = manifests?.[EXPECTED_EXPEDITION];
  if (!current) error('Expédition absente du monde');
  if (current && transfer?.revision !== current.revision) error(`Révision différente : fichier ${transfer?.revision}, Foundry ${current.revision}`);
  if (current && transfer?.authority !== current.authority) error(`Autorité différente : fichier ${transfer?.authority}, Foundry ${current.authority}`);
  if (current && transfer?.phase !== current.phase) error(`Phase différente : fichier ${transfer?.phase}, Foundry ${current.phase}`);
  if (transfer?.authority !== 'web') error('Import depuis une autorité web requis');
  if (transfer?.phase === 'in_session') error('Import interdit en session');
  if (material?.schemaVersion !== 1 || narrative?.schemaVersion !== 3) error('Version de registre de connaissances inconnue');
  const chars = transfer?.characters ?? [];
  if (!Array.isArray(chars) || !chars.length) error('Personnages manquants');
  const localChars = current?.characters ?? [];
  const localIds = new Set(localChars.map(x => x.characterId));
  const inputIds = new Set(chars.map(x => x.characterId));
  if (inputIds.size !== chars.length || inputIds.size !== localIds.size || [...localIds].some(id=>!inputIds.has(id))) error('Composition des PJ différente');
  const currentContainers = byId(current?.containers);
  const incomingContainers = [];
  const actorToCharacter = new Map();
  for (const c of chars) {
    const local = localChars.find(x=>x.characterId===c.characterId);
    const uuid = local?.actorUuid ?? local?.actorRef?.uuid ?? local?.foundryActorUuid;
    if (!uuid || uuid !== c.foundryActorUuid) error(`Actor UUID incohérent pour ${c.characterId}`);
    else {
      const actor = await fromUuid(uuid).catch(()=>null);
      if (!actor) error(`Actor introuvable ${uuid}`);
      actorToCharacter.set(c.characterId, uuid);
    }
    if (c.materialKnowledgeCoverage !== 'captured') error(`Connaissances incomplètes : ${c.characterId}`);
    if (!c.backpack?.containerId) error(`Sac absent : ${c.characterId}`);
    else incomingContainers.push(c.backpack);
    const currentK = material?.actorKnowledge?.[uuid] ?? {materials:{}};
    if (key(currentK) !== key(c.materialKnowledge)) changes.push({type:'materialKnowledge',characterId:c.characterId,beforeMaterials:Object.keys(currentK.materials??{}).length,afterMaterials:Object.keys(c.materialKnowledge?.materials??{}).length});
  }
  const structure = transfer?.caravan?.structure;
  const components = structure?.components ?? [];
  const cargoIds = components.map(c=>c.containerId).filter(Boolean);
  const cargo = transfer?.caravan?.containers ?? [];
  if (new Set(cargoIds).size !== cargoIds.length || key([...cargoIds].sort()) !== key(cargo.map(x=>x.containerId).sort())) error('Liaisons caravane incohérentes');
  if (key(current?.caravan) !== key(structure)) changes.push({type:'caravanStructure',componentsBefore:current?.caravan?.components?.length??0,componentsAfter:components.length});
  incomingContainers.push(...cargo);
  const incomingContainerIds = new Set(incomingContainers.map(x=>x.containerId));
  if (incomingContainerIds.size !== incomingContainers.length) error('Conteneur dupliqué');
  for (const c of incomingContainers) {
    const old = currentContainers.get(c.containerId);
    if (!old) { error(`Conteneur cible absent : ${c.containerId}`); continue; }
    const oldEntries = (old.contents??[]).map(x=>({entryId:x.entryId,sourceId:x.itemRef?.sourceId,quantity:x.quantity}));
    const newEntries = c.contents ?? [];
    if (!Array.isArray(newEntries)) { error(`Contenu invalide ${c.containerId}`); continue; }
    if (new Set(newEntries.map(x=>x.entryId)).size!==newEntries.length) error(`entryId dupliqué : ${c.containerId}`);
    for (const entry of newEntries) {
      if (!entry.sourceId || !Number.isInteger(entry.quantity) || entry.quantity<1) error(`Objet/quantité invalide : ${c.containerId}/${entry.entryId}`);
      const same = (old.contents??[]).find(x=>x.entryId===entry.entryId && x.itemRef?.sourceId===entry.sourceId);
      if (!same) resolutions.push({containerId:c.containerId,entryId:entry.entryId,sourceId:entry.sourceId,foundryItemUuid:entry.foundryItemUuid??null,status:'UNRESOLVED — lookup obligatoire avant application'});
    }
    if (key(oldEntries)!==key(newEntries.map(x=>({entryId:x.entryId,sourceId:x.sourceId,quantity:x.quantity}))) || key(old.capacity)!==key(c.capacity) || key(old.storageProfile)!==key(c.storageProfile) || key(old.materialStorage??null)!==key(c.materialStorage??null))
      changes.push({type:'container',containerId:c.containerId,entriesBefore:oldEntries.length,entriesAfter:newEntries.length});
  }
  const localFob = currentContainers.get('fob');
  const fobCount = localFob?.contents?.length ?? 0;
  changes.push({type:'fobResetOnApply',containerId:'fob',entriesToRemove:fobCount,destructive:fobCount>0});
  const partyMaterials = transfer?.research?.partyMaterialKnowledge?.materials ?? {};
  if (Object.keys(partyMaterials).length) error('Connaissances party non vides : portée non résolue');
  const revelations = transfer?.research?.revelations ?? [];
  const revIds = new Set();
  for (const r of revelations) {
    if (revIds.has(r.id)) error(`Révélation dupliquée ${r.id}`);
    revIds.add(r.id);
    for (const ref of [...(r.discoveredBy??[]),...(r.sharedWith??[])]) if (!inputIds.has(ref)) error(`Bénéficiaire externe ${r.id}/${ref}`);
    const existing = (narrative?.revelations??[]).find(x=>x.id===r.id);
    if (existing) {
      const norm = refs => (refs??[]).map(ref=>[...actorToCharacter.entries()].find(([,uuid])=>uuid===ref)?.[0]??ref).sort();
      if (key(norm(existing.discoveredBy))!==key([...(r.discoveredBy??[])].sort()) || key(norm(existing.sharedWith))!==key([...(r.sharedWith??[])].sort()) || key(existing.grantedTags??[])!==key(r.grantedTags??[]) || key(existing.unlocks??[])!==key(r.unlocks??[])) changes.push({type:'revelationUpdate',id:r.id});
    } else changes.push({type:'revelationAdd',id:r.id});
  }
  // Une révélation globale extérieure ne doit jamais être effacée par une importation ciblée.
  warn('Révélations hors expédition préservées ; suppression non déduite de leur absence.');
  warn('Validation JSON Schema complète à exécuter séparément avec tools/validate_transfer.py.');
  warn('Résolution sourceId, transaction, sauvegarde et verrouillage d’autorité non implémentés : application interdite.');
  const report = {schema:'dhct.p34c-dry-run-report@1',expeditionId:EXPECTED_EXPEDITION,fileName:file.name,importAllowed:false,errors,warnings,changes,resolutions,counts:{characters:chars.length,containers:incomingContainers.length,revelations:revelations.length,fobEntriesToReset:fobCount}};
  console.group(`P3.4c DRY RUN — ${errors.length?'BLOCKED':'PREVIEW ONLY'} — AUCUNE ÉCRITURE`);
  console.table(changes); console.table(resolutions); console.table(errors.map(message=>({message})));
  console.log(report); console.groupEnd();
  // Rapport accessible pour copier depuis la console; aucune mutation Foundry.
  return report;
})();
