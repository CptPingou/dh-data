function text(value, fallback = "—") {
  const normalized =
    String(value ?? "").trim();

  return normalized || fallback;
}

function makeSection(title, kind = null) {
  const section =
    document.createElement("section");

  section.className =
    "dhct-expedition-view__section";

  if (kind) {
    section.classList.add(
      `dhct-expedition-view__section--${kind}`
    );
  }

  const heading =
    document.createElement("h3");

  heading.textContent = title;

  const body =
    document.createElement("div");

  body.className =
    "dhct-expedition-view__section-body";

  section.append(
    heading,
    body
  );

  return {
    section,
    body,
  };
}

function makeMetric(label, value) {
  const row =
    document.createElement("div");

  row.className =
    "dhct-expedition-view__metric";

  const key =
    document.createElement("span");

  key.className =
    "dhct-expedition-view__metric-label";

  key.textContent = label;

  const content =
    document.createElement("span");

  content.className =
    "dhct-expedition-view__metric-value";

  content.textContent = value;

  row.append(
    key,
    content
  );

  return row;
}

function phaseLabel(value) {
  const phases = {
    prepared: "Pr\u00e9paration",
    in_session: "En chasse",
    returned: "Retour",
  };

  return phases[value] ?? text(value);
}

function capacityLabel({
  used = 0,
  capacity = 0,
} = {}) {
  return `${used} / ${capacity}`;
}

function renderHunters(hunters) {
  const { section, body } =
    makeSection("Chasseurs", "hunters");

  body.classList.add(
    "dhct-expedition-view__hunters"
  );

  if (!hunters.length) {
    body.append(
      makeMetric(
        "Affectation",
        "Aucun chasseur"
      )
    );

    return section;
  }

  for (const hunter of hunters) {
    const card =
      document.createElement("article");

    card.className =
      "dhct-expedition-view__hunter";

    const name =
      document.createElement("h4");

    name.textContent =
      text(hunter?.name, "Chasseur");

    card.append(
      name,
      makeMetric(
        "Sac",
        capacityLabel(
          hunter?.backpack
        )
      )
    );

    body.append(card);
  }

  return section;
}

function renderLogistics(logistics) {
  const { section, body } =
    makeSection("Logistique", "logistics");

  for (
    const [key, label]
    of [
      ["fob", "FOB"],
      ["caravan", "Caravane"],
    ]
  ) {
    const state =
      logistics?.[key];

    body.append(
      makeMetric(
        label,
        state?.available
          ? capacityLabel(state)
          : "Indisponible"
      )
    );
  }

  return section;
}

function renderMaterials(materials) {
  const { section, body } =
    makeSection("Matériaux trouvés");

  body.classList.add(
    "dhct-expedition-view__materials"
  );

  if (!materials.length) {
    body.append(
      makeMetric(
        "Matériaux",
        "Aucun matériau"
      )
    );

    return section;
  }

  for (const material of materials) {
    const item =
      document.createElement("div");

    item.className =
      "dhct-expedition-view__material";

    const name =
      document.createElement("span");

    name.textContent =
      text(
        material?.name,
        material?.materialId
      );

    const quantity =
      document.createElement("span");

    quantity.textContent =
      `×${Math.max(
        0,
        Number(material?.quantity) || 0
      )}`;

    item.append(
      name,
      quantity
    );

    body.append(item);
  }

  return section;
}

function readinessLabel(value) {
  return value ? "✓" : "—";
}

function renderReadiness(readiness) {
  const { section, body } =
    makeSection(
      "Préparation de l’expédition"
    );

  body.classList.add(
    "dhct-expedition-view__readiness"
  );

  const states = [
    [
      "Manifeste préparé",
      readiness?.prepared,
    ],
    [
      "Chasseurs affectés",
      readiness?.huntersAssigned,
    ],
    [
      "FOB disponible",
      readiness?.fobAvailable,
    ],
    [
      "Caravane disponible",
      readiness?.caravanAvailable,
    ],
  ];

  for (const [label, state] of states) {
    body.append(
      makeMetric(
        label,
        readinessLabel(state)
      )
    );
  }

  return section;
}

export function renderExpeditionView(
  projection
) {
  if (!projection?.expedition?.id) {
    throw new Error(
      "Expedition view requires a dashboard projection."
    );
  }

  const root =
    document.createElement("section");

  root.className =
    "dhct-expedition-view";

  root.dataset.expeditionId =
    projection.expedition.id;

  const header =
    document.createElement("header");

  header.className =
    "dhct-expedition-view__header";

  const title =
    document.createElement("h2");

  title.textContent =
    text(
      projection.expedition.name,
      projection.expedition.id
    );

  const phase =
    makeMetric(
      "Phase",
      phaseLabel(projection.expedition.phase)
    );

  header.append(
    title,
    phase
  );

  const overview =
    document.createElement("div");

  overview.className =
    "dhct-expedition-view__overview";

  overview.append(
    renderHunters(
      projection.hunters ?? []
    ),
    renderLogistics(
      projection.logistics ?? {}
    )
  );

  root.append(
    header,
    overview,
    renderMaterials(
      projection.materials ?? []
    ),
    renderReadiness(
      projection.readiness ?? {}
    )
  );

  return root;
}