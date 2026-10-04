import {
  projectInventoryContainer,
} from "./expedition-inventory-projection.mjs";

const clone = (value) =>
  value == null
    ? value
    : JSON.parse(JSON.stringify(value));

export function projectCaravanComponent(
  component,
  {
    containerById,
  } = {}
) {
  if (
    !component ||
    typeof component !== "object" ||
    Array.isArray(component)
  ) {
    throw new Error(
      "Caravan projection requires a component."
    );
  }

  const containerId =
    component.containerId ?? null;

  let storage = null;

  if (containerId != null) {
    const container =
      containerById?.get(
        containerId
      ) ?? null;

    if (!container) {
      throw new Error(
        "Caravan component " +
        component.id +
        " references unknown container " +
        containerId
      );
    }

    storage =
      projectInventoryContainer(
        container,
        {
          capabilities: {
            view: true,
          },
        }
      );
  }

  return {
    id:
      component.id,

    type:
      component.type,

    name:
      component.name,

    hp:
      clone(component.hp),

    containerId,

    layout:
      clone(component.layout),

    state:
      clone(component.state ?? {}),

    storage,
  };
}

export function resolveCaravanFobContainerId(
  manifest
) {
  const containerId =
    String(
      manifest?.fob
        ?.storageContainerId ??
      ""
    ).trim();

  return containerId || null;
}

export function projectCaravanFobStorage(
  manifest,
  {
    containerById = null,
  } = {}
) {
  const containerId =
    resolveCaravanFobContainerId(
      manifest
    );

  if (!containerId) {
    return null;
  }

  const containers =
    containerById ??
    new Map(
      (manifest.containers ?? [])
        .map(
          (container) => [
            container.containerId,
            container,
          ]
        )
    );

  const container =
    containers.get(
      containerId
    ) ?? null;

  if (!container) {
    throw new Error(
      "FOB references unknown storage container " +
      containerId
    );
  }

  return projectInventoryContainer(
    container,
    {
      capabilities: {
        view: true,
      },
    }
  );
}

export function projectExpeditionCaravan(
  {
    manifest,
  } = {}
) {
  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    throw new Error(
      "Caravan projection requires manifest."
    );
  }

  if (manifest.caravan == null) {
    return null;
  }

  const caravan =
    manifest.caravan;

  const containerById =
    new Map(
      (manifest.containers ?? [])
        .map(
          (container) => [
            container.containerId,
            container,
          ]
        )
    );

  const fobStorage =
    projectCaravanFobStorage(
      manifest,
      {
        containerById,
      }
    );

  return {
    id:
      caravan.id,

    name:
      caravan.name,

    fobStorage,

    asset:
      clone(
        caravan.asset ?? {
          src: null,
        }
      ),

    components:
      (
        caravan.components ?? []
      ).map(
        (component) =>
          projectCaravanComponent(
            component,
            {
              containerById,
            }
          )
      ),

    cargoSlots:
      (
        caravan.cargoSlots ?? []
      ).map(
        (slot) => {
          const component =
            slot.componentId == null
              ? null
              : (
                  caravan.components ?? []
                ).find(
                  (candidate) =>
                    candidate.id ===
                    slot.componentId
                ) ?? null;

          if (
            slot.componentId != null &&
            !component
          ) {
            throw new Error(
              "Caravan cargo slot " +
              slot.id +
              " references unknown component " +
              slot.componentId
            );
          }

          return {
            id:
              slot.id,

            name:
              slot.name,

            componentId:
              slot.componentId ??
              null,

            layout:
              clone(
                slot.layout
              ),

            state:
              clone(
                slot.state ?? {}
              ),

            component:
              component
                ? projectCaravanComponent(
                    component,
                    {
                      containerById,
                    }
                  )
                : null,
          };
        }
      ),

    state:
      clone(
        caravan.state ?? {}
      ),
  };
}

export const expeditionCaravanProjection = {
  project:
    projectExpeditionCaravan,

  projectComponent:
    projectCaravanComponent,

  projectFobStorage:
    projectCaravanFobStorage,

  resolveFobContainerId:
    resolveCaravanFobContainerId,
};
