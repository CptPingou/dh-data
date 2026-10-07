import { evaluateWeaponAugmentPrecompile } from "./weapon-augment-precompile.mjs";
import {
  addNativeWeaponFeature,
  getWeaponFeatureEntries,
  hasNativeWeaponFeature,
  removeNativeWeaponFeature,
} from "./weapon-augment-native.mjs";
const MODULE_ID = "daggerheart-campaign-toolkit";
const FLAG_KEY = "weaponAugments";
const SCHEMA_VERSION = 1;

function clone(value) {
  return foundry.utils.deepClone(value);
}

function assertOwnedWeapon(weapon) {
  if (!weapon || weapon.documentName !== "Item" || weapon.type !== "weapon") {
    throw new Error("Expected a Foundryborne weapon Item.");
  }

  if (weapon.parent?.documentName !== "Actor") {
    throw new Error("Weapon Augment state is only supported on actor-embedded weapons.");
  }

  return weapon;
}

function assertGM() {
  if (!game.user?.isGM) {
    throw new Error("This Weapon Augment operation is GM-only.");
  }
}

function assertNonEmptyId(value, label = "augmentId") {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertSlots(slots) {
  if (!Number.isInteger(slots) || slots < 0) {
    throw new Error("slots must be a non-negative integer.");
  }
  return slots;
}

const WEAPON_RANGE_STEPS = [
  "melee",
  "veryClose",
  "close",
  "far",
  "veryFar",
];

function nextWeaponRange(range) {
  const index = WEAPON_RANGE_STEPS.indexOf(range);
  if (index < 0) return range;
  return WEAPON_RANGE_STEPS[Math.min(index + 1, WEAPON_RANGE_STEPS.length - 1)];
}

function applyStructuralAugmentUpdate(weapon, augmentId, state, update) {
  if (augmentId !== "motherboard.scope") return;

  const currentRange = weapon.system?.attack?.range;
  if (!WEAPON_RANGE_STEPS.includes(currentRange)) {
    throw new Error(
      `Scope cannot increase unsupported weapon range: ${currentRange ?? "missing"}.`,
    );
  }

  const appliedRange = nextWeaponRange(currentRange);

  state.structural ??= {};
  state.structural.scope = {
    baseRange: currentRange,
    appliedRange,
  };

  update["system.attack.range"] = appliedRange;
}

function removeStructuralAugmentUpdate(weapon, augmentId, state, update) {
  if (augmentId !== "motherboard.scope") return;

  const scopeState = state.structural?.scope;
  if (!scopeState) return;

  const currentRange = weapon.system?.attack?.range;

  // Only restore if Scope still owns the value it applied. If another system,
  // GM edit, or future augment changed the range meanwhile, preserve that value.
  if (
    scopeState.baseRange &&
    currentRange === scopeState.appliedRange &&
    currentRange !== scopeState.baseRange
  ) {
    update["system.attack.range"] = scopeState.baseRange;
  }

  delete state.structural.scope;
  if (Object.keys(state.structural).length === 0) {
    delete state.structural;
  }
}

function emptyState(slots = 2) {
  return {
    schemaVersion: SCHEMA_VERSION,
    slots: assertSlots(slots),
    crafted: [],
    installed: [],
  };
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }

  const result = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} must contain non-empty string IDs.`);
    }

    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate ID: ${value}.`);
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

