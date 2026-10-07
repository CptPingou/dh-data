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

    .dhct-caravan-view__wheel-hp-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .25rem;
      white-space: nowrap;
    }

    .dhct-caravan-view__wheel-hp-button {
      width: 20px;
      height: 20px;
      min-width: 20px;
      padding: 0;
      border-radius: 50%;
      font-size: .72rem;
      line-height: 18px;
      text-align: center;
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

    .dhct-caravan-view__component,
    .dhct-caravan-view__cargo {
      cursor: pointer;
      transition:
        outline-color 120ms ease,
        box-shadow 120ms ease,
        transform 120ms ease;
    }

    .dhct-caravan-view__component.is-selected,
    .dhct-caravan-view__cargo.is-selected {
      outline:
        2px solid rgba(230, 195, 125, .95);
      outline-offset: 2px;
      box-shadow:
        0 0 0 2px rgba(0, 0, 0, .55);
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

    .dhct-caravan-view__detail-storage {
      margin-top: .65rem;
      padding-top: .6rem;
      border-top:
        1px solid rgba(220, 190, 135, .2);
    }

    .dhct-caravan-view__detail-storage h4 {
      margin:
        0 0 .45rem;
    }

    .dhct-caravan-view__detail-entries {
      display: grid;
      grid-template-columns:
        repeat(
          auto-fill,
          minmax(190px, 1fr)
        );
      gap: .4rem;
    }

    .dhct-caravan-view__detail-entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      min-width: 0;
      padding: .4rem .5rem;
      border:
        1px solid rgba(220, 190, 135, .35);
      border-radius: 4px;
      background:
        rgba(20, 18, 16, .32);
    }

    .dhct-caravan-view__detail-entry-identity {
      display: flex;
      align-items: center;
      gap: .45rem;
      min-width: 0;
    }

    .dhct-caravan-view__detail-entry-icon {
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dhct-caravan-view__detail-entry-icon img {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border: 0;
    }

    .dhct-caravan-view__detail-entry-name {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .dhct-caravan-view__detail-entry-quantity {
      flex: 0 0 auto;
    }

    .dhct-caravan-view__detail-storage-empty {
      margin: 0;
      opacity: .72;
    }

    .dhct-caravan-view__transfer {
      flex: 0 0 auto;
      margin-left: .4rem;
      padding: .2rem .45rem;
      font-size: .7rem;
      line-height: 1.1;
      white-space: nowrap;
    }

    .dhct-caravan-view__equipment-controls {
      display: flex;
      align-items: center;
      gap: .45rem;
      flex-wrap: wrap;
      margin-top: .7rem;
      padding-top: .65rem;
      border-top:
        1px solid rgba(220, 190, 135, .2);
    }

    .dhct-caravan-view__equipment-type {
      min-width: 140px;
    }

    .dhct-caravan-view__equipment-capacity {
      width: 85px;
    }

    .dhct-caravan-view__equipment-install,
    .dhct-caravan-view__equipment-remove {
      min-height: 30px;
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
  documentRef,
  {
    isGm = false,
  } = {}
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

    if (
      isGm &&
      component.type === "wheel"
    ) {
      const controls =
        documentRef.createElement(
          "div"
        );

      controls.className =
        "dhct-caravan-view__wheel-hp-controls";

      const createButton =
        (label, delta) => {
          const button =
            documentRef.createElement(
              "button"
            );

          button.type =
            "button";

          button.className =
            "dhct-caravan-view__wheel-hp-button";

          button.textContent =
            label;

          button.title =
            delta < 0
              ? "Endommager la roue"
              : "R?parer la roue";

          button.addEventListener(
            "pointerdown",
            (event) => {
              event.stopPropagation();
            }
          );

          button.addEventListener(
            "click",
            (event) => {
              event.preventDefault();
              event.stopPropagation();

              node.dispatchEvent(
                new CustomEvent(
                  "dhct-caravan-wheel-hp-change",
                  {
                    bubbles: true,

                    detail: {
                      componentId:
                        component.id,

                      delta,
                    },
                  }
                )
              );
            }
          );

          return button;
        };

      controls.append(
        createButton("-", -1),
        hp,
        createButton("+", 1)
      );

      node.append(
        controls
      );
    } else {
      node.append(
        hp
      );
    }
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
      "x" +
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

export function buildCaravanSelectionDetail(
  model,
  selection
) {
  if (!selection) {
    return {
      kind: null,
      id: null,
      title:
        "Composant s\u00e9lectionn\u00e9",
      lines: [
        "S\u00e9lectionnez une roue, un emplacement cargo ou un composant."
      ],
      storage: null,
    };
  }

  if (
    selection.kind === "component"
  ) {
    const component =
      (model?.components ?? [])
        .find(
          (candidate) =>
            candidate.id ===
            selection.id
        ) ?? null;

    if (!component) {
      return {
        kind:
          "component",
        id:
          selection.id,
        title:
          "Composant introuvable",
        lines: [],
        storage: null,
      };
    }

    const lines = [
      "Type : " +
        String(
          component.type ??
          "generic"
        ),
    ];

    if (
      component.hp?.max != null
    ) {
      lines.push(
        "PV : " +
        String(
          component.hp.value ?? 0
        ) +
        "/" +
        String(
          component.hp.max ?? 0
        )
      );
    }

    return {
      kind:
        "component",
      id:
        component.id,
      title:
        component.name ??
        component.id,
      lines,
      storage:
        component.storage ??
        null,
    };
  }

  if (
    selection.kind === "cargo"
  ) {
    const slot =
      (model?.cargoSlots ?? [])
        .find(
          (candidate) =>
            candidate.id ===
            selection.id
        ) ?? null;

    if (!slot) {
      return {
        kind:
          "cargo",
        id:
          selection.id,
        title:
          "Emplacement introuvable",
        lines: [],
        storage: null,
      };
    }

    if (!slot.component) {
      return {
        kind:
          "cargo",
        id:
          slot.id,
        title:
          slot.name ??
          slot.id,
        lines: [
          "Emplacement vide"
        ],
        storage: null,
      };
    }

    const component =
      slot.component;

    const lines = [];

    if (
      component.hp?.max != null
    ) {
      lines.push(
        "PV : " +
        String(
          component.hp.value ?? 0
        ) +
        "/" +
        String(
          component.hp.max ?? 0
        )
      );
    }

    const capacity =
      capacityLabel(
        component.storage
      );

    if (capacity) {
      lines.push(
        "Stockage : " +
        capacity
      );
    }

    return {
      kind:
        "cargo",
      id:
        slot.id,
      title:
        (
          slot.name ??
          slot.id
        ) +
        " ? " +
        (
          component.name ??
          component.id
        ),
      lines,
      storage:
        component.storage ??
        null,
    };
  }

  return {
    kind:
      selection.kind ?? null,
    id:
      selection.id ?? null,
    title:
      "S\u00e9lection inconnue",
    lines: [],
    storage: null,
  };
}

function renderSelectedStorage(
  storage,
  documentRef
) {
  const section =
    documentRef.createElement(
      "section"
    );

  section.className =
    "dhct-caravan-view__detail-storage";

  if (!storage) {
    return section;
  }

  section.dataset.containerId =
    storage.containerId ?? "";

  const heading =
    documentRef.createElement(
      "h4"
    );

  heading.textContent =
    "Contenu";

  section.append(
    heading
  );

  const entries =
    documentRef.createElement(
      "div"
    );

  entries.className =
    "dhct-caravan-view__detail-entries";

  for (
    const entry of
    storage.entries ?? []
  ) {
    const row =
      documentRef.createElement(
        "div"
      );

    row.className =
      "dhct-caravan-view__detail-entry";

    row.dataset.containerId =
      storage.containerId ?? "";

    row.dataset.entryId =
      entry.entryId ?? "";

    const identity =
      documentRef.createElement(
        "span"
      );

    identity.className =
      "dhct-caravan-view__detail-entry-identity";

    const icon =
      documentRef.createElement(
        "span"
      );

    icon.className =
      "dhct-caravan-view__detail-entry-icon";

    if (entry?.item?.img) {
      const image =
        documentRef.createElement(
          "img"
        );

      image.src =
        entry.item.img;

      image.alt = "";

      icon.append(
        image
      );
    }

    const name =
      documentRef.createElement(
        "span"
      );

    name.className =
      "dhct-caravan-view__detail-entry-name";

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
      "dhct-caravan-view__detail-entry-quantity";

    quantity.textContent =
      "x" +
      String(
        entry.quantity ?? 1
      );

    row.append(
      identity,
      quantity
    );

    entries.append(
      row
    );
  }

  if (
    !entries.children.length
  ) {
    const empty =
      documentRef.createElement(
        "p"
      );

    empty.className =
      "dhct-caravan-view__detail-storage-empty";

    empty.textContent =
      "Conteneur vide.";

    entries.append(
      empty
    );
  }

  section.append(
    entries
  );

  return section;
}

function refreshCaravanTransferControls({
  root,
  detail,
  model,
  selection,
  documentRef,
} = {}) {
  if (
    !(root instanceof HTMLElement) ||
    !(detail instanceof HTMLElement)
  ) {
    return;
  }

  for (
    const node of
      root.querySelectorAll(
        "[data-dhct-caravan-transfer]"
      )
  ) {
    node.remove();
  }

  const fobStorage =
    model?.fobStorage ?? null;

  if (
    !fobStorage?.containerId ||
    !selection
  ) {
    return;
  }

  const detailModel =
    buildCaravanSelectionDetail(
      model,
      selection
    );

  const cargoStorage =
    detailModel?.storage ?? null;

  if (!cargoStorage?.containerId) {
    return;
  }

  /*
   * FOB -> cargo s?lectionn?.
   */
  for (
    const row of
      root.querySelectorAll(
        ".dhct-caravan-view__fob " +
        ".dhct-caravan-view__entry[data-entry-id]"
      )
  ) {
    const entryId =
      row.dataset.entryId ?? "";

    if (!entryId) {
      continue;
    }

    const entry =
      (fobStorage.entries ?? [])
        .find(
          (candidate) =>
            candidate?.entryId ===
            entryId
        );

    const button =
      documentRef.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "dhct-caravan-view__transfer";

    button.dataset.dhctCaravanTransfer =
      "fob-to-cargo";

    button.textContent =
      "\u2192 Cargo";

    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        root.dispatchEvent(
          new CustomEvent(
            "dhct-inventory-transfer-request",
            {
              bubbles: true,

              detail: {
                fromContainerId:
                  fobStorage.containerId,

                toContainerId:
                  cargoStorage.containerId,

                entryId,

                quantity:
                  Math.max(
                    1,
                    Number(
                      entry?.quantity
                    ) || 1
                  ),
              },
            }
          )
        );
      }
    );

    row.append(button);
  }

  /*
   * Cargo s?lectionn? -> FOB.
   */
  for (
    const row of
      detail.querySelectorAll(
        ".dhct-caravan-view__detail-entry" +
        "[data-entry-id]" +
        "[data-container-id]"
      )
  ) {
    const entryId =
      row.dataset.entryId ?? "";

    const fromContainerId =
      row.dataset.containerId ?? "";

    if (
      !entryId ||
      !fromContainerId ||
      fromContainerId !==
        cargoStorage.containerId
    ) {
      continue;
    }

    const entry =
      (cargoStorage.entries ?? [])
        .find(
          (candidate) =>
            candidate?.entryId ===
            entryId
        );

    const button =
      documentRef.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "dhct-caravan-view__transfer";

    button.dataset.dhctCaravanTransfer =
      "cargo-to-fob";

    button.textContent =
      "\u2192 FOB";

    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        root.dispatchEvent(
          new CustomEvent(
            "dhct-inventory-transfer-request",
            {
              bubbles: true,

              detail: {
                fromContainerId,

                toContainerId:
                  fobStorage.containerId,

                entryId,

                quantity:
                  Math.max(
                    1,
                    Number(
                      entry?.quantity
                    ) || 1
                  ),
              },
            }
          )
        );
      }
    );

    row.append(button);
  }
}

