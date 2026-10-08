const MODULE_ID =
  "daggerheart-campaign-toolkit";

const RUNTIME_KEY =
  "__dhctFobActivityDispatcher";

function runtime() {
  if (!globalThis[RUNTIME_KEY]) {
    globalThis[RUNTIME_KEY] = {
      installed: false,
      chain:
        Promise.resolve(),
      lastResult: null,
    };
  }

  return globalThis[RUNTIME_KEY];
}

function clone(value) {
  return value == null
    ? value
    : structuredClone(value);
}

function queuedAt(entry) {
  const value =
    Number(entry?.queuedAt);

  return Number.isFinite(value)
    ? value
    : 0;
}

function compareCandidates(a, b) {
  const time =
    queuedAt(a.entry) -
    queuedAt(b.entry);

  if (time !== 0) {
    return time;
  }

  const type =
    String(a.type)
      .localeCompare(
        String(b.type)
      );

  if (type !== 0) {
    return type;
  }

  return String(a.entry?.id ?? "")
    .localeCompare(
      String(b.entry?.id ?? "")
    );
}

function candidatesByActor({
  researchQueue,
  craftQueue,
} = {}) {
  const grouped =
    new Map();

  function add(type, entry) {
    if (
      !entry?.id ||
      !entry?.actorUuid
    ) {
      return;
    }

    if (
      !grouped.has(
        entry.actorUuid
      )
    ) {
      grouped.set(
        entry.actorUuid,
        []
      );
    }

    grouped
      .get(entry.actorUuid)
      .push({
        type,
        entry,
      });
  }

  for (
    const entry of
      researchQueue ?? []
  ) {
    add(
      "research",
      entry
    );
  }

  for (
    const entry of
      craftQueue ?? []
  ) {

    add(
      "craft",
      entry
    );
  }

  const selected = [];

  for (
    const [actorUuid, entries]
    of grouped
  ) {
    entries.sort(
      compareCandidates
    );

    selected.push({
      actorUuid,
      ...entries[0],
    });
  }

  return selected.sort(
    (a, b) =>
      String(a.actorUuid)
        .localeCompare(
          String(b.actorUuid)
        )
  );
}

async function resolveResearch({
  api,
  entry,
  turn,
} = {}) {
  const queue =
    api.craftingResearchQueue;

  const knowledge =
    api.craftingKnowledge;

  const progress =
    entry.progress >=
      entry.turnsRequired
      ? {
          green: true,
          changed: false,
          completed: true,
          entry:
            clone(entry),
        }
      : await queue.progress(
          entry.id
        );

  if (!progress?.green) {
    return progress;
  }

  if (!progress.completed) {
    return {
      green: true,
      type: "research",
      changed:
        progress.changed === true,
      completed: false,
      entry:
        progress.entry,
    };
  }

  const completedEntry =
    progress.entry;

  const actor =
    await fromUuid(
      completedEntry.actorUuid
    );

  if (
    !actor ||
    actor.documentName !==
      "Actor"
  ) {
    return {
      green: false,
      reason:
        "research-actor-not-found",
      entry:
        completedEntry,
    };
  }

  const currentStatus =
    knowledge.propertyStatus(
      actor,
      completedEntry.materialId,
      completedEntry.propertyId
    );

  let discovery = null;

  if (
    currentStatus !==
      "discovered" &&
    currentStatus !==
      "shared"
  ) {
    discovery =
      await knowledge
        .setPropertyStatus({
          actor,

          materialId:
            completedEntry.materialId,

          propertyId:
            completedEntry.propertyId,

          status:
            "discovered",

          source: {
            type:
              "fob-research",

            queueEntryId:
              completedEntry.id,

            fobTurn:
              turn,
          },
        });

    if (!discovery?.green) {
      return {
        green: false,
        reason:
          discovery?.reason ??
          "research-discovery-failed",
        entry:
          completedEntry,
      };
    }
  }

  const removal =
    await queue.remove(
      completedEntry.id
    );

  if (!removal?.green) {
    return {
      green: false,
      reason:
        removal?.reason ??
        "research-queue-cleanup-failed",
      entry:
        completedEntry,
      discovery,
    };
  }

  return {
    green: true,
    type: "research",
    changed: true,
    completed: true,
    entry:
      completedEntry,
    discovery,
    removal,
  };
}

