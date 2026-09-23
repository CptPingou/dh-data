const PHASES = new Set(["prepared", "in_session", "returned"]);
const AUTHORITIES = new Set(["web", "foundry"]);

function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function transition(manifest, { fromPhase, fromAuthority, toPhase, toAuthority }) {
  if (!manifest || typeof manifest !== "object") {
    return { changed: false, reason: "invalid-manifest", manifest };
  }

  if (manifest.phase !== fromPhase || manifest.authority !== fromAuthority) {
    return {
      changed: false,
      reason: "invalid-state",
      expected: { phase: fromPhase, authority: fromAuthority },
      actual: { phase: manifest.phase, authority: manifest.authority },
      manifest,
    };
  }

  if (!PHASES.has(toPhase) || !AUTHORITIES.has(toAuthority)) {
    return { changed: false, reason: "invalid-target-state", manifest };
  }

  manifest.phase = toPhase;
  manifest.authority = toAuthority;
  manifest.revision = Number.isInteger(manifest.revision) ? manifest.revision + 1 : 1;

  return {
    changed: true,
    manifest,
    from: { phase: fromPhase, authority: fromAuthority },
    to: { phase: toPhase, authority: toAuthority },
  };
}

export function createExpeditionLifecycleApi({ persistenceApi, validate } = {}) {
  async function start(manifest) {
    const result = transition(manifest, {
      fromPhase: "prepared",
      fromAuthority: "web",
      toPhase: "in_session",
      toAuthority: "foundry",
    });
    if (!result.changed) return result;

    const validation = validate(manifest);
    if (!validation?.green) {
      Object.assign(manifest, clone({
        ...manifest,
        phase: "prepared",
        authority: "web",
        revision: Math.max(0, manifest.revision - 1),
      }));
      return { changed: false, reason: "validation-failed", validation, manifest };
    }

    await persistenceApi.save(manifest);
    return { ...result, saved: true };
  }

  async function returnToWeb(manifest) {
    const result = transition(manifest, {
      fromPhase: "in_session",
      fromAuthority: "foundry",
      toPhase: "returned",
      toAuthority: "web",
    });
    if (!result.changed) return result;

    const validation = validate(manifest);
    if (!validation?.green) {
      manifest.phase = "in_session";
      manifest.authority = "foundry";
      manifest.revision = Math.max(0, manifest.revision - 1);
      return { changed: false, reason: "validation-failed", validation, manifest };
    }

    await persistenceApi.save(manifest);
    return { ...result, saved: true };
  }

  function status(manifest) {
    return Object.freeze({
      green: Boolean(
        manifest
        && PHASES.has(manifest.phase)
        && AUTHORITIES.has(manifest.authority)
        && (
          (manifest.phase === "prepared" && manifest.authority === "web")
          || (manifest.phase === "in_session" && manifest.authority === "foundry")
          || (manifest.phase === "returned" && manifest.authority === "web")
        )
      ),
      phase: manifest?.phase ?? null,
      authority: manifest?.authority ?? null,
      canStart: manifest?.phase === "prepared" && manifest?.authority === "web",
      canReturn: manifest?.phase === "in_session" && manifest?.authority === "foundry",
    });
  }

  return Object.freeze({ version: 1, status, start, returnToWeb });
}
