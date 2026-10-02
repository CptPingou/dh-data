import { buildActor } from "./actor-builder.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = MODULE_ID;


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


