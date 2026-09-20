import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "core", "fr", "dh-domain-cards.json");
const raw = fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, "");
const cards = JSON.parse(raw);
if (!Array.isArray(cards)) throw new Error("dh-domain-cards.json doit contenir un tableau");

// Explicit translations for presentation strings observed in the reconstructed
// native mechanics. Exact-match only: unknown strings are reported, never guessed.
const exact = new Map(Object.entries({
  "Spend Hope": "Dépenser de l’Espoir",
  "Gain Hope": "Gagner de l’Espoir",
  "Clear Stress": "Effacer du Stress",
  "Clear 1 Stress": "Effacer 1 Stress",
  "Clear Hit Point": "Effacer un Point de vie",
  "Clear 1 Hit Point": "Effacer 1 Point de vie",
  "Rescind Move": "Annuler l’action",
  "Reaction Roll": "Jet de réaction",
  "Mark Stress": "Marquer du Stress",
  "Critical Success": "Réussite critique",
  "Gain Advantage": "Gagner un Avantage",
  "Body Basher": "Briseur de corps",
  "Spectral": "Spectral",
  "Deft Deceiver": "Trompeur habile",

  "<p>When you roll with Fear, you can <strong>spend 2 Hope</strong> to clear an Armor Slot.</p>":
    "<p>Lorsque vous obtenez un résultat avec Peur, vous pouvez <strong>dépenser 2 Espoir</strong> pour récupérer un emplacement d’armure.</p>",

  "<p>Once per long rest, immediately after the GM conveys the consequences of a roll you made, you can rescind the move and consequences like they never happened and make another move instead.</p>":
    "<p>Une fois par repos long, immédiatement après que le MJ vous a annoncé les conséquences d’un jet que vous avez effectué, vous pouvez annuler l’action et ses conséquences comme si elles n’avaient jamais eu lieu, puis effectuer une autre action à la place.</p>",

  "<p>Spend a token from this card to give them the following:</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Your ally clears a Stress.</p></li></ul>":
    "<p>Dépensez un jeton de cette carte pour accorder le bénéfice suivant :</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Votre allié efface un Stress.</p></li></ul>",

  "<p>Spend a token from this card to give them the following:</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Your ally clears a Hit Point.</p></li></ul>":
    "<p>Dépensez un jeton de cette carte pour accorder le bénéfice suivant :</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Votre allié efface un Point de vie.</p></li></ul>",

  "<p>Spend a token from this card to give them the following:</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Your ally gains a Hope.</p></li></ul>":
    "<p>Dépensez un jeton de cette carte pour accorder le bénéfice suivant :</p><ul class=\"\"><li class=\"vertical-card-list-found\"><p>Votre allié gagne un Espoir.</p></li></ul>",

  "<p>Gain advantage on a roll to deceive or trick someone into believing a lie you tell them.</p>":
    "<p>Gagnez un Avantage à un jet visant à tromper quelqu’un ou à lui faire croire un mensonge que vous lui racontez.</p>",

  "Deceive or trick someone into believing a lie you told them":
    "Tromper quelqu’un ou lui faire croire un mensonge que vous lui avez raconté",

  "<p>On a successful attack using a weapon with a Melee range, gain a bonus to your damage roll equal to your Strength.</p>":
    "<p>Lors d’une attaque réussie avec une arme à portée de Mêlée, ajoutez à votre jet de dégâts un bonus égal à votre Force.</p>",

  "<p>While a creature is incorporeal, they can move through solid objects and are immune to physical damage. They become corporeal again after they pass through a solid object or make an action roll. Otherwise, this effect lasts until the end of the scene.</p>":
    "<p>Tant qu’une créature est incorporelle, elle peut traverser les objets solides et est immunisée aux dégâts physiques. Elle redevient corporelle après avoir traversé un objet solide ou effectué un jet d’action. Sinon, cet effet dure jusqu’à la fin de la scène.</p>",

  "<p>When you can take a few minutes to focus on the target you're helping, you can spend 2 Hope to clear a Hit Point or a Stress on them.</p>":
    "<p>Lorsque vous pouvez prendre quelques minutes pour vous concentrer sur la cible que vous aidez, vous pouvez dépenser 2 Espoir pour lui faire récupérer 1 Point de vie ou effacer 1 Stress.</p>",

  "<p>When you can take a few minutes to focus on the target you're helping, you can <strong>spend 2 Hope</strong> to clear a Hit Point or a Stress on them.</p><p>Once per long rest, when you spend this healing time learning something new about them or revealing something about yourself, you can clear 2 Hit Points or 2 Stress on them instead.</p>":
    "<p>Lorsque vous pouvez prendre quelques minutes pour vous concentrer sur la cible que vous aidez, vous pouvez <strong>dépenser 2 Espoir</strong> pour lui faire récupérer 1 Point de vie ou effacer 1 Stress.</p><p>Une fois par repos long, si vous consacrez ce temps de soin à apprendre quelque chose de nouveau sur elle ou à révéler quelque chose sur vous-même, vous pouvez à la place lui faire récupérer 2 Points de vie ou effacer 2 Stress.</p>"
}));

