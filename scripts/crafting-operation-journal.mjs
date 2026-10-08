const MODULE = "daggerheart-campaign-toolkit";
const KEY = "craftingOperationJournal";

const clone = value => structuredClone(value);

export function registerCraftingOperationJournal() {
  const id = `${MODULE}.${KEY}`;
  if (game.settings.settings.has(id)) return;

  game.settings.register(MODULE, KEY, {
    name: "Journal des fabrications",
    scope: "world",
    config: false,
    type: Object,
    default: { schemaVersion: 1, operations: {} },
  });
}

export function createCraftingOperationJournalApi() {
  const requireGM = () => {
    if (!game.user?.isGM) {
      throw new Error("Craft journal mutation is GM-only.");
    }
  };

  const read = () => clone(
    game.settings.get(MODULE, KEY) ??
    { schemaVersion: 1, operations: {} }
  );

  function get(operationId) {
    return clone(
      read().operations[String(operationId)] ?? null
    );
  }

  async function begin({
    operationId,
    expeditionId,
    weaponUuid,
    augmentId,
  } = {}) {
    requireGM();

    if (![operationId, expeditionId, weaponUuid, augmentId]
      .every(value => typeof value === "string" && value.trim())) {
      return { green: false, reason: "craft-journal-invalid-identity" };
    }

    const state = read();

    // Une opération existante ne doit jamais être relancée.
    const existing = state.operations[operationId];
    if (existing) {
      return {
        green: false,
        reason: "craft-journal-already-started",
        operation: clone(existing),
      };
    }

    const operation = {
      operationId,
      expeditionId,
      weaponUuid,
      augmentId,
      phase: "prepared",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    state.operations[operationId] = operation;
    await game.settings.set(MODULE, KEY, state);

    return { green: true, changed: true, operation: clone(operation) };
  }

  async function mark(operationId, phase) {
    requireGM();

    const phases = [
      "prepared",
      "materials-saved",
      "weapon-applied",
      "completed",
      "requires-review",
    ];

    if (!phases.includes(phase) || phase === "prepared") {
      return { green: false, reason: "craft-journal-invalid-phase" };
    }

    const state = read();
    const operation = state.operations[operationId];

    if (!operation) {
      return { green: false, reason: "craft-journal-not-found" };
    }

    const transitions = {
      prepared: ["materials-saved", "requires-review"],
      "materials-saved": ["weapon-applied", "requires-review"],
      "weapon-applied": ["completed", "requires-review"],
      completed: [],
      "requires-review": [],
    };

    if (operation.phase === phase) {
      return { green: true, changed: false, operation: clone(operation) };
    }

    if (!transitions[operation.phase]?.includes(phase)) {
      return { green: false, reason: "craft-journal-invalid-transition" };
    }

    operation.phase = phase;
    operation.updatedAt = Date.now();

    await game.settings.set(MODULE, KEY, state);

    return { green: true, changed: true, operation: clone(operation) };
  }

  function status() {
    return { green: true, ...read() };
  }

  return Object.freeze({ get, begin, mark, status });
}