const MODULE_ID = "daggerheart-campaign-toolkit";
const SETTING_KEY = "researchKnowledge";
const VERSION = 3;

const clone = value => structuredClone(value);

export function emptyResearchKnowledge() {
  return {
    schemaVersion: VERSION,
    revision: 0,
    revelations: []
  };
}

function nonEmptyString(value) {
  return typeof value === "string" &&
    value.trim().length > 0;
}

function assertGm() {
  if (!game.user?.isGM) {
    throw new Error(
      "Research knowledge mutation requires GM"
    );
  }
}

function assertRegistered() {
  if (!game.settings?.settings?.has?.(
    `${MODULE_ID}.${SETTING_KEY}`
  )) {
    throw new Error(
      "Research knowledge setting unavailable"
    );
  }
}

function normalizeStrings(values, label) {
  if (
    !Array.isArray(values) ||
    !values.every(nonEmptyString)
  ) {
    throw new Error(`Invalid ${label}`);
  }

  const clean = [...new Set(values)];

  if (clean.length !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }

  return clean;
}

function normalizeRevelation(entry) {
  if (
    !entry ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    !nonEmptyString(entry.id) ||
    !nonEmptyString(entry.researchId) ||
    !nonEmptyString(entry.title)
  ) {
    throw new Error("Invalid research revelation");
  }

  const status = entry.status;

  if (!["discovered", "shared"].includes(status)) {
    throw new Error("Invalid research status");
  }

  if (
    entry.archived !== undefined &&
    typeof entry.archived !== "boolean"
  ) {
    throw new Error("Invalid research archive flag");
  }

  const discoveredBy = normalizeStrings(
    entry.discoveredBy ?? [],
    "discoveredBy"
  );

  const sharedWith = normalizeStrings(
    entry.sharedWith ?? [],
    "sharedWith"
  );

  if (
    status === "discovered" &&
    (
      discoveredBy.length === 0 ||
      sharedWith.length !== 0
    )
  ) {
    throw new Error(
      "Discovered knowledge requires holders and no sharing"
    );
  }

  if (
    status === "shared" &&
    (
      sharedWith.length !== 1 ||
      sharedWith[0] !== "party"
    )
  ) {
    throw new Error(
      "Shared knowledge requires party recipient"
    );
  }

  const grantedTags = normalizeStrings(
    entry.grantedTags ?? [],
    "grantedTags"
  );

  if (!Array.isArray(entry.unlocks ?? [])) {
    throw new Error("Invalid research unlocks");
  }

  const unlocks = (entry.unlocks ?? []).map(item => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !nonEmptyString(item.type) ||
      !nonEmptyString(item.ref)
    ) {
      throw new Error("Invalid research unlock");
    }

    return {
      type: item.type,
      ref: item.ref
    };
  });

  const exportConfig = entry.export ?? {
    enabled: false,
    target: "none"
  };

  if (
    !exportConfig ||
    typeof exportConfig !== "object" ||
    typeof exportConfig.enabled !== "boolean" ||
    !["none", "campaignrepo"].includes(
      exportConfig.target
    )
  ) {
    throw new Error("Invalid research export config");
  }

  // Liste blanche : aucun champ MJ supplementaire.
  return {
    id: entry.id,
    researchId: entry.researchId,
    title: entry.title,
    status,
    discoveredBy,
    sharedWith,
    archived: entry.archived === true,
    grantedTags,
    unlocks,
    export: {
      enabled: exportConfig.enabled,
      target: exportConfig.target
    }
  };
}

