import { ensureHuntDomain } from "./hunt-domain.mjs";
import { importCanonicalDomainCard } from "./domain-card-import.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_SCOPE = "daggerheart-campaign-toolkit";


export async function importHuntPilot() {
  const domain = await ensureHuntDomain();

  const card = await importCanonicalDomainCard(
    "data/homebrew/monster-hunter/domains/hunt/lecture-de-la-proie.json"
  );

  const result = {
    green: Boolean(card),
    domain,
    card: card
      ? {
          id: card.id,
          name: card.name,
          type: card.type,
          domain: card.system?.domain ?? null,
          level: card.system?.level ?? null,
          recallCost: card.system?.recallCost ?? null,
          cardType: card.system?.type ?? null,
          sourceId: card.flags?.[FLAG_SCOPE]?.sourceId ?? null,
        }
      : null,
  };

  console.log(`${MODULE_ID} | P2.11a.1 Hunt pilot`, result);
  return result;
}


