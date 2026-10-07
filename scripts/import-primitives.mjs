import { MODULE_ID, FLAG_SCOPE, PILOT_MAPPING_VERSION } from "./import-constants.mjs";
const CLASS_PRESENTATION_URL = `modules/${MODULE_ID}/data/class-presentation.json`;
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
  "blood",
]);

const TOOLKIT_DOMAIN_ICONS = Object.freeze({
  artillery:
    "modules/daggerheart-campaign-toolkit/assets/icons/artillery.svg",
  hunt:
    "modules/daggerheart-campaign-toolkit/assets/icons/hunt.svg",
  blood:
    "modules/daggerheart-campaign-toolkit/assets/icons/blood.svg",
});

function domainIcon(domain) {
  const key = normalizedChoice(domain);
  if (!key || !DOMAIN_ICON_KEYS.has(key)) return null;

  return (
    TOOLKIT_DOMAIN_ICONS[key] ??
    `systems/daggerheart/assets/icons/domains/${key}.svg`
  );
}

/**
 * Domain-card header artwork.
 *
 * Core Daggerheart domains use the PNG artwork shipped by
 * the system. Toolkit-only domains use the Toolkit PNG set.
 */
export function domainCardIcon(domain) {
  const key = normalizedChoice(domain);

  if (!key || !DOMAIN_ICON_KEYS.has(key)) {
    return null;
  }

  if (
    key === "artillery" ||
    key === "hunt" ||
    key === "blood"
  ) {
    return `modules/daggerheart-campaign-toolkit/assets/icons/domain-card/${key}.png`;
  }

  return `systems/daggerheart/assets/icons/domains/domain-card/${key}.png`;
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


export {
  ownedClassImage,
  nameOf,
  rules,
  provenanceFlags,
  setMappingGaps,
  clearItemLinks,
  sanitizeEmbeddedActorData,
  baseDescription,
  normalizedChoice,
  domainIcon,
  normalizedToken,
  mapTrait,
  mapRange,
  mapDamageTypes,
  parseWeaponDamage,
  appendFeatureDescription,
};
