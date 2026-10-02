export const HUNT_DOMAIN_ID = "hunt";

export const HUNT_DOMAIN_DEFINITION = Object.freeze({
  id: HUNT_DOMAIN_ID,
  label: "Chasse",
  src: "modules/daggerheart-campaign-toolkit/assets/icons/domain-card/hunt.png",
  description:
    "La Chasse est le domaine de lâ€™observation, de la prÃ©paration et de la coordination contre des crÃ©atures dangereuses.",
  color: "#6b5b3e",
});

export async function ensureHuntDomain() {
  if (!game.user?.isGM) {
    throw new Error("Lâ€™enregistrement du domaine Chasse est rÃ©servÃ© au MJ.");
  }

  const settingKey = CONFIG?.DH?.SETTINGS?.gameSettings?.Homebrew;
  if (!settingKey) {
    throw new Error("Foundryborne Homebrew setting key introuvable.");
  }

  const current = foundry.utils.deepClone(
    game.settings.get(CONFIG.DH.id, settingKey) ?? {}
  );

  current.domains ??= {};
  const previous = current.domains[HUNT_DOMAIN_ID] ?? null;
  const changed =
    !previous ||
    previous.id !== HUNT_DOMAIN_DEFINITION.id ||
    previous.label !== HUNT_DOMAIN_DEFINITION.label ||
    previous.src !== HUNT_DOMAIN_DEFINITION.src ||
    previous.description !== HUNT_DOMAIN_DEFINITION.description ||
    previous.color !== HUNT_DOMAIN_DEFINITION.color;

  if (changed) {
    current.domains[HUNT_DOMAIN_ID] = {
      ...HUNT_DOMAIN_DEFINITION,
    };
    await game.settings.set(CONFIG.DH.id, settingKey, current);
  }

  const allAfter = CONFIG?.DH?.DOMAIN?.allDomains?.() ?? {};
  const registered =
    allAfter[HUNT_DOMAIN_ID] ??
    current.domains[HUNT_DOMAIN_ID] ??
    CONFIG?.DH?.DOMAIN?.domains?.[HUNT_DOMAIN_ID] ??
    null;

  return {
    green: Boolean(registered),
    changed,
    reloadRecommended: changed && !allAfter[HUNT_DOMAIN_ID],
    domain: registered,
  };
}

