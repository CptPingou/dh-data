const MODULE_ID =
  "daggerheart-campaign-toolkit";

const PANEL_ID =
  "dhct-fob-turn-panel";

let installed = false;

function getApi() {
  return game.modules
    .get(MODULE_ID)
    ?.api?.fob ?? null;
}

function status() {
  return getApi()?.status?.() ?? null;
}

function removePanel() {
  document
    .getElementById(PANEL_ID)
    ?.remove();
}

function findControlButton() {
  return (
    document.querySelector(
      '[data-tool="dhctFobTurn"]'
    ) ??
    document.querySelector(
      '[data-tool="dhct-fob-turn"]'
    )
  );
}

function positionPanel(
  panel,
  anchor
) {
  if (!(anchor instanceof HTMLElement)) {
    return;
  }

  const rect =
    anchor.getBoundingClientRect();

  panel.style.position =
    "fixed";

  panel.style.left =
    `${Math.round(rect.right + 8)}px`;

  panel.style.top =
    `${Math.round(rect.top)}px`;

  panel.style.zIndex =
    "1000";
}

function panelMarkup(turn) {
  return `
    <div
      class="dhct-fob-turn-editor"
      style="
        display:flex;
        align-items:center;
        gap:4px;
        padding:6px;
        border:1px solid var(--color-border-light-primary);
        border-radius:6px;
        background:var(--color-bg);
        box-shadow:0 2px 8px rgba(0,0,0,.35);
      "
    >
      <button
        type="button"
        data-dhct-fob-action="minus"
        title="Corriger : retirer un tour FOB"
        style="
          width:32px;
          min-width:32px;
          height:32px;
          padding:0;
        "
      >
        <i class="fa-solid fa-minus"></i>
      </button>

      <input
        type="number"
        data-dhct-fob-turn
        min="0"
        step="1"
        value="${turn}"
        aria-label="Numéro du tour de FOB"
        title="Saisir directement le numéro du tour FOB"
        style="
          width:72px;
          height:32px;
          text-align:center;
        "
      />

      <button
        type="button"
        data-dhct-fob-action="plus"
        title="Avancer d'un tour FOB"
        style="
          width:32px;
          min-width:32px;
          height:32px;
          padding:0;
        "
      >
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>
  `;
}

async function refreshPanel(
  panel
) {
  const state =
    status();

  const input =
    panel.querySelector(
      "[data-dhct-fob-turn]"
    );

  if (
    input &&
    state?.green
  ) {
    input.value =
      String(state.turn);
  }
}

async function execute(
  panel,
  operation
) {
  const api =
    getApi();

  if (!api) {
    ui.notifications?.error(
      "Campaign Toolkit : runtime FOB indisponible."
    );
    return;
  }

  let result;

  if (operation === "plus") {
    result =
      await api.advanceTurn();
  }

  if (operation === "minus") {
    const current =
      api.status();

    if (
      !current?.green ||
      current.turn <= 0
    ) {
      await refreshPanel(panel);
      return;
    }

    result =
      await api.correctTurn(
        current.turn - 1
      );
  }

  if (!result?.green) {
    ui.notifications?.warn(
      `Campaign Toolkit : ${result?.reason ?? "opération FOB refusée"}.`
    );

    await refreshPanel(panel);
    return;
  }

  await refreshPanel(panel);
}

async function commitInput(
  panel
) {
  const api =
    getApi();

  const input =
    panel.querySelector(
      "[data-dhct-fob-turn]"
    );

  if (!api || !input) return;

  const target =
    Number(input.value);

  if (
    !Number.isSafeInteger(target) ||
    target < 0
  ) {
    ui.notifications?.warn(
      "Le numéro du tour FOB doit être un entier positif ou nul."
    );

    await refreshPanel(panel);
    return;
  }

  const before =
    api.status();

  input.disabled =
    true;

  try {
    const result =
      await api.setTurn(target);

    if (!result?.green) {
      ui.notifications?.warn(
        `Campaign Toolkit : ${result?.reason ?? "modification refusée"}.`
      );
      return;
    }

    if (
      target > before.turn
    ) {
      ui.notifications?.info(
        `FOB : ${before.turn} → ${target} (${target - before.turn} tour(s) avancé(s)).`
      );
    } else if (
      target < before.turn
    ) {
      ui.notifications?.info(
        `FOB : compteur corrigé ${before.turn} → ${target}.`
      );
    }
  } finally {
    input.disabled =
      false;

    await refreshPanel(panel);
  }
}

function openPanel() {
  const existing =
    document.getElementById(
      PANEL_ID
    );

  if (existing) {
    removePanel();
    return;
  }

  const state =
    status();

  if (!state?.green) {
    ui.notifications?.warn(
      "Campaign Toolkit : compteur FOB indisponible."
    );
    return;
  }

  const panel =
    document.createElement("div");

  panel.id =
    PANEL_ID;

  panel.innerHTML =
    panelMarkup(state.turn);

  document.body.appendChild(
    panel
  );

  positionPanel(
    panel,
    findControlButton()
  );

  panel.addEventListener(
    "click",
    async (event) => {
      const button =
        event.target.closest(
          "[data-dhct-fob-action]"
        );

      if (!button) return;

      button.disabled =
        true;

      try {
        await execute(
          panel,
          button.dataset
            .dhctFobAction
        );
      } catch (error) {
        console.error(
          `${MODULE_ID} | FOB control failed`,
          error
        );

        ui.notifications?.error(
          `Campaign Toolkit : ${error.message}`
        );
      } finally {
        if (button.isConnected) {
          button.disabled =
            false;
        }
      }
    }
  );

  const input =
    panel.querySelector(
      "[data-dhct-fob-turn]"
    );

  input?.addEventListener(
    "keydown",
    async (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      await commitInput(
        panel
      );

      input.blur();
    }
  );

  input?.addEventListener(
    "change",
    async () => {
      await commitInput(
        panel
      );
    }
  );
}

export function registerFobTurnControls() {
  if (installed) {
    return {
      green: true,
      installed: true,
      duplicate: true,
    };
  }

  installed = true;

  Hooks.on(
    "getSceneControlButtons",
    (controls) => {
      if (!game.user?.isGM) {
        return;
      }

      const tokenControl =
        controls?.tokens;

      if (!tokenControl?.tools) {
        return;
      }

      tokenControl.tools.dhctFobTurn = {
        name: "dhctFobTurn",
        title: "Tours de FOB",
        icon:
          "fa-solid fa-hourglass-half",
        order:
          Object.keys(
            tokenControl.tools
          ).length,
        button: true,
        visible: true,

        onChange: () => {
          openPanel();
        },
      };
    }
  );

  Hooks.on(
    "canvasTearDown",
    () => removePanel()
  );

  return {
    green: true,
    installed: true,
    duplicate: false,
  };
}
