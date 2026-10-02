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

function renderPersonalPane(
  containers,
  state,
  rerender
) {
  const container =
    containers.find(
      (candidate) =>
        candidate.containerId ===
        state.personalContainerId
    ) ??
    containers[0] ??
    null;

  if (container) {
    state.personalContainerId =
      container.containerId;
  }
  const pane =
    element(
      "section",
      "dhct-inventory-view__pane dhct-inventory-view__pane--personal"
    );

  const header =
    element(
      "header",
      "dhct-inventory-view__pane-header"
    );

  header.append(
    text(
      "h3",
      containers.length > 1
        ? "Sac du chasseur"
        : "Mon sac",
      "dhct-inventory-view__pane-title"
    )
  );

  if (container) {
    header.append(
      text(
        "span",
        capacityLabel(container),
        "dhct-inventory-view__capacity"
      )
    );
  }

  pane.append(header);

  if (!container) {
    pane.append(
      renderEmpty("Aucun sac accessible.")
    );

    return pane;
  }

  if (containers.length > 1) {
    const select =
      element(
        "select",
        "dhct-inventory-view__hunter-select"
      );

    for (const candidate of containers) {
      const option =
        document.createElement("option");

      option.value =
        candidate.containerId;

      option.textContent =
        candidate.name;

      option.selected =
        candidate.containerId ===
        container.containerId;

      select.append(option);
    }

    select.addEventListener(
      "change",
      () => {
        state.personalContainerId =
          select.value;

        state.selected = null;
        rerender();
      }
    );

    pane.append(select);
  } else {
    pane.append(
      text(
        "div",
        container.name,
        "dhct-inventory-view__container-name"
      )
    );
  }

  pane.append(
    renderContainerEntries(
      container,
      {
        selected: state.selected,
        onSelect(selection) {
          state.selected = selection;
          rerender();
        },
      }
    )
  );

  return pane;
}

function renderSharedTabs(
  containers,
  state,
  rerender
) {
  const tabs =
    element(
      "div",
      "dhct-inventory-view__shared-tabs"
    );

  for (const container of containers) {
    const button =
      element(
        "button",
        "dhct-inventory-view__shared-tab"
      );

    button.type = "button";
    button.dataset.containerId =
      container.containerId;
    button.dataset.role =
      container.role ?? "";

    button.textContent =
      ROLE_LABELS[container.role] ??
      container.name;

    if (
      state.sharedContainerId ===
      container.containerId
    ) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      state.sharedContainerId =
        container.containerId;

      rerender();
    });

    tabs.append(button);
  }

  return tabs;
}

function renderSharedPane(
  containers,
  state,
  rerender
) {
  const pane =
    element(
      "section",
      "dhct-inventory-view__pane dhct-inventory-view__pane--shared"
    );

  const header =
    element(
      "header",
      "dhct-inventory-view__pane-header"
    );

  header.append(
    text(
      "h3",
      "Stockage partag\u00e9",
      "dhct-inventory-view__pane-title"
    )
  );

  pane.append(header);

  if (!containers.length) {
    pane.append(
      renderEmpty(
        "Aucun stockage partag\u00e9 accessible."
      )
    );

    return pane;
  }

  const selected =
    containers.find(
      (container) =>
        container.containerId ===
        state.sharedContainerId
    ) ??
    containers[0];

  state.sharedContainerId =
    selected.containerId;

  pane.append(
    renderSharedTabs(
      containers,
      state,
      rerender
    )
  );

  const meta =
    element(
      "div",
      "dhct-inventory-view__shared-meta"
    );

  meta.append(
    text(
      "span",
      selected.name,
      "dhct-inventory-view__container-name"
    ),
    text(
      "span",
      capacityLabel(selected),
      "dhct-inventory-view__capacity"
    )
  );

  pane.append(meta);

  pane.append(
    renderContainerEntries(
      selected,
      {
        selected: state.selected,
        onSelect(selection) {
          state.selected = selection;
          rerender();
        },
      }
    )
  );

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

function renderDetail(projection, state) {
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

  actions.append(
    text(
      "span",
      "Actions raccord\u00e9es en 7.3b",
      "dhct-inventory-view__actions-placeholder"
    )
  );

  detail.append(actions);

  return detail;
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
      "dhct-inventory-view"
    );

  const state = {
    selected: null,
    personalContainerId: null,
    sharedContainerId: null,
  };

  const personal =
    personalContainers(projection);

  state.personalContainerId =
    personal[0]?.containerId ??
    null;

  const shared =
    sharedContainers(projection);

  state.sharedContainerId =
    shared.find(
      (container) =>
        container.role === initialSharedRole
    )?.containerId ??
    shared[0]?.containerId ??
    null;

  function rerender() {
    root.replaceChildren();

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
        state
      )
    );
  }

  rerender();

  return root;
}
