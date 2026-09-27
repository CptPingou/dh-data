import { localizeNativeEquipmentEmbedded } from "./equipment-native-fr.mjs";
import { applyContentLocale, getImportLocale } from "./content-locale.mjs";
const MODULE_ID = "daggerheart-campaign-toolkit";
const PILOT_URL = `modules/${MODULE_ID}/data/pilot.json`;
const CLASS_PRESENTATION_URL = `modules/${MODULE_ID}/data/class-presentation.json`;
const FLAG_SCOPE = MODULE_ID;
const PILOT_MAPPING_VERSION = "P2.3.4e-fix2c";
const FALLBACK_CLASS_IMAGE = "icons/svg/mystery-man.svg";

let classPresentationPromise = null;

async function classPresentation() {
  classPresentationPromise ??= fetch(CLASS_PRESENTATION_URL, { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`class-presentation.json introuvable (${response.status})`);
      return response.json();
    })
    .catch(error => {
      console.error(`${MODULE_ID} | unable to load owned class presentation`, error);
      return { entries: {} };
    });
  return classPresentationPromise;
}

async function ownedClassImage(raw) {
  const explicit = raw?.presentation?.img ?? raw?.img;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const sourceId = raw?.id;
  const catalog = await classPresentation();
  const mapped = sourceId ? catalog?.entries?.[sourceId]?.img : null;
  return typeof mapped === "string" && mapped.trim()
    ? mapped.trim()
    : FALLBACK_CLASS_IMAGE;
}

function textValue(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    for (const key of ["rules_text", "description", "text", "summary", "notes"]) {
      if (typeof v[key] === "string") return v[key];
    }
  }
  return "";
}

function nameOf(raw, fallback) {
  return raw?.identity?.name ?? raw?.name ?? raw?.label ?? fallback;
}

function rules(raw) {
  return raw?.rules ?? raw?.mechanics ?? raw?.system ?? {};
}

function provenanceFlags(raw, sourcePath) {
  return {
    [FLAG_SCOPE]: {
      pilot: true,
      sourceId: raw?.id ?? null,
      sourcePath,
      source: raw?.source ?? null,
      mappingVersion: PILOT_MAPPING_VERSION,
    }
  };
}

function setMappingGaps(data, gaps = []) {
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].mappingGaps = [...new Set(gaps.filter(Boolean))];
}

function clearItemLinks(value) {
  // ItemLinkFields serializes as an array in current Foundryborne.
  // Keep this helper defensive so sanitation survives minor schema changes.
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return [];
  return [];
}

function sanitizeEmbeddedActorData(data) {
  // Native SRD Actor templates carry their own feature Items/effects. They are
  // never valid defaults for another imported Actor.
  data.items = [];
  // Remove cloned-document effects entirely. Foundry will restore only the
  // neutral schema default, never the source template semantics.
  data.effects = [];
}

function baseDescription(raw) {
  const content = raw?.content ?? {};
  const desc =
    textValue(content.rules_text) ||
    textValue(content) ||
    textValue(raw?.rules_text) ||
    textValue(raw?.description);
  if (!desc) return "";
  // Canonical DH-DATA may deliberately carry sanitized rich text (notably
  // class/class-feature prose bootstrapped from the SRD Foundry source).
  // Preserve that markup; plain-text sources are escaped as before.
  if (/<\/?[a-z][\s\S]*>/i.test(desc)) return desc;
  return `<p>${foundry.utils.escapeHTML(desc)}</p>`;
}

function normalizedChoice(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

const DOMAIN_ICON_BASE =
  "modules/daggerheart-campaign-toolkit/assets/icons/domains";

const DOMAIN_ICON_KEYS = new Set([
  "arcana",
  "blade",
  "bone",
  "codex",
  "dread",
  "grace",
  "midnight",
  "sage",
  "splendor",
  "valor",
  "hunt",
  "artillery",
]);

function domainIcon(domain) {
  const key = normalizedChoice(domain);
  if (!key || !DOMAIN_ICON_KEYS.has(key)) return null;
  if (key === ARTILLERY_DOMAIN_ID) return ARTILLERY_DOMAIN_DEFINITION.src;
  return `${DOMAIN_ICON_BASE}/${key}.png`;
}


const HUNT_DOMAIN_ID = "hunt";
const HUNT_CARD_ROLE_SCHEMA_VERSION = 1;

const HUNT_CARD_ROLE_CONTRACT = Object.freeze({
  "Appui défensif": {
    combatRole: "support",
    huntRole: null,
  },
  "Conversion": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Couverture": {
    combatRole: "support",
    huntRole: null,
  },
  "Cuistot": {
    combatRole: null,
    huntRole: "preparation",
  },
  "Diversion": {
    combatRole: "support",
    huntRole: null,
  },
  "Extracteur": {
    combatRole: null,
    huntRole: "extraction",
  },
  "Feinte d’approche": {
    combatRole: "opener",
    huntRole: null,
  },
  "Frappe d’épuisement": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Frappe de rupture": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Frappe mutilante": {
    combatRole: "finisher",
    huntRole: null,
  },
  "Guidage du finisher": {
    combatRole: "support",
    huntRole: null,
  },
  "Naturaliste": {
    combatRole: null,
    huntRole: "knowledge",
  },
  "Ouverture": {
    combatRole: "opener",
    huntRole: null,
  },
  "Ouverture précise": {
    combatRole: "opener",
    huntRole: null,
  },
  "Provocation": {
    combatRole: "opener",
    huntRole: null,
  },
  "Tacticien": {
    combatRole: "support",
    huntRole: "logistics",
  },
  "Traqueur": {
    combatRole: null,
    huntRole: "tracking",
  },
});

const LEGACY_HUNT_CARD_NAMES = Object.freeze([
  "Appui défensif",
  "Conversion",
  "Couverture",
  "Cuistot",
  "Diversion",
  "Extracteur",
  "Feinte d’approche",
  "Frappe d’épuisement",
  "Frappe de rupture",
  "Frappe mutilante",
  "Guidage du finisher",
  "Naturaliste",
  "Ouverture",
  "Ouverture précise",
  "Provocation",
  "Tacticien",
  "Traqueur",
]);

function normalizedHuntCardName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

const LEGACY_HUNT_CARD_NAME_KEYS = new Set(
  LEGACY_HUNT_CARD_NAMES.map(normalizedHuntCardName)
);

function isLegacyHuntCardName(name) {
  return LEGACY_HUNT_CARD_NAME_KEYS.has(normalizedHuntCardName(name));
}

const ARTILLERY_DOMAIN_ID = "artillery";

const ARTILLERY_DOMAIN_DEFINITION = Object.freeze({
  id: ARTILLERY_DOMAIN_ID,
  label: "Artillery",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domains/artillery.png",
  description:
    "Artillery est le domaine de la puissance de feu, du contrôle de zone et des attaques à fort impact.",
  color: "#8a5a24",
});

export async function ensureArtilleryDomain() {
  if (!game.user?.isGM) {
    throw new Error("L’enregistrement du domaine Artillery est réservé au MJ.");
  }

  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) {
    throw new Error("Foundryborne Homebrew setting key introuvable.");
  }

  const current = foundry.utils.deepClone(
    game.settings.get(CONFIG.DH.id, settingKey) ?? {}
  );

  current.domains ??= {};
  const previous = current.domains[ARTILLERY_DOMAIN_ID] ?? null;
  const changed =
    !previous ||
    previous.id !== ARTILLERY_DOMAIN_DEFINITION.id ||
    previous.label !== ARTILLERY_DOMAIN_DEFINITION.label ||
    previous.src !== ARTILLERY_DOMAIN_DEFINITION.src ||
    previous.description !== ARTILLERY_DOMAIN_DEFINITION.description ||
    previous.color !== ARTILLERY_DOMAIN_DEFINITION.color;

  if (changed) {
    current.domains[ARTILLERY_DOMAIN_ID] = {
      ...ARTILLERY_DOMAIN_DEFINITION,
    };
    await game.settings.set(CONFIG.DH.id, settingKey, current);
  }

  const allAfter = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const registered =
    allAfter[ARTILLERY_DOMAIN_ID] ??
    current.domains[ARTILLERY_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[ARTILLERY_DOMAIN_ID] ??
    null;

  return {
    green: Boolean(registered),
    changed,
    reloadRecommended: changed && !allAfter[ARTILLERY_DOMAIN_ID],
    domain: registered,
  };
}

const HUNT_DOMAIN_DEFINITION = Object.freeze({
  id: HUNT_DOMAIN_ID,
  label: "Chasse",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domains/hunt.png",
  description:
    "La Chasse est le domaine de l’observation, de la préparation et de la coordination contre des créatures dangereuses.",
  color: "#6b5b3e",
});

export async function ensureHuntDomain() {
  if (!game.user?.isGM) {
    throw new Error("L’enregistrement du domaine Chasse est réservé au MJ.");
  }

  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) {
    throw new Error("Foundryborne Homebrew setting key introuvable.");
  }

  const current = foundry.utils.deepClone(
    game.settings.get(CONFIG.DH.id, settingKey) ?? {}
  );

  current.domains ??= {};
  const previous = current.domains[HUNT_DOMAIN_ID] ?? null;
  const changed =
    !previous ||
    previous.id !== HUNT_DOMAIN_DEFINITION.id ||
    previous.label !== HUNT_DOMAIN_DEFINITION.label ||
    previous.src !== HUNT_DOMAIN_DEFINITION.src ||
    previous.description !== HUNT_DOMAIN_DEFINITION.description ||
    previous.color !== HUNT_DOMAIN_DEFINITION.color;

  if (changed) {
    current.domains[HUNT_DOMAIN_ID] = {
      ...HUNT_DOMAIN_DEFINITION,
    };
    await game.settings.set(CONFIG.DH.id, settingKey, current);
  }

  const allAfter = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const registered =
    allAfter[HUNT_DOMAIN_ID] ??
    current.domains[HUNT_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[HUNT_DOMAIN_ID] ??
    null;

  return {
    green: Boolean(registered),
    changed,
    reloadRecommended: changed && !allAfter[HUNT_DOMAIN_ID],
    domain: registered,
  };
}

function normalizedToken(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
    : "";
}


function mapTrait(value) {
  const token = normalizedToken(value);
  const aliases = {
    agility: "agility",
    strength: "strength",
    finesse: "finesse",
    instinct: "instinct",
    presence: "presence",
    knowledge: "knowledge",
  };
  return aliases[token] ?? null;
}

function mapRange(value) {
  const token = normalizedToken(value);
  const aliases = {
    melee: "melee",
    veryclose: "veryClose",
    close: "close",
    far: "far",
    veryfar: "veryFar",
  };
  return aliases[token] ?? null;
}

function mapDamageTypes(value) {
  const token = String(value ?? "").trim().toLowerCase();
  if (token === "phy") return ["physical"];
  if (token === "mag") return ["magical"];
  if (token === "phy/mag" || token === "mag/phy") return ["physical", "magical"];
  return [];
}

function parseWeaponDamage(value) {
  const text = String(value ?? "").replace(/\s+/g, "");
  const match = /^d(4|6|8|10|12|20)([+-]\d+)?$/i.exec(text);
  if (!match) return null;
  return { dice: `d${match[1]}`, bonus: Number(match[2] ?? 0) };
}

function appendFeatureDescription(existing, feature, label = "Feature") {
  if (!feature || typeof feature !== "object") return existing ?? "";
  const name = typeof feature.name === "string" ? feature.name.trim() : "";
  const text = typeof feature.text === "string" ? feature.text.trim() : "";
  if (!name && !text) return existing ?? "";
  const safeName = foundry.utils.escapeHTML(name || label);
  const safeText = foundry.utils.escapeHTML(text);
  return `${existing ?? ""}<p><strong>${safeName}.</strong>${safeText ? ` ${safeText}` : ""}</p>`;
}

const SOURCE_FEATURE_PREFIX = "dctSource";
const sourceEquipmentFeatureKeys = {
  weapon: new Map(),
  armor: new Map(),
};

const nativeEquipmentFeatureSpecimens = {
  weapon: new Map(),
  armor: new Map(),
};
let nativeEquipmentFeatureSpecimensReady = false;

function featureFieldName(kind) {
  return kind === "weapon" ? "weaponFeatures" : "armorFeatures";
}

function ownedEquipmentPackId(kind) {
  return kind === "weapon"
    ? `${MODULE_ID}.dh-weapons`
    : `${MODULE_ID}.dh-armor`;
}

async function ensureNativeEquipmentFeatureSpecimens() {
  if (nativeEquipmentFeatureSpecimensReady) return nativeEquipmentFeatureSpecimens;

  for (const kind of ["weapon", "armor"]) {
    const pack = game.packs.get(ownedEquipmentPackId(kind));
    if (!pack) {
      console.warn(`${MODULE_ID} | owned equipment pack absent`, ownedEquipmentPackId(kind));
      continue;
    }

    const fieldName = featureFieldName(kind);
    const index = await pack.getIndex();
    for (const row of index) {
      const doc = await pack.getDocument(row._id);
      if (!doc) continue;
      const raw = doc.toObject();
      const features = Array.isArray(raw?.system?.[fieldName]) ? raw.system[fieldName] : [];
      const effects = Array.isArray(raw?.effects) ? raw.effects : [];
      const actions = Array.isArray(raw?.system?.actions) ? raw.system.actions : [];

      for (const feature of features) {
        const key = feature?.value;
        if (!key || nativeEquipmentFeatureSpecimens[kind].has(key)) continue;
        const effectIds = Array.isArray(feature?.effectIds) ? feature.effectIds : [];
        const actionIds = Array.isArray(feature?.actionIds) ? feature.actionIds : [];
        const linkedEffects = effects.filter(effect => effectIds.includes(effect?._id));
        const linkedActions = actions.filter(action => actionIds.includes(action?._id));

        // A text-only native feature is not an automation specimen. Keep
        // looking for another SRD item carrying the same feature with actual
        // linked behavior.
        if (!linkedEffects.length && !linkedActions.length) continue;

        nativeEquipmentFeatureSpecimens[kind].set(key, {
          sourceUuid: doc.uuid,
          feature: foundry.utils.deepClone(feature),
          effects: foundry.utils.deepClone(linkedEffects),
          actions: foundry.utils.deepClone(linkedActions),
        });
      }
    }
  }

  nativeEquipmentFeatureSpecimensReady = true;
  console.info(`${MODULE_ID} | P2.7.5f owned equipment specimens`, {
    weapon: nativeEquipmentFeatureSpecimens.weapon.size,
    armor: nativeEquipmentFeatureSpecimens.armor.size,
  });
  return nativeEquipmentFeatureSpecimens;
}

function remapSpecimenIds(specimen, key) {
  const effectMap = new Map();
  const actionMap = new Map();

  const effects = (specimen?.effects ?? []).map(effect => {
    const clone = foundry.utils.deepClone(effect);
    const oldId = clone._id;
    clone._id = foundry.utils.randomID();
    if (oldId) effectMap.set(oldId, clone._id);
    // The source compendium UUID is provenance only. Embedded behavior must
    // belong to the imported Item.
    if (clone.origin) clone.origin = null;
    return clone;
  });

  const actions = (specimen?.actions ?? []).map(action => {
    const clone = foundry.utils.deepClone(action);
    const oldId = clone._id;
    clone._id = foundry.utils.randomID();
    if (oldId) actionMap.set(oldId, clone._id);
    return clone;
  });

  const mapped = {
    effects,
    actions,
    effectIds: (specimen?.feature?.effectIds ?? []).map(id => effectMap.get(id)).filter(Boolean),
    actionIds: (specimen?.feature?.actionIds ?? []).map(id => actionMap.get(id)).filter(Boolean),
    sourceUuid: specimen?.sourceUuid ?? null,
  };
  // P2.3.4e-fix2b: use the same normalized locale resolver as the document
  // overlay. This avoids a mismatch between the importer locale and a raw
  // world-setting lookup while cloning native Foundryborne specimens.
  return localizeNativeEquipmentEmbedded(mapped, key, getImportLocale());
}

async function applyNativeEquipmentFeature(data, kind, key) {
  await ensureNativeEquipmentFeatureSpecimens();
  const specimen = nativeEquipmentFeatureSpecimens[kind].get(key);
  if (!specimen) return null;

  const mapped = remapSpecimenIds(specimen, key);
  data.effects = [...(Array.isArray(data.effects) ? data.effects : []), ...mapped.effects];
  if (Array.isArray(data.system.actions)) data.system.actions.push(...mapped.actions);

  const fieldName = featureFieldName(kind);
  data.system[fieldName] = [{
    value: key,
    effectIds: mapped.effectIds,
    actionIds: mapped.actionIds,
  }];

  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].nativeEquipmentFeature = {
    key,
    specimen: mapped.sourceUuid,
    effects: mapped.effectIds.length,
    actions: mapped.actionIds.length,
  };
  return mapped;
}

