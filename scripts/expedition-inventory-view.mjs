const SHARED_ROLES = [
  "ground",
  "fob",
  "caravan",
];

const ROLE_LABELS = {
  ground: "Sol",
  fob: "FOB",
  caravan: "Caravane",
};

function element(tag, className = null) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  return node;
}

function text(tag, value, className = null) {
  const node = element(tag, className);
  node.textContent = String(value ?? "");
  return node;
}

function activeEntries(container) {
  return Array.isArray(container?.entries)
    ? container.entries
    : [];
}

function capacityLabel(container) {
  const used =
    Math.max(
      0,
      Number(container?.capacity?.used) || 0
    );

  const slots =
    Math.max(
      0,
      Number(container?.capacity?.slots) || 0
    );

  return `${used} / ${slots}`;
}

function entryLabel(entry) {
  const quantity =
    Math.max(0, Number(entry?.quantity) || 0);

  const name =
    entry?.item?.name ??
    entry?.item?.sourceId ??
    "Objet";

  return quantity > 1
    ? `${name} x${quantity}`
    : name;
}

function personalContainers(projection) {
  return (projection?.containers ?? []).filter(
    (container) =>
      container?.type === "backpack" &&
      container?.scope === "personal"
  );
}

function sharedContainers(projection) {
  return (projection?.containers ?? [])
    .filter((container) =>
      SHARED_ROLES.includes(container?.role)
    )
    .sort(
      (left, right) =>
        SHARED_ROLES.indexOf(left.role) -
        SHARED_ROLES.indexOf(right.role)
    );
}

function renderEmpty(label) {
  return text(
    "div",
    label,
    "dhct-inventory-view__empty"
  );
}

function renderEntryButton(
  container,
  entry,
  {
    selected = false,
    onSelect = null,
  } = {}
) {
  const button =
    element(
      "button",
      "dhct-inventory-view__entry"
    );

  button.type = "button";
  button.dataset.containerId =
    container.containerId;
  button.dataset.entryId =
    entry.entryId ?? "";

  if (selected) {
    button.classList.add("active");
  }

  const img = element(
    "span",
    "dhct-inventory-view__entry-icon"
  );

  if (entry?.item?.img) {
    const image = document.createElement("img");
    image.src = entry.item.img;
    image.alt = "";
    img.append(image);
  }

  const name = text(
    "span",
    entryLabel(entry),
    "dhct-inventory-view__entry-name"
  );

  button.append(img, name);

  button.addEventListener("click", () => {
    onSelect?.({
      containerId: container.containerId,
      entryId: entry.entryId,
    });
  });

  return button;
}

function renderContainerEntries(
  container,
  {
    selected = null,
    onSelect = null,
  } = {}
) {
  const list =
    element(
      "div",
      "dhct-inventory-view__entries"
    );

  const entries = activeEntries(container);

  if (!entries.length) {
    list.append(
      renderEmpty("Aucun objet.")
    );

    return list;
  }

  for (const entry of entries) {
    list.append(
      renderEntryButton(
        container,
        entry,
        {
          selected:
            selected?.containerId ===
              container.containerId &&
            selected?.entryId ===
              entry.entryId,
          onSelect,
        }
      )
    );
  }

  return list;
}

function renderContainerCard(
  container,
  state,
  rerender,
  {
    kind = "personal",
    title = null,
  } = {}
) {
  const card =
    element(
      "section",
      `dhct-inventory-view__pane dhct-inventory-view__container-card dhct-inventory-view__container-card--${kind}`
    );

  card.dataset.containerId =
    container.containerId;

  const header =
    element(
      "header",
      "dhct-inventory-view__pane-header"
    );

  header.append(
    text(
      "h3",
      title ?? container.name,
      "dhct-inventory-view__pane-title"
    ),
    text(
      "span",
      capacityLabel(container),
      "dhct-inventory-view__capacity"
    )
  );

  card.append(header);

  const entries =
    renderContainerEntries(
      container,
      {
        selected: state.selected,
        onSelect(selection) {
          state.selected = selection;
          rerender();
        },
      }
    );

  installEntryDragSources(
    entries,
    container
  );

  installContainerDropTarget(
    card,
    container.containerId
  );

  card.append(entries);

  return card;
}

function renderPersonalPane(
  containers,
  state,
  rerender
) {
  const pane =
    element(
      "section",
      "dhct-inventory-view__pane-group dhct-inventory-view__pane-group--personal"
    );

  pane.append(
    text(
      "h2",
      "Sacs du groupe",
      "dhct-inventory-view__group-title"
    )
  );

  if (!containers.length) {
    pane.append(
      renderEmpty("Aucun sac accessible.")
    );
    return pane;
  }

  const cards =
    element(
      "div",
      "dhct-inventory-view__container-stack"
    );

  for (const container of containers) {
    cards.append(
      renderContainerCard(
        container,
        state,
        rerender,
        {
          kind: "personal",
          title: container.name,
        }
      )
    );
  }

  pane.append(cards);
  return pane;
}

