import {
  getMotherboardAugment,
  listMotherboardAugments,
} from "./weapon-augment-catalog.mjs";

/** P2.11d.3f — World-authoritative Infusions; recipient-scoped lifecycle. */
const SCOPE = "daggerheart-campaign-toolkit";

/** P2.13b.5a ? automatic add/remove weapon sync */
let weaponAugmentStateApi = null;

export function registerArtificerInfusionWeaponSync(
  api
) {
  if (
    !api ||
    typeof api.resync !== "function"
  ) {
    throw new Error(
      "Weapon Augment state API with resync() required."
    );
  }

  weaponAugmentStateApi =
    api;

  return {
    installed: true,
    version: "P2.13c.2",
  };
}

/** P2.13c.2 ? hunt weapon eligibility + permanent/infusion anti-duplicate */
function assertInfusionWeaponEligibility(
  weapon,
  augmentId
) {
  if (
    !weapon ||
    weapon.documentName !== "Item" ||
    weapon.type !== "weapon" ||
    weapon.parent?.documentName !== "Actor"
  ) {
    throw new Error(
      "Une arme de chasse embarqu?e sur un personnage est requise."
    );
  }

  if (
    !weaponAugmentStateApi ||
    typeof weaponAugmentStateApi.get !== "function"
  ) {
    throw new Error(
      "Weapon Augment state API unavailable."
    );
  }

  const current =
    weaponAugmentStateApi.get(
      weapon
    );

  if (!current?.initialized) {
    throw new Error(
      "Cette arme n'est pas une arme de chasse Motherboard initialis?e."
    );
  }

  const installed =
    Array.isArray(
      current?.state?.installed
    )
      ? current.state.installed
      : [];

  if (
    installed.includes(
      augmentId
    )
  ) {
    throw new Error(
      `Cet augment est d?j? install? de fa?on permanente : ${augmentId}.`
    );
  }

  return current;
}


async function resyncInfusionWeapons(
  weaponUuids
) {
  if (
    !weaponAugmentStateApi ||
    !game.user?.isGM
  ) {
    return [];
  }

  const uuids =
    [
      ...new Set(
        (weaponUuids ?? [])
          .filter(
            uuid =>
              typeof uuid === "string" &&
              /^Actor\.[^.]+\.Item\.[^.]+$/.test(
                uuid
              )
          )
      ),
    ];

  const results = [];

  for (const uuid of uuids) {
    const weapon =
      await fromUuid(uuid);

    if (
      !weapon ||
      weapon.documentName !== "Item" ||
      weapon.type !== "weapon" ||
      weapon.parent?.documentName !== "Actor"
    ) {
      results.push({
        weaponUuid: uuid,
        green: false,
        reason: "weapon-not-resolved",
      });

      continue;
    }

    try {
      const result =
        await weaponAugmentStateApi
          .resync(weapon);

      results.push({
        weaponUuid: uuid,
        green: true,
        result,
      });
    } catch (error) {
      console.error(
        `${SCOPE} | infusion weapon resync failed`,
        uuid,
        error
      );

      results.push({
        weaponUuid: uuid,
        green: false,
        reason:
          error?.message ??
          String(error),
      });
    }
  }

  return results;
}
const WORLD_KEY = "activeInfusions";
const OLD_FLAG = "artificerInfusions";
const CLASS_ID = "homebrew.artificer.class.artificer";
const FEATURE_ID = "homebrew.artificer.class.artificer.feature.infusions-d-artificier";
/** P2.13a.1 ? Artificer Tier infusion capacity.
 * Daggerheart tiers:
 *   level 1     -> tier 1
 *   levels 2-4  -> tier 2
 *   levels 5-7  -> tier 3
 *   levels 8-10 -> tier 4
 */
const ARTIFICER_TIERS = [
  [8, 4],
  [5, 3],
  [2, 2],
  [1, 1],
];
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
export function artificerTierFromLevel(level) {
  const n =
    Number(level);

  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 10
  ) {
    throw new Error(
      "Niveau entier de 1 ? 10 requis."
    );
  }

  return ARTIFICER_TIERS
    .find(
      ([minimumLevel]) =>
        n >= minimumLevel
    )[1];
}

