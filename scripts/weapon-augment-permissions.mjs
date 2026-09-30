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
   * Preserve current behaviour:
   * the owner of the weapon may still install/uninstall their
   * already-crafted Augments.
   */
  const ownsWeapon =
    weapon.testUserPermission?.(user, "OWNER") === true ||
    weapon.parent?.testUserPermission?.(user, "OWNER") === true;

  if (
    ownsWeapon &&
    (operation === "install" || operation === "uninstall")
  ) {
    return {
      allowed: true,
      reason: "WEAPON_OWNER",
      operation,
      crafterUuid: crafter?.uuid ?? null,
      weaponUuid: weapon.uuid,
    };
  }

  /*
   * Artificer qualification.
   *
   * This is deliberately independent from Foundry document ownership:
   * the execution bridge will deal with the actual mutation later.
   */
  if (isMotherboardArtificer(crafter)) {
    return {
      allowed: true,
      reason: "ARTIFICER",
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