async function resolveCraft({
  api,
  entry,
} = {}) {
  let currentEntry =
    clone(entry);

  if (
    Number(currentEntry.progress) <
    Number(currentEntry.turnsRequired)
  ) {
    const progress =
      await api.craftingCraftQueue
        .progress(
          currentEntry.id
        );

    if (!progress?.green) {
      return progress;
    }

    currentEntry =
      progress.entry;

    if (!progress.completed) {
      return {
        green: true,
        type: "craft",
        changed:
          progress.changed === true,
        completed: false,
        ready: false,
        entry:
          currentEntry,
      };
    }
  }

  const actor =
    await fromUuid(
      currentEntry.actorUuid
    );

  if (
    !actor ||
    actor.documentName !==
      "Actor"
  ) {
    return {
      green: false,
      type: "craft",
      reason:
        "craft-actor-not-found",
      entry:
        currentEntry,
    };
  }

  const weapon =
    await fromUuid(
      currentEntry.weaponUuid
    );

  if (
    !weapon ||
    weapon.documentName !==
      "Item"
  ) {
    return {
      green: false,
      type: "craft",
      reason:
        "craft-weapon-not-found",
      entry:
        currentEntry,
    };
  }

  const craft =
    await api.crafting
      .craftWeaponAugment({
        crafter:
          actor,

        weapon,

        augmentId:
          currentEntry.augmentId,

        expeditionId:
          currentEntry.expeditionId,
      });

  /*
   * A failed revalidation does not destroy the
   * completed queue entry. It remains ready and may
   * be retried on a future FOB turn.
   */
  if (!craft?.green) {
    return {
      green: true,
      type: "craft",
      changed: false,
      completed: true,
      ready: true,
      blocked: true,
      reason:
        craft?.reason ??
        "craft-resolution-blocked",
      entry:
        currentEntry,
      craft,
    };
  }

  const removal =
    await api.craftingCraftQueue
      .remove(
        currentEntry.id
      );

  if (!removal?.green) {
    return {
      green: false,
      type: "craft",
      reason:
        removal?.reason ??
        "craft-queue-cleanup-failed",
      completed: true,
      entry:
        currentEntry,
      craft,
    };
  }

  return {
    green: true,
    type: "craft",
    changed: true,
    completed: true,
    ready: false,
    resolved: true,
    entry:
      currentEntry,
    craft,
    removal,
  };
}