const strongEnglish = /\b(the|you|your|when|with|from|after|before|until|target|damage|stress|hope|roll|attack|ally|gain|spend|clear|mark|move|rest|range|weapon|creature|physical|magical|advantage)\b/i;
const presentationKeys = new Set(["name", "description"]);

const beforeIds = cards.map(c => c._id);
const beforeMechanics = JSON.stringify(cards, (k, v) => {
  // Remove only fields this pass is allowed to alter.
  if (presentationKeys.has(k) && typeof v === "string") return "__PRESENTATION__";
  if (k === "value" && typeof v === "string" && strongEnglish.test(v)) return "__PRESENTATION_VALUE__";
  if (k === "localizedPaths") return "__LOCALIZED_PATHS__";
  return v;
});

let changed = 0;
const touched = [];
const unknown = [];

function translateString(value, ctx) {
  if (typeof value !== "string" || value === "") return value;
  if (exact.has(value)) {
    const next = exact.get(value);
    if (next !== value) {
      changed++;
      touched.push({ ...ctx, from: value, to: next });
    }
    return next;
  }
  if (strongEnglish.test(value)) unknown.push({ ...ctx, value });
  return value;
}

for (const card of cards) {
  for (const [actionId, action] of Object.entries(card?.system?.actions ?? {})) {
    action.name = translateString(action.name, { card: card.name, cardId: card._id, path: `system.actions.${actionId}.name` });
    action.description = translateString(action.description, { card: card.name, cardId: card._id, path: `system.actions.${actionId}.description` });
  }

  for (let i = 0; i < (card.effects ?? []).length; i++) {
    const effect = card.effects[i];
    effect.name = translateString(effect.name, { card: card.name, cardId: card._id, path: `effects[${i}].name` });
    effect.description = translateString(effect.description, { card: card.name, cardId: card._id, path: `effects[${i}].description` });

    for (let j = 0; j < (effect?.system?.changes ?? []).length; j++) {
      const change = effect.system.changes[j];
      // Only human-readable English strings are eligible. Formulas/keys/numbers stay untouched.
      if (typeof change?.value === "string" && strongEnglish.test(change.value)) {
        change.value = translateString(change.value, { card: card.name, cardId: card._id, path: `effects[${i}].system.changes[${j}].value` });
      }
    }
  }

  const flags = card?.flags?.["daggerheart-campaign-toolkit"];
  if (flags && touched.some(x => x.cardId === card._id)) {
    const paths = Array.isArray(flags.localizedPaths) ? flags.localizedPaths : [];
    for (const p of ["system.actions.*.name", "system.actions.*.description", "effects.*.name", "effects.*.description", "effects.*.system.changes.*.value"]) {
      if (!paths.includes(p)) paths.push(p);
    }
    flags.localizedPaths = paths;
  }
}

if (unknown.length) {
  console.error("\n[P2.9a.2] Chaînes anglaises non traduites (aucune écriture effectuée):");
  console.table(unknown.map(x => ({ card: x.card, path: x.path, value: x.value.slice(0, 140) })));
  throw new Error(`P2.9a.2 incomplet: ${unknown.length} chaîne(s) anglaise(s) inconnue(s).`);
}

if (cards.map(c => c._id).join("|") !== beforeIds.join("|")) throw new Error("Invariant IDs/order violé");

const afterMechanics = JSON.stringify(cards, (k, v) => {
  if (presentationKeys.has(k) && typeof v === "string") return "__PRESENTATION__";
  if (k === "value" && typeof v === "string" && strongEnglish.test(v)) return "__PRESENTATION_VALUE__";
  if (k === "localizedPaths") return "__LOCALIZED_PATHS__";
  return v;
});
if (beforeMechanics !== afterMechanics) throw new Error("Invariant mécanique violé: champ hors présentation modifié");

fs.writeFileSync(FILE, JSON.stringify(cards, null, 2) + "\n", "utf8");
console.table(touched.map(x => ({ card: x.card, path: x.path, from: x.from.slice(0, 60), to: x.to.slice(0, 60) })));
console.log({ cards: cards.length, changed, unknownEnglish: 0, file: path.relative(process.cwd(), FILE) });
