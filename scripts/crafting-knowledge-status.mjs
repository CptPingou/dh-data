export const PROPERTY_KNOWLEDGE_STATUSES =
  Object.freeze({
    INVISIBLE:
      "invisible",

    VISIBLE:
      "visible",

    DISCOVERED:
      "discovered",

    SHARED:
      "shared",
  });

const STATUS_SET =
  new Set(
    Object.values(
      PROPERTY_KNOWLEDGE_STATUSES
    )
  );

export function normalizePropertyKnowledgeStatus(
  value,
  fallback =
    PROPERTY_KNOWLEDGE_STATUSES.INVISIBLE
) {
  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (
    STATUS_SET.has(
      normalized
    )
  ) {
    return normalized;
  }

  return STATUS_SET.has(fallback)
    ? fallback
    : PROPERTY_KNOWLEDGE_STATUSES.INVISIBLE;
}

export function propertyKnowledgeRank(
  status
) {
  switch (
    normalizePropertyKnowledgeStatus(
      status
    )
  ) {
    case PROPERTY_KNOWLEDGE_STATUSES.VISIBLE:
      return 1;

    case PROPERTY_KNOWLEDGE_STATUSES.DISCOVERED:
      return 2;

    case PROPERTY_KNOWLEDGE_STATUSES.SHARED:
      return 3;

    default:
      return 0;
  }
}

export function propertyKnowledgeProjection(
  status
) {
  const normalized =
    normalizePropertyKnowledgeStatus(
      status
    );

  const discovered =
    normalized ===
      PROPERTY_KNOWLEDGE_STATUSES.DISCOVERED ||
    normalized ===
      PROPERTY_KNOWLEDGE_STATUSES.SHARED;

  const shared =
    normalized ===
    PROPERTY_KNOWLEDGE_STATUSES.SHARED;

  return Object.freeze({
    status:
      normalized,

    listed:
      normalized !==
      PROPERTY_KNOWLEDGE_STATUSES.INVISIBLE,

    revealIdentity:
      discovered,

    revealDescription:
      discovered,

    exploitable:
      discovered,

    navigable:
      discovered,

    shared,
  });
}

export function propertyIsVisible(
  status
) {
  return (
    propertyKnowledgeRank(
      status
    ) >= 1
  );
}

export function propertyIsDiscovered(
  status
) {
  const normalized =
    normalizePropertyKnowledgeStatus(
      status
    );

  return (
    normalized ===
      PROPERTY_KNOWLEDGE_STATUSES.DISCOVERED ||
    normalized ===
      PROPERTY_KNOWLEDGE_STATUSES.SHARED
  );
}

export function propertyIsShared(
  status
) {
  return (
    normalizePropertyKnowledgeStatus(
      status
    ) ===
    PROPERTY_KNOWLEDGE_STATUSES.SHARED
  );
}

export function propertyCanBeExploited(
  status
) {
  return propertyIsDiscovered(
    status
  );
}

export function propertyCanBeNavigated(
  status
) {
  return propertyIsDiscovered(
    status
  );
}

export const craftingKnowledgeStatusApi =
  Object.freeze({
    statuses:
      PROPERTY_KNOWLEDGE_STATUSES,

    normalize:
      normalizePropertyKnowledgeStatus,

    rank:
      propertyKnowledgeRank,

    project:
      propertyKnowledgeProjection,

    visible:
      propertyIsVisible,

    discovered:
      propertyIsDiscovered,

    shared:
      propertyIsShared,

    exploitable:
      propertyCanBeExploited,

    navigable:
      propertyCanBeNavigated,
  });
