import { MODULE_ID, FLAG_SCOPE, PILOT_MAPPING_VERSION } from "./import-constants.mjs";
import { ARTILLERY_DOMAIN_ID } from "./artillery-domain.mjs";
import { localizeNativeEquipmentEmbedded } from "./equipment-native-fr.mjs";
import { applyContentLocale, getImportLocale } from "./content-locale.mjs";
import { nativeTemplate } from "./native-mapping.mjs";
import { applyArtilleryDomainCardAutomation } from "./artillery-automation.mjs";

import {
  ownedClassImage,
  nameOf,
  rules,
  provenanceFlags,
  setMappingGaps,
  clearItemLinks,
  baseDescription,
  normalizedChoice,
  domainIcon,
  normalizedToken,
  mapTrait,
  mapRange,
  mapDamageTypes,
  parseWeaponDamage,
  appendFeatureDescription,
} from "./import-primitives.mjs";


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