function sourceFeatureHash(value) {
  let hash = 0x811c9dc5;
  for (const ch of String(value ?? "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

function sourceFeatureKey(kind, name) {
  const token = normalizedToken(name) || "feature";
  return `${SOURCE_FEATURE_PREFIX}_${kind}_${token}_${sourceFeatureHash(`${kind}:${name}`)}`;
}

function configuredFeatureKey(kind, feature) {
  const name = typeof feature?.name === "string" ? feature.name.trim() : "";
  if (!name) return null;
  const wanted = normalizedToken(name);
  const all = kind === "weapon"
    ? CONFIG?.DH?.ITEM?.allWeaponFeatures?.()
    : CONFIG?.DH?.ITEM?.allArmorFeatures?.();
  if (all && typeof all === "object") {
    for (const [key, data] of Object.entries(all)) {
      const candidates = [key, data?.name, data?.label]
        .filter(v => typeof v === "string")
        .flatMap(v => [v, game.i18n?.localize?.(v)]);
      if (candidates.some(v => normalizedToken(v) === wanted)) return key;
    }
  }
  return sourceEquipmentFeatureKeys[kind]?.get(wanted) ?? null;
}

function collectSourceFeatureDefinitions(entries, kind) {
  const out = new Map();
  for (const entry of entries ?? []) {
    if (entry?.kind !== kind) continue;
    const feature = entry?.data?.feature ?? entry?.data?.rules?.feature;
    const name = typeof feature?.name === "string" ? feature.name.trim() : "";
    if (!name) continue;
    const token = normalizedToken(name);
    if (!token || out.has(token)) continue;
    out.set(token, {
      name,
      description: typeof feature?.text === "string" ? feature.text.trim() : "",
      actions: [],
      effects: [],
    });
  }
  return out;
}

export async function ensureSourceEquipmentFeatureCatalog(entries) {
  if (!game.user?.isGM) throw new Error("Source equipment feature catalog registration is GM-only.");
  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) throw new Error("Foundryborne Homebrew setting key introuvable.");

  const current = foundry.utils.deepClone(game.settings.get(CONFIG.DH.id, settingKey) ?? {});
  current.itemFeatures ??= {};
  current.itemFeatures.weaponFeatures ??= {};
  current.itemFeatures.armorFeatures ??= {};

  const report = { weapon: { existing: 0, registered: 0 }, armor: { existing: 0, registered: 0 }, changed: false };

  for (const kind of ["weapon", "armor"]) {
    sourceEquipmentFeatureKeys[kind].clear();
    const definitions = collectSourceFeatureDefinitions(entries, kind);
    const targetKey = kind === "weapon" ? "weaponFeatures" : "armorFeatures";
    const target = current.itemFeatures[targetKey];

    for (const [token, feature] of definitions) {
      const nativeKey = configuredFeatureKey(kind, feature);
      if (nativeKey) {
        sourceEquipmentFeatureKeys[kind].set(token, nativeKey);
        report[kind].existing += 1;
        continue;
      }

      const key = sourceFeatureKey(kind, feature.name);
      // Toolkit-owned source catalog entries are identity/description only.
      // Never overwrite an existing user/native entry and never invent actions/effects.
      if (!target[key]) {
        target[key] = feature;
        report[kind].registered += 1;
        report.changed = true;
      }
      sourceEquipmentFeatureKeys[kind].set(token, key);
    }
  }

  if (report.changed) await game.settings.set(CONFIG.DH.id, settingKey, current);
  return report;
}



function mapFeatureForm(value) {
  const token = normalizedToken(value);
  if (["passive", "action", "reaction"].includes(token)) return token;
  return "passive";
}

async function buildEmbeddedSourceFeature(feature, parentRaw, sourcePath, index) {
  const data = await nativeTemplate("Item", "feature");
  data._id = foundry.utils.randomID();
  data.name = typeof feature?.name === "string" && feature.name.trim()
    ? feature.name.trim()
    : `Feature ${index + 1}`;
  data.flags = foundry.utils.mergeObject(
    data.flags ?? {},
    {
      [FLAG_SCOPE]: {
        embeddedSourceFeature: true,
        parentSourceId: parentRaw?.id ?? null,
        parentSourcePath: sourcePath,
        sourceFeatureIndex: index,
        sourceFeatureType: feature?.type ?? null,
        mappingVersion: PILOT_MAPPING_VERSION,
      }
    },
    { inplace: false }
  );

  // Native feature template provides only schema shape. Strip every source
  // semantic that could leak from that template; P2.3.3k imports source text
  // and presentation form only. Actions/effects/resources remain manual.
  // Remove cloned-document effects entirely. Foundry will restore only the
  // neutral schema default, never the source template semantics.
  data.effects = [];
  if (data.system) {
    data.system.description = typeof feature?.text === "string" && feature.text.trim()
      ? `<p>${foundry.utils.escapeHTML(feature.text.trim())}</p>`
      : "";
    if ("gmNotes" in data.system) data.system.gmNotes = "";
    // Delete template-owned automation/resource payloads rather than forcing
    // a guessed container shape. Foundryborne may normalize these fields into
    // DataModels/TypedObjects on creation; the semantic audit compares them to
    // a fresh blank feature baseline.
    if ("actions" in data.system) delete data.system.actions;
    if ("resource" in data.system) delete data.system.resource;
    if ("granter" in data.system) data.system.granter = null;
    if ("actorResources" in data.system) data.system.actorResources = [];
    if ("featureForm" in data.system) data.system.featureForm = mapFeatureForm(feature?.type);
  }
  return data;
}

export async function buildLinkedSourceFeature(feature, parentRaw, sourcePath, index, linkType) {
  const data = await nativeTemplate("Item", "feature");
  const featureSlug = String(feature?.name ?? `feature-${index + 1}`)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const sourceFeatureId = parentRaw?.id
    ? `${parentRaw.id}.feature.${featureSlug}`
    : null;
  data._id = foundry.utils.randomID();
  data.name = typeof feature?.name === "string" && feature.name.trim()
    ? feature.name.trim()
    : `Feature ${index + 1}`;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
      [FLAG_SCOPE]: {
        supportManaged: true,
        sourceFeature: true,
        sourceId: sourceFeatureId,
      parentSourceId: parentRaw?.id ?? null,
      parentSourcePath: sourcePath,
      sourceFeatureIndex: index,
      sourceFeatureType: linkType ?? null,
      source: parentRaw?.source ?? null,
      mappingVersion: PILOT_MAPPING_VERSION,
    }
  }, { inplace: false });
  data.effects = [];
  if (data.system) {
    data.system.description = typeof feature?.text === "string" && feature.text.trim()
      ? `<p>${foundry.utils.escapeHTML(feature.text.trim())}</p>`
      : "";
    if ("gmNotes" in data.system) data.system.gmNotes = "";
    if ("actions" in data.system) delete data.system.actions;
    if ("resource" in data.system) delete data.system.resource;
    if ("granter" in data.system) data.system.granter = null;
    if ("actorResources" in data.system) data.system.actorResources = [];
    if ("featureForm" in data.system) data.system.featureForm = "passive";
  }
  await applyContentLocale(data, sourceFeatureId, getImportLocale());
  return data;
}

async function mapEmbeddedSourceFeatures(raw, sourcePath, gaps) {
  const features = Array.isArray(raw?.features) ? raw.features : [];
  if (!features.length) {
    if (raw?.features_text) gaps.push("embeddedItems:features");
    return [];
  }
  const out = [];
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    if (!feature || typeof feature !== "object") {
      gaps.push("embeddedItems:features:invalid-source-record");
      continue;
    }
    out.push(await buildEmbeddedSourceFeature(feature, raw, sourcePath, index));
  }
  return out;
}

function parseAdversaryExperiences(value) {
  // A handful of SRD rows still carry extraction control tokens such as
  // "+/two.tnum" and "/comma.tab". They are deterministic OCR artifacts,
  // not rules text, so normalize only this closed vocabulary before parsing.
  const text = String(value ?? "")
    .replace(/\/comma\.tab/gi, ", ")
    .replace(/\+\/one\.tnum/gi, "+1")
    .replace(/\+\/two\.tnum/gi, "+2")
    .replace(/\+\/three\.tnum/gi, "+3")
    .replace(/\+\/four\.tnum/gi, "+4")
    .replace(/\+\/five\.tnum/gi, "+5")
    .trim();
  if (!text) return {};
  const out = {};
  for (const part of text.split(/\s*,\s*/)) {
    const match = /^(.*?)(?:\s*([+-]\d+))$/.exec(part.trim());
    if (!match) continue;
    const name = match[1].trim();
    const score = Number(match[2]);
    if (!name || !Number.isFinite(score)) continue;
    out[foundry.utils.randomID()] = { name, value: score, description: "" };
  }
  return out;
}

function mapAdversaryAttack(templateAttack, attack, gaps) {
  if (!attack || typeof attack !== "object") return null;
  const data = foundry.utils.deepClone(templateAttack);
  if (!data || typeof data !== "object") return null;

  data._id = foundry.utils.randomID();
  data.name = typeof attack.name === "string" && attack.name.trim() ? attack.name.trim() : "Attack";
  data.systemPath = "attack";
  data.chatDisplay = false;
  data.type = "attack";
  data.baseAction = true;

  const range = mapRange(attack.range);
  if (range) data.range = range;
  else gaps.push("system.attack.range");

  if (data.roll && typeof data.roll === "object") {
    data.roll.type = "attack";
    const modifier = Number(attack.modifier);
    if (Number.isFinite(modifier)) data.roll.bonus = modifier;
    else gaps.push("system.attack.roll.bonus");
  }

  const damageTypes = mapDamageTypes(attack.damage_type);
  const sourceDamage = String(attack.damage ?? "").trim();
  const compactDamage = sourceDamage.replace(/\s+/g, "");
  // Canonical SRD attack damage is normally a dice/flat Roll formula. One known
  // SRD row uses the rules phrase "40 direct". Feeding that literal phrase to
  // Foundry's Roll parser makes it interpret the word as DiceTerm syntax
  // (denomination "i"), so normalize only the numeric part and retain an
  // explicit semantic gap for the unsupported "direct" rider.
  const directMatch = /^(\d+)\s+direct$/i.exec(sourceDamage);
  const formula = directMatch ? directMatch[1] : compactDamage;
  const validFormula = /^(?:\d+|\d*d\d+(?:[+-]\d+)?)$/i.test(formula);

  if (data.damage?.main) {
    if (damageTypes.length) data.damage.main.type = damageTypes;
    else gaps.push("system.attack.damage.type");
    if (data.damage.main.value && formula && validFormula) {
      data.damage.main.value.multiplier = "flat";
      if (data.damage.main.value.custom) {
        data.damage.main.value.custom.enabled = true;
        data.damage.main.value.custom.formula = formula;
        if (directMatch) gaps.push("system.attack.damage:direct-semantics");
      } else {
        gaps.push("system.attack.damage.value.custom");
      }
    } else {
      // Never serialize arbitrary extracted text as a Foundry Roll formula.
      // Keep the template's ActionField structurally valid and surface the
      // source value as a mapping gap instead of crashing document creation.
      if (data.damage.main.value?.custom) {
        data.damage.main.value.custom.enabled = false;
        data.damage.main.value.custom.formula = "";
      }
      gaps.push("system.attack.damage.value");
    }
  }
  return data;
}

function mapWeaponBurden(value) {
  const token = normalizedToken(value);
  const burden = CONFIG?.DH?.GENERAL?.burden;

  // Foundryborne exposes the canonical enum values through CONFIG.
  // Map neutral/source labels to those values instead of writing display labels
  // such as "One-Handed" directly into a ChoiceField.
  if (token === "onehanded") return burden?.oneHanded?.value ?? null;
  if (token === "twohanded") return burden?.twoHanded?.value ?? null;

  // If DH-DATA already contains a canonical Foundryborne enum value, preserve it.
  for (const option of Object.values(burden ?? {})) {
    if (option?.value === value) return value;
  }

  return null;
}

/*
 * P2.7.5f doctrine:
 * Owned Item imports must never bootstrap their schema from a native SRD
 * compendium. Foundryborne's configured Item document class is the schema
 * authority; constructing an in-memory Item applies the current defaults
 * without reading any daggerheart.* content pack.
 *
 * Actor imports remain on the legacy specimen path for now because adversary /
 * environment autonomy is outside the seven owned content families cut over in
 * P2.7.5.
 */
async function nativeTemplate(documentName, type) {
  if (documentName === "Item") {
    const DocumentClass = CONFIG?.Item?.documentClass;
    if (!DocumentClass) {
      throw new Error(`CONFIG.Item.documentClass indisponible pour Item:${type}`);
    }

    // Daggerheart 2.9.4 runs legacy migration as soon as a DHItem is
    // constructed. Armor migration expects the legacy system.armor container
    // even for this neutral schema specimen.
    const seed = {
      name: `Toolkit schema ${type}`,
      type,
    };
    if (type === "armor") {
      seed.system = { armor: {} };
    }

    const doc = new DocumentClass(seed);
    const source = doc.toObject();

    delete source._id;
    delete source.folder;
    delete source.sort;
    delete source.ownership;
    delete source._stats;

    return source;
  }

  // Legacy Actor-only fallback. It is intentionally isolated from owned Item
  // families and will be removed when adversaries/environments get their own
  // autonomous source cutover.
  for (const pack of game.packs) {
    if (pack.metadata?.packageName !== "daggerheart") continue;
    if (pack.documentName !== documentName) continue;

    const index = await pack.getIndex({ fields: ["type"] });
    const hit = index.find((e) => e.type === type);
    if (!hit) continue;

    const doc = await pack.getDocument(hit._id);
    if (!doc) continue;

    const source = doc.toObject();
    delete source._id;
    delete source.folder;
    delete source.sort;
    delete source.ownership;
    delete source._stats;
    return source;
  }

  throw new Error(`Aucun template Foundryborne trouvé pour ${documentName}:${type}`);
}


function parseVersatileProfile(feature) {
  if (String(feature?.name ?? "").trim().toLowerCase() !== "versatile") return null;
  const text = String(feature?.text ?? "");
  const match = text.match(/statistics[—-]\s*([^,]+),\s*([^,]+),\s*(d\d+(?:[+-]\d+)?)(?:\s+(phy|mag))?/i);
  if (!match) return { raw: text, parseStatus: "text-preserved" };
  return {
    trait: match[1].trim().toLowerCase(),
    range: match[2].trim().toLowerCase(),
    damage: match[3].trim(),
    damageType: match[4]?.toLowerCase() ?? null,
    parseStatus: "structured",
  };
}

function recordEquipmentFeatureDisposition(data, kind, feature, key, status, extra = {}) {
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  const list = data.flags[FLAG_SCOPE].equipmentFeatureDispositions ??= [];
  const behavior = String(feature?.name ?? key ?? "feature").trim();
  list.push({
    kind,
    key: key ?? null,
    behavior,
    status,
    sourceText: String(feature?.text ?? ""),
    ...extra,
  });
}


const ARTILLERY_AUTOMATION_VERSION = "P2.11c.6e";

function artilleryBaseAction({
  id = foundry.utils.randomID(),
  name,
  description = "",
  type = "effect",
  img = ARTILLERY_DOMAIN_DEFINITION.src,
  range = "",
  targetAmount = null,
  stressCost = 0,
  usesMax = "",
  recovery = null,
  consumeOnSuccess = false,
}) {
  return {
    type,
    _id: id,
    systemPath: "actions",
    description,
    chatDisplay: true,
    actionType: "action",
    cost: stressCost > 0
      ? [{
          key: "stress",
          value: stressCost,
          scalable: false,
          step: null,
          itemId: null,
          consumeOnSuccess: false,
        }]
      : [],
    uses: {
      value: null,
      max: usesMax,
      recovery,
      consumeOnSuccess,
    },
    target: { type: "any", amount: targetAmount },
    effects: [],
    name,
    img,
    range,
    baseAction: false,
    originItem: { type: "itemCollection" },
    triggers: [],
    areas: [],
  };
}

function artilleryAttackAction(options = {}) {
  const action = artilleryBaseAction({ ...options, type: "attack" });
  action.damage = { main: null, resources: {} };
  action.roll = {
    type: options.rollType ?? null,
    trait: null,
    difficulty: options.rollDifficulty ?? null,
    bonus: null,
    advState: "neutral",
    diceRolling: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      compare: null,
      treshold: null,
    },
    useDefault: false,
  };
  action.save = {
    trait: options.saveTrait ?? null,
    difficulty: options.saveDifficulty ?? null,
    damageMod: options.saveDamageMod ?? "none",
  };
  return action;
}


function artilleryHealingAction({
  name,
  description = "",
  img = ARTILLERY_DOMAIN_DEFINITION.src,
  stress = 0,
  usesMax = "",
  recovery = null,
}) {
  const action = artilleryBaseAction({
    name,
    description,
    type: "healing",
    img,
    range: "self",
    targetAmount: null,
    usesMax,
    recovery,
    consumeOnSuccess: false,
  });

  action.target = { type: "self", amount: null };
  action.damage = {
    main: null,
    resources: {
      stress: {
        value: {
          custom: { enabled: true, formula: String(stress) },
          multiplier: "prof",
          flatMultiplier: 1,
          dice: "d6",
          bonus: null,
        },
        applyTo: "stress",
        base: false,
        resultBased: false,
        valueAlt: {
          multiplier: "prof",
          flatMultiplier: 1,
          dice: "d6",
          bonus: null,
          custom: { enabled: false, formula: "" },
        },
        fullRestore: false,
        itemId: null,
      },
    },
  };
  action.roll = {
    type: null,
    trait: null,
    difficulty: null,
    bonus: null,
    advState: "neutral",
    diceRolling: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      compare: null,
      treshold: null,
    },
    useDefault: false,
  };

  return action;
}

function artilleryDamage({ dice, count = 1, bonus = 0, damageType = "physical" }) {
  return {
    value: {
      custom: { enabled: false, formula: "" },
      multiplier: "flat",
      flatMultiplier: count,
      dice,
      bonus,
    },
    applyTo: "hitPoints",
    type: [damageType],
    base: false,
    resultBased: false,
    valueAlt: {
      multiplier: "prof",
      flatMultiplier: 1,
      dice: "d6",
      bonus: null,
      custom: { enabled: false, formula: "" },
    },
    includeBase: false,
    direct: false,
    fullRestore: false,
    itemId: null,
  };
}