export function infusionCapacity(level) {
  return artificerTierFromLevel(level);
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
  const slot =
    key
      ? r.creatorSlots[key] ?? null
      : null;

  const capacity =
    slot?.lastKnownLevel != null
      ? infusionCapacity(
          slot.lastKnownLevel
        )
      : (
          key
            ? slot?.capacity ?? null
            : null
        );
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
/** P2.13b.1 ? Motherboard-backed infusions */
function motherboardAugmentTier(augment) {
  if (
    !augment ||
    typeof augment !== "object"
  ) {
    throw new Error(
      "Augment Motherboard invalide."
    );
  }

  const precompile =
    augment.precompile ?? null;

  if (!precompile) {
    return 1;
  }

  if (
    precompile.primitive !== "tier" ||
    !Number.isInteger(
      precompile.minimum
    ) ||
    precompile.minimum < 2 ||
    precompile.minimum > 4
  ) {
    throw new Error(
      `Pr?compilation Motherboard non prise en charge : ${augment.id ?? "inconnu"}.`
    );
  }

  return precompile.minimum;
}

async function addWorld({
  creatorKey: key,
  creatorName =
    "Artificier (hors session)",
  sourceLevel,
  targetActorUuid,
  itemId,
  augmentId,
} = {}) {
  gm();

  if (
    typeof key !== "string" ||
    !key.trim() ||
    key.length > 128
  ) {
    throw new Error(
      "creatorKey stable requis."
    );
  }

  if (
    typeof augmentId !== "string" ||
    !augmentId.trim()
  ) {
    throw new Error(
      "augmentId Motherboard requis."
    );
  }

  const capacity =
    infusionCapacity(sourceLevel);

  const sourceTier =
    capacity;

  const target =
    actorByUuid(targetActorUuid);

  assertActor(target);

  const weapon =
    itemById(
      target,
      itemId
    );

  if (
    !weapon ||
    weapon.type !== "weapon"
  ) {
    throw new Error(
      "Une arme appartenant ? un personnage est requise."
    );
  }

  const augment =
    await getMotherboardAugment(
      augmentId
    );

  assertInfusionWeaponEligibility(
    weapon,
    augment.id
  );

  const augmentTier =
    motherboardAugmentTier(
      augment
    );

  if (
    augmentTier >
    sourceTier
  ) {
    throw new Error(
      `Tier insuffisant : Artificier T${sourceTier}, augment T${augmentTier}.`
    );
  }

  const r =
    read();

  const used =
    r.entries.filter(
      entry =>
        entry.creatorKey === key
    ).length;

  if (
    used >= capacity
  ) {
    throw new Error(
      `Capacit? d'Infusions atteinte (${capacity}).`
    );
  }

  if (
    r.entries.some(
      entry =>
        entry.targetActorUuid ===
          target.uuid &&
        entry.itemId ===
          weapon.id &&
        entry.augmentId ===
          augment.id
    )
  ) {
    throw new Error(
      "Cette arme porte d?j? cette infusion."
    );
  }

  r.creatorSlots[key] = {
    capacity,
    sourceName:
      String(creatorName),
    lastKnownLevel:
      Number(sourceLevel),
    lastKnownTier:
      sourceTier,
  };

  r.entries.push({
    id:
      foundry.utils.randomID(),

    creatorKey:
      key,

    creatorName:
      String(creatorName),

    sourceLevel:
      Number(sourceLevel),

    sourceTier,

    targetActorUuid:
      target.uuid,

    itemId:
      weapon.id,

    weaponUuid:
      weapon.uuid,

    itemName:
      weapon.name,

    augmentId:
      augment.id,

    augmentTier,

    source:
      "artificer-infusion",

    temporary:
      true,

    order:
      r.nextOrder++,

    createdAt:
      Date.now(),

    effect:
      null,
  });

  await write(r);

  await resyncInfusionWeapons([
    weapon.uuid,
  ]);

  return status(key);
}

async function add(
  creator,
  targetOrId,
  itemId,
  augmentId
) {
  assertCreator(creator);

  const {
    target,
    item,
  } = chooseTarget(
    creator,
    targetOrId,
    itemId
  );

  if (
    item.type !== "weapon"
  ) {
    throw new Error(
      "Les infusions d'Artificier ne ciblent que les armes."
    );
  }

  return addWorld({
    creatorKey:
      creator.uuid,

    creatorName:
      creator.name,

    sourceLevel:
      levelOf(creator),

    targetActorUuid:
      target.uuid,

    itemId:
      item.id,

    augmentId,
  });
}

async function remove(
  _creatorOrId,
  maybeId
) {
  gm();

  const id =
    maybeId ??
    _creatorOrId;

  const r =
    read();

  const removed =
    r.entries.find(
      entry =>
        entry.id === id
    );

  if (!removed) {
    throw new Error(
      "Infusion inconnue."
    );
  }

  r.entries =
    r.entries.filter(
      entry =>
        entry.id !== id
    );

  await write(r);

  await resyncInfusionWeapons([
    removed.weaponUuid,
  ]);

  return status();
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

  if (
    consequence === "infusion-lost"
  ) {
    await resyncInfusionWeapons([
      recent.weaponUuid,
    ]);
  }
  return { ...result, status: status() };
}
async function clearAtLongRest(
  creatorOrOptions = {},
  options = {}
) {
  gm();

  const opts =
    creatorOrOptions &&
    typeof creatorOrOptions === "object" &&
    "confirmed" in creatorOrOptions
      ? creatorOrOptions
      : options;

  if (!opts.confirmed) {
    throw new Error(
      "Repos long explicitement confirm? : {confirmed:true}."
    );
  }

  const r =
    read();

  const key =
    creatorOrOptions &&
    typeof creatorOrOptions === "object" &&
    "confirmed" in creatorOrOptions
      ? null
      : creatorKey(
          creatorOrOptions
        );

  const expired =
    key
      ? r.entries.filter(
          entry =>
            entry.creatorKey === key
        )
      : [...r.entries];

  r.entries =
    key
      ? r.entries.filter(
          entry =>
            entry.creatorKey !== key
        )
      : [];

  await write(r);

  await resyncInfusionWeapons(
    expired.map(
      entry =>
        entry.weaponUuid
    )
  );

  return status();
}

async function clearForRecipientAtLongRest(
  recipient,
  { confirmed = false } = {}
) {
  gm();

  if (!confirmed) {
    throw new Error(
      "Repos long du porteur explicitement confirm? : {confirmed:true}."
    );
  }

  const uuid =
    recipientUuid(
      recipient
    );

  const target =
    actorByUuid(uuid);

  if (!target) {
    throw new Error(
      "Personnage porteur permanent introuvable."
    );
  }

  const r =
    read();

  const expired =
    r.entries.filter(
      entry =>
        entry.targetActorUuid === uuid
    );

  r.entries =
    r.entries.filter(
      entry =>
        entry.targetActorUuid !== uuid
    );

  await write(r);

  await resyncInfusionWeapons(
    expired.map(
      entry =>
        entry.weaponUuid
    )
  );

  return {
    recipientUuid:
      uuid,

    recipientName:
      target.name,

    expiredIds:
      expired.map(
        entry =>
          entry.id
      ),

    expiredCount:
      expired.length,

    status:
      status(),
  };
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

  await resyncInfusionWeapons(
    expired.map(
      entry =>
        entry.weaponUuid
    )
  );
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
/** P2.13b.2 ? Artificer augment catalog */
async function availableAugments(
  creator
) {
  assertCreator(creator);

  const level =
    levelOf(creator);

  const tier =
    artificerTierFromLevel(
      level
    );

  const augments =
    await listMotherboardAugments({
      tier,
    });

  return {
    creatorUuid:
      creator.uuid,

    creatorName:
      creator.name,

    level,

    tier,

    capacity:
      infusionCapacity(level),

    augments,
  };
}

/** P2.13b.3 ? weapon infusion projection */
function infusionsForWeapon(
  weaponOrUuid
) {
  const weapon =
    typeof weaponOrUuid === "string"
      ? null
      : weaponOrUuid;

  const weaponUuid =
    typeof weaponOrUuid === "string"
      ? weaponOrUuid
      : weapon?.uuid;

  if (
    typeof weaponUuid !== "string" ||
    !/^Actor\.[^.]+\.Item\.[^.]+$/.test(
      weaponUuid
    )
  ) {
    throw new Error(
      "UUID d'une arme embarqu?e dans un Actor requis."
    );
  }

  const r =
    read();

  const actorUuid =
    weapon?.parent?.uuid ?? (
      weaponUuid
        .split(".Item.")[0]
    );

  const itemId =
    weapon?.id ?? (
      weaponUuid
        .split(".Item.")[1]
    );

  return r.entries
    .filter(
      entry =>
        entry.weaponUuid ===
          weaponUuid ||
        (
          entry.targetActorUuid ===
            actorUuid &&
          entry.itemId ===
            itemId
        )
    )
    .map(decorate);
}

/** P2.13b.5b ? automatic expiration weapon sync */
export const artificerInfusionApi = Object.freeze({ version: "P2.13b.5a", storage: "world",
  capacity: infusionCapacity, tierFromLevel: artificerTierFromLevel, availableAugments, forWeapon: infusionsForWeapon, status, eligibleItems, add, addWorld, remove, newest,
  newestForRecipient, resolveCriticalDamage, clearAtLongRest, clearForRecipientAtLongRest, startNewSession,
  migrateLegacyInfusions, expireForNativeLongRest });
