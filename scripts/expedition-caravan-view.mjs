const STYLE_ID =
  "dhct-expedition-caravan-view-style";

const clone = (value) =>
  value == null
    ? value
    : JSON.parse(JSON.stringify(value));

function escapeText(value) {
  return String(value ?? "");
}

function entryLabel(entry) {
  return (
    entry?.item?.name ??
    entry?.item?.sourceId ??
    entry?.entryId ??
    "Objet"
  );
}

function capacityLabel(storage) {
  if (!storage?.capacity) {
    return null;
  }

  return (
    String(storage.capacity.used ?? 0) +
    " / " +
    String(storage.capacity.slots ?? 0) +
    " slots"
  );
}

function cargoShortLabel(slot) {
  const match =
    String(slot?.id ?? "")
      .match(/cargo-(\d+)/i);

  return match
    ? match[1]
    : String(slot?.name ?? "?");
}

export function buildExpeditionCaravanViewModel(
  projection
) {
  if (projection == null) {
    return {
      empty: true,
      id: null,
      name: "Caravane",
      assetSrc: null,
      components: [],
      cargoSlots: [],
      fobStorage: null,
      state: {},
    };
  }

  return {
    empty: false,

    id:
      projection.id ?? null,

    name:
      projection.name ??
      "Caravane",

    assetSrc:
      projection.asset?.src ??
      null,

    components:
      clone(
        projection.components ?? []
      ),

    cargoSlots:
      clone(
        projection.cargoSlots ?? []
      ),

    fobStorage:
      clone(
        projection.fobStorage ?? null
      ),

    state:
      clone(
        projection.state ?? {}
      ),
  };
}

function ensureCaravanStyles(
  documentRef
) {
  if (
    documentRef.getElementById(
      STYLE_ID
    )
  ) {
    return;
  }

  const style =
    documentRef.createElement(
      "style"
    );

  style.id =
    STYLE_ID;

  style.textContent = `
    .dhct-caravan-view {
      display: grid;
      grid-template-columns:
        minmax(0, 1.7fr)
        minmax(230px, .8fr);
      grid-template-areas:
        "board fob"
        "detail detail";
      gap: .75rem;
      min-width: 0;
    }

    .dhct-caravan-view__board {
      grid-area: board;
      position: relative;
      min-height: 430px;
      overflow: hidden;
      border:
        1px solid rgba(220, 190, 135, .35);
      border-radius: 6px;
      background:
        rgba(20, 18, 16, .35);
    }

    .dhct-caravan-view__board-title {
      position: absolute;
      top: .5rem;
      left: .75rem;
      z-index: 4;
      margin: 0;
      font-size: 1.05rem;
    }

    .dhct-caravan-view__asset {
      position: absolute;
      inset: 2.5rem .5rem .5rem;
      width: calc(100% - 1rem);
      height: calc(100% - 3rem);
      object-fit: contain;
      opacity: .5;
      pointer-events: none;
    }

    .dhct-caravan-view__component,
    .dhct-caravan-view__cargo {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border-radius: 6px;
      padding: .25rem;
      line-height: 1.15;
    }

    .dhct-caravan-view__component {
      border:
        1px solid rgba(190, 190, 190, .55);
      background:
        rgba(25, 25, 25, .78);
      font-size: .72rem;
    }

    .dhct-caravan-view__component[data-component-type="wheel"] {
      border-radius: 50%;
    }

    .dhct-caravan-view__wheel {
      min-width: 78px;
      min-height: 78px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: .38rem;
      padding: .5rem;
      line-height: 1.15;
      overflow: visible;
    }

    .dhct-caravan-view__wheel .dhct-caravan-view__component-name {
      max-width: 70px;
      font-size: .74rem;
      font-weight: 700;
      line-height: 1.18;
      text-align: center;
    }

    .dhct-caravan-view__wheel .dhct-caravan-view__hp {
      font-size: .68rem;
      line-height: 1;
      white-space: nowrap;
      opacity: .82;
    }

    .dhct-caravan-view__cargo {
      border:
        1px dashed rgba(220, 190, 135, .7);
      background:
        rgba(70, 55, 35, .3);
      flex-direction: column;
      gap: .15rem;
      font-size: .72rem;
    }

    .dhct-caravan-view__cargo.is-occupied {
      border-style: solid;
      background:
        rgba(90, 70, 40, .55);
    }

    .dhct-caravan-view__cargo-index {
      font-weight: 700;
    }

    .dhct-caravan-view__cargo-meta,
    .dhct-caravan-view__hp {
      opacity: .75;
      font-size: .65rem;
    }

    .dhct-caravan-view__fob {
      grid-area: fob;
      min-width: 0;
      border:
        1px solid rgba(220, 190, 135, .35);
      border-radius: 6px;
      padding: .65rem;
      background:
        rgba(20, 18, 16, .28);
    }

    .dhct-caravan-view__fob h3 {
      margin:
        0 0 .45rem;
    }

    .dhct-caravan-view__fob-capacity {
      margin-bottom: .55rem;
      opacity: .78;
    }

    .dhct-caravan-view__fob-entries {
      display: grid;
      gap: .35rem;
      max-height: 330px;
      overflow: auto;
    }

    .dhct-caravan-view__entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      padding: .35rem .45rem;
      border:
        1px solid rgba(255, 255, 255, .08);
      border-radius: 4px;
    }

    .dhct-caravan-view__entry-identity {
      display: flex;
      align-items: center;
      gap: .45rem;
      min-width: 0;
    }

    .dhct-caravan-view__entry-icon {
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dhct-caravan-view__entry-icon img {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border: 0;
    }

    .dhct-caravan-view__entry-name {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .dhct-caravan-view__entry-quantity {
      flex: 0 0 auto;
    }

    .dhct-caravan-view__detail {
      grid-area: detail;
      min-height: 92px;
      border:
        1px solid rgba(220, 190, 135, .25);
      border-radius: 6px;
      padding: .65rem;
    }

    .dhct-caravan-view__detail h3 {
      margin:
        0 0 .35rem;
    }

    .dhct-caravan-view__empty {
      grid-column: 1 / -1;
      padding: 1rem;
      opacity: .75;
    }

    @media (max-width: 850px) {
      .dhct-caravan-view {
        grid-template-columns: 1fr;
        grid-template-areas:
          "board"
          "fob"
          "detail";
      }
    }
  `;

  documentRef.head.append(
    style
  );
}