function artilleryProneEffect(description) {
  return {
    name: "À terre",
    img: "icons/svg/falling.svg",
    transfer: false,
    _id: foundry.utils.randomID(),
    type: "base",
    system: {
      changes: [],
      duration: { type: "temporary", description: "" },
      rangeDependence: null,
      stacking: null,
      targetDispositions: [],
    },
    disabled: false,
    duration: {
      value: null,
      units: "seconds",
      expiry: null,
      expired: false,
    },
    description,
    tint: "#ffffff",
    statuses: ["prone"],
    sort: 0,
    flags: {},
    start: null,
    showIcon: 1,
    folder: null,
    origin: null,
  };
}

function addArtilleryEffectToAction(data, action, effect, { onSave = false } = {}) {
  data.effects ??= [];
  data.effects.push(effect);
  action.effects ??= [];
  action.effects.push({ _id: effect._id, onSave });
}


function serializedActions(value) {
  if (Array.isArray(value)) return [...value];
  if (value?.contents) return [...value.contents];
  if (value instanceof Map) return [...value.values()];
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

let nativeDomainActionSpecimenPromise = null;
async function nativeDomainActionSpecimens() {
  if (nativeDomainActionSpecimenPromise) return nativeDomainActionSpecimenPromise;

  nativeDomainActionSpecimenPromise = (async () => {
    const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
    if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

    const specimens = {
      attack: null,
      effect: null,
      damage: null,
      healing: null,
      proneEffect: null,
      transferEffect: null,
      actionContainer: "array",
    };

    const docs = await pack.getDocuments();
    specimens.transferEffect = nativeTransferEffectSpecimen(docs);

    for (const doc of docs) {
      // Never use the Artillery cards we are currently rebuilding as schema
      // specimens. We want already-valid Foundryborne 2.9.4 data.
      if (normalizedChoice(doc.system?.domain) === ARTILLERY_DOMAIN_ID) continue;

      const raw = doc.toObject();
      const sourceActions = raw?.system?.actions;
      if (sourceActions && !Array.isArray(sourceActions) && typeof sourceActions === "object") {
        specimens.actionContainer = "object";
      }

      for (const action of serializedActions(sourceActions)) {
        const type = normalizedChoice(action?.type);
        if (type && Object.prototype.hasOwnProperty.call(specimens, type) && !specimens[type]) {
          specimens[type] = foundry.utils.deepClone(action);
        }
        if (
          type === "attack" &&
          !specimens.attack &&
          action?.roll &&
          action?.save &&
          action?.damage
        ) {
          specimens.attack = foundry.utils.deepClone(action);
        }
      }

      for (const effect of Array.isArray(raw?.effects) ? raw.effects : []) {
        if (
          !specimens.proneEffect &&
          Array.isArray(effect?.statuses) &&
          effect.statuses.includes("prone")
        ) {
          specimens.proneEffect = foundry.utils.deepClone(effect);
        }
      }

      if (specimens.attack && specimens.healing && specimens.proneEffect) break;
    }

    if (!specimens.attack) {
      throw new Error("Aucun specimen natif d'Action attack trouvé dans dh-domain-cards.");
    }

    console.info(`${MODULE_ID} | P2.11c.4a2 native Artillery specimens`, {
      attack: Boolean(specimens.attack),
      effect: Boolean(specimens.effect),
      damage: Boolean(specimens.damage),
      healing: Boolean(specimens.healing),
      proneEffect: Boolean(specimens.proneEffect),
      transferEffect: Boolean(specimens.transferEffect),
      actionContainer: specimens.actionContainer,
    });

    return specimens;
  })();

  return nativeDomainActionSpecimenPromise;
}


function nativeTransferEffectSpecimen(docs) {
  for (const doc of docs) {
    if (normalizedChoice(doc.system?.domain) === ARTILLERY_DOMAIN_ID) continue;
    const raw = doc.toObject();
    for (const effect of Array.isArray(raw?.effects) ? raw.effects : []) {
      if (
        effect?.type === "base" &&
        effect?.system &&
        Array.isArray(effect.system.changes)
      ) {
        return foundry.utils.deepClone(effect);
      }
    }
  }
  return null;
}

function artilleryEffectDraft({
  name,
  description = "",
  changes = [],
  transfer = true,
  disabled = false,
  img = ARTILLERY_DOMAIN_DEFINITION.src,
}) {
  return {
    name,
    img,
    transfer,
    _id: foundry.utils.randomID(),
    type: "base",
    system: {
      changes,
      duration: {
        description: "",
      },
      rangeDependence: null,
      stacking: null,
      targetDispositions: [],
    },
    disabled,
    duration: {
      value: null,
      units: "seconds",
      expiry: null,
      expired: false,
    },
    description,
    tint: "#ffffff",
    statuses: [],
    sort: 0,
    flags: {},
    start: null,
    showIcon: 1,
    folder: null,
    origin: null,
  };
}

function hydrateNativeEffect(specimen, draft) {
  if (!specimen) return draft;

  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();
  clone._id = id;

  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.origin = null;
  return merged;
}

function hydrateNativeAction(specimen, draft) {
  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();

  clone._id = id;

  // Merge onto a known-valid Foundryborne ActionField source so fields added or
  // made mandatory by 2.9.4 are retained instead of guessed by the Toolkit.
  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.systemPath = "actions";
  merged.baseAction = false;
  merged.originItem ??= { type: "itemCollection" };
  merged.triggers ??= [];
  merged.areas ??= [];
  merged.effects ??= [];
  merged.cost ??= [];
  merged.uses ??= {
    value: null,
    max: "",
    recovery: null,
    consumeOnSuccess: false,
  };

  return merged;
}

function hydrateNativeProneEffect(specimen, draft) {
  if (!specimen) return draft;

  const clone = foundry.utils.deepClone(specimen);
  const id = draft?._id ?? foundry.utils.randomID();
  clone._id = id;

  const merged = foundry.utils.mergeObject(
    clone,
    foundry.utils.deepClone(draft),
    {
      inplace: false,
      overwrite: true,
      recursive: true,
    }
  );

  merged._id = id;
  merged.statuses = ["prone"];
  merged.origin = null;
  return merged;
}

async function applyArtilleryDomainCardAutomation(data, raw) {
  const sourceId = String(raw?.id ?? "");
  if (!sourceId.startsWith("homebrew.artificer.domain-card.artillery.")) return null;

  const nativeSpecimens = await nativeDomainActionSpecimens();

  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].artilleryAutomation = {
    version: ARTILLERY_AUTOMATION_VERSION,
    status: "text-only",
  };

  const actionMap = {};
  const register = (action) => {
    actionMap[action._id] = action;
    return action;
  };

  if (sourceId.endsWith(".concussive-shot")) {
    const action = register(artilleryAttackAction({
      name: "Décharge concussive",
      description:
        "<p>Après une attaque réussie, marquez 1 Stress. La cible est repoussée d’un cran de portée et effectue un jet de Réaction d’Agilité (12). En cas d’échec, elle est mise À terre. Si un adversaire est mis À terre ainsi, il marque aussi 1 Stress.</p><p><em>Le recul et le Stress de la cible restent à appliquer manuellement.</em></p>",
      img: "icons/magic/sonic/explosion-shock-wave-teal.webp",
      targetAmount: 1,
      stressCost: 1,
      saveTrait: "agility",
      saveDifficulty: 12,
    }));
    action.roll.type = null;
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Échec au jet de Réaction d’Agilité (12) de Tir concussif.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: ["stress-cost", "agility-reaction-12", "prone-on-failed-save"],
      manual: ["forced-movement-one-range-step", "target-stress-if-adversary-and-prone"],
    };
  }

  if (sourceId.endsWith(".shockwave")) {
    const action = register(artilleryAttackAction({
      name: "Onde de choc",
      description:
        "<p>Effectuez un jet d’Incantation contre une cible à portée Lointaine. En cas de réussite, les adversaires à portée Très proche de la cible effectuent un jet de Réaction d’Agilité (13). Ils subissent 1d6+2 dégâts physiques dans tous les cas ; ceux qui échouent sont également mis À terre.</p>",
      img: "icons/magic/earth/projectile-stone-landslide.webp",
      range: "far",
      rollType: "spellcast",
      saveTrait: "agility",
      saveDifficulty: 13,
      saveDamageMod: "none",
    }));
    action.damage.main = artilleryDamage({
      dice: "d6",
      count: 1,
      bonus: 2,
      damageType: "physical",
    });
    action.areas = [{
      name: "Onde de choc",
      type: "placed",
      shape: "emanation",
      size: "veryClose",
      effects: [],
      hasHole: false,
    }];
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Échec au jet de Réaction d’Agilité (13) d’Onde de choc.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "native",
      automated: [
        "spellcast-roll",
        "far-range",
        "very-close-area",
        "physical-damage-1d6+2",
        "agility-reaction-13",
        "prone-on-failed-save",
      ],
      manual: [],
    };
  }

  if (sourceId.endsWith(".carpet-bomb")) {
    const action = register(artilleryAttackAction({
      name: "Bombardement en tapis",
      description:
        "<p>Une fois par repos long, effectuez un jet d’Incantation contre un point à portée Lointaine. En cas de réussite, tous les adversaires dans une zone Très proche subissent 3d10+5 dégâts physiques et effectuent un jet de Réaction d’Agilité (15). Ceux qui échouent sont mis À terre.</p><p><strong>Réussite critique :</strong> étendez manuellement la zone à portée Proche.</p>",
      img: "icons/magic/fire/projectile-meteor-salvo-strong-red.webp",
      range: "far",
      rollType: "spellcast",
      saveTrait: "agility",
      saveDifficulty: 15,
      saveDamageMod: "none",
      usesMax: "1",
      recovery: "longRest",
      consumeOnSuccess: false,
    }));
    action.damage.main = artilleryDamage({
      dice: "d10",
      count: 3,
      bonus: 5,
      damageType: "physical",
    });
    action.areas = [{
      name: "Bombardement en tapis",
      type: "placed",
      shape: "emanation",
      size: "veryClose",
      effects: [],
      hasHole: false,
    }];
    const prone = hydrateNativeProneEffect(
      nativeSpecimens.proneEffect,
      artilleryProneEffect(
        "<p>Échec au jet de Réaction d’Agilité (15) de Bombardement en tapis.</p>"
      )
    );
    addArtilleryEffectToAction(data, action, prone, { onSave: false });

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: [
        "spellcast-roll",
        "far-range",
        "very-close-area",
        "physical-damage-3d10+5",
        "agility-reaction-15",
        "prone-on-failed-save",
        "one-per-long-rest",
      ],
      manual: ["critical-success-expand-area-to-close"],
    };
  }



  if (sourceId.endsWith(".battle-rhythm")) {
    register(
      artilleryBaseAction({
        name: "Moment de calme",
        description:
          "<p>Une fois par repos, pendant un moment de calme entre deux vagues, effacez 2 Stress et gagnez 1 Cob Round.</p>",
        type: "effect",
        img: ARTILLERY_DOMAIN_DEFINITION.src,
        range: "self",
        targetAmount: null,
        usesMax: "1",
        recovery: "shortRest",
        consumeOnSuccess: false,
      })
    );

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "runtime-authoritative",
      automated: [
        "critical-attack-clear-1-stress-runtime",
        "calm-clear-2-stress-runtime",
        "calm-gain-1-cob-round-runtime",
        "one-per-rest-native",
      ],
      manual: [],
      runtimeApi: "artificerResource",
    };
  }

  if (sourceId.endsWith(".decisive-strike")) {
    register(
      artilleryBaseAction({
        name: "Armer Frappe décisive",
        description:
          "<p>Une fois par repos long, avant votre prochain jet d’attaque, dépensez tous vos Cob Rounds. Le prochain jet d’attaque gagne +1 et +2d6 dégâts par Cob Round dépensé. En cas de réussite, la cible ne peut pas effectuer de Réactions jusqu’au début de votre prochaine action.</p>",
        type: "effect",
        img: ARTILLERY_DOMAIN_DEFINITION.src,
        range: "self",
        targetAmount: null,
        usesMax: "1",
        recovery: "longRest",
        consumeOnSuccess: false,
      })
    );

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-runtime",
      automated: [
        "spend-all-cob-rounds-runtime",
        "next-attack-bonus-plus-one-per-cob-runtime-effect",
        "next-damage-plus-2d6-per-cob-manual-chat",
        "effect-consumed-on-next-attack",
        "one-per-long-rest-native",
      ],
      manual: [
        "successful-target-cannot-react-until-start-of-next-action",
      ],
      runtimeApi: "artificerResource",
    };
  }

  if (sourceId.endsWith(".heavy-volley")) {
    const effect = hydrateNativeEffect(
      nativeSpecimens.transferEffect,
      artilleryEffectDraft({
        name: "Volée lourde",
        description:
          "<p>Ajoute un dé aux jets de dégâts : d6 au Tier 1, d8 au Tier 2, d10 au Tier 3, d12 au Tier 4.</p><p><em>P2.11c.4b automatise nativement le bonus Tier 1 ; le changement de taille du dé avec le Tier reste suivi par le flag Toolkit jusqu’à ce qu’un hook de scaling sûr soit validé.</em></p>",
        transfer: true,
        disabled: false,
        img: "icons/skills/ranged/arrows-flying-salvo-blue.webp",
        changes: [
          {
            key: "system.bonuses.damage.physical.dice",
            type: "add",
            value: "d6",
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.magical.dice",
            type: "add",
            value: "d6",
            priority: null,
            phase: "initial",
          },
        ],
      })
    );
    data.effects ??= [];
    data.effects.push(effect);

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: ["tier-1-extra-d6-physical", "tier-1-extra-d6-magical"],
      manual: ["tier-scaling-d6-d8-d10-d12"],
      tierScaling: {
        1: "d6",
        2: "d8",
        3: "d10",
        4: "d12",
      },
    };
  }

  if (sourceId.endsWith(".siege-stance")) {
    const stance = hydrateNativeEffect(
      nativeSpecimens.transferEffect,
      artilleryEffectDraft({
        name: "Posture de siège",
        description:
          "<p>Tant que la posture est active : +2 aux jets d’attaque et +1d8 aux jets de dégâts. Vous ne pouvez pas être déplacé contre votre volonté. La posture prend fin dès que vous vous déplacez.</p><p><em>L’immunité au déplacement forcé et la fin automatique au mouvement restent manuelles dans P2.11c.4b.</em></p>",
        transfer: false,
        disabled: false,
        img: "icons/skills/ranged/cannon-barrel-firing-orange.webp",
        changes: [
          {
            key: "system.bonuses.roll.attack.bonus",
            type: "add",
            value: 2,
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.physical.dice",
            type: "add",
            value: "d8",
            priority: null,
            phase: "initial",
          },
          {
            key: "system.bonuses.damage.magical.dice",
            type: "add",
            value: "d8",
            priority: null,
            phase: "initial",
          },
        ],
      })
    );
    data.effects ??= [];
    data.effects.push(stance);

    const action = register(
      artilleryBaseAction({
        name: "Adopter la posture de siège",
        description:
          "<p>Une fois par repos, adoptez la Posture de siège : +2 aux attaques et +1d8 dégâts tant que vous ne vous déplacez pas.</p>",
        type: "effect",
        img: "icons/skills/ranged/cannon-barrel-firing-orange.webp",
        usesMax: "1",
        recovery: "shortRest",
        consumeOnSuccess: false,
      })
    );
    action.effects = [{ _id: stance._id, onSave: false }];

    data.flags[FLAG_SCOPE].artilleryAutomation = {
      version: ARTILLERY_AUTOMATION_VERSION,
      status: "partial-native",
      automated: [
        "one-per-rest",
        "attack-bonus-2",
        "extra-d8-physical",
        "extra-d8-magical",
        "apply-siege-stance-effect",
      ],
      manual: [
        "forced-movement-immunity",
        "remove-effect-when-actor-moves",
      ],
    };
  }

  if (!Object.keys(actionMap).length) return data.flags[FLAG_SCOPE].artilleryAutomation;

  const hydratedActions = Object.values(actionMap).map((draft) => {
    const type = normalizedChoice(draft?.type);
    const specimen =
      nativeSpecimens[type] ??
      nativeSpecimens.attack;
    return hydrateNativeAction(specimen, draft);
  });

  // Preserve the same source container shape as existing valid domain cards in
  // this exact Foundryborne runtime.
  data.system.actions =
    nativeSpecimens.actionContainer === "object"
      ? Object.fromEntries(hydratedActions.map((action) => [action._id, action]))
      : hydratedActions;

  data.flags[FLAG_SCOPE].artilleryAutomation.specimen = {
    actionContainer: nativeSpecimens.actionContainer,
    nativeAttack: true,
    nativeProne: Boolean(nativeSpecimens.proneEffect),
  };

  return data.flags[FLAG_SCOPE].artilleryAutomation;
}