function renderCaravanEquipmentControls(
  detailModel,
  {
    documentRef,
    root,
  }
) {
  const controls =
    documentRef.createElement(
      "section"
    );

  controls.className =
    "dhct-caravan-view__equipment-controls";

  if (
    detailModel?.kind !==
      "cargo"
  ) {
    return controls;
  }

  if (detailModel.storage != null) {
    const remove =
      documentRef.createElement(
        "button"
      );

    remove.type =
      "button";

    remove.className =
      "dhct-caravan-view__equipment-remove";

    remove.textContent =
      "Retirer le composant";

    remove.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        root.dispatchEvent(
          new CustomEvent(
            "dhct-caravan-equipment-remove",
            {
              bubbles: true,

              detail: {
                slotId:
                  detailModel.id,
              },
            }
          )
        );
      }
    );

    controls.append(
      remove
    );

    return controls;
  }

  if (
    !detailModel.lines
      ?.includes(
        "Emplacement vide"
      )
  ) {
    return controls;
  }

  const select =
    documentRef.createElement(
      "select"
    );

  select.className =
    "dhct-caravan-view__equipment-type";

  for (
    const optionData of [
      {
        value: "chest",
        label: "Coffre",
        storage: true,
      },
      {
        value: "barrel",
        label: "Tonneau",
        storage: true,
      },
      {
        value: "stretcher",
        label: "Civi\u00e8re",
        storage: false,
      },
    ]
  ) {
    const option =
      documentRef.createElement(
        "option"
      );

    option.value =
      optionData.value;

    option.textContent =
      optionData.label;

    option.dataset.storage =
      optionData.storage
        ? "1"
        : "0";

    select.append(
      option
    );
  }

  const capacity =
    documentRef.createElement(
      "input"
    );

  capacity.type =
    "number";

  capacity.min =
    "1";

  capacity.step =
    "1";

  capacity.placeholder =
    "Slots";

  capacity.className =
    "dhct-caravan-view__equipment-capacity";

  const install =
    documentRef.createElement(
      "button"
    );

  install.type =
    "button";

  install.className =
    "dhct-caravan-view__equipment-install";

  install.textContent =
    "Installer";

  const refreshCapacityState =
    () => {
      const selected =
        select.selectedOptions?.[0];

      const storage =
        selected?.dataset
          ?.storage === "1";

      capacity.disabled =
        !storage;

      capacity.required =
        storage;

      if (!storage) {
        capacity.value = "";
      }
    };

  refreshCapacityState();

  select.addEventListener(
    "change",
    refreshCapacityState
  );

  install.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const selected =
        select.selectedOptions?.[0];

      const storage =
        selected?.dataset
          ?.storage === "1";

      const capacitySlots =
        storage
          ? Number(
              capacity.value
            )
          : null;

      if (
        storage &&
        (
          !Number.isInteger(
            capacitySlots
          ) ||
          capacitySlots < 1
        )
      ) {
        globalThis.ui
          ?.notifications
          ?.warn(
            "Indiquez une capacit\u00e9 en slots."
          );

        return;
      }

      root.dispatchEvent(
        new CustomEvent(
          "dhct-caravan-equipment-install",
          {
            bubbles: true,

            detail: {
              slotId:
                detailModel.id,

              definitionId:
                select.value,

              capacitySlots,
            },
          }
        )
      );
    }
  );

  controls.append(
    select,
    capacity,
    install
  );

  return controls;
}