function applyLayout(
  node,
  layout = {}
) {
  const x =
    Number(layout.x) || 0;

  const y =
    Number(layout.y) || 0;

  const width =
    Number(layout.width) || 0.1;

  const height =
    Number(layout.height) || 0.1;

  const rotation =
    Number(layout.rotation) || 0;

  node.style.left =
    String(x * 100) + "%";

  node.style.top =
    String(y * 100) + "%";

  node.style.width =
    String(width * 100) + "%";

  node.style.height =
    String(height * 100) + "%";

  node.style.transform =
    "rotate(" +
    String(rotation) +
    "deg)";
}

function renderComponent(
  component,
  documentRef
) {
  const node =
    documentRef.createElement(
      "div"
    );

  node.className =
    "dhct-caravan-view__component";

  if (
    component.type === "wheel"
  ) {
    node.classList.add(
      "dhct-caravan-view__wheel"
    );
  }

  node.dataset.componentId =
    component.id ?? "";

  node.dataset.componentType =
    component.type ?? "generic";

  applyLayout(
    node,
    component.layout
  );

  const label =
    documentRef.createElement(
      "div"
    );

  label.className =
    "dhct-caravan-view__component-name";

  label.textContent =
    escapeText(
      component.name ??
      component.id
    );

  node.append(label);

  if (
    component.hp?.max != null
  ) {
    const hp =
      documentRef.createElement(
        "div"
      );

    hp.className =
      "dhct-caravan-view__hp";

    hp.textContent =
      "PV " +
      String(
        component.hp.value ?? 0
      ) +
      "/" +
      String(
        component.hp.max ?? 0
      );

    node.append(hp);
  }

  return node;
}

function renderCargoSlot(
  slot,
  documentRef
) {
  const node =
    documentRef.createElement(
      "div"
    );

  node.className =
    "dhct-caravan-view__cargo";

  node.dataset.cargoSlotId =
    slot.id ?? "";

  if (slot.component) {
    node.classList.add(
      "is-occupied"
    );
  }

  applyLayout(
    node,
    slot.layout
  );

  const index =
    documentRef.createElement(
      "div"
    );

  index.className =
    "dhct-caravan-view__cargo-index";

  index.textContent =
    "[" +
    cargoShortLabel(slot) +
    "]";

  node.append(index);

  const name =
    documentRef.createElement(
      "div"
    );

  name.textContent =
    slot.component
      ? escapeText(
          slot.component.name
        )
      : "Vide";

  node.append(name);

  const capacity =
    capacityLabel(
      slot.component?.storage
    );

  if (capacity) {
    const meta =
      documentRef.createElement(
        "div"
      );

    meta.className =
      "dhct-caravan-view__cargo-meta";

    meta.textContent =
      capacity;

    node.append(meta);
  }

  return node;
}