export async function buildItem(entry) {
  const raw = entry.data;
  const r = rules(raw);

  const typeByKind = {
    class: "class",
    subclass: "subclass",
    domain_card: "domainCard",
    weapon: "weapon",
    armor: "armor",
    class_feature: "feature",
  };
  const type = typeByKind[entry.kind];
  if (!type) throw new Error(`Unsupported pilot Item kind: ${entry.kind}`);

  const data = await nativeTemplate("Item", type);
  data.name = nameOf(raw, entry.key);
  data.flags = foundry.utils.mergeObject(
    data.flags ?? {},
    provenanceFlags(raw, entry.source_path),
    { inplace: false }
  );

  // P2.3.4e-fix3: nativeTemplate() is a schema/default specimen, never a semantic
  // source. Always discard its prose before applying canonical DH-DATA.
  // This prevents the first native Item of a type (for example Assassin)
  // from leaking its description into every imported document of that type.
  if (data.system && "description" in data.system) data.system.description = "";
  const description = baseDescription(raw);
  if (description) data.system.description = description;

  const gaps = [];

  if (entry.kind === "class") {
    // The schema Item is a structure/default specimen only. Class artwork belongs to our
    // presentation source and must never leak from the first native specimen
    // (currently Assassin).
    data.img = await ownedClassImage(raw);

    // Sanitize every source-specific relation carried by the SRD template.
    // The in-memory document is used only to obtain a valid Foundryborne schema.
    // No specimen-specific prose, effects, links or recommendations may leak.
    data.effects = [];
    data.system.domains = [];
    data.system.classItems = [];
    data.system.features = clearItemLinks(data.system.features);
    if (data.system.inventory && typeof data.system.inventory === "object") {
      data.system.inventory.take = [];
      data.system.inventory.choiceA = [];
      data.system.inventory.choiceB = [];
    }
    if (data.system.characterGuide && typeof data.system.characterGuide === "object") {
      // Preserve the native schema shape but neutralize every recommendation
      // inherited from the specimen.
      if (data.system.characterGuide.suggestedTraits) {
        for (const key of Object.keys(data.system.characterGuide.suggestedTraits)) {
          data.system.characterGuide.suggestedTraits[key] = 0;
        }
      }
      data.system.characterGuide.suggestedPrimaryWeapon = null;
      data.system.characterGuide.suggestedSecondaryWeapon = null;
      data.system.characterGuide.suggestedArmor = null;
    }
    data.system.backgroundQuestions = ["", "", ""];
    data.system.connections = ["", "", ""];
    data.system.isMulticlass = false;
    if ("levelupOptionTiers" in data.system) data.system.levelupOptionTiers = { 2: {}, 3: {}, 4: {} };

    // Neutral schema defaults: do not inherit another class's HP/evasion.
    if ("hitPoints" in data.system) data.system.hitPoints = 5;
    if ("evasion" in data.system) data.system.evasion = 0;

    if (Array.isArray(r.domains ?? raw?.domains)) data.system.domains = r.domains ?? raw.domains;
    else gaps.push("system.domains");

    const evasion = Number(r.starting_evasion ?? r.evasion ?? raw?.starting_evasion ?? raw?.evasion);
    if (Number.isFinite(evasion)) data.system.evasion = evasion;
    else gaps.push("system.evasion");

    const hitPoints = Number(r.starting_hit_points ?? r.hitPoints ?? raw?.starting_hit_points ?? raw?.hitPoints);
    if (Number.isFinite(hitPoints)) data.system.hitPoints = hitPoints;

    const content = raw?.content ?? {};
    if (Array.isArray(content.background_questions)) data.system.backgroundQuestions = [...content.background_questions];
    if (Array.isArray(content.connections)) data.system.connections = [...content.connections];

    const guide = raw?.character_guide ?? {};
    if (data.system.characterGuide && guide.suggested_traits && typeof guide.suggested_traits === "object") {
      for (const [trait, value] of Object.entries(guide.suggested_traits)) {
        if (trait in data.system.characterGuide.suggestedTraits && Number.isFinite(Number(value))) {
          data.system.characterGuide.suggestedTraits[trait] = Number(value);
        }
      }
    }
    // Equipment recommendations are stable semantic slugs in DH-DATA. Their
    // Foundry ItemLink payloads are resolved in a later pass; never borrow the
    // specimen's recommendations.
    if (guide.suggested_primary_weapon) gaps.push("system.characterGuide.suggestedPrimaryWeapon");
    if (guide.suggested_secondary_weapon) gaps.push("system.characterGuide.suggestedSecondaryWeapon");
    if (guide.suggested_armor) gaps.push("system.characterGuide.suggestedArmor");

    // Canonical SRD class features are separate class_feature entities. The
    // parent links are resolved after all family packs have been imported.
    if (Array.isArray(raw?.feature_refs) && raw.feature_refs.length) gaps.push("system.features");
    // Blood Hunter still carries embedded feature definitions and uses its
    // dedicated resolver below.
    if (Array.isArray(r.features) && r.features.length) gaps.push("system.features");
  }

  if (entry.kind === "class_feature") {
    // Feature specimens may contain executable automation/effects belonging to
    // an unrelated native feature. Keep only schema + canonical prose.
    data.effects = [];
    if (data.system) {
      if ("actions" in data.system) delete data.system.actions;
      if ("resource" in data.system) delete data.system.resource;
      if ("gmNotes" in data.system) data.system.gmNotes = "";
      if ("granter" in data.system) data.system.granter = null;
      if ("actorResources" in data.system) data.system.actorResources = [];
      if ("featureForm" in data.system) data.system.featureForm = "passive";
    }
    data.flags[FLAG_SCOPE].parentSourceId = raw?.class_id ?? null;
    data.flags[FLAG_SCOPE].sourceFeatureType = raw?.feature_type ?? null;
  }

  if (entry.kind === "subclass") {
    // As with classes, the schema subclass is a structure/default specimen only.
    data.effects = [];
    data.system.features = clearItemLinks(data.system.features);
    data.system.featureState = 1; // native schema default, not template semantics
    data.system.linkedClass = null;
    data.system.spellcastingTrait = null;
    if ("isMulticlass" in data.system) data.system.isMulticlass = false;

    const hasExplicitSpellcast = Object.prototype.hasOwnProperty.call(r, "spellcast_trait")
      || Object.prototype.hasOwnProperty.call(r, "spellcastingTrait")
      || Object.prototype.hasOwnProperty.call(raw ?? {}, "spellcast_trait");
    const sourceTrait = r.spellcast_trait ?? r.spellcastingTrait ?? raw?.spellcast_trait ?? null;
    const trait = normalizedChoice(sourceTrait);
    if (trait) data.system.spellcastingTrait = trait;
    else if (!hasExplicitSpellcast) gaps.push("system.spellcastingTrait");

    // Preserve the neutral parent identity for a later UUID-resolution pass.
    const linkedClassSourceId = raw?.class_id ?? raw?.classId ?? raw?.class ?? null;
    data.flags[FLAG_SCOPE].linkedClassSourceId = linkedClassSourceId;
    if (linkedClassSourceId) gaps.push("system.linkedClass");
    if (Array.isArray(r.features) && r.features.length) gaps.push("system.features");
  }

  if (entry.kind === "domain_card") {
    // Domain-card specimens can carry executable Actions and Active Effects.
    // Never inherit them: only explicitly mapped canonical mechanics belong
    // on the imported card.
    data.effects = [];
    if ("actions" in data.system) data.system.actions = [];
    if ("resource" in data.system) data.system.resource = null;

    const domain = r.domain ?? raw?.domain;
    if (domain) {
      data.system.domain = normalizedChoice(domain);

      const icon = domainIcon(domain);
      if (icon) data.img = icon;
      else if (normalizedChoice(domain) === HUNT_DOMAIN_ID) {
        data.img = HUNT_DOMAIN_DEFINITION.src;
      } else gaps.push("img.domain");
    }

    const level = Number(r.level ?? raw?.level);
    if (Number.isFinite(level)) data.system.level = level;

    const recall = Number(r.recall_cost ?? r.recallCost ?? raw?.recall_cost);
    if (Number.isFinite(recall)) data.system.recallCost = recall;

    // Domain-card type is canonical DH-DATA semantics, not a template default.
    // Explicitly map it so a spell/grimoire never inherits the specimen's
    // neutral "ability" value. Unknown future values remain visible as gaps.
    const cardType = normalizedChoice(r.card_type ?? r.cardType ?? raw?.card_type);
    if (["ability", "spell", "grimoire"].includes(cardType)) data.system.type = cardType;
    else if (cardType) gaps.push("system.type");

    if (normalizedChoice(data.system.domain) === ARTILLERY_DOMAIN_ID) {
      await applyArtilleryDomainCardAutomation(data, raw);
    }
  }

  if (entry.kind === "weapon" || entry.kind === "armor") {
    const tier = Number(r.tier ?? raw?.tier);
    if (Number.isFinite(tier)) data.system.tier = tier;
  }

  if (entry.kind === "weapon") {
    if ("equipped" in data.system) data.system.equipped = false;
    if ("secondary" in data.system) data.system.secondary = raw?.slot === "secondary";
    if (typeof raw?.burden === "string" && "burden" in data.system) {
      const burden = mapWeaponBurden(raw.burden);
      if (burden) data.system.burden = burden;
      else console.warn(`${MODULE_ID} | unmapped weapon burden`, raw.burden, raw?.id ?? data.name);
    }
    data.system.weaponFeatures = [];
    if (Array.isArray(data.system.actions)) data.system.actions = [];
    if ("resource" in data.system) data.system.resource = null;

    // P2.3.3e: map the complete neutral weapon stat line into Foundryborne's
    // native attack ActionField while preserving the template's required shape.
    if (data.system.attack && typeof data.system.attack === "object") {
      data.system.attack.name = "Attack";
      data.system.attack.img = "icons/svg/sword.svg";
      data.system.attack._id = foundry.utils.randomID();
      data.system.attack.baseAction = true;
      data.system.attack.chatDisplay = false;
      data.system.attack.systemPath = "attack";
      data.system.attack.type = "attack";

      const mappedRange = mapRange(raw?.range ?? r?.range);
      if (mappedRange) data.system.attack.range = mappedRange;
      else gaps.push("system.attack.range");

      const sourceTrait = raw?.trait ?? r?.trait;
      const mappedTrait = mapTrait(sourceTrait);
      const spellcastTrait = normalizedToken(sourceTrait) === "spellcast";
      if (data.system.attack.roll) {
        data.system.attack.roll.type = "attack";
        if (mappedTrait) {
          data.system.attack.roll.trait = mappedTrait;
        } else if (spellcastTrait) {
          // "Spellcast" is a DH rules-level pseudo-trait: the actual trait is
          // supplied by the character's subclass. Foundryborne's Action roll
          // ChoiceField only accepts the six concrete actor abilities, so never
          // serialize the literal string "spellcast" here. Keep the action
          // nullable/default-driven and retain an explicit mapping gap until we
          // wire the equipped weapon to character.spellcastModifierTrait.
          data.system.attack.roll.trait = null;
          if ("useDefault" in data.system.attack.roll) data.system.attack.roll.useDefault = true;
          data.flags[FLAG_SCOPE].sourceAttackTrait = "spellcast";
          data.flags[FLAG_SCOPE].spellcastTraitResolution = "actor-default";
        } else {
          gaps.push("system.attack.roll.trait");
        }
      }

      const parsedDamage = parseWeaponDamage(raw?.damage ?? r?.damage);
      const damageTypes = mapDamageTypes(raw?.damage_type ?? r?.damage_type);
      if (data.system.attack.damage?.main) {
        if (damageTypes.length) data.system.attack.damage.main.type = damageTypes;
        else gaps.push("system.attack.damage.type");
        if (parsedDamage && data.system.attack.damage.main.value) {
          const value = data.system.attack.damage.main.value;
          value.multiplier = "prof";
          value.dice = parsedDamage.dice;
          if (value.custom) {
            value.custom.enabled = parsedDamage.bonus !== 0;
            value.custom.formula = parsedDamage.bonus !== 0
              ? `@prof${parsedDamage.dice}${parsedDamage.bonus > 0 ? "+" : ""}${parsedDamage.bonus}`
              : "";
          }
        } else gaps.push("system.attack.damage.value");
      }
    } else gaps.push("system.attack");

    const feature = raw?.feature ?? r?.feature;
    if (feature && (feature.name || feature.text)) {
      const key = configuredFeatureKey("weapon", feature);
      if (key) {
        const nativeMapping = await applyNativeEquipmentFeature(data, "weapon", key);
        if (nativeMapping) {
          recordEquipmentFeatureDisposition(data, "weapon", feature, key, "nativeMapped", {
            nativeSourceUuid: nativeMapping.sourceUuid ?? null,
          });
        } else {
          data.system.weaponFeatures = [{ value: key, effectIds: [], actionIds: [] }];
          const versatile = parseVersatileProfile(feature);
          if (versatile) {
            recordEquipmentFeatureDisposition(data, "weapon", feature, key, "mappedStructured", {
              family: "versatile",
              alternateProfile: versatile,
            });
          } else {
            recordEquipmentFeatureDisposition(data, "weapon", feature, key, "deferredAutomation");
          }
        }
        // Configured feature rendering owns the visible rule text. Keep source
        // provenance without duplicating the rule in description.
      } else {
        data.system.description = appendFeatureDescription(data.system.description, feature, "Weapon Feature");
        gaps.push("system.weaponFeatures:catalog");
      }
    }
  }

  if (entry.kind === "armor") {
    if ("equipped" in data.system) data.system.equipped = false;
    const score = Number(raw?.base_score ?? r.base_score);
    if (Number.isFinite(score) && data.system.armor && typeof data.system.armor === "object") {
      if ("max" in data.system.armor) data.system.armor.max = score;
      if ("current" in data.system.armor) data.system.armor.current = score;
    }
    const thresholds = raw?.base_thresholds ?? r.base_thresholds;
    if (thresholds && data.system.baseThresholds && typeof data.system.baseThresholds === "object") {
      const major = Number(thresholds.major);
      const severe = Number(thresholds.severe);
      if (Number.isFinite(major) && "major" in data.system.baseThresholds) data.system.baseThresholds.major = major;
      if (Number.isFinite(severe) && "severe" in data.system.baseThresholds) data.system.baseThresholds.severe = severe;
    }
    data.system.armorFeatures = [];
    if (Array.isArray(data.system.actions)) data.system.actions = [];
    if ("resource" in data.system) data.system.resource = null;

    const feature = raw?.feature ?? r?.feature;
    if (feature && (feature.name || feature.text)) {
      const key = configuredFeatureKey("armor", feature);
      if (key) {
        const nativeMapping = await applyNativeEquipmentFeature(data, "armor", key);
        if (nativeMapping) {
          recordEquipmentFeatureDisposition(data, "armor", feature, key, "nativeMapped", {
            nativeSourceUuid: nativeMapping.sourceUuid ?? null,
          });
        } else {
          data.system.armorFeatures = [{ value: key, effectIds: [], actionIds: [] }];
          recordEquipmentFeatureDisposition(data, "armor", feature, key, "deferredAutomation");
        }
        // Native catalog rendering owns the visible rule text; avoid duplicating
        // the same source feature in the generic description.
      } else {
        data.system.description = appendFeatureDescription(data.system.description, feature, "Armor Feature");
        gaps.push("system.armorFeatures:catalog");
      }
    }
  }

  setMappingGaps(data, gaps);
  await applyContentLocale(data, entry.id ?? entry.sourceId ?? data.flags?.["daggerheart-campaign-toolkit"]?.sourceId, getImportLocale());
  return data;
}


function huntingNotesHtml(raw) {
  const hunting = raw?.hunting;
  if (!hunting || typeof hunting !== "object" || Array.isArray(hunting)) return "";

  const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const labelTag = (tag) => {
    const labels = {
      herbivore: "Herbivore",
      burrower: "Fouisseur",
      flying: "Volant",
      carnivore: "Carnivore",
    };
    return labels[tag] ?? String(tag);
  };

  const lines = [];
  lines.push("<h3>Hunting</h3>");

  if (Array.isArray(hunting.tags) && hunting.tags.length) {
    lines.push(`<p><strong>Tags :</strong> ${hunting.tags.map(labelTag).map(esc).join(", ")}</p>`);
  }

  if (hunting.footprint?.width && hunting.footprint?.height) {
    lines.push(
      `<p><strong>Empreinte :</strong> ${esc(hunting.footprint.width)}×${esc(hunting.footprint.height)}</p>`
    );
  }

  if (hunting.mobility?.mode) {
    const mobility = hunting.mobility.state
      ? `${hunting.mobility.mode} (${hunting.mobility.state})`
      : hunting.mobility.mode;
    lines.push(`<p><strong>Mobilité :</strong> ${esc(mobility)}</p>`);
  }

  if (Array.isArray(hunting.loot) && hunting.loot.length) {
    lines.push("<h4>Parties et butin</h4>");
    lines.push("<ul>");
    for (const loot of hunting.loot) {
      const part = esc(loot?.part ?? "Butin");
      const uuid = String(loot?.uuid ?? "").trim();
      const link = uuid ? `@UUID[${uuid}]{${part}}` : part;
      lines.push(`<li>${link}</li>`);
    }
    lines.push("</ul>");
  }

  if (hunting.colossus?.parts?.length) {
    lines.push("<h4>Parties Colossus</h4>");
    lines.push("<ul>");
    for (const part of hunting.colossus.parts) {
      const ft = Number(part?.fractureThreshold);
      const ftText = Number.isFinite(ft) ? ` — FT ${esc(ft)}` : "";
      const effectText = part?.brokenEffectName ? ` → <strong>${esc(part.brokenEffectName)}</strong>` : "";
      const consequence = part?.brokenConsequence ? `<br><small>${esc(part.brokenConsequence)}</small>` : "";
      lines.push(`<li><strong>${esc(part?.name ?? part?.id ?? "Partie")}</strong>${ftText}${effectText}${consequence}</li>`);
    }
    lines.push("</ul>");
    lines.push("<p><em>Assembler dans Colossus par glisser-déposer : Tetsucabra comme principal, puis les Actors de partie.</em></p>");
  }

  if (hunting.colossusPart === true) {
    const ft = Number(hunting.fractureThreshold);
    lines.push("<h4>Partie Colossus</h4>");
    if (Number.isFinite(ft)) lines.push(`<p><strong>Seuil de fracture :</strong> ${esc(ft)} sur un même impact.</p>`);
    if (hunting.brokenEffect?.name) lines.push(`<p><strong>Broken :</strong> ${esc(hunting.brokenEffect.name)} — ${esc(hunting.brokenEffect.rule ?? "")}</p>`);
    if (hunting.notes) lines.push(`<p>${esc(hunting.notes)}</p>`);
  }

  const normal = hunting.reactions?.normal;
  const fear = hunting.reactions?.fear;
  const normalName = normal?.name ?? "Réaction normale";
  const fearName = fear?.name ?? "Réaction renforcée";

  lines.push("<h4>Matrice d'Engagement</h4>");
  lines.push("<ul>");
  lines.push("<li><strong>Succès + Hope :</strong> 2 OP — aucune réaction hostile — Spotlight → Finisher.</li>");
  lines.push(`<li><strong>Succès + Fear :</strong> 2 OP — ${esc(normalName)}.</li>`);
  lines.push(`<li><strong>Échec + Hope :</strong> 1 OP — ${esc(normalName)}.</li>`);
  lines.push(`<li><strong>Échec + Fear :</strong> 1 OP — ${esc(fearName)}.</li>`);
  lines.push("</ul>");

  const reactionDetails = (reaction, key) => {
    if (!reaction || typeof reaction !== "object") return;

    lines.push(`<h4>${esc(reaction.name ?? key)}</h4>`);

    if (reaction.baseReaction === "normal" && normal?.name) {
      lines.push(`<p>Résoudre d'abord <strong>${esc(normal.name)}</strong>, puis appliquer la conséquence ci-dessous.</p>`);
    }

    const resolution = reaction.resolution;
    if (!resolution || typeof resolution !== "object") return;

    if (resolution.kind === "attack") {
      const attack = resolution.attack ?? {};
      const mod = Number(attack.modifier);
      const modText = Number.isFinite(mod) ? (mod >= 0 ? `+${mod}` : `${mod}`) : "?";
      lines.push(
        `<p><strong>Attaque contre l'Opener :</strong> ${esc(modText)} | ` +
        `${esc(attack.range ?? "?")} | ${esc(attack.damage ?? "?")} ${esc(attack.damage_type ?? "")}</p>`
      );
      if (reaction.supportWindow) {
        lines.push("<p><strong>Support :</strong> 1 Hope → −1d4 au jet d'attaque du monstre.</p>");
      }
      if (resolution.onHit?.markStress) {
        lines.push(`<p><strong>Sur une touche :</strong> la cible marque ${esc(resolution.onHit.markStress)} Stress.</p>`);
      }
    } else if (resolution.kind === "forcedMovement") {
      lines.push(
        `<p>Projeter l'Opener de <strong>${esc(resolution.steps ?? "?")} bandes de portée</strong>.`
      );
      if (resolution.collision?.damagePerUnspentStep) {
        lines.push(
          ` Chaque bande non parcourue à cause d'un obstacle solide inflige ` +
          `<strong>${esc(resolution.collision.damagePerUnspentStep)} ${esc(resolution.collision.damage_type ?? "")}</strong> de collision.</p>`
        );
      } else {
        lines.push("</p>");
      }
    } else if (resolution.kind === "consequence" && resolution.text) {
      lines.push(`<p>${esc(resolution.text)}</p>`);
    }
  };

  reactionDetails(normal, "Réaction normale");
  reactionDetails(fear, "Réaction renforcée");

  return lines.join("");
}

