import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "core", "fr", "dh-domain-cards.json");
const cards = JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
if (!Array.isArray(cards)) throw new Error("dh-domain-cards.json doit contenir un tableau");

// P2.9a.2b is deliberately an AUDIT/EXTRACTION pass.
// It fixes the false-positive detector from P2.9a.2 and writes no source data.
// The resulting JSON is the exact worklist for the translation patch.
const OUT = path.join(process.cwd(), "tmp", "p2.9a.2b-domain-card-english.json");

const frenchWords = /\b(le|la|les|un|une|des|du|de|dans|avec|pour|vous|votre|vos|lorsque|quand|sur|cible|attaque|dégâts|dégât|jet|gagner|dépenser|effacer|marquer|soigner|réduire|subir|espoir|peur)\b/giu;
const englishWords = /\b(the|a|an|you|your|yours|they|their|them|when|while|within|against|from|after|before|until|instead|target|attack|damage|roll|gain|spend|clear|mark|make|choose|creature|ally|adversary|weapon|range|rest|success|failure|become|take|deal|move|can|must|this|that|these|those|all|another|any|each|equal|using|into|through|where|which|who|would|have|has|are|is|to|of|and|or|on|for|as|if|it|with)\b/giu;

function stripMarkup(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function count(re, s) {
  re.lastIndex = 0;
  return [...s.matchAll(re)].length;
}

function isFormulaOrReference(s) {
  const t = String(s ?? "").trim();
  if (!t) return true;
  if (/^@[\w.[\]-]+$/.test(t)) return true;
  if (/^[\d\s+\-*/().@[\]A-Za-z_]+$/.test(t) && /[@[\]*/]/.test(t)) return true;
  return false;
}

function looksEnglish(value) {
  if (typeof value !== "string" || !value.trim() || isFormulaOrReference(value)) return false;
  const t = stripMarkup(value);
  const en = count(englishWords, t);
  const fr = count(frenchWords, t);

  // Key fix vs P2.9a.2: isolated game terms such as "Stress" are not evidence.
  // Short labels need >=2 English grammar words; prose needs English dominance.
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 5) return en >= 2 && en > fr;
  return en >= 3 && en >= fr + 2;
}

const findings = [];
function add(card, pathName, value, kind) {
  if (!looksEnglish(value)) return;
  findings.push({
    cardId: card._id,
    card: card.name,
    canonicalSourceId: card?.flags?.["daggerheart-campaign-toolkit"]?.canonicalSourceId ?? null,
    kind,
    path: pathName,
    value
  });
}

for (const card of cards) {
  for (const [actionId, action] of Object.entries(card?.system?.actions ?? {})) {
    add(card, `system.actions.${actionId}.name`, action?.name, "action-name");
    add(card, `system.actions.${actionId}.description`, action?.description, "action-description");
  }
  for (let i = 0; i < (card.effects ?? []).length; i++) {
    const effect = card.effects[i];
    add(card, `effects[${i}].name`, effect?.name, "effect-name");
    add(card, `effects[${i}].description`, effect?.description, "effect-description");
    for (let j = 0; j < (effect?.system?.changes ?? []).length; j++) {
      add(card, `effects[${i}].system.changes[${j}].value`,
          effect.system.changes[j]?.value, "effect-visible-value");
    }
  }
}

const byKind = Object.fromEntries(
  [...new Set(findings.map(x => x.kind))].sort().map(k => [k, findings.filter(x => x.kind === k).length])
);
const uniqueStrings = new Set(findings.map(x => x.value)).size;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  schema: "daggerheart-campaign-toolkit/p2.9a.2b-domain-card-english-worklist@1",
  source: path.relative(process.cwd(), FILE),
  cards: cards.length,
  findings: findings.length,
  uniqueStrings,
  byKind,
  rows: findings
}, null, 2) + "\n", "utf8");

console.log("[P2.9a.2b] audit GREEN — aucune donnée source modifiée");
console.log({ cards: cards.length, findings: findings.length, uniqueStrings, byKind });
console.log(`écrit: ${path.relative(process.cwd(), OUT)}`);
console.table(findings.slice(0, 30).map(x => ({
  card: x.card,
  kind: x.kind,
  path: x.path,
  value: stripMarkup(x.value).slice(0, 100)
})));