function renderFobStorage(
  storage,
  documentRef
) {
  const panel =
    documentRef.createElement(
      "section"
    );

  panel.className =
    "dhct-caravan-view__fob";

  const title =
    documentRef.createElement(
      "h3"
    );

  title.textContent =
    "Zone FOB";

  panel.append(title);

  if (!storage) {
    const empty =
      documentRef.createElement(
        "p"
      );

    empty.textContent =
      "Aucune zone FOB disponible.";

    panel.append(empty);

    return panel;
  }

  panel.dataset.containerId =
    storage.containerId ?? "";

  const capacity =
    documentRef.createElement(
      "div"
    );

  capacity.className =
    "dhct-caravan-view__fob-capacity";

  capacity.textContent =
    capacityLabel(storage) ??
    "Capacit\u00e9 inconnue";

  panel.append(capacity);

  const entries =
    documentRef.createElement(
      "div"
    );

  entries.className =
    "dhct-caravan-view__fob-entries";

  for (
    const entry of
    storage.entries ?? []
  ) {
    const row =
      documentRef.createElement(
        "div"
      );

    row.className =
      "dhct-caravan-view__entry";

    row.dataset.entryId =
      entry.entryId ?? "";

    const identity =
      documentRef.createElement(
        "span"
      );

    identity.className =
      "dhct-caravan-view__entry-identity";

    const icon =
      documentRef.createElement(
        "span"
      );

    icon.className =
      "dhct-caravan-view__entry-icon";

    if (entry?.item?.img) {
      const image =
        documentRef.createElement(
          "img"
        );

      image.src =
        entry.item.img;

      image.alt = "";

      icon.append(image);
    }

    const name =
      documentRef.createElement(
        "span"
      );

    name.className =
      "dhct-caravan-view__entry-name";

    name.textContent =
      entryLabel(entry);

    identity.append(
      icon,
      name
    );

    const quantity =
      documentRef.createElement(
        "strong"
      );

    quantity.className =
      "dhct-caravan-view__entry-quantity";

    quantity.textContent =
      "?" +
      String(
        entry.quantity ?? 1
      );

    row.append(
      identity,
      quantity
    );

    entries.append(row);
  }

  if (
    !entries.children.length
  ) {
    const empty =
      documentRef.createElement(
        "p"
      );

    empty.textContent =
      "Zone FOB vide.";

    entries.append(empty);
  }

  panel.append(entries);

  return panel;
}

export function renderExpeditionCaravanView(
  projection,
  {
    documentRef =
      globalThis.document,
  } = {}
) {
  if (!documentRef) {
    throw new Error(
      "Caravan renderer requires a document."
    );
  }

  ensureCaravanStyles(
    documentRef
  );

  const model =
    buildExpeditionCaravanViewModel(
      projection
    );

  const root =
    documentRef.createElement(
      "section"
    );

  root.className =
    "dhct-caravan-view";

  if (model.empty) {
    const empty =
      documentRef.createElement(
        "div"
      );

    empty.className =
      "dhct-caravan-view__empty";

    empty.textContent =
      "Aucune caravane configur?e.";

    root.append(empty);

    return root;
  }

  root.dataset.caravanId =
    model.id ?? "";

  const board =
    documentRef.createElement(
      "section"
    );

  board.className =
    "dhct-caravan-view__board";

  const title =
    documentRef.createElement(
      "h3"
    );

  title.className =
    "dhct-caravan-view__board-title";

  title.textContent =
    model.name;

  board.append(title);

  if (model.assetSrc) {
    const image =
      documentRef.createElement(
        "img"
      );

    image.className =
      "dhct-caravan-view__asset";

    image.src =
      model.assetSrc;

    image.alt = "";

    board.append(image);
  }

  /*
   * Structural components not installed into cargo.
   * At present this primarily means the four wheels.
   */
  const cargoComponentIds =
    new Set(
      model.cargoSlots
        .map(
          (slot) =>
            slot.componentId
        )
        .filter(Boolean)
    );

  for (
    const component of
    model.components
  ) {
    if (
      cargoComponentIds.has(
        component.id
      )
    ) {
      continue;
    }

    board.append(
      renderComponent(
        component,
        documentRef
      )
    );
  }

  for (
    const slot of
    model.cargoSlots
  ) {
    board.append(
      renderCargoSlot(
        slot,
        documentRef
      )
    );
  }

  root.append(
    board,
    renderFobStorage(
      model.fobStorage,
      documentRef
    )
  );

  const detail =
    documentRef.createElement(
      "section"
    );

  detail.className =
    "dhct-caravan-view__detail";

  const detailTitle =
    documentRef.createElement(
      "h3"
    );

  detailTitle.textContent =
    "Composant s\u00e9lectionn\u00e9";

  const detailText =
    documentRef.createElement(
      "p"
    );

  detailText.textContent =
    "S\u00e9lectionnez une roue, un emplacement cargo ou un composant.";

  detail.append(
    detailTitle,
    detailText
  );

  root.append(detail);

  return root;
}

export const expeditionCaravanView = {
  buildModel:
    buildExpeditionCaravanViewModel,

  render:
    renderExpeditionCaravanView,
};