export async function buildActor(entry) {
  const raw = entry.data;
  const r = rules(raw);
  const type = entry.kind === "adversary"
    ? "adversary"
    : entry.kind === "environment"
      ? "environment"
      : null;

  if (!type) throw new Error(`Unsupported pilot Actor kind: ${entry.kind}`);

  const data = await nativeTemplate("Actor", type);
  data.name = nameOf(raw, entry.key);

  // P2.6.4a1: Actor templates are cloned from a native Foundryborne specimen.
  // Never keep the specimen's prototype-token identity (e.g. "Cult Adept").
  if (data.prototypeToken && typeof data.prototypeToken === "object") {
    data.prototypeToken.name = data.name;
  }

  data.flags = foundry.utils.mergeObject(
    data.flags ?? {},
    provenanceFlags(raw, entry.source_path),
    { inplace: false }
  );
  sanitizeEmbeddedActorData(data);

  // P2.3.3p / P2.3.4e-fix2c: Actor templates may carry specimen-specific
  // descriptive prose. Never inherit that prose implicitly. Preserve only
  // an explicit description supplied by canonical DH-DATA.
  data.system.description = "";
  const sourceDescription = baseDescription(raw);
  if (sourceDescription) data.system.description = sourceDescription;

  const gaps = [];
  const tier = Number(r.tier ?? raw?.tier);
  if (Number.isFinite(tier)) data.system.tier = tier;

  const difficulty = Number(r.difficulty ?? raw?.difficulty);
  if (Number.isFinite(difficulty)) data.system.difficulty = difficulty;

  if (entry.kind === "adversary") {
    const role = normalizedChoice(r.role ?? raw?.role);
    if (role) data.system.type = role;

    const motives = raw?.motives_tactics ?? raw?.motives_and_tactics ?? raw?.motivesAndTactics;
    data.system.motivesAndTactics = typeof motives === "string" ? motives : "";

    // Preserve the valid ActionField shape from the native template, but replace
    // every semantic attack value with DH-DATA. Never keep the template attack.
    const attackTemplate = foundry.utils.deepClone(data.system.attack);
    data.system.attack = null;
    data.system.experiences = {};
    data.system.hordeHp = 1;
    data.system.criticalThreshold = 20;

    const thresholds = raw?.thresholds ?? r?.thresholds ?? raw?.damageThresholds;
    if (data.system.damageThresholds && typeof data.system.damageThresholds === "object") {
      data.system.damageThresholds.major = 0;
      data.system.damageThresholds.severe = 0;
      const major = Number(thresholds?.major);
      const severe = Number(thresholds?.severe);
      if (Number.isFinite(major)) data.system.damageThresholds.major = major;
      if (Number.isFinite(severe)) data.system.damageThresholds.severe = severe;
      // Minions canonically have no damage thresholds; absence is semantic, not
      // a mapping failure. Other partial/missing threshold rows remain explicit.
      const isMinion = normalizedToken(r.role ?? raw?.role) === "minion";
      if (!isMinion && (!Number.isFinite(major) || !Number.isFinite(severe))) gaps.push("system.damageThresholds");
    }

    // Creature resources are simple neutral fields and are safe to map now.
    const hp = Number(raw?.hp ?? r?.hp);
    const stress = Number(raw?.stress ?? r?.stress);
    if (data.system.resources?.hitPoints) {
      if (Number.isFinite(hp)) {
        data.system.resources.hitPoints.max = hp;
        data.system.resources.hitPoints.value = 0;
      } else gaps.push("system.resources.hitPoints");
    }
    if (data.system.resources?.stress) {
      if (Number.isFinite(stress)) {
        data.system.resources.stress.max = stress;
        data.system.resources.stress.value = 0;
      } else if (raw?.stress_none === true) {
        // Explicit source semantics: this adversary cannot mark Stress.
        data.system.resources.stress.max = 0;
        data.system.resources.stress.value = 0;
        data.flags[FLAG_SCOPE].stressNone = true;
      } else gaps.push("system.resources.stress");
    }

    // P2.3.3f: standard adversary attack and Experiences are sufficiently
    // structured in DH-DATA to map natively. Complex FEATURES remain source text
    // until the extraction is normalized into discrete feature records.
    if (raw?.attack) {
      data.system.attack = mapAdversaryAttack(attackTemplate, raw.attack, gaps);
      if (!data.system.attack) gaps.push("system.attack");

      // P2.3.3m: "direct" is a damage semantic, not part of the Roll formula.
      // Foundryborne has no dedicated direct-damage field on this ActionField,
      // so retain the exact semantic as provenance instead of treating it as
      // missing data. The numeric formula remains natively rollable.
      const sourceDamage = String(raw.attack.damage ?? "").trim();
      const directMatch = /^(\d+)\s+direct$/i.exec(sourceDamage);
      if (directMatch) {
        data.flags[FLAG_SCOPE].sourceAttackDamage = {
          raw: sourceDamage,
          formula: directMatch[1],
          direct: true,
          meaning: "cannot-be-reduced-by-armor-slots",
        };
        for (let i = gaps.length - 1; i >= 0; i--) {
          if (gaps[i] === "system.attack.damage:direct-semantics") gaps.splice(i, 1);
        }
      }
    }

    if (raw?.experience_text) {
      const experiences = parseAdversaryExperiences(raw.experience_text);
      data.system.experiences = experiences;
      if (!Object.keys(experiences).length) gaps.push("system.experiences:parse");
    }

    const huntingNote = huntingNotesHtml(raw);
    data.system.notes = huntingNote || "";
    data.items = await mapEmbeddedSourceFeatures(raw, entry.source_path, gaps);
    data.flags[FLAG_SCOPE].sourceFeatureCount = Array.isArray(raw?.features) ? raw.features.length : 0;

    // P2.6.3e / P2.6.4a: preserve the complete canonical Hunting extension
    // losslessly in Toolkit flags. The note above is presentation only.
    if (raw?.hunting && typeof raw.hunting === "object" && !Array.isArray(raw.hunting)) {
      data.flags[FLAG_SCOPE].hunting = foundry.utils.deepClone(raw.hunting);
    }
  }

  if (entry.kind === "environment") {
    const envType = normalizedChoice(r.type ?? raw?.type);
    if (envType) data.system.type = envType;

    const impulses = raw?.impulses ?? r.impulses;
    data.system.impulses = typeof impulses === "string" ? impulses : Array.isArray(impulses) ? impulses.join(", ") : "";
    data.system.potentialAdversaries = {};
    if (typeof raw?.potential_adversaries_text === "string" && raw.potential_adversaries_text.trim()) {
      data.flags[FLAG_SCOPE].potentialAdversariesSourceText = raw.potential_adversaries_text.trim();
    }

    const noteParts = [raw?.description, raw?.potential_adversaries_text].filter(v => typeof v === "string" && v.trim());
    data.system.notes = noteParts.length
      ? `<p>${foundry.utils.escapeHTML(noteParts.join("\n\n"))}</p>`
      : "";
    if (raw?.potential_adversaries_text) gaps.push("system.potentialAdversaries:uuid-resolution");
    data.items = await mapEmbeddedSourceFeatures(raw, entry.source_path, gaps);
    data.flags[FLAG_SCOPE].sourceFeatureCount = Array.isArray(raw?.features) ? raw.features.length : 0;
  }

  setMappingGaps(data, gaps);
  await applyContentLocale(data, raw?.id ?? entry.id ?? entry.sourceId ?? data.flags?.[FLAG_SCOPE]?.sourceId, getImportLocale());
  return data;
}

async function loadPilot() {
  const response = await fetch(PILOT_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`pilot.json introuvable (${response.status}). Lance d'abord export_foundry_pilot.py.`);
  }
  const payload = await response.json();
  if (payload?.phase !== "P2.3.1") throw new Error("pilot.json n'est pas un payload P2.3.1");
  return payload;
}

export async function seedPack(packId, docs, documentClass) {
  const pack = game.packs.get(`${MODULE_ID}.${packId}`);
  if (!pack) throw new Error(`Compendium absent: ${packId}`);

  await pack.configure({ locked: false });
  try {
    const index = await pack.getIndex({ fields: [`flags.${FLAG_SCOPE}.pilot`] });
    const pilotIds = index
      .filter((e) => foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true)
      .map((e) => e._id);

    for (const id of pilotIds) {
      const doc = await pack.getDocument(id);
      if (doc) await doc.delete();
    }

    for (const data of docs) {
      await documentClass.create(data, { pack: pack.collection });
    }
  } finally {
    await pack.configure({ locked: true });
  }
}

export async function importPilot() {
  if (!game.user?.isGM) throw new Error("P2.3.1 pilot import is GM-only.");

  const payload = await loadPilot();
  const itemEntries = payload.entries.filter((e) =>
    ["class", "subclass", "domain_card", "weapon", "armor"].includes(e.kind)
  );
  const actorEntries = payload.entries.filter((e) =>
    ["adversary", "environment"].includes(e.kind)
  );

  const itemDocs = [];
  for (const entry of itemEntries) itemDocs.push(await buildItem(entry));

  const actorDocs = [];
  for (const entry of actorEntries) actorDocs.push(await buildActor(entry));

  await seedPack("pilot-items", itemDocs, Item);
  await seedPack("pilot-actors", actorDocs, Actor);

  const result = await pilotStatus();
  console.log(`${MODULE_ID} | P2.3.2 mapped pilot imported`, result);
  ui.notifications.info("Campaign Toolkit : P2.3.2 mapping importé");
  return result;
}

export async function clearPilot() {
  if (!game.user?.isGM) throw new Error("P2.3.1 pilot clear is GM-only.");
  await seedPack("pilot-items", [], Item);
  await seedPack("pilot-actors", [], Actor);
  return pilotStatus();
}

export async function pilotStatus() {
  const result = {};
  for (const [key, packId] of [["items", "pilot-items"], ["actors", "pilot-actors"]]) {
    const pack = game.packs.get(`${MODULE_ID}.${packId}`);
    if (!pack) {
      result[key] = { available: false, count: 0 };
      continue;
    }
    const index = await pack.getIndex({
      fields: [`flags.${FLAG_SCOPE}.pilot`, "type", "name"]
    });
    const pilot = index.filter((e) =>
      foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true
    );
    result[key] = {
      available: true,
      count: pilot.length,
      documents: pilot.map((e) => ({ name: e.name, type: e.type })),
    };
  }

  console.table({
    pilotItems: result.items.count,
    pilotActors: result.actors.count,
  });
  return result;
}


export async function mappingAudit() {
  const rows = [];
  for (const packId of ["pilot-items", "pilot-actors"]) {
    const pack = game.packs.get(`${MODULE_ID}.${packId}`);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: [`flags.${FLAG_SCOPE}.pilot`] });
    for (const entry of index.filter((e) => foundry.utils.getProperty(e, `flags.${FLAG_SCOPE}.pilot`) === true)) {
      const doc = await pack.getDocument(entry._id);
      const source = doc?.toObject();
      if (!source) continue;
      rows.push({
        pack: packId,
        name: source.name,
        type: source.type,
        sourceId: foundry.utils.getProperty(source, `flags.${FLAG_SCOPE}.sourceId`) ?? null,
        mappingVersion: foundry.utils.getProperty(source, `flags.${FLAG_SCOPE}.mappingVersion`) ?? null,
        tier: source.system?.tier ?? null,
        domain: source.system?.domain ?? null,
        level: source.system?.level ?? null,
        evasion: source.system?.evasion ?? null,
        difficulty: source.system?.difficulty ?? null,
      });
    }
  }
  console.table(rows);
  return rows;
}


export async function importCanonicalDomainCard(sourcePath) {
  if (!game.user?.isGM) {
    throw new Error("L’import d’une carte de domaine Toolkit est réservé au MJ.");
  }

  const cleanPath = String(sourcePath ?? "").replace(/^\/+/, "");
  if (!cleanPath.startsWith("data/homebrew/") || !cleanPath.endsWith(".json")) {
    throw new Error(`Chemin de carte de domaine non autorisé: ${cleanPath}`);
  }

  const response = await fetch(`modules/${MODULE_ID}/${cleanPath}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${cleanPath} introuvable (${response.status}).`);
  }

  const raw = await response.json();
  if (raw?.kind !== "domain_card" || !raw?.id) {
    throw new Error(`${cleanPath} n’est pas une carte de domaine canonique valide.`);
  }

  if (normalizedChoice(raw?.domain) === HUNT_DOMAIN_ID) {
    const registration = await ensureHuntDomain();
    if (!registration.green) {
      throw new Error("Le domaine Chasse n’a pas pu être enregistré dans Foundryborne.");
    }
  }
  if (normalizedChoice(raw?.domain) === ARTILLERY_DOMAIN_ID) {
    const registration = await ensureArtilleryDomain();
    if (!registration.green) {
      throw new Error("Le domaine Artillery n’a pas pu être enregistré dans Foundryborne.");
    }
  }

  const entry = {
    kind: "domain_card",
    key: raw.id,
    corpus: raw?.source?.corpus ?? "homebrew",
    source_path: cleanPath,
    data: raw,
  };

  const data = await buildItem(entry);
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].managed = true;
  data.flags[FLAG_SCOPE].kind = "domain_card";
  data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
  data.flags[FLAG_SCOPE].contentOrigin = "homebrew";

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    const previous = docs.filter(
      (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === raw.id
    );

    for (const doc of previous) {
      await doc.delete();
    }

    const created = await Item.create(data, {
      pack: pack.collection,
    });

    ui.notifications.info(
      `Campaign Toolkit : ${created.name} importée dans dh-domain-cards.`
    );

    return created;
  } finally {
    await pack.configure({ locked: true });
  }
}




export async function normalizeHuntCardIcons() {
  if (!game.user?.isGM) {
    throw new Error("La normalisation des icônes Chasse est réservée au MJ.");
  }

  const domain = await ensureHuntDomain();
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  let packChanged = 0;
  let actorChanged = 0;

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (
        doc.type === "domainCard" &&
        normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID &&
        doc.img !== HUNT_DOMAIN_DEFINITION.src
      ) {
        await doc.update({ img: HUNT_DOMAIN_DEFINITION.src });
        packChanged += 1;
      }
    }
  } finally {
    await pack.configure({ locked: true });
  }

  for (const actor of game.actors ?? []) {
    const updates = actor.items
      .filter(
        (item) =>
          item.type === "domainCard" &&
          normalizedChoice(item.system?.domain) === HUNT_DOMAIN_ID &&
          item.img !== HUNT_DOMAIN_DEFINITION.src
      )
      .map((item) => ({
        _id: item.id,
        img: HUNT_DOMAIN_DEFINITION.src,
      }));

    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      actorChanged += updates.length;
    }
  }

  const result = {
    green: true,
    icon: HUNT_DOMAIN_DEFINITION.src,
    domainChanged: domain.changed,
    packChanged,
    actorChanged,
    changed: domain.changed || packChanged > 0 || actorChanged > 0,
  };

  console.log(`${MODULE_ID} | P2.11b.1 Hunt icon normalized`, result);
  ui.notifications.info(
    `Campaign Toolkit : icône Chasse synchronisée (${packChanged} compendium, ${actorChanged} personnage(s)).`
  );
  return result;
}

