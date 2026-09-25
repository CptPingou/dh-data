import "./native-item-artwork.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const PATCH_MARK = Symbol.for(`${MODULE_ID}.itemBrowserSourceOwnershipPatched`);

const OWNED_NATIVE_ITEM_PACKS = new Set([
  "daggerheart.classes",
  "daggerheart.subclasses",
  "daggerheart.domains",
  "daggerheart.ancestries",
  "daggerheart.communities",
  "daggerheart.weapons",
  "daggerheart.armors",
  "daggerheart.consumables",
  "daggerheart.loot",
]);

const TOOLKIT_REPLACEMENTS = Object.freeze({
  "daggerheart.classes": "daggerheart-campaign-toolkit.dh-classes",
  "daggerheart.subclasses": "daggerheart-campaign-toolkit.dh-subclasses",
  "daggerheart.domains": "daggerheart-campaign-toolkit.dh-domain-cards",
  "daggerheart.ancestries": "daggerheart-campaign-toolkit.dh-ancestries",
  "daggerheart.communities": "daggerheart-campaign-toolkit.dh-communities",
  "daggerheart.weapons": "daggerheart-campaign-toolkit.dh-weapons",
  "daggerheart.armors": "daggerheart-campaign-toolkit.dh-armor",
  "daggerheart.consumables": "daggerheart-campaign-toolkit.dh-consumables",
  "daggerheart.loot": "daggerheart-campaign-toolkit.dh-loot",
});

const REDUNDANT_THIRD_PARTY_ITEM_PACKS = new Set([
  "daggerheart-quickactions.items",
]);

function documentPackId(document) {
  return (
    document?.pack ??
    document?.compendium?.collection ??
    document?.collection?.collection ??
    null
  );
}

function toolkitReplacementReady(nativePackId) {
  const replacement = TOOLKIT_REPLACEMENTS[nativePackId];
  if (!replacement) return false;

  const pack = game.packs.get(replacement);
  return Boolean(pack);
}

function shouldExcludeOwnedNativeEntry(document) {
  const packId = documentPackId(document);

  return Boolean(
    packId &&
    OWNED_NATIVE_ITEM_PACKS.has(packId) &&
    toolkitReplacementReady(packId)
  );
}

function shouldExcludeThirdPartyEntry(document) {
  const packId = documentPackId(document);
  return Boolean(packId && REDUNDANT_THIRD_PARTY_ITEM_PACKS.has(packId));
}

function shouldExcludeToolkitOwnedEntry(document) {
  return (
    shouldExcludeOwnedNativeEntry(document) ||
    shouldExcludeThirdPartyEntry(document)
  );
}

function patchBrowserSettings(settings) {
  if (!settings || settings[PATCH_MARK]) return false;

  const proto = Object.getPrototypeOf(settings);
  if (!proto || typeof proto.isEntryExcluded !== "function") return false;

  if (proto[PATCH_MARK]) return true;

  const original = proto.isEntryExcluded;

  Object.defineProperty(proto, PATCH_MARK, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  proto.isEntryExcluded = function (document, ...args) {
    if (shouldExcludeToolkitOwnedEntry(document)) return true;
    return original.call(this, document, ...args);
  };

  return true;
}

function getBrowserSettings() {
  const settingKey = CONFIG.DH?.SETTINGS?.gameSettings?.CompendiumBrowserSettings;
  if (!settingKey) return null;

  return game.settings.get(CONFIG.DH.id, settingKey);
}

function status() {
  const ownedRows = Object.entries(TOOLKIT_REPLACEMENTS).map(([nativePack, toolkitPack]) => ({
    kind: "owned-native",
    nativePack,
    nativePresent: Boolean(game.packs.get(nativePack)),
    toolkitPack,
    toolkitPresent: Boolean(game.packs.get(toolkitPack)),
    excluded: Boolean(
      game.packs.get(nativePack) &&
      game.packs.get(toolkitPack)
    ),
  }));

  const thirdPartyRows = [...REDUNDANT_THIRD_PARTY_ITEM_PACKS].map((packId) => ({
    kind: "third-party",
    packId,
    present: Boolean(game.packs.get(packId)),
    excluded: Boolean(game.packs.get(packId)),
  }));

  return {
    green: ownedRows.every((row) => !row.nativePresent || row.toolkitPresent),
    ownedRows,
    thirdPartyRows,
  };
}

Hooks.once("ready", () => {
  const settings = getBrowserSettings();
  const patched = patchBrowserSettings(settings);

  const toolkitApi = game.modules.get(MODULE_ID)?.api;
  if (toolkitApi) {
    toolkitApi.itemBrowserSources ??= {};
    toolkitApi.itemBrowserSources.status = status;
    toolkitApi.itemBrowserSources.shouldExclude = shouldExcludeToolkitOwnedEntry;
  }

  console.log(`${MODULE_ID} | item browser source ownership`, {
    patched,
    ...status(),
  });
});
