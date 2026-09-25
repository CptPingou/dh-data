function cloneValue(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

export function captureManifestState(manifest) {
  return cloneValue(manifest);
}

export function restoreManifestState(manifest, snapshot) {
  if (!manifest || !snapshot) return;
  for (const key of Object.keys(manifest)) delete manifest[key];
  Object.assign(manifest, cloneValue(snapshot));
}

export function captureActorInventory(actor) {
  if (!actor?.items) return [];
  return actor.items.map((item) => item.toObject());
}

export async function restoreActorInventory(actor, snapshot) {
  if (!actor || !Array.isArray(snapshot)) return;

  const ids = actor.items?.map?.((item) => item.id) ?? [];
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);

  if (snapshot.length) {
    await actor.createEmbeddedDocuments(
      "Item",
      snapshot.map((item) => cloneValue(item))
    );
  }
}

export async function rollbackExpeditionTransfer({
  manifest,
  manifestSnapshot,
  actor,
  actorInventorySnapshot,
} = {}) {
  const errors = [];

  try {
    restoreManifestState(manifest, manifestSnapshot);
  } catch (error) {
    errors.push({ stage: "manifest", error });
  }

  try {
    await restoreActorInventory(actor, actorInventorySnapshot);
  } catch (error) {
    errors.push({ stage: "actor", error });
  }

  return { green: errors.length === 0, errors };
}