export async function huntIconStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) return { green: false, reason: "dh-domain-cards absent" };

  const docs = await pack.getDocuments();
  const packCards = docs.filter(
    (doc) =>
      doc.type === "domainCard" &&
      normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
  );

  const actorCards = [];
  for (const actor of game.actors ?? []) {
    for (const item of actor.items ?? []) {
      if (
        item.type === "domainCard" &&
        normalizedChoice(item.system?.domain) === HUNT_DOMAIN_ID
      ) {
        actorCards.push({
          actor: actor.name,
          actorId: actor.id,
          item: item.name,
          itemId: item.id,
          img: item.img,
          green: item.img === HUNT_DOMAIN_DEFINITION.src,
        });
      }
    }
  }

  const allDomains = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const configDomain = allDomains[HUNT_DOMAIN_ID] ?? CONFIG?.DH?.DOMAIN?.domains?.[HUNT_DOMAIN_ID] ?? null;

  const rows = packCards.map((doc) => ({
    scope: "compendium",
    owner: "dh-domain-cards",
    name: doc.name,
    id: doc.id,
    img: doc.img,
    green: doc.img === HUNT_DOMAIN_DEFINITION.src,
  })).concat(actorCards.map((row) => ({
    scope: "actor",
    owner: row.actor,
    name: row.item,
    id: row.itemId,
    img: row.img,
    green: row.green,
  })));

  const result = {
    green:
      configDomain?.src === HUNT_DOMAIN_DEFINITION.src &&
      rows.every((row) => row.green),
    icon: HUNT_DOMAIN_DEFINITION.src,
    domainIcon: configDomain?.src ?? null,
    compendiumCards: packCards.length,
    actorCards: actorCards.length,
    invalid: rows.filter((row) => !row.green),
    rows,
  };

  console.table(rows);
  return result;
}


export async function normalizeHuntCardRoles() {
  if (!game.user?.isGM) {
    throw new Error("La normalisation des rôles Chasse est réservée au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  const docs = await pack.getDocuments();
  const changes = [];
  const missing = [];

  await pack.configure({ locked: false });
  try {
    for (const [expectedName, roles] of Object.entries(HUNT_CARD_ROLE_CONTRACT)) {
      const key = normalizedHuntCardName(expectedName);
      const candidates = docs.filter(
        (doc) =>
          normalizedHuntCardName(doc.name) === key &&
          normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
      );

      if (candidates.length !== 1) {
        missing.push({
          name: expectedName,
          found: candidates.length,
        });
        continue;
      }

      const doc = candidates[0];
      const current =
        doc.flags?.[FLAG_SCOPE]?.huntingCardRoles ?? {};

      const next = {
        schemaVersion: HUNT_CARD_ROLE_SCHEMA_VERSION,
        combatRole: roles.combatRole,
        huntRole: roles.huntRole,
      };

      if (
        current.schemaVersion === next.schemaVersion &&
        current.combatRole === next.combatRole &&
        current.huntRole === next.huntRole
      ) {
        continue;
      }

      await doc.update({
        [`flags.${FLAG_SCOPE}.huntingCardRoles`]: next,
      });

      changes.push({
        id: doc.id,
        name: doc.name,
        combatRole: next.combatRole,
        huntRole: next.huntRole,
      });
    }
  } finally {
    await pack.configure({ locked: true });
  }

  const result = {
    green: missing.length === 0,
    expected: Object.keys(HUNT_CARD_ROLE_CONTRACT).length,
    changed: changes.length,
    missing,
    changes,
  };

  console.table(
    Object.entries(HUNT_CARD_ROLE_CONTRACT).map(([name, roles]) => ({
      name,
      combatRole: roles.combatRole,
      huntRole: roles.huntRole,
    }))
  );
  console.log(`${MODULE_ID} | P2.11a.4 Hunt card roles`, result);

  if (result.green) {
    ui.notifications.info(
      `Campaign Toolkit : rôles Chasse normalisés (${changes.length} modification(s)).`
    );
  } else {
    ui.notifications.warn(
      `Campaign Toolkit : rôles Chasse incomplets (${missing.length} anomalie(s)).`
    );
  }

  return result;
}

export async function huntCardRoleStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    return { green: false, reason: "dh-domain-cards absent" };
  }

  const docs = await pack.getDocuments();
  const rows = Object.entries(HUNT_CARD_ROLE_CONTRACT).map(([expectedName, roles]) => {
    const key = normalizedHuntCardName(expectedName);
    const candidates = docs.filter(
      (doc) =>
        normalizedHuntCardName(doc.name) === key &&
        normalizedChoice(doc.system?.domain) === HUNT_DOMAIN_ID
    );

    const doc = candidates.length === 1 ? candidates[0] : null;
    const stored = doc?.flags?.[FLAG_SCOPE]?.huntingCardRoles ?? null;

    return {
      expectedName,
      found: Boolean(doc),
      id: doc?.id ?? null,
      domain: doc?.system?.domain ?? null,
      combatRole: stored?.combatRole ?? null,
      huntRole: stored?.huntRole ?? null,
      expectedCombatRole: roles.combatRole,
      expectedHuntRole: roles.huntRole,
      schemaVersion: stored?.schemaVersion ?? null,
      green:
        Boolean(doc) &&
        stored?.schemaVersion === HUNT_CARD_ROLE_SCHEMA_VERSION &&
        stored?.combatRole === roles.combatRole &&
        stored?.huntRole === roles.huntRole,
    };
  });

  const result = {
    green: rows.every((row) => row.green),
    expected: rows.length,
    valid: rows.filter((row) => row.green).length,
    combat: {
      opener: rows.filter((row) => row.combatRole === "opener").length,
      finisher: rows.filter((row) => row.combatRole === "finisher").length,
      support: rows.filter((row) => row.combatRole === "support").length,
      none: rows.filter((row) => row.combatRole == null).length,
    },
    hunt: {
      preparation: rows.filter((row) => row.huntRole === "preparation").length,
      extraction: rows.filter((row) => row.huntRole === "extraction").length,
      knowledge: rows.filter((row) => row.huntRole === "knowledge").length,
      logistics: rows.filter((row) => row.huntRole === "logistics").length,
      tracking: rows.filter((row) => row.huntRole === "tracking").length,
      none: rows.filter((row) => row.huntRole == null).length,
    },
    rows,
  };

  console.table(rows);
  return result;
}


export async function migrateLegacyHuntCards() {
  if (!game.user?.isGM) {
    throw new Error("La migration Valor → Chasse est réservée au MJ.");
  }

  const domain = await ensureHuntDomain();
  if (!domain.green) {
    throw new Error("Le domaine Chasse n’est pas disponible.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    throw new Error("Compendium Toolkit dh-domain-cards absent.");
  }

  const docs = await pack.getDocuments();

  const isMonsterHunterLegacyCard = (doc) => {
    if (!isLegacyHuntCardName(doc.name)) return false;

    // Runtime compendium rows produced by the older homebrew rail do not
    // necessarily carry sourcePath/sourceId provenance flags. The historical
    // discriminator we *do* have is the temporary domain assignment itself:
    // Monster Hunter cards lived in Valor. Once migrated, they live in Hunt.
    //
    // This also safely excludes same-name core cards such as Bone/Tacticien.
    const domain = normalizedChoice(doc.system?.domain);
    return domain === "valor" || domain === HUNT_DOMAIN_ID;
  };

  const candidates = docs.filter(isMonsterHunterLegacyCard);

  const byName = new Map(
    candidates.map((doc) => [normalizedHuntCardName(doc.name), doc])
  );

  const missing = LEGACY_HUNT_CARD_NAMES.filter(
    (name) => !byName.has(normalizedHuntCardName(name))
  );

  const wrongDomain = [];
  const alreadyHunt = [];
  const migrated = [];

  await pack.configure({ locked: false });

  try {
    for (const name of LEGACY_HUNT_CARD_NAMES) {
      const doc = byName.get(normalizedHuntCardName(name));
      if (!doc) continue;

      const currentDomain = normalizedChoice(doc.system?.domain);

      if (currentDomain === HUNT_DOMAIN_ID) {
        alreadyHunt.push(doc.name);
        continue;
      }

      if (currentDomain !== "valor") {
        wrongDomain.push({
          name: doc.name,
          domain: doc.system?.domain ?? null,
        });
        continue;
      }

      const update = {
        "system.domain": HUNT_DOMAIN_ID,
      };

      const currentImg = String(doc.img ?? "");
      if (
        !currentImg ||
        /(?:^|\/)domains\/valor\.(?:png|webp|svg)$/i.test(currentImg) ||
        currentImg === "icons/svg/item-bag.svg"
      ) {
        update.img = HUNT_DOMAIN_DEFINITION.src;
      }

      await doc.update(update);

      migrated.push({
        id: doc.id,
        name: doc.name,
        sourceId: doc.flags?.[FLAG_SCOPE]?.sourceId ?? null,
        from: currentDomain,
        to: HUNT_DOMAIN_ID,
      });
    }
  } finally {
    await pack.configure({ locked: true });
  }

  const result = {
    green: missing.length === 0 && wrongDomain.length === 0,
    expected: LEGACY_HUNT_CARD_NAMES.length,
    found: candidates.length,
    migrated: migrated.length,
    alreadyHunt: alreadyHunt.length,
    missing,
    wrongDomain,
    cards: migrated,
  };

  console.table(
    [
      ...migrated.map((card) => ({
        name: card.name,
        status: "migrated",
        from: card.from,
        to: card.to,
        sourceId: card.sourceId,
      })),
      ...alreadyHunt.map((name) => ({
        name,
        status: "already-hunt",
        from: "hunt",
        to: "hunt",
        sourceId:
          byName.get(normalizedHuntCardName(name))?.flags?.[FLAG_SCOPE]?.sourceId ??
          null,
      })),
      ...wrongDomain.map((row) => ({
        name: row.name,
        status: "wrong-domain",
        from: row.domain,
        to: "hunt",
        sourceId:
          byName.get(normalizedHuntCardName(row.name))?.flags?.[FLAG_SCOPE]?.sourceId ??
          null,
      })),
      ...missing.map((name) => ({
        name,
        status: "missing",
        from: null,
        to: "hunt",
        sourceId: null,
      })),
    ]
  );

  console.log(`${MODULE_ID} | P2.11a.2 legacy Hunt migration`, result);

  if (result.green) {
    ui.notifications.info(
      `Campaign Toolkit : ${LEGACY_HUNT_CARD_NAMES.length} cartes Chasse validées (${migrated.length} migrées).`
    );
  } else {
    ui.notifications.warn(
      `Campaign Toolkit : migration Chasse incomplète — ${missing.length} absente(s), ${wrongDomain.length} domaine(s) inattendu(s).`
    );
  }

  return result;
}

export async function huntMigrationStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) {
    return { green: false, reason: "dh-domain-cards absent" };
  }

  const docs = await pack.getDocuments();

  const isMonsterHunterLegacyCard = (doc) => {
    const domain = normalizedChoice(doc.system?.domain);
    return domain === "valor" || domain === HUNT_DOMAIN_ID;
  };

  const rows = LEGACY_HUNT_CARD_NAMES.map((name) => {
    const key = normalizedHuntCardName(name);

    // Prefer the migrated Hunt row if both variants somehow coexist, then
    // fall back to the legacy Valor row.
    const matching = docs.filter(
      (candidate) =>
        isMonsterHunterLegacyCard(candidate) &&
        normalizedHuntCardName(candidate.name) === key
    );

    const doc =
      matching.find(
        (candidate) => normalizedChoice(candidate.system?.domain) === HUNT_DOMAIN_ID
      ) ??
      matching.find(
        (candidate) => normalizedChoice(candidate.system?.domain) === "valor"
      ) ??
      null;

    return {
      expectedName: name,
      found: Boolean(doc),
      id: doc?.id ?? null,
      name: doc?.name ?? null,
      domain: doc?.system?.domain ?? null,
      level: doc?.system?.level ?? null,
      recallCost: doc?.system?.recallCost ?? null,
      cardType: doc?.system?.type ?? null,
      sourceId: doc?.flags?.[FLAG_SCOPE]?.sourceId ?? null,
    };
  });

  const green = rows.every(
    (row) => row.found && normalizedChoice(row.domain) === HUNT_DOMAIN_ID
  );

  console.table(rows);
  return {
    green,
    expected: LEGACY_HUNT_CARD_NAMES.length,
    found: rows.filter((row) => row.found).length,
    hunt: rows.filter(
      (row) => normalizedChoice(row.domain) === HUNT_DOMAIN_ID
    ).length,
    rows,
  };
}


const ARTIFICER_CLASS_SOURCE =
  "data/homebrew/artificer/classes/artificer.json";
const ARTIFICER_SUBCLASS_SOURCES = Object.freeze([
  "data/homebrew/artificer/subclasses/armorer.json",
  "data/homebrew/artificer/subclasses/battle-smith.json",
]);
const ARTILLERY_CARD_SOURCE =
  "data/homebrew/artificer/domains/artillery/domain-cards.json";

async function loadCanonicalHomebrewJson(sourcePath) {
  const cleanPath = String(sourcePath ?? "").replace(/^\/+/, "");
  if (!cleanPath.startsWith("data/homebrew/") || !cleanPath.endsWith(".json")) {
    throw new Error(`Chemin homebrew non autorisé: ${cleanPath}`);
  }
  const response = await fetch(`modules/${MODULE_ID}/${cleanPath}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${cleanPath} introuvable (${response.status}).`);
  return {
    cleanPath,
    payload: await response.json(),
  };
}

function neutralRichText(text) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  return `<p>${foundry.utils.escapeHTML(value)}</p>`;
}

function sourceFeatureRecords(raw, sourcePath) {
  const records = [];

  if (raw?.kind === "class") {
    if (raw?.hope_feature?.name && raw?.hope_feature?.text) {
      records.push({
        name: raw.hope_feature.name,
        text: raw.hope_feature.text,
        linkType: "hope",
        tier: null,
        featureType: "hope",
      });
    }
    for (const feature of raw?.features ?? []) {
      if (!feature?.name || !feature?.text) continue;
      records.push({
        name: feature.name,
        text: feature.text,
        linkType: "class",
        tier: null,
        featureType: "class",
      });
    }
  }

  if (raw?.kind === "subclass") {
    for (const feature of raw?.features ?? []) {
      if (!feature?.name || !feature?.text) continue;
      records.push({
        name: feature.name,
        text: feature.text,
        linkType: normalizedChoice(feature.tier),
        tier: normalizedChoice(feature.tier),
        featureType: "subclass",
      });
    }
  }

  return records.map((record, index) => ({
    ...record,
    index,
    sourcePath,
  }));
}

async function upsertHomebrewFeature(parentRaw, record) {
  const pack = game.packs.get(`${MODULE_ID}.dh-features`);
  if (!pack) throw new Error("Compendium Toolkit dh-features absent.");

  const feature = {
    name: record.name,
    text: record.text,
    type: "passive",
  };
  const data = await buildLinkedSourceFeature(
    feature,
    parentRaw,
    record.sourcePath,
    record.index,
    record.linkType,
  );

  data.system.description = neutralRichText(record.text);
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].managed = true;
  data.flags[FLAG_SCOPE].kind = "class_feature";
  data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
  data.flags[FLAG_SCOPE].contentOrigin = "homebrew";
  data.flags[FLAG_SCOPE].sourceFeatureType = record.featureType;
  data.flags[FLAG_SCOPE].sourceFeatureTier = record.tier;

  const sourceId = data.flags?.[FLAG_SCOPE]?.sourceId;
  const docs = await pack.getDocuments();
  for (const previous of docs.filter(
    (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === sourceId
  )) {
    await previous.delete();
  }
  return Item.create(data, { pack: pack.collection });
}

function serializeItemLinkSpecimen(value) {
  if (!value || typeof value !== "object") return null;

  // Foundryborne exposes ItemLink entries as DataModel-like runtime objects.
  // Mutating a deep-cloned runtime object is not sufficient: its resolved
  // `item` reference can still point at the specimen source. Always collapse
  // the specimen to its source payload first.
  const serialized =
    value?.toObject?.() ??
    value?._source ??
    foundry.utils.deepClone(value);

  if (!serialized || typeof serialized !== "object") return null;

  const link = foundry.utils.deepClone(serialized);

  // `item` is a runtime-resolved document reference, never canonical link data.
  if ("item" in link) delete link.item;

  return link;
}

async function nativeLinkSpecimen(ownerType, wantedType) {
  const wanted = normalizedChoice(wantedType);
  const packId = ownerType === "class" ? "dh-classes" : "dh-subclasses";
  const pack = game.packs.get(`${MODULE_ID}.${packId}`);

  // Use an already-valid Toolkit link as schema specimen, but serialize it
  // before remapping so no resolved Item document from the source class leaks.
  if (pack) {
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      const links = Array.isArray(doc.system?.features)
        ? doc.system.features
        : [];
      const match = links.find(
        (link) => normalizedChoice(link?.type) === wanted
      );
      if (match) {
        const serialized = serializeItemLinkSpecimen(match);
        if (serialized) return serialized;
      }
    }
  }

  // Fallback for future Foundryborne versions where the blank schema template
  // exposes the ItemLink shape directly.
  const specimen = await nativeTemplate("Item", ownerType);
  const links = Array.isArray(specimen?.system?.features)
    ? specimen.system.features
    : [];
  const match = links.find(
    (link) => normalizedChoice(link?.type) === wanted
  );
  if (match) {
    const serialized = serializeItemLinkSpecimen(match);
    if (serialized) return serialized;
  }

  throw new Error(
    `Aucun ItemLink specimen disponible pour ${ownerType}:${wantedType}.`
  );
}

