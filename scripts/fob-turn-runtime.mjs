const MODULE_ID = "daggerheart-campaign-toolkit";
const SETTING_KEY = "fobTurnState";

export const FOB_TURN_ADVANCED_HOOK =
  "dhctFobTurnAdvanced";

export const FOB_TURN_CORRECTED_HOOK =
  "dhctFobTurnCorrected";

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  turn: 0,
});

function normalizeState(value) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};

  const turn =
    Number.isSafeInteger(source.turn) &&
    source.turn >= 0
      ? source.turn
      : 0;

  return {
    schemaVersion: 1,
    turn,
  };
}

function cloneState(state) {
  return {
    schemaVersion: state.schemaVersion,
    turn: state.turn,
  };
}

function readState() {
  return normalizeState(
    game.settings.get(
      MODULE_ID,
      SETTING_KEY
    )
  );
}

export function registerFobTurnSetting() {
  game.settings.register(
    MODULE_ID,
    SETTING_KEY,
    {
      name: "FOB Turn State",
      scope: "world",
      config: false,
      type: Object,
      default: {
        schemaVersion: 1,
        turn: 0,
      },
    }
  );
}

export function fobTurnStatus() {
  return {
    green: true,
    ...cloneState(readState()),
  };
}

async function advanceFobTurnCore() {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "gm-required",
    };
  }

  const previous = readState();

  if (
    previous.turn >=
    Number.MAX_SAFE_INTEGER
  ) {
    return {
      green: false,
      reason: "turn-overflow",
    };
  }

  const next = {
    schemaVersion: 1,
    turn: previous.turn + 1,
  };

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    next
  );

  const result = {
    green: true,
    previousTurn: previous.turn,
    turn: next.turn,
  };

  Hooks.callAll(
    FOB_TURN_ADVANCED_HOOK,
    {
      ...result,
      state: cloneState(next),
      sourceUserId:
        game.user?.id ?? null,
    }
  );

  return result;
}

async function correctFobTurnCore(targetTurn) {
  if (!game.user?.isGM) {
    return {
      green: false,
      reason: "gm-required",
    };
  }

  const target =
    Number(targetTurn);

  if (
    !Number.isSafeInteger(target) ||
    target < 0
  ) {
    return {
      green: false,
      reason: "invalid-turn",
    };
  }

  const previous =
    readState();

  if (target === previous.turn) {
    return {
      green: true,
      changed: false,
      previousTurn: previous.turn,
      turn: previous.turn,
    };
  }

  const next = {
    schemaVersion: 1,
    turn: target,
  };

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    next
  );

  const result = {
    green: true,
    changed: true,
    previousTurn: previous.turn,
    turn: next.turn,
  };

  Hooks.callAll(
    FOB_TURN_CORRECTED_HOOK,
    {
      ...result,
      state: cloneState(next),
      sourceUserId:
        game.user?.id ?? null,
    }
  );

  return result;
}

let operationQueue =
  Promise.resolve();

function queueOperation(operation) {
  const result =
    operationQueue.then(operation);

  operationQueue =
    result.catch(() => undefined);

  return result;
}

export function advanceFobTurn() {
  return queueOperation(
    () => advanceFobTurnCore()
  );
}

export function correctFobTurn(targetTurn) {
  return queueOperation(
    () => correctFobTurnCore(targetTurn)
  );
}

export function setFobTurn(targetTurn) {
  return queueOperation(
    async () => {
      if (!game.user?.isGM) {
        return {
          green: false,
          reason: "gm-required",
        };
      }

      const target =
        Number(targetTurn);

      if (
        !Number.isSafeInteger(target) ||
        target < 0
      ) {
        return {
          green: false,
          reason: "invalid-turn",
        };
      }

      const current =
        readState().turn;

      // Retour en arrière = correction,
      // aucun système aval ne doit être rembobiné.
      if (target < current) {
        return correctFobTurnCore(
          target
        );
      }

      if (target === current) {
        return {
          green: true,
          changed: false,
          previousTurn: current,
          turn: current,
          advanced: 0,
        };
      }

      const start =
        current;

      // Avance réelle :
      // chaque tour émet individuellement
      // FOB_TURN_ADVANCED.
      for (
        let turn = current;
        turn < target;
        turn += 1
      ) {
        const result =
          await advanceFobTurnCore();

        if (!result?.green) {
          return {
            ...result,
            previousTurn: start,
            turn: readState().turn,
            advanced:
              readState().turn - start,
          };
        }
      }

      return {
        green: true,
        changed: true,
        previousTurn: start,
        turn: target,
        advanced:
          target - start,
      };
    }
  );
}

export const fobTurnApi =
  Object.freeze({
    status: fobTurnStatus,

    // Vrai passage du temps.
    advanceTurn: advanceFobTurn,

    // Édition du compteur.
    // Vers l'avant => traite chaque tour.
    // Vers l'arrière => correction seulement.
    setTurn: setFobTurn,

    // Correction explicite sans automation.
    correctTurn: correctFobTurn,

    hook: FOB_TURN_ADVANCED_HOOK,
    correctedHook:
      FOB_TURN_CORRECTED_HOOK,
  });