export function renderExpeditionCaravanView(
  projection,
  {
    documentRef =
      globalThis.document,

    isGm = false,
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
        documentRef,
        {
          isGm,
        }
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

  root.append(detail);

  let selection = null;

  function updateSelectionVisuals() {
    for (
      const node of
      board.querySelectorAll(
        ".is-selected"
      )
    ) {
      node.classList.remove(
        "is-selected"
      );
    }

    if (!selection) {
      return;
    }

    const selector =
      selection.kind ===
        "component"
        ? (
            '[data-component-id="' +
            CSS.escape(selection.id) +
            '"]'
          )
        : (
            '[data-cargo-slot-id="' +
            CSS.escape(selection.id) +
            '"]'
          );

    const selectedNode =
      board.querySelector(
        selector
      );

    selectedNode?.classList.add(
      "is-selected"
    );
  }

  function renderDetail() {
    const detailModel =
      buildCaravanSelectionDetail(
        model,
        selection
      );

    detail.replaceChildren();

    const detailTitle =
      documentRef.createElement(
        "h3"
      );

    detailTitle.textContent =
      detailModel.title;

    detail.append(
      detailTitle
    );

    for (
      const line of
      detailModel.lines
    ) {
      const paragraph =
        documentRef.createElement(
          "p"
        );

      paragraph.textContent =
        line;

      detail.append(
        paragraph
      );
    }

    delete detail.dataset
      .containerId;

    if (detailModel.storage) {
      detail.dataset.containerId =
        detailModel.storage
          .containerId ?? "";

      detail.append(
        renderSelectedStorage(
          detailModel.storage,
          documentRef
        )
      );
    }

    refreshCaravanTransferControls({
      root,
      detail,
      model,
      selection,
      documentRef,
    });

    if (isGm) {
      const controls =
        renderCaravanEquipmentControls(
          detailModel,
          {
            documentRef,
            root,
          }
        );

      if (
        controls.children.length
      ) {
        detail.append(
          controls
        );
      }
    }
  }

  for (
    const componentNode of
    board.querySelectorAll(
      "[data-component-id]"
    )
  ) {
    componentNode.addEventListener(
      "click",
      () => {
        selection = {
          kind:
            "component",
          id:
            componentNode.dataset
              .componentId,
        };

        updateSelectionVisuals();
        renderDetail();
      }
    );
  }

  for (
    const cargoNode of
    board.querySelectorAll(
      "[data-cargo-slot-id]"
    )
  ) {
    cargoNode.addEventListener(
      "click",
      () => {
        selection = {
          kind:
            "cargo",
          id:
            cargoNode.dataset
              .cargoSlotId,
        };

        updateSelectionVisuals();
        renderDetail();
      }
    );
  }

  renderDetail();

  return root;
}

export const expeditionCaravanView = {
  buildModel:
    buildExpeditionCaravanViewModel,

  buildSelectionDetail:
    buildCaravanSelectionDetail,

  render:
    renderExpeditionCaravanView,
};
