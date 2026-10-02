import { applyContentLocale, getImportLocale } from "./content-locale.mjs";

const FLAG_SCOPE = "daggerheart-campaign-toolkit";
const PILOT_MAPPING_VERSION = "P2.3.4e-fix2c";

import {
  rules,
  normalizedToken,
  mapRange,
  mapDamageTypes,
} from "./import-primitives.mjs";

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


export async function mapEmbeddedSourceFeatures(raw, sourcePath, gaps) {
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


export function parseAdversaryExperiences(value) {
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


export function mapAdversaryAttack(templateAttack, attack, gaps) {
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


export async function nativeTemplate(documentName, type) {
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



