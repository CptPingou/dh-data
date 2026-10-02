import { organizeDomainCardsByDomain } from "./domain-card-import.mjs";
import { ARTILLERY_DOMAIN_ID, ensureArtilleryDomain } from "./artillery-domain.mjs";
import { syncOwnedArtilleryCards } from "./artillery-owned-sync.mjs";
import { buildItem, buildLinkedSourceFeature } from "./item-builder.mjs";
import { nativeTemplate } from "./native-mapping.mjs";
import { normalizedChoice } from "./import-primitives.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = "daggerheart-campaign-toolkit";


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

function cloneItemLinkRuntime(value) {
  if (!value || typeof value !== "object") return null;

  // Foundryborne 2.10.5 ItemLink is a lightweight runtime object, not a
  // DataModel: observed own keys are exactly `type`, `item`, `uuid`, with no
  // toObject(), no toJSON() and no _source. Preserve that shape.
  const link = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    link[key] = value[key];
  }
  return link;
}

async function nativeLinkSpecimen(ownerType, wantedType) {
  const wanted = normalizedChoice(wantedType);
  const packId = ownerType === "class" ? "dh-classes" : "dh-subclasses";
  const pack = game.packs.get(`${MODULE_ID}.${packId}`);

  // Use an already-resolved Toolkit ItemLink as a schema specimen.
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
        const cloned = cloneItemLinkRuntime(match);
        if (cloned) return cloned;
      }
    }
  }

  // Fallback for future Foundryborne versions where the blank schema template
  // exposes populated ItemLinks.
  const specimen = await nativeTemplate("Item", ownerType);
  const links = Array.isArray(specimen?.system?.features)
    ? specimen.system.features
    : [];
  const match = links.find(
    (link) => normalizedChoice(link?.type) === wanted
  );
  if (match) {
    const cloned = cloneItemLinkRuntime(match);
    if (cloned) return cloned;
  }

  throw new Error(
    `Aucun ItemLink specimen disponible pour ${ownerType}:${wantedType}.`
  );
}

function remapItemLink(specimen, doc, wantedType) {
  const link = cloneItemLinkRuntime(specimen);
  if (!link) {
    throw new Error(`Aucun ItemLink specimen disponible pour ${wantedType}.`);
  }

  // Foundryborne 2.10.5 runtime contract observed directly:
  // { type, item: DhItem, uuid }. `uuid` is not sufficient by itself:
  // the resolved `item` document is what actually drives the link.
  // Remap BOTH fields to the target feature document.
  link.type = wantedType;
  link.item = doc;
  link.uuid = doc.uuid;

  // Compatibility fields for alternate/minor schema variants.
  if ("itemUuid" in link) link.itemUuid = doc.uuid;
  if ("value" in link && typeof link.value === "string") link.value = doc.uuid;
  if ("id" in link) link.id = doc.id;
  if ("itemId" in link) link.itemId = doc.id;
  if ("name" in link && typeof link.name === "string") link.name = doc.name;
  if ("label" in link && typeof link.label === "string") link.label = doc.name;

  if (link.item !== doc || link.uuid !== doc.uuid) {
    throw new Error(
      `ItemLink ${wantedType} mal remappé vers ${doc.name}.`
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

      // These deferred relations have now been resolved to real Foundry documents.
      data.flags[FLAG_SCOPE].mappingGaps = (
        data.flags[FLAG_SCOPE].mappingGaps ?? []
      ).filter((gap) =>
        gap !== "system.linkedClass" &&
        gap !== "system.features"
      );
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


