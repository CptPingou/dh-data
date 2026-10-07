import { hasHuntArtisanCard } from "./weapon-augment-workshop.mjs";
const MODULE_ID = "daggerheart-campaign-toolkit";

const ARTIFICER_CLASS_SOURCE_ID =
  "homebrew.artificer.class.artificer";

function sourceIdOf(item) {
  return item?.flags?.[MODULE_ID]?.sourceId ?? null;
}

function actorItems(actor) {
  return actor?.items?.contents ?? [...(actor?.items ?? [])];
}

export function isMotherboardArtificer(actor) {
  if (!actor || actor.documentName !== "Actor") return false;

  return actorItems(actor).some(
    (item) =>
      item?.type === "class" &&
      sourceIdOf(item) === ARTIFICER_CLASS_SOURCE_ID
  );
}

export function canModifyMotherboard({
  user = game.user,
  crafter = null,
  weapon = null,
  operation,
} = {}) {
  const supported = new Set([
    "craft",
    "install",
    "uninstall",
  ]);

  if (!supported.has(operation)) {
    return {
      allowed: false,
      reason: "UNSUPPORTED_OPERATION",
      operation,
    };
  }

  if (
    !weapon ||
    weapon.documentName !== "Item" ||
    weapon.type !== "weapon" ||
    weapon.parent?.documentName !== "Actor"
  ) {
    return {
      allowed: false,
      reason: "INVALID_WEAPON",
      operation,
    };
  }

  if (user?.isGM) {
    return {
      allowed: true,
      reason: "GM",
      operation,
      crafterUuid: crafter?.uuid ?? null,
      weaponUuid: weapon.uuid,
    };
  }

  /*
   * Player-side qualification:
   * the requesting user must control a character
   * that owns the Hunt Artisant card.
   *
   * The target weapon may belong to another character;
   * the GM authority bridge performs the mutation.
   */
  const ownsCrafter =
    crafter?.testUserPermission?.(
      user,
      "OWNER",
    ) === true;

  if (
    ownsCrafter &&
    hasHuntArtisanCard(crafter)
  ) {
    return {
      allowed: true,
      reason: "HUNT_ARTISAN",
      operation,
      crafterUuid: crafter.uuid,
      weaponUuid: weapon.uuid,
    };
  }

  return {
    allowed: false,
    reason: "MISSING_QUALIFICATION",
    operation,
    crafterUuid: crafter?.uuid ?? null,
    weaponUuid: weapon.uuid,
  };
}

export const weaponAugmentPermissionApi = Object.freeze({
  isArtificer: isMotherboardArtificer,
  canModify: canModifyMotherboard,
});