import { applyContentLocale, getImportLocale } from "./content-locale.mjs";
import {
  mapEmbeddedSourceFeatures,
  parseAdversaryExperiences,
  mapAdversaryAttack,
  nativeTemplate,
} from "./native-mapping.mjs";

const FLAG_SCOPE = "daggerheart-campaign-toolkit";

let dependencies = null;

export function configureActorBuilder(value) {
  dependencies = value;
}

function builderDependencies() {
  if (!dependencies) {
    throw new Error("Actor builder dependencies are not configured.");
  }
  return dependencies;
}

const nameOf = (...args) => builderDependencies().nameOf(...args);
const rules = (...args) => builderDependencies().rules(...args);
const provenanceFlags = (...args) => builderDependencies().provenanceFlags(...args);
const setMappingGaps = (...args) => builderDependencies().setMappingGaps(...args);
const sanitizeEmbeddedActorData = (...args) => builderDependencies().sanitizeEmbeddedActorData(...args);
const baseDescription = (...args) => builderDependencies().baseDescription(...args);
const normalizedChoice = (...args) => builderDependencies().normalizedChoice(...args);
const normalizedToken = (...args) => builderDependencies().normalizedToken(...args);

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
      `<p><strong>Empreinte :</strong> ${esc(hunting.footprint.width)}Ã—${esc(hunting.footprint.height)}</p>`
    );
  }

  if (hunting.mobility?.mode) {
    const mobility = hunting.mobility.state
      ? `${hunting.mobility.mode} (${hunting.mobility.state})`
      : hunting.mobility.mode;
    lines.push(`<p><strong>MobilitÃ© :</strong> ${esc(mobility)}</p>`);
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
      const ftText = Number.isFinite(ft) ? ` â€” FT ${esc(ft)}` : "";
      const effectText = part?.brokenEffectName ? ` â†’ <strong>${esc(part.brokenEffectName)}</strong>` : "";
      const consequence = part?.brokenConsequence ? `<br><small>${esc(part.brokenConsequence)}</small>` : "";
      lines.push(`<li><strong>${esc(part?.name ?? part?.id ?? "Partie")}</strong>${ftText}${effectText}${consequence}</li>`);
    }
    lines.push("</ul>");
    lines.push("<p><em>Assembler dans Colossus par glisser-dÃ©poser : Tetsucabra comme principal, puis les Actors de partie.</em></p>");
  }

  if (hunting.colossusPart === true) {
    const ft = Number(hunting.fractureThreshold);
    lines.push("<h4>Partie Colossus</h4>");
    if (Number.isFinite(ft)) lines.push(`<p><strong>Seuil de fracture :</strong> ${esc(ft)} sur un mÃªme impact.</p>`);
    if (hunting.brokenEffect?.name) lines.push(`<p><strong>Broken :</strong> ${esc(hunting.brokenEffect.name)} â€” ${esc(hunting.brokenEffect.rule ?? "")}</p>`);
    if (hunting.notes) lines.push(`<p>${esc(hunting.notes)}</p>`);
  }

  const normal = hunting.reactions?.normal;
  const fear = hunting.reactions?.fear;
  const normalName = normal?.name ?? "RÃ©action normale";
  const fearName = fear?.name ?? "RÃ©action renforcÃ©e";

  lines.push("<h4>Matrice d'Engagement</h4>");
  lines.push("<ul>");
  lines.push("<li><strong>SuccÃ¨s + Hope :</strong> 2 OP â€” aucune rÃ©action hostile â€” Spotlight â†’ Finisher.</li>");
  lines.push(`<li><strong>SuccÃ¨s + Fear :</strong> 2 OP â€” ${esc(normalName)}.</li>`);
  lines.push(`<li><strong>Ã‰chec + Hope :</strong> 1 OP â€” ${esc(normalName)}.</li>`);
  lines.push(`<li><strong>Ã‰chec + Fear :</strong> 1 OP â€” ${esc(fearName)}.</li>`);
  lines.push("</ul>");

  const reactionDetails = (reaction, key) => {
    if (!reaction || typeof reaction !== "object") return;

    lines.push(`<h4>${esc(reaction.name ?? key)}</h4>`);

    if (reaction.baseReaction === "normal" && normal?.name) {
      lines.push(`<p>RÃ©soudre d'abord <strong>${esc(normal.name)}</strong>, puis appliquer la consÃ©quence ci-dessous.</p>`);
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
        lines.push("<p><strong>Support :</strong> 1 Hope â†’ âˆ’1d4 au jet d'attaque du monstre.</p>");
      }
      if (resolution.onHit?.markStress) {
        lines.push(`<p><strong>Sur une touche :</strong> la cible marque ${esc(resolution.onHit.markStress)} Stress.</p>`);
      }
    } else if (resolution.kind === "forcedMovement") {
      lines.push(
        `<p>Projeter l'Opener de <strong>${esc(resolution.steps ?? "?")} bandes de portÃ©e</strong>.`
      );
      if (resolution.collision?.damagePerUnspentStep) {
        lines.push(
          ` Chaque bande non parcourue Ã  cause d'un obstacle solide inflige ` +
          `<strong>${esc(resolution.collision.damagePerUnspentStep)} ${esc(resolution.collision.damage_type ?? "")}</strong> de collision.</p>`
        );
      } else {
        lines.push("</p>");
      }
    } else if (resolution.kind === "consequence" && resolution.text) {
      lines.push(`<p>${esc(resolution.text)}</p>`);
    }
  };

  reactionDetails(normal, "RÃ©action normale");
  reactionDetails(fear, "RÃ©action renforcÃ©e");

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

