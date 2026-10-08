const MODULE_ID =
  "daggerheart-campaign-toolkit";

const SETTING_KEY =
  "fobActivityLedger";

const SCHEMA_VERSION = 2;

function clone(value) {
  return value == null
    ? value
    : structuredClone(value);
}

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    claims: [],
  };
}

function normalizeClaim(claim) {
  return {
    turn:
      Number.isSafeInteger(
        Number(claim?.turn)
      ) &&
      Number(claim?.turn) >= 0
        ? Number(claim.turn)
        : -1,

    actorUuid:
      String(
        claim?.actorUuid ?? ""
      ).trim(),

    activityType:
      String(
        claim?.activityType ?? ""
      ).trim(),

    activityId:
      String(
        claim?.activityId ?? ""
      ).trim(),

        claimedAt:
      Number(claim?.claimedAt) || 0,

    executionStatus:
      ["claimed", "completed", "blocked"].includes(
        claim?.executionStatus
      )
        ? claim.executionStatus
        : "claimed",

    resolutionReason:
      String(claim?.resolutionReason ?? "").trim(),

    resolvedAt:
      Number.isFinite(Number(claim?.resolvedAt)) &&
      Number(claim?.resolvedAt) > 0
        ? Number(claim.resolvedAt)
        : 0,
  };
}

function normalizeState(raw) {
  const source =
    raw &&
    typeof raw === "object"
      ? raw
      : emptyState();

  const claims =
    Array.isArray(source.claims)
      ? source.claims
          .map(normalizeClaim)
          .filter(
            claim =>
              claim.turn >= 0 &&
              claim.actorUuid &&
              claim.activityType &&
              claim.activityId
          )
      : [];

  return {
    schemaVersion: SCHEMA_VERSION,

    revision:
      Number.isSafeInteger(
        Number(source.revision)
      ) &&
      Number(source.revision) >= 0
        ? Number(source.revision)
        : 0,

    claims,
  };
}

function assertRegistered() {
  if (
    !game.settings.settings.has(
      `${MODULE_ID}.${SETTING_KEY}`
    )
  ) {
    throw new Error(
      "FOB activity ledger setting is not registered."
    );
  }
}

function assertGm() {
  if (!game.user?.isGM) {
    throw new Error(
      "FOB activity ledger mutation is GM-only."
    );
  }
}

function readState() {
  assertRegistered();

  return normalizeState(
    game.settings.get(
      MODULE_ID,
      SETTING_KEY
    )
  );
}

async function writeState(state) {
  assertGm();

  const normalized =
    normalizeState(state);

  normalized.revision += 1;

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    normalized
  );

  return normalized;
}

export function registerFobActivityLedgerSetting() {
  if (
    game.settings.settings.has(
      `${MODULE_ID}.${SETTING_KEY}`
    )
  ) {
    return;
  }

  game.settings.register(
    MODULE_ID,
    SETTING_KEY,
    {
      name:
        "ActivitÃ©s productives FOB",

      hint:
        "Garantit qu'un personnage ne progresse qu'une activitÃ© productive par tour de FOB.",

      scope: "world",
      config: false,
      type: Object,
      default: emptyState(),
    }
  );
}

