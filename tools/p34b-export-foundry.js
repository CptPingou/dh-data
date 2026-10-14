/* P3.4b — Exporteur Foundry en lecture seule, à coller dans F12 (MJ).
 * Produit dhct.expedition-transfer@1. Ne modifie AUCUN setting/document.
 * Si les données sont ambiguës, aucun JSON n'est téléchargé.
 */
(async () => {
  'use strict';
  const MODULE = 'daggerheart-campaign-toolkit';
  const EXPEDITION_ID = 'test-drag-drop'; // Modifier pour une autre expédition.
  const FAIL_ON_GLOBAL_PARTY_KNOWLEDGE = true;
  const errors = [], warnings = [];
  const fail = message => errors.push(message);
  const clone = value => JSON.parse(JSON.stringify(value));
  if (!game.user?.isGM) { console.error('P3.4b : accès MJ requis'); return; }
  let manifests, material, narrative;
  try {
    manifests = game.settings.get(MODULE, 'expeditionManifests');
    material = game.settings.get(MODULE, 'materialKnowledge');
    narrative = game.settings.get(MODULE, 'researchKnowledge');
  } catch (error) { console.error('P3.4b : lecture des settings impossible', error); return; }
  const manifest = manifests?.[EXPEDITION_ID];
  if (!manifest) { console.error('P3.4b : expédition introuvable', EXPEDITION_ID); return; }
  if (manifest.schema !== 'daggerheart-campaign-toolkit/expedition-manifest@2') fail('Version de manifeste non prise en charge');
  if (material?.schemaVersion !== 1) fail('Version materialKnowledge non prise en charge');
  if (narrative?.schemaVersion !== 3) fail('Version researchKnowledge non prise en charge');
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) fail('Révision de manifeste invalide');
  if (!['web', 'foundry'].includes(manifest.authority)) fail('Autorité invalide');
  if (!['prepared', 'in_session', 'returned'].includes(manifest.phase)) fail('Phase invalide');
  const chars = manifest.characters ?? [];
  const containers = manifest.containers ?? [];
  const byContainerId = new Map();
  for (const c of containers) {
    if (byContainerId.has(c.containerId)) fail(`Conteneur dupliqué : ${c.containerId}`);
    byContainerId.set(c.containerId, c);
  }
  function portableContainer(c) {
    if (!c) return null;
    return {
      containerId: c.containerId,
      capacity: clone(c.capacity ?? null),
      storageProfile: clone(c.storageProfile ?? null),
      materialStorage: clone(c.materialStorage ?? null),
      contents: (c.contents ?? []).map(entry => {
        const sourceId = entry.itemRef?.sourceId;
        if (!sourceId) fail(`Item sans sourceId dans ${c.containerId} : ${entry.entryId ?? '?'}`);
        if (!Number.isInteger(entry.quantity) || entry.quantity < 1) fail(`Quantité invalide dans ${c.containerId} : ${entry.entryId ?? '?'}`);
        const item = { entryId: entry.entryId, sourceId: sourceId ?? '', quantity: entry.quantity };
        const ref = entry.itemRef ?? {};
        if (ref.uuid) item.foundryItemUuid = ref.uuid;
        const display = {};
        for (const key of ['name', 'img', 'type']) if (typeof ref[key] === 'string') display[key] = ref[key];
        if (Object.keys(display).length) item.display = display;
        return item;
      })
    };
  }
  const uuidToId = new Map(), idSet = new Set();
  const characters = [];
  for (const c of chars) {
    const id = c.characterId;
    const uuid = c.actorUuid ?? c.actorRef?.uuid ?? c.foundryActorUuid;
    if (!id || !uuid) { fail(`Identifiant PJ manquant : ${c.name ?? '?'}`); continue; }
    if (idSet.has(id) || uuidToId.has(uuid)) fail(`PJ dupliqué : ${id}`);
    idSet.add(id); uuidToId.set(uuid, id);
    const actor = await fromUuid(uuid).catch(() => null);
    if (!actor) fail(`Acteur introuvable : ${uuid}`);
    const backpacks = containers.filter(x => x.type === 'backpack' && x.holderRef?.id === id);
    if (backpacks.length !== 1) { fail(`Sac à dos absent/ambigu pour ${id} (${backpacks.length})`); continue; }
    const knowledge = material?.actorKnowledge?.[uuid];
    if (knowledge && (typeof knowledge !== 'object' || !knowledge.materials)) fail(`Connaissance PJ mal formée : ${id}`);
    characters.push({ characterId: id, name: c.name ?? actor?.name ?? '', foundryActorUuid: uuid,
      backpack: portableContainer(backpacks[0]),
      materialKnowledge: clone(knowledge ?? { materials: {} }), materialKnowledgeCoverage: 'captured' });
  }
  const structure = manifest.caravan;
  if (!structure || !Array.isArray(structure.components) || !Array.isArray(structure.cargoSlots)) fail('Structure caravane absente');
  const cargoIds = (structure?.components ?? []).map(c => c.containerId).filter(Boolean);
  if (new Set(cargoIds).size !== cargoIds.length) fail('Un conteneur cargo est lié plusieurs fois');
  const cargo = cargoIds.map(id => {
    const c = byContainerId.get(id);
    if (!c) { fail(`Conteneur cargo introuvable : ${id}`); return null; }
    return portableContainer(c);
  }).filter(Boolean);
  // Les connaissances party sont globales au monde : un contenu réellement documenté
  // ne peut pas être attribué à cette expédition sans décision explicite.
  const party = material?.partyKnowledge ?? { scope: 'party', materials: {} };
  const documented = Object.entries(party.materials ?? {}).filter(([, m]) => Object.keys(m?.documentedProperties ?? {}).length > 0);
  if (documented.length && FAIL_ON_GLOBAL_PARTY_KNOWLEDGE)
    fail(`Connaissances party globales non attribuables (${documented.length} matériaux documentés). Export bloqué.`);
  // Les entrées vides n'apportent aucune connaissance : on ne les transfère pas.
  const portableParty = { scope: 'party', materials: {} };
  if (documented.length === 0 && Object.keys(party.materials ?? {}).length)
    warnings.push('Connaissances party globales vides omises du transfert.');
  const revelations = [];
  for (const r of narrative?.revelations ?? []) {
    const rawRecipients = [...(r.discoveredBy ?? []), ...(r.sharedWith ?? [])];
    const touchesExpedition = rawRecipients.some(ref => idSet.has(ref) || uuidToId.has(ref));
    if (!touchesExpedition && !rawRecipients.includes('party')) continue;
    if (rawRecipients.includes('party')) {
      fail(`Révélation partagée globalement avec party, portée ambiguë : ${r.id}`);
      continue;
    }
    // Si une révélation concerne aussi un acteur extérieur, ne pas tronquer silencieusement.
    for (const ref of rawRecipients) if (!idSet.has(ref) && !uuidToId.has(ref))
      fail(`Révélation ${r.id} : destinataire externe/inconnu ${ref}`);
    const resolve = refs => [...new Set((refs ?? []).map(ref => uuidToId.get(ref) ?? ref))];
    revelations.push({ id: r.id, researchId: r.researchId, title: r.title, status: r.status,
      discoveredBy: resolve(r.discoveredBy), sharedWith: resolve(r.sharedWith),
      archived: !!r.archived, grantedTags: clone(r.grantedTags ?? []),
      unlocks: clone(r.unlocks ?? []), export: clone(r.export ?? { enabled: false, target: 'none' }) });
  }
  const transfer = {
    schema: 'dhct.expedition-transfer@1', expeditionId: manifest.expeditionId,
    revision: manifest.revision, authority: manifest.authority, phase: manifest.phase,
    characters, caravan: { structure: clone(structure ?? {}), containers: cargo },
    research: { partyMaterialKnowledge: portableParty, revelations },
    transferPolicy: { fobStock: 'reset-on-import', groundInventory: 'excluded', narrativeTopics: 'web-only',
      characterSheets: 'excluded', infusions: 'excluded', weaponAugments: 'excluded' },
    metadata: { exportedAt: new Date().toISOString(), source: 'foundry', exporter: 'P3.4b-readonly-v1',
      sourceVersions: { manifest: manifest.schema, materialKnowledge: material?.schemaVersion,
        researchKnowledge: narrative?.schemaVersion }, warnings }
  };
  if (errors.length) {
    console.error('P3.4b EXPORT BLOQUÉ — aucune donnée modifiée', errors);
    return;
  }
  const json = JSON.stringify(transfer, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `P3.4b-transfer-${EXPEDITION_ID}-r${manifest.revision}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  console.log('P3.4b EXPORT LECTURE SEULE — valider ensuite avec tools/validate_transfer.py',
    { expeditionId: EXPEDITION_ID, revision: manifest.revision, characters: characters.length,
      cargo: cargo.length, revelations: revelations.length, warnings });
})();