export function validateWeaponAugmentStateData(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Weapon Augment state is absent or invalid.");
  }

  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Weapon Augment schemaVersion: ${state.schemaVersion ?? "missing"}.`,
    );
  }

  const slots = assertSlots(state.slots);
  const crafted = uniqueStrings(state.crafted, "crafted");
  const installed = uniqueStrings(state.installed, "installed");
  const craftedSet = new Set(crafted);

  for (const augmentId of installed) {
    if (!craftedSet.has(augmentId)) {
      throw new Error(`Installed Augment is not crafted: ${augmentId}.`);
    }
  }

  if (installed.length > slots) {
    throw new Error(
      `Installed Augments exceed slots: ${installed.length} installed, ${slots} slots.`,
    );
  }

  return {
    green: true,
    slots,
    craftedCount: crafted.length,
    installedCount: installed.length,
    availableSlots: slots - installed.length,
  };
}

async function resolveCatalogAugment(catalogApi, augmentId) {
  assertNonEmptyId(augmentId);

  if (!catalogApi?.get) {
    throw new Error("Weapon Augment catalog API is unavailable.");
  }

  return catalogApi.get(augmentId);
}

async function evaluatePrecompile(catalogApi, weapon, augmentId) {
  assertOwnedWeapon(weapon);
  const augment = await resolveCatalogAugment(catalogApi, augmentId);
  const evaluation = evaluateWeaponAugmentPrecompile(
    weapon,
    augment.precompile ?? null,
  );

  return {
    ...evaluation,
    augmentId: augment.id,
    precompile: clone(augment.precompile ?? null),
  };
}

async function writeState(weapon, state) {
  assertOwnedWeapon(weapon);
  validateWeaponAugmentStateData(state);
  await weapon.setFlag(MODULE_ID, FLAG_KEY, clone(state));
  return getWeaponAugmentState(weapon);
}

async function writeStateAndNativeFeatures(
  weapon,
  state,
  weaponFeatures,
  extraUpdate = {},
) {
  assertOwnedWeapon(weapon);
  validateWeaponAugmentStateData(state);

  await weapon.update({
    ...clone(extraUpdate),
    [`flags.${MODULE_ID}.${FLAG_KEY}`]: clone(state),
    "system.weaponFeatures": clone(weaponFeatures),
  });

  return {
    ...getWeaponAugmentState(weapon),
    nativeWeaponFeatures: getWeaponFeatureEntries(weapon),
  };
}

export function getWeaponAugmentState(weapon) {
  assertOwnedWeapon(weapon);

  const state = weapon.getFlag(MODULE_ID, FLAG_KEY);

  if (!state) {
    const candidate = emptyState();
    return {
      state: candidate,
      initialized: false,
      ...validateWeaponAugmentStateData(candidate),
    };
  }

  return {
    state: clone(state),
    initialized: true,
    ...validateWeaponAugmentStateData(state),
  };
}

export function validateWeaponAugmentState(weapon) {
  return getWeaponAugmentState(weapon);
}

export async function initializeWeaponAugments(weapon, { slots = 2 } = {}) {
  assertOwnedWeapon(weapon);
  assertGM();

  if (weapon.getFlag(MODULE_ID, FLAG_KEY)) {
    throw new Error("Weapon Augment state is already initialized.");
  }

  return writeState(weapon, emptyState(slots));
}

export async function setWeaponAugmentSlots(weapon, slots) {
  assertOwnedWeapon(weapon);
  assertGM();
  assertSlots(slots);

  const current = getWeaponAugmentState(weapon);
  if (!current.initialized) {
    throw new Error("Weapon Augment state must be initialized first.");
  }

  if (current.state.installed.length > slots) {
    throw new Error(
      `Cannot reduce slots to ${slots}: ${current.state.installed.length} Augments are installed.`,
    );
  }

  const next = clone(current.state);
  next.slots = slots;
  return writeState(weapon, next);
}

export function createWeaponAugmentStateApi(
  catalogApi,
  infusionApi = null
) {
  return {
    get: getWeaponAugmentState,

    /** P2.13b.3 ? effective weapon Augments
     * Projection read-only:
     * permanent installed[] + active Artificer infusions.
     * Does not mutate crafted[], installed[] or native weapon features.
     */
    effective(weapon) {
      assertOwnedWeapon(weapon);

      const current =
        getWeaponAugmentState(
          weapon
        );

      const permanentIds =
        [...current.state.installed];

      const infusionEntries =
        typeof infusionApi?.forWeapon ===
          "function"
          ? infusionApi.forWeapon(
              weapon
            )
          : [];

      const usableInfusions =
        infusionEntries.filter(
          entry =>
            typeof entry?.augmentId ===
              "string" &&
            entry.augmentId.trim()
        );

      const infusionIds =
        [
          ...new Set(
            usableInfusions.map(
              entry =>
                entry.augmentId
            )
          ),
        ];

      const permanentSet =
        new Set(
          permanentIds
        );

      const duplicates =
        infusionIds.filter(
          augmentId =>
            permanentSet.has(
              augmentId
            )
        );

      const effectiveIds =
        [
          ...new Set([
            ...permanentIds,
            ...infusionIds,
          ]),
        ];

      return {
        green: true,

        weaponUuid:
          weapon.uuid,

        permanentIds,

        infusionIds,

        effectiveIds,

        duplicates,

        permanentCount:
          permanentIds.length,

        infusionCount:
          infusionIds.length,

        effectiveCount:
          effectiveIds.length,

        infusionEntries:
          clone(
            usableInfusions
          ),
      };
    },
    validate: validateWeaponAugmentState,

    initialize: initializeWeaponAugments,

    setSlots: setWeaponAugmentSlots,

    eligibility(weapon, augmentId) {
      return evaluatePrecompile(catalogApi, weapon, augmentId);
    },

    nativeStatus(weapon, augmentId) {
      assertOwnedWeapon(weapon);
      assertNonEmptyId(augmentId);

      const current = getWeaponAugmentState(weapon);
      return {
        augmentId,
        installed: current.state.installed.includes(augmentId),
        nativeFeature: hasNativeWeaponFeature(weapon, augmentId),
      };
    },

    async craft(weapon, augmentId) {
      assertOwnedWeapon(weapon);
      assertGM();

      const current = getWeaponAugmentState(weapon);
      if (!current.initialized) {
        throw new Error("Weapon Augment state must be initialized first.");
      }

      const augment = await resolveCatalogAugment(catalogApi, augmentId);

      if (current.state.crafted.includes(augment.id)) {
        throw new Error(`Augment is already crafted: ${augment.id}.`);
      }

      const eligibility = await evaluatePrecompile(catalogApi, weapon, augment.id);
      if (!eligibility.eligible) {
        throw new Error(
          `Precompile not met for ${augment.id}: ${eligibility.reason ?? "ineligible"}`,
        );
      }

      const next = clone(current.state);
      next.crafted.push(augment.id);
      return writeState(weapon, next);
    },

    async uncraft(weapon, augmentId) {
      assertOwnedWeapon(weapon);
      assertGM();

      const current = getWeaponAugmentState(weapon);
      if (!current.initialized) {
        throw new Error("Weapon Augment state must be initialized first.");
      }

      assertNonEmptyId(augmentId);

      if (!current.state.crafted.includes(augmentId)) {
        throw new Error(`Augment is not crafted: ${augmentId}.`);
      }

      if (current.state.installed.includes(augmentId)) {
        throw new Error(`Cannot uncraft an installed Augment: ${augmentId}.`);
      }

      const next = clone(current.state);
      next.crafted = next.crafted.filter((id) => id !== augmentId);
      return writeState(weapon, next);
    },

    async install(weapon, augmentId) {
      assertOwnedWeapon(weapon);

      const current = getWeaponAugmentState(weapon);
      if (!current.initialized) {
        throw new Error("Weapon Augment state must be initialized first.");
      }

      const augment = await resolveCatalogAugment(catalogApi, augmentId);

      if (!current.state.crafted.includes(augment.id)) {
        throw new Error(`Augment must be crafted before installation: ${augment.id}.`);
      }

      const eligibility = await evaluatePrecompile(catalogApi, weapon, augment.id);
      if (!eligibility.eligible) {
        throw new Error(
          `Precompile not met for ${augment.id}: ${eligibility.reason ?? "ineligible"}`,
        );
      }

      if (current.state.installed.includes(augment.id)) {
        throw new Error(`Augment is already installed: ${augment.id}.`);
      }

      /*
       * P2.13g.1b - reject permanent install while infusion is active
       *
       * Permanent and temporary provenance must never own the same
       * Motherboard augment on the same weapon at the same time.
       */
      const activeInfusions =
        infusionApi?.forWeapon?.(weapon) ?? [];

      if (
        activeInfusions.some(
          entry =>
            entry?.augmentId ===
            augment.id
        )
      ) {
        throw new Error(
          `Augment is currently active as an Artificer infusion: ${augment.id}.`,
        );
      }

      if (current.state.installed.length >= current.state.slots) {
        throw new Error(
          `No Weapon Augment slots available: ${current.state.installed.length}/${current.state.slots} occupied.`,
        );
      }

      const next = clone(current.state);
      next.installed.push(augment.id);

      const nativeFeatures = addNativeWeaponFeature(
        getWeaponFeatureEntries(weapon),
        augment.id,
      );

      const extraUpdate = {};
      applyStructuralAugmentUpdate(weapon, augment.id, next, extraUpdate);

      return writeStateAndNativeFeatures(
        weapon,
        next,
        nativeFeatures,
        extraUpdate,
      );
    },

    /** P2.13b.4 ? native sync from effective Augments */
    async resync(weapon) {
      /** P2.13f.1 ? temporary Scope structural lifecycle */

      assertOwnedWeapon(weapon);
      assertGM();

      const current =
        getWeaponAugmentState(
          weapon
        );

      if (!current.initialized) {
        throw new Error(
          "Weapon Augment state must be initialized first."
        );
      }

      validateWeaponAugmentStateData(
        current.state
      );

      const permanentIds =
        [
          ...current.state.installed,
        ];

      const infusionEntries =
        infusionApi?.forWeapon?.(
          weapon
        ) ?? [];

      const infusionIds =
        [
          ...new Set(
            infusionEntries
              .map(
                entry =>
                  entry?.augmentId
              )
              .filter(
                augmentId =>
                  typeof augmentId ===
                    "string" &&
                  augmentId.length > 0
              )
          ),
        ];

      const effectiveIds =
        [
          ...new Set([
            ...permanentIds,
            ...infusionIds,
          ]),
        ];


      /*
       * ------------------------------------------------------
       * Temporary structural lifecycle ? Scope
       * ------------------------------------------------------
       *
       * Permanent Scope owns:
       *   state.structural.scope
       *
       * Temporary infusion Scope owns:
       *   state.structural.infusionScope
       *
       * Keeping distinct ownership prevents a temporary
       * infusion from corrupting permanent craft state.
       */

      const next =
        clone(
          current.state
        );

      const structuralUpdate =
        {};

      const permanentScope =
        permanentIds.includes(
          "motherboard.scope"
        );

      const infusionScope =
        infusionIds.includes(
          "motherboard.scope"
        );

      const temporaryScopeState =
        next.structural
          ?.infusionScope ??
        null;


      /*
       * Permanent + temporary Scope on the same weapon should
       * already be prevented by runtime eligibility.
       *
       * Refuse to guess if corrupted/legacy state contains both.
       */
      if (
        permanentScope &&
        temporaryScopeState
      ) {
        throw new Error(
          "Invalid Scope state: permanent and temporary structural ownership overlap."
        );
      }


      /*
       * Apply temporary Scope once.
       */
      if (
        !permanentScope &&
        infusionScope &&
        !temporaryScopeState
      ) {
        const currentRange =
          weapon.system
            ?.attack
            ?.range;

        if (
          !WEAPON_RANGE_STEPS.includes(
            currentRange
          )
        ) {
          throw new Error(
            `Scope cannot increase unsupported weapon range: ${
              currentRange ??
              "missing"
            }.`
          );
        }

        const appliedRange =
          nextWeaponRange(
            currentRange
          );

        next.structural ??=
          {};

        next.structural
          .infusionScope = {
            baseRange:
              currentRange,

            appliedRange,
          };

        structuralUpdate[
          "system.attack.range"
        ] =
          appliedRange;
      }


      /*
       * Remove temporary Scope.
       *
       * Restore only if the weapon still has exactly the range
       * value owned by this infusion. An external edit wins.
       */
      if (
        !infusionScope &&
        temporaryScopeState
      ) {
        const currentRange =
          weapon.system
            ?.attack
            ?.range;

        if (
          temporaryScopeState
            .baseRange &&
          currentRange ===
            temporaryScopeState
              .appliedRange &&
          currentRange !==
            temporaryScopeState
              .baseRange
        ) {
          structuralUpdate[
            "system.attack.range"
          ] =
            temporaryScopeState
              .baseRange;
        }

        /** P2.13f.1b ? explicit temporary Scope flag deletion */

        delete next.structural
          .infusionScope;

        /*
         * Foundry recursively merges nested flag objects.
         * Omitting infusionScope from the rewritten object is
         * therefore not sufficient to remove the persisted key.
         *
         * Explicitly delete the nested key with Foundry's
         * -= update syntax.
         */
        /*
         * P2.13f.1d ? Foundry v14 ForcedDeletion cleanup
         *
         * Nested flag deletion happens after the normal state
         * write using Foundry v14 ForcedDeletion.
         */

        if (
          Object.keys(
            next.structural
          ).length === 0
        ) {
          delete next.structural;
        }
      }


      /*
       * ------------------------------------------------------
       * Native Motherboard projection
       * ------------------------------------------------------
       */

      const preservedFeatures =
        getWeaponFeatureEntries(
          weapon
        ).filter(
          feature =>
            !String(
              feature?.value ??
              ""
            ).startsWith(
              "motherboard-"
            )
        );

      /*
       * Let Foundryborne run its native cleanup lifecycle for
       * linked effects/actions before rebuilding the projection.
       */
      await weapon.update({
        "system.weaponFeatures":
          clone(
            preservedFeatures
          ),
      });


      let rebuiltFeatures =
        clone(
          preservedFeatures
        );

      for (
        const augmentId
        of effectiveIds
      ) {
        rebuiltFeatures =
          addNativeWeaponFeature(
            rebuiltFeatures,
            augmentId
          );
      }


      /*
       * Persist permanent state plus temporary structural
       * ownership together with the rebuilt native projection.
       */
      let result =
        await writeStateAndNativeFeatures(
          weapon,
          next,
          rebuiltFeatures,
          structuralUpdate
        );


      /*
       * P2.13f.1c ? two-phase temporary Scope flag cleanup
       *
       * Foundry recursively merges the parent weaponAugments flag.
       * A nested -= deletion sent in the same update as the parent
       * write can therefore be recreated by that parent write.
       *
       * Perform temporary Scope cleanup only after the normal
       * state/native projection has completed.
       */
      if (
        !infusionScope &&
        temporaryScopeState
      ) {
        await weapon.update({
          flags: {
            [MODULE_ID]: {
              [FLAG_KEY]: {
                structural: {
                  infusionScope:
                    new foundry.data.operators
                      .ForcedDeletion(),
                },
              },
            },
          },
        });

        const afterNestedDelete =
          getWeaponAugmentState(
            weapon
          );

        const remainingStructural =
          afterNestedDelete
            .state
            .structural ??
          null;

        if (
          remainingStructural &&
          Object.keys(
            remainingStructural
          ).length === 0
        ) {
          await weapon.update({
            flags: {
              [MODULE_ID]: {
                [FLAG_KEY]: {
                  structural:
                    new foundry.data.operators
                      .ForcedDeletion(),
                },
              },
            },
          });
        }

        result = {
          ...getWeaponAugmentState(
            weapon
          ),

          nativeWeaponFeatures:
            getWeaponFeatureEntries(
              weapon
            ),
        };
      }


      return {
        ...result,

        permanentIds,
        infusionIds,
        effectiveIds,

        permanentCount:
          permanentIds.length,

        infusionCount:
          infusionIds.length,

        effectiveCount:
          effectiveIds.length,

        infusionEntries,

        temporaryStructural: {
          scope:
            next.structural
              ?.infusionScope ??
            null,
        },
      };
    },

    async uninstall(weapon, augmentId) {
      assertOwnedWeapon(weapon);

      const current = getWeaponAugmentState(weapon);
      if (!current.initialized) {
        throw new Error("Weapon Augment state must be initialized first.");
      }

      assertNonEmptyId(augmentId);

      if (!current.state.installed.includes(augmentId)) {
        throw new Error(`Augment is not installed: ${augmentId}.`);
      }

      const next = clone(current.state);
      next.installed = next.installed.filter((id) => id !== augmentId);

      const nativeFeatures = removeNativeWeaponFeature(
        getWeaponFeatureEntries(weapon),
        augmentId,
      );

      const extraUpdate = {};
      removeStructuralAugmentUpdate(weapon, augmentId, next, extraUpdate);

      return writeStateAndNativeFeatures(
        weapon,
        next,
        nativeFeatures,
        extraUpdate,
      );
    },
  };
}
