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

  return {
    id:
      caravan.id,

    name:
      caravan.name,

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
};