function remapItemLink(specimen, doc, wantedType) {
  const link = serializeItemLinkSpecimen(specimen);
  if (!link) {
    throw new Error(`Aucun ItemLink specimen disponible pour ${wantedType}.`);
  }

  let mapped = false;

  // Foundryborne 2.10.5 ItemLink source schema observed at runtime:
  // { uuid, type } with `item` exposed only as a resolved getter.
  // Prefer uuid explicitly and overwrite it unconditionally when supported.
  if ("uuid" in link) {
    link.uuid = doc.uuid;
    mapped = true;
  }

  for (const key of ["itemUuid", "value"]) {
    if (key in link && typeof link[key] === "string") {
      link[key] = doc.uuid;
      mapped = true;
    }
  }

  for (const key of ["id", "itemId"]) {
    if (key in link) {
      link[key] = doc.id;
      mapped = true;
    }
  }

  if ("type" in link) link.type = wantedType;
  if ("name" in link && typeof link.name === "string") link.name = doc.name;
  if ("label" in link && typeof link.label === "string") link.label = doc.name;

  // Never persist a resolved document from the specimen.
  if ("item" in link) delete link.item;

  if (!mapped) {
    throw new Error(
      `ItemLink specimen ${wantedType} sans identifiant exploitable: ${JSON.stringify(link)}`
    );
  }

  // Fail early if the canonical UUID was not actually remapped.
  if ("uuid" in link && link.uuid !== doc.uuid) {
    throw new Error(
      `ItemLink ${wantedType} mal remappé: ${link.uuid} != ${doc.uuid}`
    );
  }

  return link;
}

async function linkedFeaturePayload(ownerType, records, docs) {
  const links = [];
  for (let i = 0; i < records.length; i += 1) {
    const specimen = await nativeLinkSpecimen(ownerType, records[i].linkType);
    links.push(remapItemLink(specimen, docs[i], records[i].linkType));
  }
  return links;
}

async function remapNativeDocumentReference(ownerType, fieldName, targetDoc) {
  const specimen = await nativeTemplate("Item", ownerType);
  const value = specimen?.system?.[fieldName];

  if (typeof value === "string") return targetDoc.uuid;
  if (value && typeof value === "object") {
    const clone = foundry.utils.deepClone(value);
    let mapped = false;
    for (const key of ["uuid", "itemUuid"]) {
      if (key in clone) {
        clone[key] = targetDoc.uuid;
        mapped = true;
      }
    }
    for (const key of ["id", "itemId"]) {
      if (key in clone) {
        clone[key] = targetDoc.id;
        mapped = true;
      }
    }
    if (mapped) return clone;
  }

  // Current Foundryborne accepts UUID-backed class references; fail loudly if
  // that assumption changes rather than inheriting another subclass's class.
  return targetDoc.uuid;
}

async function upsertCanonicalItem(raw, sourcePath, packId, finalizeData = null) {
  const entry = {
    kind: raw.kind,
    key: raw.id,
    corpus: raw?.source?.corpus ?? "homebrew",
    source_path: sourcePath,
    data: raw,
  };
  const data = await buildItem(entry);

  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].managed = true;
  data.flags[FLAG_SCOPE].kind = raw.kind;
  data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
  data.flags[FLAG_SCOPE].contentOrigin = "homebrew";

  if (typeof finalizeData === "function") {
    await finalizeData(data);
  }

  const pack = game.packs.get(`${MODULE_ID}.${packId}`);
  if (!pack) throw new Error(`Compendium Toolkit ${packId} absent.`);

  const docs = await pack.getDocuments();
  for (const previous of docs.filter(
    (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === raw.id
  )) {
    await previous.delete();
  }
  return Item.create(data, { pack: pack.collection });
}

async function importArtificerClass() {
  const { cleanPath, payload: raw } = await loadCanonicalHomebrewJson(
    ARTIFICER_CLASS_SOURCE
  );
  if (raw?.kind !== "class" || !raw?.id) {
    throw new Error(`${cleanPath} n’est pas une classe canonique valide.`);
  }

  // Our integration decision is Codex + Artillery. Register Artillery before
  // validating the class document.
  await ensureArtilleryDomain();

  const featureRecords = sourceFeatureRecords(raw, cleanPath);
  const featureDocs = [];
  for (const record of featureRecords) {
    featureDocs.push(await upsertHomebrewFeature(raw, record));
  }

  const links = await linkedFeaturePayload("class", featureRecords, featureDocs);

  const classDoc = await upsertCanonicalItem(
    raw,
    cleanPath,
    "dh-classes",
    async (data) => {
      data.system.features = links;
      data.flags[FLAG_SCOPE].sourceDomainDecision = {
        selected: ["codex", "artillery"],
        conflictingSource: ["codex", "magitech"],
        status: "homebrew-decision",
      };
    },
  );

  return { classDoc, featureDocs };
}

async function importArtificerSubclass(sourcePath, classDoc) {
  const { cleanPath, payload: raw } = await loadCanonicalHomebrewJson(sourcePath);
  if (raw?.kind !== "subclass" || !raw?.id) {
    throw new Error(`${cleanPath} n’est pas une sous-classe canonique valide.`);
  }

  const featureRecords = sourceFeatureRecords(raw, cleanPath);
  const featureDocs = [];
  for (const record of featureRecords) {
    featureDocs.push(await upsertHomebrewFeature(raw, record));
  }

  const links = await linkedFeaturePayload("subclass", featureRecords, featureDocs);
  const linkedClass = await remapNativeDocumentReference(
    "subclass",
    "linkedClass",
    classDoc
  );

  const subclassDoc = await upsertCanonicalItem(
    raw,
    cleanPath,
    "dh-subclasses",
    async (data) => {
      data.system.features = links;
      data.system.linkedClass = linkedClass;
    },
  );

  return { subclassDoc, featureDocs };
}

async function importArtilleryCards() {
  const { cleanPath, payload } = await loadCanonicalHomebrewJson(
    ARTILLERY_CARD_SOURCE
  );
  if (!Array.isArray(payload) || payload.length !== 9) {
    throw new Error(`${cleanPath} doit contenir exactement 9 cartes Artillery.`);
  }

  await ensureArtilleryDomain();
  const created = [];
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

  const docs = await pack.getDocuments();
  for (const raw of payload) {
    if (
      raw?.kind !== "domain_card" ||
      !raw?.id ||
      normalizedChoice(raw?.domain) !== ARTILLERY_DOMAIN_ID
    ) {
      throw new Error(`Carte Artillery canonique invalide: ${raw?.name ?? raw?.id}`);
    }

    for (const previous of docs.filter(
      (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === raw.id
    )) {
      await previous.delete();
    }

    const entry = {
      kind: "domain_card",
      key: raw.id,
      corpus: raw?.source?.corpus ?? "homebrew",
      source_path: cleanPath,
      data: raw,
    };
    const data = await buildItem(entry);
    data.flags ??= {};
    data.flags[FLAG_SCOPE] ??= {};
    data.flags[FLAG_SCOPE].managed = true;
    data.flags[FLAG_SCOPE].kind = "domain_card";
    data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
    data.flags[FLAG_SCOPE].contentOrigin = "homebrew";
    created.push(await Item.create(data, { pack: pack.collection }));
  }

  return created;
}


function artillerySourceId(item) {
  const sourceId = item?.flags?.[FLAG_SCOPE]?.sourceId;
  return typeof sourceId === "string" &&
    sourceId.startsWith("homebrew.artificer.domain-card.artillery.")
    ? sourceId
    : null;
}

function actionSyncKey(action) {
  return [
    String(action?.name ?? "").trim().toLowerCase(),
    String(action?.type ?? "").trim().toLowerCase(),
  ].join("::");
}

function preserveOwnedActionUseValues(sourceActions, ownedActions) {
  const source = foundry.utils.deepClone(sourceActions ?? {});
  const ownedByKey = new Map();

  for (const action of serializedActions(ownedActions)) {
    const key = actionSyncKey(action);
    if (!key || key === "::") continue;
    ownedByKey.set(key, action);
  }

  const apply = (action) => {
    const previous = ownedByKey.get(actionSyncKey(action));
    if (
      previous?.uses &&
      action?.uses &&
      previous.uses.value !== undefined &&
      previous.uses.value !== null
    ) {
      action.uses.value = previous.uses.value;
    }
    return action;
  };

  if (Array.isArray(source)) return source.map(apply);

  if (source && typeof source === "object") {
    for (const [key, action] of Object.entries(source)) {
      source[key] = apply(action);
    }
  }

  return source;
}

function ownedArtilleryCardUpdateData(sourceDoc, ownedDoc) {
  const source = sourceDoc.toObject();
  const owned = ownedDoc.toObject();
  const sourceSystem = foundry.utils.deepClone(source.system ?? {});
  const ownedSystem = owned.system ?? {};

  // Runtime/session state belongs to the Actor copy, not the compendium.
  // Keep current use counters while accepting source max/recovery/action data.
  if ("actions" in sourceSystem) {
    sourceSystem.actions = preserveOwnedActionUseValues(
      sourceSystem.actions,
      ownedSystem.actions
    );
  }

  // If a future Artillery card gains a native resource, keep only its current
  // value while still syncing the source schema/max.
  if (
    sourceSystem.resource &&
    ownedSystem.resource &&
    ownedSystem.resource.value !== undefined
  ) {
    sourceSystem.resource.value = ownedSystem.resource.value;
  }

  // Preserve known sheet-placement/runtime selectors when present on the Actor
  // copy. They are character state rather than canonical card definition.
  for (const key of [
    "inVault",
    "vault",
    "loadout",
    "equipped",
    "active",
    "selected",
    "prepared",
  ]) {
    if (Object.prototype.hasOwnProperty.call(ownedSystem, key)) {
      sourceSystem[key] = foundry.utils.deepClone(ownedSystem[key]);
    }
  }

  return {
    name: source.name,
    img: source.img,
    system: sourceSystem,
    [`flags.${FLAG_SCOPE}`]: foundry.utils.deepClone(
      source.flags?.[FLAG_SCOPE] ?? {}
    ),
  };
}

async function replaceOwnedCardEffects(sourceDoc, ownedDoc) {
  const currentIds = [...(ownedDoc.effects ?? [])].map((effect) => effect.id);
  if (currentIds.length) {
    await ownedDoc.deleteEmbeddedDocuments("ActiveEffect", currentIds);
  }

  const sourceEffects = (sourceDoc.toObject().effects ?? []).map((effect) => {
    const clone = foundry.utils.deepClone(effect);
    delete clone._stats;
    return clone;
  });

  if (sourceEffects.length) {
    await ownedDoc.createEmbeddedDocuments(
      "ActiveEffect",
      sourceEffects,
      { keepId: true }
    );
  }

  return sourceEffects.length;
}

export async function syncOwnedArtilleryCards({ cards = null } = {}) {
  if (!game.user?.isGM) {
    throw new Error("La synchronisation des cartes Artillery possédées est réservée au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

  const sourceDocs = Array.isArray(cards) && cards.length
    ? cards
    : await pack.getDocuments();

  const sourceById = new Map();
  for (const sourceDoc of sourceDocs) {
    const sourceId = artillerySourceId(sourceDoc);
    if (sourceId) sourceById.set(sourceId, sourceDoc);
  }

  const rows = [];
  let actorsScanned = 0;
  let cardsFound = 0;
  let cardsUpdated = 0;
  let effectsReplaced = 0;

  for (const actor of game.actors ?? []) {
    actorsScanned += 1;

    for (const ownedDoc of actor.items ?? []) {
      const sourceId = artillerySourceId(ownedDoc);
      if (!sourceId) continue;

      cardsFound += 1;
      const sourceDoc = sourceById.get(sourceId);
      if (!sourceDoc) {
        rows.push({
          actor: actor.name,
          item: ownedDoc.name,
          sourceId,
          green: false,
          reason: "source-card-missing",
        });
        continue;
      }

      const updateData = ownedArtilleryCardUpdateData(sourceDoc, ownedDoc);
      await ownedDoc.update(updateData);
      const effectCount = await replaceOwnedCardEffects(sourceDoc, ownedDoc);

      cardsUpdated += 1;
      effectsReplaced += effectCount;
      rows.push({
        actor: actor.name,
        item: ownedDoc.name,
        sourceId,
        green: true,
        effects: effectCount,
      });
    }
  }

  const missing = rows.filter((row) => !row.green);
  const result = {
    green: missing.length === 0,
    actorsScanned,
    cardsFound,
    cardsUpdated,
    effectsReplaced,
    missing,
    rows,
  };

  console.info(`${MODULE_ID} | owned Artillery cards sync`, result);

  if (result.green) {
    ui.notifications?.info?.(
      `Campaign Toolkit : ${cardsUpdated} carte(s) Artillery possédée(s) synchronisée(s).`
    );
  } else {
    ui.notifications?.warn?.(
      `Campaign Toolkit : synchronisation Artillery partielle (${missing.length} source(s) manquante(s)).`
    );
  }

  return result;
}


function domainFolderLabel(domain) {
  const key = normalizedChoice(domain);
  const configured =
    CONFIG?.DH?.DOMAIN?.allDomains?.()?.[key] ??
    CONFIG?.DH?.DOMAIN?.domains?.[key] ??
    null;

  if (configured?.label) {
    const localized = game.i18n?.localize?.(configured.label);
    if (localized && localized !== configured.label) return localized;
    return configured.label;
  }

  const labels = {
    artillery: "Artillery",
    hunt: "Chasse",
    hunting: "Hunting",
    blood: "Blood",
  };
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

async function compendiumFolders(pack) {
  if (pack?.folders?.contents) return [...pack.folders.contents];
  if (Array.isArray(pack?.folders)) return [...pack.folders];

  // Fallback for Foundry versions where the pack does not expose a direct
  // collection but Folder documents can still be queried by compendium.
  return game.folders?.filter?.(
    (folder) => folder.pack === pack.collection
  ) ?? [];
}

async function ensureDomainCardFolder(pack, domain) {
  const key = normalizedChoice(domain);
  if (!key) return null;

  const existing = (await compendiumFolders(pack)).find(
    (folder) =>
      folder.type === "Item" &&
      folder.flags?.[FLAG_SCOPE]?.domainCardFolder === key
  );
  if (existing) return existing;

  // Also adopt an existing same-name Item folder instead of duplicating it.
  const label = domainFolderLabel(key);
  const sameName = (await compendiumFolders(pack)).find(
    (folder) => folder.type === "Item" && folder.name === label
  );
  if (sameName) {
    await sameName.update({
      [`flags.${FLAG_SCOPE}.domainCardFolder`]: key,
    });
    return sameName;
  }

  return Folder.create(
    {
      name: label,
      type: "Item",
      sorting: "a",
      flags: {
        [FLAG_SCOPE]: {
          domainCardFolder: key,
          managed: true,
        },
      },
    },
    { pack: pack.collection }
  );
}


export async function artilleryAutomationStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) return { green: false, reason: "dh-domain-cards absent" };

  const docs = await pack.getDocuments();
  const expected = new Map([
    ["homebrew.artificer.domain-card.artillery.concussive-shot", { status: "partial-native", requiresAction: true, requiresEffect: true }],
    ["homebrew.artificer.domain-card.artillery.shockwave", { status: "native", requiresAction: true, requiresEffect: true }],
    ["homebrew.artificer.domain-card.artillery.carpet-bomb", { status: "partial-native", requiresAction: true, requiresEffect: true }],
    ["homebrew.artificer.domain-card.artillery.heavy-volley", { status: "partial-native", requiresAction: false, requiresEffect: true }],
    ["homebrew.artificer.domain-card.artillery.siege-stance", { status: "partial-native", requiresAction: true, requiresEffect: true }],
    ["homebrew.artificer.domain-card.artillery.battle-rhythm", { status: "runtime-authoritative", requiresAction: true, requiresEffect: false }],
    ["homebrew.artificer.domain-card.artillery.decisive-strike", { status: "partial-runtime", requiresAction: true, requiresEffect: false }],
  ]);

  const rows = [];
  for (const [sourceId, expectation] of expected) {
    const expectedStatus = expectation.status;
    const doc = docs.find(
      (candidate) => candidate.flags?.[FLAG_SCOPE]?.sourceId === sourceId
    ) ?? null;
    const automation = doc?.flags?.[FLAG_SCOPE]?.artilleryAutomation ?? null;
    const actions = doc?.system?.actions ?? [];
    const actionRows = serializedActions(actions);
    const rawActions = serializedActions(doc?.toObject()?.system?.actions);
    const actionCount = Math.max(actionRows.length, rawActions.length);
    const runtimeEffects = Array.isArray(doc?.toObject()?.effects)
      ? doc.toObject().effects
      : [];
    const effectCount = runtimeEffects.length;

    rows.push({
      sourceId,
      name: doc?.name ?? null,
      expectedStatus,
      status: automation?.status ?? null,
      version: automation?.version ?? null,
      actions: actionCount,
      runtimeActions: actionRows.length,
      rawActions: rawActions.length,
      effects: effectCount,
      actionNames: (actionRows.length ? actionRows : rawActions)
        .map((action) => action?.name ?? null)
        .filter(Boolean),
      effectNames: runtimeEffects.map((effect) => effect?.name ?? null).filter(Boolean),
      specimenContainer: automation?.specimen?.actionContainer ?? null,
      ok:
        Boolean(doc) &&
        automation?.version === ARTILLERY_AUTOMATION_VERSION &&
        automation?.status === expectedStatus &&
        (!expectation.requiresAction || actionCount > 0) &&
        (!expectation.requiresEffect || effectCount > 0),
    });
  }

  console.table(rows);
  const result = {
    green: rows.every((row) => row.ok),
    expected: rows.length,
    valid: rows.filter((row) => row.ok).length,
    rows,
  };
  console.log(`${MODULE_ID} | P2.11c.6e Artillery automation status`, result);
  return result;
}

export async function organizeDomainCardsByDomain() {
  if (!game.user?.isGM) {
    throw new Error("Le classement des cartes de Domaine est réservé au MJ.");
  }

  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) throw new Error("Compendium Toolkit dh-domain-cards absent.");

  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    const domains = [
      ...new Set(
        docs
          .map((doc) => normalizedChoice(doc.system?.domain))
          .filter(Boolean)
      ),
    ].sort();

    const folders = new Map();
    for (const domain of domains) {
      folders.set(domain, await ensureDomainCardFolder(pack, domain));
    }

    let changed = 0;
    const rows = [];
    for (const doc of docs) {
      const domain = normalizedChoice(doc.system?.domain);
      if (!domain) {
        rows.push({
          name: doc.name,
          domain: null,
          folder: null,
          changed: false,
        });
        continue;
      }

      const folder = folders.get(domain);
      const currentFolderId =
        typeof doc.folder === "string"
          ? doc.folder
          : doc.folder?.id ?? doc.folder?._id ?? null;
      const targetFolderId = folder?.id ?? folder?._id ?? null;
      const needsUpdate = Boolean(targetFolderId) && currentFolderId !== targetFolderId;

      if (needsUpdate) {
        await doc.update({ folder: targetFolderId });
        changed += 1;
      }

      rows.push({
        name: doc.name,
        domain,
        folder: folder?.name ?? null,
        changed: needsUpdate,
      });
    }

    console.table(
      domains.map((domain) => ({
        domain,
        folder: folders.get(domain)?.name ?? null,
        cards: rows.filter((row) => row.domain === domain).length,
      }))
    );

    const result = {
      green:
        rows
          .filter((row) => row.domain)
          .every((row) => Boolean(row.folder)),
      domains: domains.length,
      cards: docs.length,
      changed,
      folders: domains.map((domain) => ({
        domain,
        name: folders.get(domain)?.name ?? null,
        id: folders.get(domain)?.id ?? null,
      })),
      unclassified: rows.filter((row) => !row.domain).map((row) => row.name),
    };

    console.log(`${MODULE_ID} | domain-card folders`, result);
    return result;
  } finally {
    await pack.configure({ locked: true });
  }
}