async function dispatchTurn(
  event = {}
) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason:
        "not-authority",
    };
  }

  const turn =
    Number(event?.turn);

  if (
    !Number.isSafeInteger(turn) ||
    turn < 0
  ) {
    return {
      green: false,
      reason:
        "fob-turn-invalid",
      turn,
    };
  }

  const api =
    game.modules
      .get(MODULE_ID)
      ?.api ?? null;

  if (
    !api?.fobActivity?.claim ||
    !api?.fobActivity?.claimFor ||
    !api?.fobActivity?.recordResolution ||
    !api?.craftingResearchQueue
      ?.status ||
    !api?.craftingResearchQueue
      ?.progress ||
    !api?.craftingResearchQueue
      ?.remove ||
    !api?.craftingCraftQueue
      ?.status ||
    !api?.craftingCraftQueue
      ?.progress ||
    !api?.craftingKnowledge
      ?.propertyStatus ||
    !api?.craftingKnowledge
      ?.setPropertyStatus
  ) {
    return {
      green: false,
      reason:
        "fob-activity-dispatcher-api-unavailable",
    };
  }

  const research =
    api.craftingResearchQueue
      .status();

  const craft =
    api.craftingCraftQueue
      .status();

  const selectedCraft =
    candidatesByActor({
      researchQueue: [],
      craftQueue:
        craft.queue,
    });

  const selectedResearch =
    (research.queue ?? [])
      .map(
        entry => ({
          type: "research",
          actorUuid:
            entry.actorUuid,
          entry,
        })
      );

  const selected = [
    ...selectedResearch,
    ...selectedCraft,
  ];

  const results = [];

  for (
    const candidate of selected
  ) {
    const existing =
      api.fobActivity.claimFor({
        actorUuid:
          candidate.actorUuid,
        turn,
        activityType:
          candidate.type,
        activityId:
          candidate.entry.id,
      });

    /*
     * Replaying the same FOB event must never
     * advance an activity twice.
     */
    if (existing) {
      results.push({
        green: true,
        changed: false,
        skipped: true,
        reason:
          "fob-turn-already-claimed",
        actorUuid:
          candidate.actorUuid,
        existing,
      });

      continue;
    }

    const claim =
      await api.fobActivity
        .claim({
          actorUuid:
            candidate.actorUuid,

          turn,

          activityType:
            candidate.type,

          activityId:
            candidate.entry.id,
        });

    if (!claim?.green) {
      results.push({
        ...claim,
        actorUuid:
          candidate.actorUuid,
      });

      continue;
    }

    // Une revendication reutilisee n'autorise jamais un rejeu.
    if (claim.reused === true) {
      results.push({
        green: true,
        changed: false,
        skipped: true,
        reason: "fob-turn-already-claimed",
        actorUuid: candidate.actorUuid,
        existing: claim.claim,
      });
      continue;
    }

    let result;

    try {
      result = candidate.type === "research"
        ? await resolveResearch({
            api,
            entry: candidate.entry,
            turn,
          })
        : await resolveCraft({
            api,
            entry: candidate.entry,
          });
    } catch (error) {
      result = {
        green: false,
        changed: false,
        reason: "fob-activity-resolution-exception",
        errorMessage: String(error?.message ?? error),
      };
    }

    const blocked =
      result?.green !== true ||
      result?.blocked === true;

    let resolution;

    try {
      resolution = await api.fobActivity.recordResolution({
        actorUuid: candidate.actorUuid,
        turn,
        activityType: candidate.type,
        activityId: candidate.entry.id,
        executionStatus: blocked ? "blocked" : "completed",
        resolutionReason: blocked
          ? String(
              result?.reason ??
              "fob-activity-resolution-failed"
            )
          : "",
      });
    } catch (error) {
      resolution = {
        green: false,
        reason: "fob-resolution-record-exception",
        errorMessage: String(error?.message ?? error),
      };
    }

    results.push({
      actorUuid: candidate.actorUuid,
      claim,
      ...result,
      resolution,
      ...(resolution?.green !== true
        ? {
            green: false,
            reason: "fob-resolution-record-failed",
            activityResult: result,
          }
        : {}),
    });
  }

  return {
    green:
      results.every(
        result =>
          result?.green !== false
      ),

    turn,

    changed:
      results.some(
        result =>
          result?.changed === true
      ),

    selectedCount:
      selected.length,

    results,
  };
}

export function installFobActivityDispatcher() {
  const state =
    runtime();

  if (state.installed) {
    return {
      green: true,
      reused: true,
    };
  }

  if (!globalThis.Hooks?.on) {
    return {
      green: false,
      reason:
        "hooks-unavailable",
    };
  }

  state.installed = true;

  Hooks.on(
    "dhctFobTurnAdvanced",
    event => {
      state.chain =
        state.chain
          .then(
            async () => {
              const result =
                await dispatchTurn(
                  event
                );

              state.lastResult =
                result;

              if (!result?.green) {
                console.warn(
                  MODULE_ID +
                    " | FOB activity dispatcher rejected",
                  result
                );
              }

              return result;
            }
          )
          .catch(
            error => {
              console.error(
                MODULE_ID +
                  " | FOB activity dispatcher failed",
                error
              );

              state.lastResult = {
                green: false,
                reason:
                  error?.message ??
                  "fob-activity-dispatcher-failed",
              };
            }
          );
    }
  );

  return {
    green: true,
    reused: false,
  };
}

export function fobActivityDispatcherStatus() {
  const state =
    runtime();

  return {
    green: true,

    installed:
      state.installed === true,

    lastResult:
      state.lastResult == null
        ? null
        : clone(
            state.lastResult
          ),
  };
}

export const fobActivityDispatcherApi =
  Object.freeze({
    install:
      installFobActivityDispatcher,

    status:
      fobActivityDispatcherStatus,

    dispatchTurn,
  });
