/** P2.11d.3f — World-authoritative Infusions; recipient-scoped lifecycle. */
const SCOPE = "daggerheart-campaign-toolkit";
const WORLD_KEY = "activeInfusions";
const OLD_FLAG = "artificerInfusions";
const CLASS_ID = "homebrew.artificer.class.artificer";
const FEATURE_ID = "homebrew.artificer.class.artificer.feature.infusions-d-artificier";
const CAPACITY = [[9, 10], [7, 8], [5, 6], [3, 4], [1, 2]];
const TYPES = new Set(["weapon", "armor", "item", "equipment", "consumable", "loot"]);
const clone = value => foundry.utils.deepClone(value);

export function registerWorldInfusionsSetting() {
  if (game.settings.settings.has(`${SCOPE}.${WORLD_KEY}`)) return;
  game.settings.register(SCOPE, WORLD_KEY, {
    name: "Infusions actives du monde", scope: "world", config: false,
    type: Object, default: { version: 3, entries: [], creatorSlots: {}, preventionUsed: [], sessionIndex: 1, nextOrder: 1, lastIncident: null, processedIncidentKeys: [], processedRestMessageIds: [], migratedActors: [] },
    restricted: false,
  });
}
function assertWorld() {
  if (!game.settings.settings.has(`${SCOPE}.${WORLD_KEY}`)) {
    throw new Error("Setting activeInfusions absent : redémarrer Foundry après déploiement du Toolkit.");
  }
}
function gm() { if (!game.user?.isGM) throw new Error("Modification du registre mondial réservée au MJ."); }
function actorByUuid(uuid) {
  if (typeof uuid !== "string" || !/^Actor\.[^.]+$/.test(uuid)) return null;
  return game.actors?.get?.(uuid.slice(6)) ?? null;
}
function assertActor(a) {
  if (!a || !/^Actor\.[^.]+$/.test(a.uuid ?? "")) throw new Error("Personnage permanent du répertoire Actors requis.");
}
function itemById(actor, id) { return actor?.items?.get?.(id) ?? actor?.items?.find?.(i => i.id === id) ?? null; }
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const entries = Array.isArray(r.entries) ? r.entries.filter(e => e?.id && e?.targetActorUuid && e?.itemId) : [];
  const creatorSlots = r.creatorSlots && typeof r.creatorSlots === "object" ? clone(r.creatorSlots) : {};
  return { version: 3, entries: clone(entries), creatorSlots,
    preventionUsed: Array.isArray(r.preventionUsed) ? [...new Set(r.preventionUsed)] : [],
    sessionIndex: Number.isInteger(r.sessionIndex) && r.sessionIndex > 0 ? r.sessionIndex : 1,
    nextOrder: Math.max(1, Number(r.nextOrder) || 1, ...entries.map(e => (Number(e.order) || 0) + 1)),
    lastIncident: r.lastIncident ? clone(r.lastIncident) : null,
    processedIncidentKeys: Array.isArray(r.processedIncidentKeys) ? [...new Set(r.processedIncidentKeys.filter(k => typeof k === "string" && k.length > 0))] : [],
    processedRestMessageIds: Array.isArray(r.processedRestMessageIds) ? [...new Set(r.processedRestMessageIds.filter(k => typeof k === "string" && k.length > 0))] : [],
    migratedActors: Array.isArray(r.migratedActors) ? [...new Set(r.migratedActors)] : [] };
}
function read() { assertWorld(); return normalize(game.settings.get(SCOPE, WORLD_KEY)); }
async function write(state) { gm(); await game.settings.set(SCOPE, WORLD_KEY, normalize(state)); }
export function infusionCapacity(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("Niveau entier de 1 à 10 requis.");
  return CAPACITY.find(([lv]) => n >= lv)[1];
}
function levelOf(a) {
  const n = [a.system?.levelData?.level?.current, a.system?.level?.current, a.system?.level].map(Number).find(x => Number.isInteger(x) && x >= 1 && x <= 10);
  if (n === undefined) throw new Error("Niveau de l'Artificier introuvable.");
  return n;
}
function creatorKey(actorOrKey) { return typeof actorOrKey === "string" ? actorOrKey : actorOrKey?.uuid; }
function assertCreator(a) {
  assertActor(a);
  if (!a.items?.some?.(i => [CLASS_ID, FEATURE_ID].includes(i.flags?.[SCOPE]?.sourceId))) {
    throw new Error("La source doit posséder la classe/feature Artificier du Toolkit lors de la création.");
  }
}
function decorate(e) {
  const target = actorByUuid(e.targetActorUuid), item = itemById(target, e.itemId);
  return { ...e, targetActorExists: !!target, currentActorName: target?.name ?? null,
    itemExists: !!item, currentItemName: item?.name ?? null };
}
function status(creator = null) {
  const r = read(), key = creatorKey(creator);
  const entries = (key ? r.entries.filter(e => e.creatorKey === key) : r.entries).map(decorate);
  const capacity = key ? (r.creatorSlots[key]?.capacity ?? null) : null;
  return { storage: "world", capacity, used: entries.length,
    available: capacity == null ? null : Math.max(0, capacity - entries.length),
    entries, nextOrder: r.nextOrder, preventionUsed: r.preventionUsed,
    sessionIndex: r.sessionIndex, lastIncident: r.lastIncident };
}
function eligibleItems(target) { assertActor(target); return (target.items?.filter?.(i => TYPES.has(i.type)) ?? []).map(i => ({
  id: i.id, name: i.name, type: i.type, targetActorUuid: target.uuid,
})); }
function chooseTarget(creator, targetOrId, itemId) {
  const target = itemId === undefined ? creator : typeof targetOrId === "string" ? actorByUuid(targetOrId) : targetOrId;
  const id = itemId === undefined ? targetOrId : itemId;
  assertActor(target);
  const item = itemById(target, id);
  if (!item || !TYPES.has(item.type)) throw new Error("Équipement cible absent ou type non admissible.");
  return { target, item };
}
/** GM creation with NO Artificer Actor: virtual source key + explicit level. */
async function addWorld({ creatorKey: key, creatorName = "Artificier (hors session)", sourceLevel,
  targetActorUuid, itemId } = {}) {
  gm();
  if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("creatorKey stable requis (ex. artificer:giovanni).");
  const capacity = infusionCapacity(sourceLevel), target = actorByUuid(targetActorUuid);
  assertActor(target);
  const item = itemById(target, itemId);
  if (!item || !TYPES.has(item.type)) throw new Error("Équipement cible absent ou type non admissible.");
  const r = read(), used = r.entries.filter(e => e.creatorKey === key).length;
  if (used >= capacity) throw new Error(`Capacité d'Infusions atteinte (${capacity}).`);
  if (r.entries.some(e => e.targetActorUuid === target.uuid && e.itemId === item.id)) {
    throw new Error("Cet équipement porte déjà une infusion active dans le registre mondial.");
  }
  r.creatorSlots[key] = { capacity, sourceName: String(creatorName), lastKnownLevel: Number(sourceLevel) };
  r.entries.push({ id: foundry.utils.randomID(), creatorKey:key, creatorName: String(creatorName),
    sourceLevel: Number(sourceLevel), targetActorUuid:target.uuid, itemId:item.id, itemName:item.name,
    order:r.nextOrder++, createdAt:Date.now(), effect:null });
  await write(r); return status(key);
}
async function add(creator, targetOrId, itemId) {
  assertCreator(creator);
  const { target, item } = chooseTarget(creator, targetOrId, itemId);
  return addWorld({ creatorKey: creator.uuid, creatorName: creator.name, sourceLevel: levelOf(creator),
    targetActorUuid: target.uuid, itemId:item.id });
}