function normalize(raw) {
  if (raw == null) {
    return emptyResearchKnowledge();
  }

  if (
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    throw new Error("Invalid research registry");
  }

  if (raw.schemaVersion === 1) {
    const empty =
      raw.revision === 0 &&
      Object.keys(raw.topics ?? {}).length === 0 &&
      Object.keys(raw.revelations ?? {}).length === 0 &&
      Array.isArray(raw.history) &&
      raw.history.length === 0;

    if (!empty) {
      throw new Error(
        "Legacy research registry is not empty; manual review required"
      );
    }

    return emptyResearchKnowledge();
  }

  if (
    ![2, VERSION].includes(raw.schemaVersion) ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 0 ||
    !Array.isArray(raw.revelations) ||
    Object.keys(raw).some(
      key => ![
        "schemaVersion",
        "revision",
        "revelations"
      ].includes(key)
    )
  ) {
    throw new Error("Invalid research registry");
  }

  const revelations =
    raw.revelations.map(entry => {
      if (raw.schemaVersion === 2) {
        // Migration des anciennes revelations publiques.
        if (
          entry?.status !== "revealed" ||
          entry?.visibility !== "party"
        ) {
          throw new Error(
            "Cannot migrate non-public V2 revelation"
          );
        }

        return normalizeRevelation({
          ...entry,
          status: "shared",
          discoveredBy: [],
          sharedWith: ["party"]
        });
      }

      return normalizeRevelation(entry);
    });

  const ids = revelations.map(entry => entry.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate research revelation IDs");
  }

  return {
    schemaVersion: VERSION,
    revision: raw.revision,
    revelations
  };
}

export function registerResearchKnowledgeSetting() {
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
      name: "Connaissances acquises du groupe",
      hint: "Connaissances narratives publiques et leurs detenteurs.",
      scope: "world",
      config: false,
      type: Object,
      default: emptyResearchKnowledge(),
      restricted: true
    }
  );
}

export function readResearchKnowledge() {
  assertRegistered();

  return normalize(
    game.settings.get(MODULE_ID, SETTING_KEY)
  );
}

export function projectPartyKnowledge(state) {
  return clone(normalize(state));
}

export async function revealResearchKnowledge({
  revelation,
  visibility = "party",
  status = "shared",
  discoveredBy = []
} = {}) {
  assertGm();
  assertRegistered();

  if (visibility !== "party") {
    throw new Error(
      "Private revelations cannot be stored here"
    );
  }

  const entry = normalizeRevelation({
    ...revelation,
    status,
    discoveredBy:
      status === "discovered"
        ? discoveredBy
        : [],
    sharedWith:
      status === "shared"
        ? ["party"]
        : []
  });

  const state = readResearchKnowledge();

  if (
    state.revelations.some(
      item => item.id === entry.id
    )
  ) {
    throw new Error(
      "Revelation already registered: " + entry.id
    );
  }

  state.revelations.push(entry);
  state.revision += 1;

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    state
  );

  return clone(entry);
}

export async function shareResearchKnowledge(id) {
  assertGm();
  assertRegistered();

  if (!nonEmptyString(id)) {
    throw new Error("Research revelation ID required");
  }

  const state = readResearchKnowledge();

  const entry = state.revelations.find(
    item => item.id === id
  );

  if (!entry) {
    throw new Error(
      "Research revelation not found: " + id
    );
  }

  if (entry.status === "shared") {
    return {
      changed: false,
      revelation: clone(entry)
    };
  }

  entry.status = "shared";
  entry.sharedWith = ["party"];
  state.revision += 1;

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    state
  );

  return {
    changed: true,
    revelation: clone(entry)
  };
}
export async function archiveResearchKnowledge(
  id,
  archived = true
) {
  assertGm();
  assertRegistered();

  if (!nonEmptyString(id)) {
    throw new Error("Research revelation ID required");
  }

  if (typeof archived !== "boolean") {
    throw new Error("Invalid research archive flag");
  }

  const state = readResearchKnowledge();
  const entry = state.revelations.find(
    item => item.id === id
  );

  if (!entry) {
    throw new Error(
      "Research revelation not found: " + id
    );
  }

  if (entry.archived === archived) {
    return {
      changed: false,
      revelation: clone(entry)
    };
  }

  entry.archived = archived;
  state.revision += 1;

  await game.settings.set(
    MODULE_ID,
    SETTING_KEY,
    state
  );

  return {
    changed: true,
    revelation: clone(entry)
  };
}