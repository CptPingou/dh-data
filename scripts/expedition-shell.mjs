const DEFAULT_TAB = "expedition";

export const EXPEDITION_TABS = Object.freeze([
  {
    id: "expedition",
    label: "Expédition",
  },
  {
    id: "inventory",
    label: "Inventaire",
  },
  {
    id: "fob",
    label: "FOB",
  },
  {
    id: "caravan",
    label: "Caravane",
  },
  {
    id: "workshop",
    label: "Atelier",
  },
  {
    id: "research",
    label: "Recherche",
  },
]);

function normalizedTabId(tabId) {
  const candidate =
    String(tabId ?? "").trim();

  return EXPEDITION_TABS.some(
    (tab) => tab.id === candidate
  )
    ? candidate
    : DEFAULT_TAB;
}

export function activateExpeditionShellTab(
  shell,
  tabId
) {
  if (!(shell instanceof HTMLElement)) {
    return {
      green: false,
      reason: "shell-not-found",
    };
  }

  const activeTab =
    normalizedTabId(tabId);

  for (
    const button
    of shell.querySelectorAll(
      "[data-dhct-expedition-tab]"
    )
  ) {
    const active =
      button.dataset.dhctExpeditionTab ===
      activeTab;

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-selected",
      active ? "true" : "false"
    );

    button.tabIndex =
      active ? 0 : -1;
  }

  for (
    const pane
    of shell.querySelectorAll(
      "[data-dhct-expedition-pane]"
    )
  ) {
    const active =
      pane.dataset.dhctExpeditionPane ===
      activeTab;

    pane.hidden = !active;
  }

  shell.dataset.dhctActiveTab =
    activeTab;

  return {
    green: true,
    activeTab,
  };
}

function makeTabButton({
  id,
  label,
}) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "dhct-expedition-shell__tab";

  button.dataset.dhctExpeditionTab =
    id;

  button.setAttribute(
    "role",
    "tab"
  );

  button.setAttribute(
    "aria-selected",
    "false"
  );

  button.tabIndex = -1;
  button.textContent = label;

  return button;
}

function makePane(tabId) {
  const pane =
    document.createElement("section");

  pane.className =
    "dhct-expedition-shell__pane";

  pane.dataset.dhctExpeditionPane =
    tabId;

  pane.setAttribute(
    "role",
    "tabpanel"
  );

  pane.hidden = true;

  return pane;
}

export function createExpeditionShell({
  activeTab = DEFAULT_TAB,
  canManage = false,
} = {}) {
  const shell =
    document.createElement("div");

  shell.className =
    "dhct-expedition-shell";

  const header =
    document.createElement("header");

  header.className =
    "dhct-expedition-shell__header";

  const nav =
    document.createElement("nav");

  nav.className =
    "dhct-expedition-shell__nav";

  nav.setAttribute(
    "role",
    "tablist"
  );

  const panes =
    document.createElement("div");

  panes.className =
    "dhct-expedition-shell__panes";

  for (const tab of EXPEDITION_TABS) {
    const button =
      makeTabButton(tab);

    const pane =
      makePane(tab.id);

    button.addEventListener(
      "click",
      () => {
        activateExpeditionShellTab(
          shell,
          tab.id
        );
      }
    );

    nav.append(button);
    panes.append(pane);
  }

  header.append(nav);

  if (canManage) {
    const gmButton =
      document.createElement("button");

    gmButton.type = "button";
    gmButton.className =
      "dhct-expedition-shell__gm";

    gmButton.dataset.dhctExpeditionGm =
      "1";

    gmButton.setAttribute(
      "aria-label",
      "Administration MJ"
    );

    gmButton.innerHTML =
      '<i class="fa-solid fa-gear"></i> MJ';

    header.append(gmButton);
  }

  shell.append(
    header,
    panes
  );

  activateExpeditionShellTab(
    shell,
    activeTab
  );

  return shell;
}

export function setExpeditionShellTabVisibility(
  shell,
  tabId,
  visible,
  {
    fallbackTab = DEFAULT_TAB,
  } = {}
) {
  if (!(shell instanceof HTMLElement)) {
    return {
      green: false,
      reason: "shell-not-found",
    };
  }

  const normalized =
    normalizedTabId(tabId);

  const button =
    shell.querySelector(
      '[data-dhct-expedition-tab="' +
      CSS.escape(normalized) +
      '"]'
    );

  const pane =
    shell.querySelector(
      '[data-dhct-expedition-pane="' +
      CSS.escape(normalized) +
      '"]'
    );

  if (
    !(button instanceof HTMLElement) ||
    !(pane instanceof HTMLElement)
  ) {
    return {
      green: false,
      reason: "tab-not-found",
      tabId: normalized,
    };
  }

  const shown =
    Boolean(visible);

  button.hidden =
    !shown;

  button.setAttribute(
    "aria-hidden",
    shown
      ? "false"
      : "true"
  );

  if (!shown) {
    pane.hidden = true;

    if (
      shell.dataset.dhctActiveTab ===
      normalized
    ) {
      const fallback =
        normalizedTabId(
          fallbackTab
        );

      const fallbackButton =
        shell.querySelector(
          '[data-dhct-expedition-tab="' +
          CSS.escape(fallback) +
          '"]'
        );

      if (
        fallbackButton instanceof
          HTMLElement &&
        !fallbackButton.hidden
      ) {
        activateExpeditionShellTab(
          shell,
          fallback
        );
      }
    }
  }

  return {
    green: true,
    tabId: normalized,
    visible: shown,
  };
}

export function expeditionShellPane(
  shell,
  tabId
) {
  if (!(shell instanceof HTMLElement)) {
    return null;
  }

  const normalized =
    normalizedTabId(tabId);

  return shell.querySelector(
    `[data-dhct-expedition-pane="${CSS.escape(normalized)}"]`
  );
}

export const expeditionShellApi =
  Object.freeze({
    tabs: EXPEDITION_TABS,
    create:
      createExpeditionShell,
    activate:
      activateExpeditionShellTab,
    setTabVisibility:
      setExpeditionShellTabVisibility,
    pane:
      expeditionShellPane,
  });