async function remove(_creatorOrId, maybeId) {
  gm(); const id = maybeId ?? _creatorOrId;
  const r = read(), initial = r.entries.length;
  r.entries = r.entries.filter(e => e.id !== id);
  if (r.entries.length === initial) throw new Error("Infusion inconnue.");
  await write(r); return status();
}
function newest(creator = null) { return status(creator).entries.sort((a,b) => b.order-a.order)[0] ?? null; }
function recipientUuid(value) { return typeof value === "string" ? value : value?.uuid; }
function newestForRecipient(first, second) {
  const recipient = second === undefined ? first : second; // 3c signature accepted; creator no longer used.
  const uuid = recipientUuid(recipient);
  if (!/^Actor\.[^.]+$/.test(uuid ?? "")) throw new Error("UUID du porteur requis.");
  return read().entries.filter(e => e.targetActorUuid === uuid).sort((a,b) => b.order-a.order)[0] ?? null;
}
async function resolveCriticalDamage(first, second, third) {
  gm();
  // Current: (recipient, options); legacy: (artificer, recipient, options).
  const recipient = third === undefined ? first : second;
  const opts = third === undefined ? second : third;
  const { confirmedCriticalDamage = false, dieResult = null, prevent = false, confirmedHopeSpent = false, incidentKey = null } = opts ?? {};
  if (!confirmedCriticalDamage) throw new Error("Confirmer des dégâts provenant d'une réussite critique.");
  const uuid = recipientUuid(recipient), target = actorByUuid(uuid);
  if (!target) throw new Error("Personnage porteur introuvable dans le répertoire Actors.");
  if (!Number.isInteger(dieResult) || dieResult < 1 || dieResult > 6) throw new Error("Résultat réel de 1d6 (1..6) requis.");
  if (incidentKey !== null && (typeof incidentKey !== "string" || !incidentKey.trim() || incidentKey.length > 128)) {
    throw new Error("incidentKey doit être une chaîne non vide (max 128 caractères).");
  }
  const r = read();
  const dedupeKey = incidentKey === null ? null : `${r.sessionIndex}:${uuid}:${incidentKey}`;
  if (dedupeKey && r.processedIncidentKeys.includes(dedupeKey)) {
    throw new Error("Cet incident critique a déjà été traité dans cette session.");
  }
  const recent = r.entries.filter(e => e.targetActorUuid === uuid).sort((a,b) => b.order-a.order)[0];
  if (!recent) throw new Error("Ce personnage ne porte aucune infusion active.");
  if (prevent && !confirmedHopeSpent) throw new Error("Confirmer la dépense de 1 Espoir sur la fiche du porteur.");
  if (!prevent && confirmedHopeSpent) throw new Error("confirmedHopeSpent nécessite prevent:true.");
  if (prevent && r.preventionUsed.includes(uuid)) throw new Error("Prévention déjà utilisée par ce porteur pendant la session.");
  let consequence;
  if (prevent) { r.preventionUsed.push(uuid); consequence = "prevented"; }
  else if (dieResult === 1) { r.entries = r.entries.filter(e => e.id !== recent.id); consequence = "infusion-lost"; }
  else if (dieResult === 2) consequence = "mark-1-hp-manually";
  else if (dieResult === 3) consequence = "mark-1-stress-manually";
  else consequence = "none";
  const result = { recipientUuid: uuid, recipientName: target.name, infusionId: recent.id,
    itemId: recent.itemId, itemName: recent.itemName, dieResult, consequence, sessionIndex: r.sessionIndex,
    incidentKey,
    manualSheetChangeRequired: consequence === "mark-1-hp-manually" || consequence === "mark-1-stress-manually" };
  r.lastIncident = result;
  if (dedupeKey) r.processedIncidentKeys.push(dedupeKey);
  await write(r);
  return { ...result, status: status() };
}
async function clearAtLongRest(creatorOrOptions = {}, options = {}) {
  gm();
  const opts = creatorOrOptions && typeof creatorOrOptions === "object" && "confirmed" in creatorOrOptions ? creatorOrOptions : options;
  if (!opts.confirmed) throw new Error("Repos long explicitement confirmé : {confirmed:true}.");
  const r = read(), key = creatorOrOptions && typeof creatorOrOptions === "object" && "confirmed" in creatorOrOptions ? null : creatorKey(creatorOrOptions);
  // With no creator, expire all world infusions at the table's confirmed long rest.
  r.entries = key ? r.entries.filter(e => e.creatorKey !== key) : [];
  await write(r); return status();
}
/** Repos long du porteur : seules SES infusions expirent, tous fabricants confondus.
 * Le repos long collectif reste disponible via clearAtLongRest({confirmed:true}).
 */
