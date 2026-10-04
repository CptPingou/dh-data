function nonEmpty(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function positiveIntegerOrNull(value) {
  if (value == null) return null;

  const numeric = Number(value);

  if (
    !Number.isInteger(numeric) ||
    numeric < 1
  ) {
    return null;
  }

  return numeric;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter(nonEmpty)
        .map((value) =>
          value.trim()
        )
    ),
  ];
}

export function normalizeContainerStorageProfile(
  profile = {}
) {
  return {
    accepts:
      uniqueStrings(
        profile?.accepts
      ),

    stackLimit:
      positiveIntegerOrNull(
        profile?.stackLimit
      ),

    mergeStacks:
      profile?.mergeStacks !== false,
  };
}

export function resolveEntryContainerClasses(
  entry
) {
  const flags =
    entry?.itemRef?.snapshot?.flags?.[
      "daggerheart-campaign-toolkit"
    ] ?? {};

  const storage =
    flags?.storage ??
    entry?.itemRef?.storage ??
    {};

  const explicit =
    uniqueStrings(
      storage?.containerClasses
    );

  if (explicit.length) {
    return explicit;
  }

  if (
    nonEmpty(
      storage?.containerClass
    )
  ) {
    return [
      storage.containerClass.trim(),
    ];
  }

  const materialClass =
    flags?.material?.containerClass;

  if (nonEmpty(materialClass)) {
    return [
      materialClass.trim(),
    ];
  }

  return [];
}

export function containerProfileAcceptsEntry(
  profile,
  entry
) {
  const normalized =
    normalizeContainerStorageProfile(
      profile
    );

  const classes =
    resolveEntryContainerClasses(
      entry
    );

  if (
    normalized.accepts.length === 0
  ) {
    return {
      green: true,
      classes,
      unrestricted: true,
    };
  }

  const accepted =
    classes.some(
      (entryClass) =>
        normalized.accepts.includes(
          entryClass
        )
    );

  return accepted
    ? {
        green: true,
        classes,
        unrestricted: false,
      }
    : {
        green: false,
        classes,
        acceptedClasses:
          normalized.accepts,
        code:
          "container-class-rejected",
      };
}

export const expeditionContainerProfileApi =
  Object.freeze({
    normalize:
      normalizeContainerStorageProfile,

    resolveEntryClasses:
      resolveEntryContainerClasses,

    acceptsEntry:
      containerProfileAcceptsEntry,
  });
