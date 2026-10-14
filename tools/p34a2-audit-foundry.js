/* P3.4a.2 — audit lecture seule. À coller dans la console Foundry, connecté MJ.
 * Ne modifie aucun setting ni document. Produit un JSON de diagnostic, PAS un transfert importable.
 */
(async () => {
  "use strict";
  const MODULE = "daggerheart-campaign-toolkit";
  const EXPEDITION_ID = "test-drag-drop"; // À ADAPTER si nécessaire
  if (!game.user?.isGM) { console.error("P3.4a.2 : connexion MJ requise."); return; }
  const read = key => game.settings.get(MODULE, key);
  let manifests, material, narrative;
  try {
    manifests = read("expeditionManifests");
    material = read("materialKnowledge");
    narrative = read("researchKnowledge");
  } catch (error) { console.error("P3.4a.2 : setting indisponible", error); return; }
  const manifest = manifests?.[EXPEDITION_ID];
  if (!manifest) { console.error("P3.4a.2 : expédition introuvable", EXPEDITION_ID); return; }
  const characters = manifest.characters ?? [];
  const warnings = [];
  const uuids = new Set();
  const characterIds = new Set();
  const participants = [];
  for (const character of characters) {
    const characterId = character.characterId;
    const actorUuid = character.actorUuid ?? character.actorRef?.uuid ?? character.foundryActorUuid ?? null;
    // La structure du manifeste peut varier : on conserve la référence brute pour audit.
    const actor = actorUuid ? await fromUuid(actorUuid).catch(() => null) : null;
    if (!actorUuid || !actor) warnings.push(`Acteur non résolu : ${characterId} (${actorUuid ?? "aucun UUID"})`);
    if (actorUuid) uuids.add(actorUuid);
    characterIds.add(characterId);
    participants.push({
      characterId, name: character.name ?? actor?.name ?? null,
      actorUuid, actorResolved: !!actor,
      materialKnowledge: actorUuid ? (material?.actorKnowledge?.[actorUuid] ?? { materials: {} }) : null,
      materialKnowledgePresent: !!(actorUuid && Object.hasOwn(material?.actorKnowledge ?? {}, actorUuid))
    });
  }
  const allRevelations = narrative?.revelations ?? [];
  const revelations = allRevelations.filter(r =>
    (r.discoveredBy ?? []).some(id => uuids.has(id) || characterIds.has(id)) ||
    (r.sharedWith ?? []).some(id => uuids.has(id) || characterIds.has(id) || id === "party")
  );
  if (revelations.some(r => (r.sharedWith ?? []).includes("party")))
    warnings.push("Révélation partagée avec 'party' : portée mondiale, vérifier l'association à cette expédition.");
  if (Object.keys(material?.partyKnowledge?.materials ?? {}).length)
    warnings.push("Connaissances party globales : ne pas supposer qu'elles appartiennent exclusivement à cette expédition.");
  const cargoIds = new Set((manifest.caravan?.components ?? []).map(c => c.containerId).filter(Boolean));
  const backpacks = (manifest.containers ?? []).filter(c => c.type === "backpack");
  const cargo = (manifest.containers ?? []).filter(c => cargoIds.has(c.containerId));
  for (const id of cargoIds) if (!cargo.some(c => c.containerId === id)) warnings.push(`Cargo manquant : ${id}`);
  const report = {
    schema: "dhct.p34a2-readonly-audit@1", expeditionId: EXPEDITION_ID,
    manifestRevision: manifest.revision, phase: manifest.phase, authority: manifest.authority,
    sourceVersions: { manifest: manifest.schema, materialKnowledge: material?.schemaVersion, researchKnowledge: narrative?.schemaVersion },
    characters: participants,
    inventory: { backpacks, caravanStructure: manifest.caravan ?? null, caravanContainers: cargo },
    research: { partyMaterialKnowledge: material?.partyKnowledge ?? null, revelations,
      totalGlobalRevelations: allRevelations.length },
    exclusions: { ground: true, fobStock: true, fobBuildings: true, ledger: true, craftQueues: true },
    warnings
  };
  const json = JSON.stringify(report, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `P3.4a.2-audit-${EXPEDITION_ID}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  console.log("P3.4a.2 AUDIT READ-ONLY", {
    expeditionId: EXPEDITION_ID, revision: manifest.revision,
    characters: participants.length, backpacks: backpacks.length,
    cargo: cargo.length, revelations: revelations.length, warnings
  });
})();