async function clearForRecipientAtLongRest(recipient, { confirmed = false } = {}) {
  gm();
  if (!confirmed) throw new Error("Repos long du porteur explicitement confirmé : {confirmed:true}.");
  const uuid = recipientUuid(recipient);
  const target = actorByUuid(uuid);
  if (!target) throw new Error("Personnage porteur permanent introuvable.");
  const r = read(), expired = r.entries.filter(e => e.targetActorUuid === uuid);
  r.entries = r.entries.filter(e => e.targetActorUuid !== uuid);
  await write(r);
  return { recipientUuid: uuid, recipientName: target.name, expiredIds: expired.map(e => e.id), expiredCount: expired.length, status: status() };
}
/** P2.11d.3f: one persisted world mutation per committed native long-rest chat card.
 * Called only by the strict Foundryborne chat bridge; never from dialogue opening.
 * A duplicate message is idempotent even if the first rest removed zero entries.
 */
export async function expireForNativeLongRest({ messageId, recipientUuid: uuid } = {}) {
  gm();
  if (typeof messageId !== "string" || !/^[A-Za-z0-9]{16}$/.test(messageId)) {
    throw new Error("ID de ChatMessage natif valide requis.");
  }
  const target = actorByUuid(uuid);
  if (!target) throw new Error("Porteur permanent introuvable pour le repos natif.");
  const r = read();
  if (r.processedRestMessageIds.includes(messageId)) {
    return { handled: false, duplicate: true, messageId, recipientUuid: uuid, expiredCount: 0 };
  }
  const expired = r.entries.filter(e => e.targetActorUuid === uuid);
  r.entries = r.entries.filter(e => e.targetActorUuid !== uuid);
  r.processedRestMessageIds.push(messageId);
  await write(r);
  return { handled: true, duplicate: false, messageId, recipientUuid: uuid,
    recipientName: target.name, expiredCount: expired.length, expiredIds: expired.map(e => e.id) };
}

