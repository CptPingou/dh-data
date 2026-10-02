function capacityOf(container) {
  const capacity = container?.capacity ?? {};

  return {
    used: Math.max(0, Number(capacity.used) || 0),
    capacity: Math.max(0, Number(capacity.slots) || 0),
  };
}

function projectFoundMaterials(materialLibrary) {
  return (materialLibrary?.materials ?? [])
    .filter(
      (material) =>
        material?.inventory?.available === true &&
        Number(material?.inventory?.quantity) > 0
    )
    .map((material) => ({
      materialId: material.materialId ?? null,
      name: material.name ?? material.materialId ?? "Materiau",
      img: material.img ?? null,
      quantity: Math.max(
        0,
        Number(material.inventory.quantity) || 0
      ),
    }));
}

function unavailableLogistics() {
  return {
    available: false,
    used: 0,
    capacity: 0,
  };
}

function logisticsOf(container) {
  if (!container) {
    return unavailableLogistics();
  }

  return {
    available: true,
    ...capacityOf(container),
  };
}

export function projectExpeditionDashboard({
  manifest,
  inventory,
  materialLibrary = null,
} = {}) {
  if (!manifest?.expeditionId) {
    throw new Error(
      "Dashboard projection requires manifest.expeditionId."
    );
  }

  if (!inventory || !Array.isArray(inventory.containers)) {
    throw new Error(
      "Dashboard projection requires inventory.containers."
    );
  }

  const containers = inventory.containers;

  const characters = new Map(
    (manifest.characters ?? [])
      .filter((character) => character?.characterId)
      .map((character) => [
        character.characterId,
        character,
      ])
  );

  const hunters = containers
    .filter(
      (container) =>
        container?.type === "backpack" &&
        container?.holder?.kind === "character"
    )
    .map((container) => {
      const character =
        characters.get(container.holder.id) ?? null;

      return {
        id: container.holder.id,
        name:
          character?.name ??
          container.name ??
          container.holder.id,
        backpack: {
          containerId: container.containerId,
          ...capacityOf(container),
        },
      };
    });

  const byRole = (role) =>
    containers.find(
      (container) => container?.role === role
    ) ?? null;

  const fob = byRole("fob");
  const caravan = byRole("caravan");

  return {
    expedition: {
      id: manifest.expeditionId,
      name:
        manifest.name ??
        manifest.title ??
        manifest.expeditionId,
      phase: manifest.phase ?? null,
    },

    hunters,

    logistics: {
      fob: logisticsOf(fob),
      caravan: logisticsOf(caravan),
    },

    materials: projectFoundMaterials(
      materialLibrary
    ),

    readiness: {
      prepared: manifest.phase === "prepared",
      huntersAssigned: hunters.length > 0,
      fobAvailable: Boolean(fob),
      caravanAvailable: Boolean(caravan),
    },
  };
}