export function createFobActivityLedgerApi() {
  function status({
    turn = null,
    actorUuid = null,
  } = {}) {
    const state =
      readState();

    let claims =
      state.claims;

    if (turn != null) {
      const resolvedTurn =
        Number(turn);

      claims =
        claims.filter(
          claim =>
            claim.turn ===
            resolvedTurn
        );
    }

    if (actorUuid != null) {
      const resolvedActorUuid =
        String(
          actorUuid ?? ""
        ).trim();

      claims =
        claims.filter(
          claim =>
            claim.actorUuid ===
            resolvedActorUuid
        );
    }

    return {
      green: true,
      schemaVersion:
        state.schemaVersion,
      revision:
        state.revision,
      claims:
        clone(claims),
      count:
        claims.length,
    };
  }

  function claimFor({
    actorUuid,
    turn,
    activityType = null,
    activityId = null,
  } = {}) {
    actorUuid =
      String(
        actorUuid ?? ""
      ).trim();

    turn =
      Number(turn);

    activityType =
      activityType == null
        ? null
        : String(
            activityType
          ).trim();

    activityId =
      activityId == null
        ? null
        : String(
            activityId
          ).trim();

    if (
      !actorUuid ||
      !Number.isSafeInteger(turn) ||
      turn < 0
    ) {
      return null;
    }

    const state =
      readState();

    return clone(
      state.claims.find(
        claim =>
          claim.actorUuid ===
            actorUuid &&
          claim.turn ===
            turn &&
          (
            activityType == null ||
            claim.activityType ===
              activityType
          ) &&
          (
            activityId == null ||
            claim.activityId ===
              activityId
          )
      ) ?? null
    );
  }

  function canClaim({
    actor,
    actorUuid = null,
    turn,
  } = {}) {
    const resolvedActorUuid =
      String(
        actor?.uuid ??
        actorUuid ??
        ""
      ).trim();

    turn =
      Number(turn);

    if (!resolvedActorUuid) {
      return {
        green: false,
        reason:
          "fob-activity-actor-required",
      };
    }

    if (
      !Number.isSafeInteger(turn) ||
      turn < 0
    ) {
      return {
        green: false,
        reason:
          "fob-activity-turn-invalid",
        turn,
      };
    }

    const existing =
      claimFor({
        actorUuid:
          resolvedActorUuid,
        turn,
      });

    return {
      green: true,
      allowed:
        !existing,
      actorUuid:
        resolvedActorUuid,
      turn,
      existing,
    };
  }

  async function claim({
    actor,
    actorUuid = null,
    turn,
    activityType,
    activityId,
  } = {}) {
    assertGm();

    const resolvedActorUuid =
      String(
        actor?.uuid ??
        actorUuid ??
        ""
      ).trim();

    turn =
      Number(turn);

    activityType =
      String(
        activityType ?? ""
      ).trim();

    activityId =
      String(
        activityId ?? ""
      ).trim();

    if (!resolvedActorUuid) {
      return {
        green: false,
        reason:
          "fob-activity-actor-required",
      };
    }

    if (
      !Number.isSafeInteger(turn) ||
      turn < 0
    ) {
      return {
        green: false,
        reason:
          "fob-activity-turn-invalid",
        turn,
      };
    }

    if (!activityType) {
      return {
        green: false,
        reason:
          "fob-activity-type-required",
      };
    }

    if (!activityId) {
      return {
        green: false,
        reason:
          "fob-activity-id-required",
      };
    }

    const state =
      readState();

    const existing =
      state.claims.find(
        entry =>
          entry.actorUuid ===
            resolvedActorUuid &&
          entry.turn ===
            turn &&
          (
            activityType ===
              "research"
              ? (
                  entry.activityType ===
                    "research" &&
                  entry.activityId ===
                    activityId
                )
              : entry.activityType !==
                  "research"
          )
      );

    if (existing) {
      const sameActivity =
        existing.activityType ===
          activityType &&
        existing.activityId ===
          activityId;

      if (sameActivity) {
        return {
          green: true,
          changed: false,
          reused: true,
          claim:
            clone(existing),
        };
      }

      return {
        green: false,
        changed: false,
        reason:
          "fob-activity-already-claimed",
        existing:
          clone(existing),
      };
    }

    const activityClaim = {
      turn,
      actorUuid:
        resolvedActorUuid,
      activityType,
      activityId,
      claimedAt:
        Date.now(),

      executionStatus: "claimed",
      resolutionReason: "",
      resolvedAt: 0,
    };

    state.claims.push(
      activityClaim
    );

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      reused: false,
      claim:
        clone(activityClaim),
      revision:
        saved.revision,
    };
  }

  async function recordResolution({
    actorUuid,
    turn,
    activityType,
    activityId,
    executionStatus,
    resolutionReason = "",
  } = {}) {
    assertGm();

    actorUuid = String(actorUuid ?? "").trim();
    turn = Number(turn);
    activityType = String(activityType ?? "").trim();
    activityId = String(activityId ?? "").trim();

    if (
      !actorUuid ||
      !Number.isSafeInteger(turn) ||
      turn < 0 ||
      !activityType ||
      !activityId
    ) {
      return {
        green: false,
        reason: "fob-resolution-invalid-identity",
      };
    }

    if (
      !["completed", "blocked"].includes(executionStatus)
    ) {
      return {
        green: false,
        reason: "fob-resolution-invalid-status",
      };
    }

    const state = readState();

    const claim = state.claims.find(
      entry =>
        entry.actorUuid === actorUuid &&
        entry.turn === turn &&
        entry.activityType === activityType &&
        entry.activityId === activityId
    );

    if (!claim) {
      return {
        green: false,
        reason: "fob-resolution-claim-not-found",
      };
    }

    if (
      claim.executionStatus === "completed" &&
      executionStatus !== "completed"
    ) {
      return {
        green: false,
        reason: "fob-resolution-already-completed",
        claim: clone(claim),
      };
    }

    const reason =
      executionStatus === "blocked"
        ? String(resolutionReason ?? "").trim()
        : "";

    if (
      claim.executionStatus === executionStatus &&
      claim.resolutionReason === reason
    ) {
      return {
        green: true,
        changed: false,
        claim: clone(claim),
      };
    }

    claim.executionStatus = executionStatus;
    claim.resolutionReason = reason;
    claim.resolvedAt = Date.now();

    const saved = await writeState(state);

    return {
      green: true,
      changed: true,
      claim: clone(claim),
      revision: saved.revision,
    };
  }

  async function clearTurn(turn) {
    assertGm();

    turn =
      Number(turn);

    if (
      !Number.isSafeInteger(turn) ||
      turn < 0
    ) {
      return {
        green: false,
        reason:
          "fob-activity-turn-invalid",
        turn,
      };
    }

    const state =
      readState();

    const before =
      state.claims.length;

    state.claims =
      state.claims.filter(
        claim =>
          claim.turn !== turn
      );

    if (
      state.claims.length === before
    ) {
      return {
        green: true,
        changed: false,
        turn,
        removed: 0,
      };
    }

    const removed =
      before -
      state.claims.length;

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      turn,
      removed,
      revision:
        saved.revision,
    };
  }

  async function clear() {
    assertGm();

    const state =
      readState();

    if (
      state.claims.length === 0
    ) {
      return {
        green: true,
        changed: false,
        removed: 0,
      };
    }

    const removed =
      state.claims.length;

    state.claims = [];

    const saved =
      await writeState(state);

    return {
      green: true,
      changed: true,
      removed,
      revision:
        saved.revision,
    };
  }

  return Object.freeze({
    status,
        claimFor,
    canClaim,
    claim,
    recordResolution,
    clearTurn,
    clear,
  });
}