function installContainerDropTarget(
  target,
  toContainerId
) {
  if (!(target instanceof HTMLElement)) return;

  target.dataset.dropContainerId =
    toContainerId;

  target.addEventListener(
    "dragover",
    (event) => {
      const types =
        [...(event.dataTransfer?.types ?? [])];

      if (
        !types.includes(
          "application/x-dhct-inventory-entry"
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      target.classList.add(
        "dhct-inventory-view__drop-target"
      );

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }
  );

  target.addEventListener(
    "dragleave",
    (event) => {
      if (
        event.relatedTarget &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }

      target.classList.remove(
        "dhct-inventory-view__drop-target"
      );
    }
  );

  target.addEventListener(
    "drop",
    (event) => {
      const raw =
        event.dataTransfer?.getData(
          "application/x-dhct-inventory-entry"
        );

      if (!raw) return;

      event.preventDefault();
      event.stopPropagation();

      target.classList.remove(
        "dhct-inventory-view__drop-target"
      );

      let payload;

      try {
        payload = JSON.parse(raw);
      } catch (_error) {
        return;
      }

      const transferTo =
        Array.isArray(payload?.transferTo)
          ? payload.transferTo
          : [];

      if (
        !payload?.entryId ||
        !payload?.fromContainerId ||
        !toContainerId ||
        payload.fromContainerId ===
          toContainerId ||
        !transferTo.includes(toContainerId)
      ) {
        return;
      }

      target.dispatchEvent(
        new CustomEvent(
          "dhct-inventory-transfer-request",
          {
            bubbles: true,
            detail: {
              entryId:
                payload.entryId,
              fromContainerId:
                payload.fromContainerId,
              toContainerId,
              quantity:
                Math.max(
                  1,
                  Number(payload.quantity) || 1
                ),
            },
          }
        )
      );
    }
  );
}

function installEntryDragSources(
  root,
  container
) {
  if (!(root instanceof HTMLElement)) return;

  for (
    const node of root.querySelectorAll(
      "[data-entry-id]"
    )
  ) {
    if (!(node instanceof HTMLElement)) continue;

    const entryId =
      node.dataset.entryId;

    if (!entryId) continue;

    const entry =
      activeEntries(container).find(
        (candidate) =>
          candidate.entryId === entryId
      );

    if (!entry) continue;

    node.draggable = true;

    node.classList.add(
      "dhct-inventory-view__drag-source"
    );

    node.addEventListener(
      "dragstart",
      (event) => {
        if (!event.dataTransfer) return;

        event.dataTransfer.setData(
          "application/x-dhct-inventory-entry",
          JSON.stringify({
            entryId,
            fromContainerId:
              container.containerId,
            quantity:
              Math.max(
                1,
                Number(entry.quantity) || 1
              ),
            transferTo:
              Array.isArray(
                container.capabilities
                  ?.transferTo
              )
                ? [
                    ...container.capabilities
                      .transferTo,
                  ]
                : [],
          })
        );

        event.dataTransfer.effectAllowed =
          "move";
      }
    );
  }
}

function renderSharedPane(
  containers,
  state,
  rerender
) {
  const pane =
    element(
      "section",
      "dhct-inventory-view__pane-group dhct-inventory-view__pane-group--shared"
    );

  pane.append(
    text(
      "h2",
      "Stockage partagé",
      "dhct-inventory-view__group-title"
    )
  );

  if (!containers.length) {
    pane.append(
      renderEmpty(
        "Aucun stockage partagé accessible."
      )
    );
    return pane;
  }

  const cards =
    element(
      "div",
      "dhct-inventory-view__container-stack"
    );

  for (const container of containers) {
    cards.append(
      renderContainerCard(
        container,
        state,
        rerender,
        {
          kind: "shared",
          title:
            ROLE_LABELS[container.role] ??
            container.name,
        }
      )
    );
  }

  pane.append(cards);
  return pane;
}

function selectedEntry(
  projection,
  selection
) {
  if (
    !selection?.containerId ||
    !selection?.entryId
  ) {
    return null;
  }

  const container =
    (projection?.containers ?? []).find(
      (candidate) =>
        candidate.containerId ===
        selection.containerId
    );

  const entry =
    container?.entries?.find(
      (candidate) =>
        candidate.entryId ===
        selection.entryId
    );

  if (!container || !entry) {
    return null;
  }

  return {
    container,
    entry,
  };
}

function renderDetail(
  projection,
  state,
  rerender
) {
  const detail =
    element(
      "section",
      "dhct-inventory-view__detail"
    );

  const selected =
    selectedEntry(
      projection,
      state.selected
    );

  if (!selected) {
    detail.append(
      renderEmpty(
        "S\u00e9lectionnez un objet pour afficher ses d\u00e9tails."
      )
    );

    return detail;
  }

  const { container, entry } = selected;

  const header =
    element(
      "header",
      "dhct-inventory-view__detail-header"
    );

  if (entry?.item?.img) {
    const image = document.createElement("img");
    image.className =
      "dhct-inventory-view__detail-image";
    image.src = entry.item.img;
    image.alt = "";
    header.append(image);
  }

  const identity =
    element(
      "div",
      "dhct-inventory-view__detail-identity"
    );

  identity.append(
    text(
      "h3",
      entry?.item?.name ?? "Objet",
      "dhct-inventory-view__detail-title"
    ),
    text(
      "span",
      `Quantit\u00e9 : ${Math.max(
        0,
        Number(entry?.quantity) || 0
      )}`,
      "dhct-inventory-view__detail-quantity"
    )
  );

  header.append(identity);

  detail.append(header);

  const meta =
    element(
      "div",
      "dhct-inventory-view__detail-meta"
    );

  meta.append(
    text(
      "span",
      container.name,
      "dhct-inventory-view__detail-container"
    )
  );

  if (entry?.item?.type) {
    meta.append(
      text(
        "span",
        entry.item.type,
        "dhct-inventory-view__detail-type"
      )
    );
  }

  detail.append(meta);

  const actions =
    element(
      "div",
      "dhct-inventory-view__actions"
    );

  const personal =
    personalContainers(projection);

  const selectedPersonal =
    personal.find(
      (candidate) =>
        candidate.containerId ===
        state.personalContainerId
    ) ??
    personal[0] ??
    null;

  const ground =
    sharedContainers(projection).find(
      (candidate) =>
        candidate.role === "ground"
    ) ?? null;

  const isPersonal =
    container.containerId ===
    selectedPersonal?.containerId;

  const isGround =
    container.containerId ===
    ground?.containerId;

  let transferTarget = null;
  let transferLabel = null;

  const transferTo =
    Array.isArray(
      container.capabilities?.transferTo
    )
      ? container.capabilities.transferTo
      : [];

  if (
    isPersonal &&
    ground &&
    container.capabilities?.transfer === true &&
    ground.capabilities?.receive === true &&
    transferTo.includes(
      ground.containerId
    )
  ) {
    transferTarget = ground;
    transferLabel = "Envoyer au Sol";
  } else if (
    isGround &&
    selectedPersonal &&
    container.capabilities?.transfer === true &&
    selectedPersonal.capabilities?.receive === true &&
    transferTo.includes(
      selectedPersonal.containerId
    )
  ) {
    transferTarget = selectedPersonal;
    transferLabel = "Mettre dans le sac";
  }

  const appendActionButton = ({
    label,
    className,
    eventName,
    eventDetail,
  }) => {
    const button =
      element(
        "button",
        `dhct-inventory-view__action ${className}`
      );

    button.type = "button";
    button.textContent = label;

    button.addEventListener(
      "click",
      () => {
        detail.dispatchEvent(
          new CustomEvent(
            eventName,
            {
              bubbles: true,
              detail: eventDetail,
            }
          )
        );
      }
    );

    actions.append(button);
  };

  if (
    isPersonal &&
    container.capabilities?.returnToActor === true
  ) {
    appendActionButton({
      label: "Renvoyer au personnage",
      className:
        "dhct-inventory-view__action--return",
      eventName:
        "dhct-inventory-return-request",
      eventDetail: {
        entryId: entry.entryId,
        fromContainerId:
          container.containerId,
        quantity:
          Math.max(
            1,
            Number(entry.quantity) || 1
          ),
      },
    });
  }

  if (transferTarget && transferLabel) {
    const button =
      element(
        "button",
        "dhct-inventory-view__action dhct-inventory-view__action--transfer"
      );

    button.type = "button";
    button.textContent = transferLabel;

    button.addEventListener(
      "click",
      () => {
        detail.dispatchEvent(
          new CustomEvent(
            "dhct-inventory-transfer-request",
            {
              bubbles: true,
              detail: {
                entryId: entry.entryId,
                fromContainerId:
                  container.containerId,
                toContainerId:
                  transferTarget.containerId,
                quantity:
                  Math.max(
                    1,
                    Number(entry.quantity) || 1
                  ),
              },
            }
          )
        );
      }
    );

    actions.append(button);
  }

  if (
    entry.item?.type === "consumable" &&
    container.capabilities?.consume === true
  ) {
    appendActionButton({
      label: "Consommer",
      className:
        "dhct-inventory-view__action--consume",
      eventName:
        "dhct-inventory-item-action-request",
      eventDetail: {
        action: "consume",
        entryId: entry.entryId,
        containerId:
          container.containerId,
      },
    });
  }

  if (
    container.capabilities?.delete === true
  ) {
    appendActionButton({
      label: "Supprimer",
      className:
        "dhct-inventory-view__action--delete",
      eventName:
        "dhct-inventory-item-action-request",
      eventDetail: {
        action: "delete",
        entryId: entry.entryId,
        containerId:
          container.containerId,
      },
    });
  }

  if (!actions.childElementCount) {
    actions.append(
      text(
        "span",
        "Aucune action disponible.",
        "dhct-inventory-view__actions-placeholder"
      )
    );
  }

  detail.append(actions);

  return detail;
}

export function renderExpeditionContainerView(
  projection,
  {
    role,
  } = {}
) {
  if (
    projection?.kind !==
    "expedition-inventory-projection"
  ) {
    throw new Error(
      "Container view requires an expedition inventory projection."
    );
  }

  if (!SHARED_ROLES.includes(role)) {
    throw new Error(
      "Container view requires a valid shared role."
    );
  }

  const container =
    sharedContainers(projection).find(
      (candidate) =>
        candidate.role === role
    ) ??
    null;

  const root =
    element(
      "div",
      "dhct-inventory-view dhct-inventory-view--single-container"
    );

  const state = {
    selected: container
      ? {
          containerId:
            container.containerId,
          entryId: null,
        }
      : null,
    personalContainerId: null,
  };

  function rerender() {
    root.replaceChildren();

    if (!container) {
      root.append(
        renderEmpty(
          "Aucun conteneur disponible."
        )
      );
      return;
    }

    root.append(
      renderContainerCard(
        container,
        state,
        rerender,
        {
          kind: "shared",
        }
      ),
      renderDetail(
        projection,
        state,
        rerender
      )
    );
  }

  rerender();

  return root;
}

export function renderExpeditionInventoryView(
  projection,
  {
    initialSharedRole = "ground",
  } = {}
) {
  if (
    projection?.kind !==
    "expedition-inventory-projection"
  ) {
    throw new Error(
      "Inventory view requires an expedition inventory projection."
    );
  }

  const root =
    element(
      "div",
      "dhct-inventory-view dhct-inventory-view--multicontainer"
    );

  const style = document.createElement("style");
  style.textContent = `
    .dhct-inventory-view {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    .dhct-inventory-view__columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.75rem;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      align-items: stretch;
    }

    .dhct-inventory-view__pane-group {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .dhct-inventory-view__group-title {
      flex: 0 0 auto;
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .dhct-inventory-view__container-stack {
      display: grid;
      grid-auto-rows: max-content;
      gap: 0.65rem;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 0.35rem;
      align-content: start;
    }

    .dhct-inventory-view__container-card {
      position: relative;
      min-width: 0;
      min-height: max-content;
      overflow: visible;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 0.55rem;
      transition:
        border-color 120ms ease,
        box-shadow 120ms ease;
    }

    .dhct-inventory-view__container-card .dhct-inventory-view__entries {
      position: relative;
      min-height: 0;
      overflow: visible;
    }

    .dhct-inventory-view__detail {
      position: relative;
      flex: 0 0 auto;
      min-height: 0;
      max-height: 13rem;
      overflow-y: auto;
      margin-top: 0.75rem;
      z-index: 1;
    }

    .dhct-inventory-view__container-card.dhct-inventory-view__drop-target {
      border-color: currentColor;
      box-shadow: inset 0 0 0 1px currentColor;
    }

    .dhct-inventory-view__drag-source {
      cursor: grab;
    }

    .dhct-inventory-view__drag-source:active {
      cursor: grabbing;
    }
  `;

  root.append(style);

  const state = {
    selected: null,
    personalContainerId: null,
  };

  const personal =
    personalContainers(projection);

  state.personalContainerId =
    personal[0]?.containerId ??
    null;

  const shared =
    sharedContainers(projection);

  const initialSharedContainer =
    shared.find(
      (container) =>
        container.role ===
        initialSharedRole
    ) ??
    shared[0] ??
    null;

  if (initialSharedContainer) {
    state.selected = {
      containerId:
        initialSharedContainer.containerId,
      entryId: null,
    };
  }

  function rerender() {
    root.replaceChildren(style);

    const columns =
      element(
        "div",
        "dhct-inventory-view__columns"
      );

    columns.append(
      renderPersonalPane(
        personal,
        state,
        rerender
      ),
      renderSharedPane(
        shared,
        state,
        rerender
      )
    );

    root.append(
      columns,
      renderDetail(
        projection,
        state,
        rerender
      )
    );
  }

  rerender();

  return root;
}