async function startNewSession(_creatorOrOptions = {}, options = {}) {
  gm();
  const opts = _creatorOrOptions && typeof _creatorOrOptions === "object" && "confirmed" in _creatorOrOptions ? _creatorOrOptions : options;
  if (!opts.confirmed) throw new Error("Nouvelle session explicitement confirmée.");
  const r = read(); r.sessionIndex++; r.preventionUsed = []; r.lastIncident = null; r.processedIncidentKeys = [];
  await write(r); return status();
}
/** Explicit idempotent GM migration; old Actor flags stay untouched as backup. */
async function migrateLegacyInfusions({ confirmed = false } = {}) {
  gm(); if (!confirmed) throw new Error("Confirmer la migration : {confirmed:true}.");
  const r = read(), report = { actors: 0, imported: 0, skipped: 0 };
  for (const actor of game.actors.contents) {
    const raw = actor.getFlag?.(SCOPE, OLD_FLAG);
    if (!Array.isArray(raw?.entries) || !raw.entries.length || r.migratedActors.includes(actor.uuid)) continue;
    report.actors++;
    const cap = infusionCapacity(levelOf(actor));
    r.creatorSlots[actor.uuid] = { capacity: cap, sourceName: actor.name, lastKnownLevel: levelOf(actor) };
    for (const old of raw.entries) {
      if (!old?.id || !old?.itemId) { report.skipped++; continue; }
      if (r.entries.some(e => e.id === old.id)) { report.skipped++; continue; }
      const targetUuid = old.targetActorUuid || actor.uuid;
      r.entries.push({ id: old.id, creatorKey: actor.uuid, creatorName: actor.name,
        sourceLevel: levelOf(actor), targetActorUuid: targetUuid, itemId: old.itemId,
        itemName: String(old.itemName ?? ""), order: r.nextOrder++,
        createdAt: Number(old.createdAt) || Date.now(), effect: null,
        legacyOrder: Number(old.order) || 0 });
      report.imported++;
    }
    r.migratedActors.push(actor.uuid);
    for (const used of raw.preventionUsed ?? []) if (!r.preventionUsed.includes(used)) r.preventionUsed.push(used);
  }
  await write(r); return { ...report, status: status() };
}
export const artificerInfusionApi = Object.freeze({ version: "P2.11d.3f", storage: "world",
  capacity: infusionCapacity, status, eligibleItems, add, addWorld, remove, newest,
  newestForRecipient, resolveCriticalDamage, clearAtLongRest, clearForRecipientAtLongRest, startNewSession,
  migrateLegacyInfusions, expireForNativeLongRest });
