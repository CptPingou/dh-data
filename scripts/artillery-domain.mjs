export const ARTILLERY_DOMAIN_ID = "artillery";

const ARTILLERY_DOMAIN_DEFINITION = Object.freeze({
  id: ARTILLERY_DOMAIN_ID,
  label: "Artillery",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/artillery.png",
  description:
    "Artillery est le domaine de la puissance de feu, du contrôle de zone et des attaques à fort impact.",
  color: "#8a5a24",
});

export async function ensureArtilleryDomain() {
  if (!game.user?.isGM) {
    throw new Error("L’enregistrement du domaine Artillery est réservé au MJ.");
  }

  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) {
    throw new Error("Foundryborne Homebrew setting key introuvable.");
  }

  const current = foundry.utils.deepClone(
    game.settings.get(CONFIG.DH.id, settingKey) ?? {}
  );

  current.domains ??= {};
  const previous = current.domains[ARTILLERY_DOMAIN_ID] ?? null;
  const changed =
    !previous ||
    previous.id !== ARTILLERY_DOMAIN_DEFINITION.id ||
    previous.label !== ARTILLERY_DOMAIN_DEFINITION.label ||
    previous.src !== ARTILLERY_DOMAIN_DEFINITION.src ||
    previous.description !== ARTILLERY_DOMAIN_DEFINITION.description ||
    previous.color !== ARTILLERY_DOMAIN_DEFINITION.color;

  if (changed) {
    current.domains[ARTILLERY_DOMAIN_ID] = {
      ...ARTILLERY_DOMAIN_DEFINITION,
    };
    await game.settings.set(CONFIG.DH.id, settingKey, current);
  }

  const allAfter = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const registered =
    allAfter[ARTILLERY_DOMAIN_ID] ??
    current.domains[ARTILLERY_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[ARTILLERY_DOMAIN_ID] ??
    null;

  return {
    green: Boolean(registered),
    changed,
    reloadRecommended: changed && !allAfter[ARTILLERY_DOMAIN_ID],
    domain: registered,
  };
}