export async function domainCardFolderStatus() {
  const pack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);
  if (!pack) return { green: false, reason: "dh-domain-cards absent" };

  const docs = await pack.getDocuments();
  const folders = await compendiumFolders(pack);
  const managedFolders = folders.filter(
    (folder) => folder.flags?.[FLAG_SCOPE]?.domainCardFolder
  );

  const rows = docs.map((doc) => {
    const domain = normalizedChoice(doc.system?.domain);
    const folderId =
      typeof doc.folder === "string"
        ? doc.folder
        : doc.folder?.id ?? doc.folder?._id ?? null;
    const folder = folders.find((candidate) => candidate.id === folderId) ?? null;
    return {
      name: doc.name,
      domain,
      folder: folder?.name ?? null,
      folderDomain: folder?.flags?.[FLAG_SCOPE]?.domainCardFolder ?? null,
      ok:
        !domain ||
        folder?.flags?.[FLAG_SCOPE]?.domainCardFolder === domain,
    };
  });

  const result = {
    green: rows.every((row) => row.ok),
    cards: rows.length,
    domains: [...new Set(rows.map((row) => row.domain).filter(Boolean))].length,
    folders: managedFolders.length,
    invalid: rows.filter((row) => !row.ok),
    unclassified: rows.filter((row) => !row.domain).map((row) => row.name),
  };

  if (result.invalid.length) console.table(result.invalid);
  console.log(`${MODULE_ID} | domain-card folder status`, result);
  return result;
}

export async function artificerArtilleryStatus() {
  const classPack = game.packs.get(`${MODULE_ID}.dh-classes`);
  const subclassPack = game.packs.get(`${MODULE_ID}.dh-subclasses`);
  const featurePack = game.packs.get(`${MODULE_ID}.dh-features`);
  const domainPack = game.packs.get(`${MODULE_ID}.dh-domain-cards`);

  if (!classPack || !subclassPack || !featurePack || !domainPack) {
    return { green: false, reason: "un ou plusieurs compendiums Toolkit sont absents" };
  }

  const [classes, subclasses, features, cards] = await Promise.all([
    classPack.getDocuments(),
    subclassPack.getDocuments(),
    featurePack.getDocuments(),
    domainPack.getDocuments(),
  ]);

  const classDoc = classes.find(
    (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === "homebrew.artificer.class.artificer"
  ) ?? null;

  const subclassIds = [
    "homebrew.artificer.subclass.armorer",
    "homebrew.artificer.subclass.battle-smith",
  ];
  const subclassDocs = subclassIds.map(
    (sourceId) => subclasses.find(
      (doc) => doc.flags?.[FLAG_SCOPE]?.sourceId === sourceId
    ) ?? null
  );

  const artilleryCards = cards.filter(
    (doc) =>
      normalizedChoice(doc.system?.domain) === ARTILLERY_DOMAIN_ID &&
      String(doc.flags?.[FLAG_SCOPE]?.sourceId ?? "").startsWith(
        "homebrew.artificer.domain-card.artillery."
      )
  );

  const ownedFeatures = features.filter(
    (doc) =>
      String(doc.flags?.[FLAG_SCOPE]?.parentSourceId ?? "").startsWith(
        "homebrew.artificer."
      )
  );

  const domain =
    CONFIG?.DH?.DOMAIN?.allDomains?.()?.[ARTILLERY_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[ARTILLERY_DOMAIN_ID] ??
    null;

  const rows = artilleryCards
    .map((doc) => ({
      kind: "domainCard",
      name: doc.name,
      domain: doc.system?.domain ?? null,
      level: doc.system?.level ?? null,
      recall: doc.system?.recallCost ?? null,
      type: doc.system?.type ?? null,
      sourceId: doc.flags?.[FLAG_SCOPE]?.sourceId ?? null,
    }))
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  console.table(rows);

  const result = {
    green:
      Boolean(domain) &&
      Boolean(classDoc) &&
      subclassDocs.every(Boolean) &&
      artilleryCards.length === 9 &&
      ownedFeatures.length === 10 &&
      Array.isArray(classDoc?.system?.features) &&
      classDoc.system.features.length === 3 &&
      subclassDocs.every(
        (doc) => Array.isArray(doc?.system?.features) && doc.system.features.length >= 3
      ),
    domain: domain
      ? { id: domain.id ?? ARTILLERY_DOMAIN_ID, label: domain.label, src: domain.src }
      : null,
    class: classDoc
      ? {
          id: classDoc.id,
          name: classDoc.name,
          domains: classDoc.system?.domains ?? [],
          evasion: classDoc.system?.evasion ?? null,
          hitPoints: classDoc.system?.hitPoints ?? null,
          features: classDoc.system?.features?.length ?? 0,
        }
      : null,
    subclasses: subclassDocs.map((doc) =>
      doc
        ? {
            id: doc.id,
            name: doc.name,
            spellcastTrait: doc.system?.spellcastingTrait ?? null,
            features: doc.system?.features?.length ?? 0,
            linkedClass: doc.system?.linkedClass ?? null,
          }
        : null
    ),
    cards: { expected: 9, actual: artilleryCards.length, rows },
    features: { expected: 10, actual: ownedFeatures.length },
  };

  console.log(`${MODULE_ID} | P2.11c.1 Artificer + Artillery status`, result);
  return result;
}


async function withArtificerImportPacksUnlocked(operation) {
  const packIds = [
    "dh-features",
    "dh-domain-cards",
    "dh-classes",
    "dh-subclasses",
  ];

  const packs = packIds.map((packId) => {
    const pack = game.packs.get(`${MODULE_ID}.${packId}`);
    if (!pack) throw new Error(`Compendium Toolkit ${packId} absent.`);
    return pack;
  });

  // Keep the entire multi-pack import inside one unlock transaction. Foundry
  // v14 can reject a create if a helper re-locks the collection between
  // asynchronous document operations.
  for (const pack of packs) {
    await pack.configure({ locked: false });
  }

  try {
    return await operation();
  } finally {
    for (const pack of [...packs].reverse()) {
      try {
        await pack.configure({ locked: true });
      } catch (error) {
        console.error(`${MODULE_ID} | unable to relock ${pack.collection}`, error);
      }
    }
  }
}

export async function importArtificerArtillery() {
  if (!game.user?.isGM) {
    throw new Error("L’import Artificier + Artillery est réservé au MJ.");
  }

  return withArtificerImportPacksUnlocked(async () => {
    const domain = await ensureArtilleryDomain();
    const cards = await importArtilleryCards();
    const ownedCards = await syncOwnedArtilleryCards({ cards });
    const { classDoc, featureDocs: classFeatures } = await importArtificerClass();

    const subclasses = [];
    let subclassFeatureCount = 0;
    for (const sourcePath of ARTIFICER_SUBCLASS_SOURCES) {
      const imported = await importArtificerSubclass(sourcePath, classDoc);
      subclasses.push(imported.subclassDoc);
      subclassFeatureCount += imported.featureDocs.length;
    }

    const folders = await organizeDomainCardsByDomain();
    const status = await artificerArtilleryStatus();
    const result = {
      green: status.green && folders.green && ownedCards.green,
      domain,
      folders,
      ownedCards,
      imported: {
        cards: cards.length,
        class: classDoc?.name ?? null,
        subclasses: subclasses.map((doc) => doc.name),
        features: classFeatures.length + subclassFeatureCount,
      },
      status,
    };

    if (result.green) {
      ui.notifications.info(
        "Campaign Toolkit : Artificier + Artillery importés (9 cartes, 1 classe, 2 sous-classes)."
      );
    } else {
      ui.notifications.warn(
        "Campaign Toolkit : import Artificier + Artillery incomplet, consultez artificerArtilleryStatus()."
      );
    }

    return result;
  });
}


export async function importHuntPilot() {
  const domain = await ensureHuntDomain();

  const card = await importCanonicalDomainCard(
    "data/homebrew/monster-hunter/domains/hunt/lecture-de-la-proie.json"
  );

  const result = {
    green: Boolean(card),
    domain,
    card: card
      ? {
          id: card.id,
          name: card.name,
          type: card.type,
          domain: card.system?.domain ?? null,
          level: card.system?.level ?? null,
          recallCost: card.system?.recallCost ?? null,
          cardType: card.system?.type ?? null,
          sourceId: card.flags?.[FLAG_SCOPE]?.sourceId ?? null,
        }
      : null,
  };

  console.log(`${MODULE_ID} | P2.11a.1 Hunt pilot`, result);
  return result;
}


/**
 * Import one canonical homebrew adversary without rebuilding any owned Item pack.
 * This deliberately keeps the Actor legacy/native-template route isolated from
 * syncAutonomousSources(): Foundry is the session runtime, while DH-DATA remains
 * the canonical source.
 */
async function refreshHuntingNoteLinks(pack) {
  const docs = await pack.getDocuments();
  const bySourceId = new Map(
    docs
      .map(doc => [doc.flags?.[FLAG_SCOPE]?.sourceId, doc])
      .filter(([sourceId]) => typeof sourceId === "string" && sourceId)
  );

  const sectionPattern = /<section data-dct-hunting-links="true">[\s\S]*?<\/section>/g;
  for (const doc of docs) {
    const links = doc.flags?.[FLAG_SCOPE]?.hunting?.noteLinks;
    if (!Array.isArray(links) || !links.length) continue;

    const baseNotes = String(doc.system?.notes ?? "").replace(sectionPattern, "").trim();
    const rows = links.map(link => {
      const label = foundry.utils.escapeHTML(String(link?.label ?? "Adversaire lié"));
      const target = bySourceId.get(String(link?.sourceId ?? ""));
      const contentLink = target ? `@UUID[${target.uuid}]{${label}}` : label;
      const note = String(link?.note ?? "").trim();
      const noteHtml = note ? `<br><small>${foundry.utils.escapeHTML(note)}</small>` : "";
      return `<li>${contentLink}${noteHtml}</li>`;
    }).join("");
    const section = `<section data-dct-hunting-links="true"><h4>Adversaires liés</h4><ul>${rows}</ul></section>`;
    const nextNotes = [baseNotes, section].filter(Boolean).join("\n");
    if (nextNotes !== String(doc.system?.notes ?? "")) {
      await doc.update({ "system.notes": nextNotes });
    }
  }
}

export async function importCanonicalAdversary(sourcePath) {
  if (!game.user?.isGM) throw new Error("L'import d'un adversaire Toolkit est réservé au MJ.");
  const cleanPath = String(sourcePath ?? "").replace(/^\/+/, "");
  if (!cleanPath.startsWith("data/homebrew/") || !cleanPath.endsWith(".json")) {
    throw new Error(`Chemin adversaire non autorisé: ${cleanPath}`);
  }

  const response = await fetch(`modules/${MODULE_ID}/${cleanPath}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${cleanPath} introuvable (${response.status}).`);
  const raw = await response.json();
  if (raw?.kind !== "adversary" || !raw?.id) throw new Error(`${cleanPath} n'est pas un adversaire canonique valide.`);

  const entry = {
    kind: "adversary",
    key: raw.id,
    corpus: raw?.source?.corpus ?? "homebrew",
    source_path: cleanPath,
    data: raw,
  };
  const data = await buildActor(entry);
  data.flags ??= {};
  data.flags[FLAG_SCOPE] ??= {};
  data.flags[FLAG_SCOPE].managed = true;
  data.flags[FLAG_SCOPE].kind = "adversary";
  data.flags[FLAG_SCOPE].contentOwner = MODULE_ID;
  data.flags[FLAG_SCOPE].contentOrigin = "homebrew";

  const pack = game.packs.get(`${MODULE_ID}.dh-adversaries`);
  if (!pack) throw new Error("Compendium Toolkit dh-adversaries absent.");
  await pack.configure({ locked: false });
  try {
    const docs = await pack.getDocuments();
    const previous = docs.filter(doc => doc.flags?.[FLAG_SCOPE]?.sourceId === raw.id);
    for (const doc of previous) await doc.delete();
    const created = await Actor.create(data, { pack: pack.collection });
    await refreshHuntingNoteLinks(pack);
    ui.notifications.info(`Campaign Toolkit : ${created.name} importé dans dh-adversaries.`);
    return created;
  } finally {
    await pack.configure({ locked: true });
  }
}

const TETSUCABRA_ACTOR_SOURCES = [
  "data/homebrew/monster-hunter/adversaries/tetsucabra.json",
  "data/homebrew/monster-hunter/adversaries/tetsucabra-part-head-fangs.json",
  "data/homebrew/monster-hunter/adversaries/tetsucabra-part-forelegs.json",
  "data/homebrew/monster-hunter/adversaries/tetsucabra-part-hindlegs.json",
];

export async function importTetsucabra() {
  const actors = [];
  for (const sourcePath of TETSUCABRA_ACTOR_SOURCES) {
    actors.push(await importCanonicalAdversary(sourcePath));
  }
  return actors;
}

export async function tetsucabraStatus() {
  const principalSourceId = "homebrew.monster-hunter.adversary.tetsucabra";
  const expectedPartIds = [
    "homebrew.monster-hunter.adversary.tetsucabra-part-head-fangs",
    "homebrew.monster-hunter.adversary.tetsucabra-part-forelegs",
    "homebrew.monster-hunter.adversary.tetsucabra-part-hindlegs",
  ];
  const pack = game.packs.get(`${MODULE_ID}.dh-adversaries`);
  if (!pack) return { green: false, reason: "dh-adversaries absent" };
  const docs = await pack.getDocuments();
  const principalMatches = docs.filter(doc => doc.flags?.[FLAG_SCOPE]?.sourceId === principalSourceId);
  const doc = principalMatches[0] ?? null;
  const hunting = doc?.flags?.[FLAG_SCOPE]?.hunting ?? null;
  const loot = Array.isArray(hunting?.loot) ? hunting.loot : [];
  const parts = expectedPartIds.map(sourceId => docs.find(doc => doc.flags?.[FLAG_SCOPE]?.sourceId === sourceId) ?? null);
  const partRows = parts.map((part, index) => ({
    sourceId: expectedPartIds[index],
    name: part?.name ?? null,
    uuid: part?.uuid ?? null,
    fractureThreshold: part?.flags?.[FLAG_SCOPE]?.hunting?.fractureThreshold ?? null,
  }));
  const result = {
    green: principalMatches.length === 1 && Boolean(doc?.system?.attack) && loot.length === 2 && parts.every(Boolean),
    count: principalMatches.length + parts.filter(Boolean).length,
    name: doc?.name ?? null,
    uuid: doc?.uuid ?? null,
    tier: doc?.system?.tier ?? null,
    role: doc?.system?.type ?? null,
    embeddedFeatures: doc?.items?.size ?? doc?.items?.length ?? 0,
    huntingTags: hunting?.tags ?? [],
    lootLinks: loot.map(row => ({ part: row.part ?? null, uuid: row.uuid ?? null })),
    colossus: {
      mode: hunting?.colossus?.integration ?? null,
      principal: doc?.uuid ?? null,
      parts: partRows,
    },
  };
  console.table(partRows);
  console.log(`${MODULE_ID} | Tetsucabra Colossus status`, result);
  return result;
}

