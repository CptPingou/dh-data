const MODULE_ID = "daggerheart-campaign-toolkit";

const NATIVE_ARTWORK_PACKS = Object.freeze({
  weapons: "daggerheart.weapons",
  armor: "daggerheart.armors",
  consumables: "daggerheart.consumables",
  loot: "daggerheart.loot",
});

async function collectNativeItemArtwork() {
  const packs = {};
  let count = 0;

  for (const [kind, packId] of Object.entries(NATIVE_ARTWORK_PACKS)) {
    const pack = game.packs.get(packId);

    if (!pack) {
      packs[kind] = {
        packId,
        present: false,
        entries: [],
      };
      continue;
    }

    const docs = await pack.getDocuments();
    const entries = docs.map((doc) => ({
      id: doc.id,
      uuid: doc.uuid,
      name: doc.name ?? null,
      type: doc.type ?? null,
      img: doc.img ?? null,
      sourceId:
        doc.flags?.core?.sourceId ??
        doc.flags?.[MODULE_ID]?.sourceId ??
        null,
    }));

    count += entries.length;

    packs[kind] = {
      packId,
      present: true,
      entries,
    };
  }

  return {
    schema: `${MODULE_ID}/native-item-artwork-map@1`,
    generatedAt: new Date().toISOString(),
    system: {
      id: game.system?.id ?? null,
      version: game.system?.version ?? null,
    },
    module: {
      id: MODULE_ID,
      version: game.modules.get(MODULE_ID)?.version ?? null,
    },
    count,
    packs,
  };
}

async function exportNativeItemArtwork({
  filename = "native-item-artwork-map.json",
} = {}) {
  const payload = await collectNativeItemArtwork();
  const json = JSON.stringify(payload, null, 2);

  foundry.utils.saveDataToFile(
    json,
    "application/json",
    filename,
  );

  console.log(`${MODULE_ID} | native item artwork exported`, {
    filename,
    count: payload.count,
    packs: Object.fromEntries(
      Object.entries(payload.packs).map(([kind, pack]) => [
        kind,
        {
          packId: pack.packId,
          present: pack.present,
          count: pack.entries.length,
        },
      ])
    ),
  });

  return payload;
}

function status() {
  const rows = Object.entries(NATIVE_ARTWORK_PACKS).map(([kind, packId]) => ({
    kind,
    packId,
    present: Boolean(game.packs.get(packId)),
  }));

  return {
    green: rows.every((row) => row.present),
    rows,
  };
}

Hooks.once("ready", () => {
  const toolkitApi = game.modules.get(MODULE_ID)?.api;
  if (!toolkitApi) return;

  toolkitApi.nativeItemArtwork ??= {};
  toolkitApi.nativeItemArtwork.status = status;
  toolkitApi.nativeItemArtwork.collect = collectNativeItemArtwork;
  toolkitApi.nativeItemArtwork.export = exportNativeItemArtwork;

  console.log(`${MODULE_ID} | native item artwork mapper ready`, status());
});
