/**
 * P2.13c.1 — native short/long rest bridge + Artificer infusion action.
 *
 * Long rest:
 *   - expire existing recipient infusions on committed native card
 *   - then render the Infuse action
 *
 * Short rest:
 *   - does not expire infusions
 *   - renders the same Infuse action
 *
 * P2.13c.1 UI authority:
 *   - GM-side only
 *   - player/socket authority comes later
 */

import {
  expireForNativeLongRest,
} from "./artificer-infusion-runtime.mjs";

const SCOPE =
  "daggerheart-campaign-toolkit";

const CLASS_ID =
  "homebrew.artificer.class.artificer";

const FEATURE_ID =
  "homebrew.artificer.class.artificer.feature.infusions-d-artificier";

let createHookId =
  null;

let renderHookId =
  null;

let queued =
  Promise.resolve();

const processing =
  new Set();


/**
 * P2.13h.4a - downtime dialog scroll fix
 *
 * Daggerheart's downtime dialog can exceed the available
 * window-content height while that container remains
 * overflow:hidden. This clips native validation controls
 * for actors exposing many refreshable resources.
 */
function installDowntimeDialogScrollFix() {
  const styleId =
    "dhct-downtime-dialog-scroll-fix";

  if (
    document.getElementById(
      styleId
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    styleId;

  style.textContent = `
.application.daggerheart.views.dh-style.dialog.downtime
  > .window-content {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    min-height: 0 !important;
  }

.application.daggerheart.views.dh-style.dialog.downtime
  [id$="-downtime"] {
    min-height: 0 !important;
  }
`;

  document.head.append(
    style
  );
}


function leadGM() {
  const activeGMs =
    (game.users?.contents ?? [])
      .filter(
        user =>
          user.active &&
          user.isGM
      )
      .sort(
        (a, b) =>
          String(a.id)
            .localeCompare(
              String(b.id)
            )
      );

  return (
    activeGMs[0]?.id ===
    game.user?.id
  );
}


function actorHasArtificer(actor) {
  return Boolean(
    actor?.items?.some?.(
      item =>
        [
          CLASS_ID,
          FEATURE_ID,
        ].includes(
          item.flags?.[SCOPE]?.sourceId
        )
    )
  );
}


/**
 * Strict shared detector for committed native downtime cards.
 *
 * Returns:
 * {
 *   actorUuid,
 *   actor,
 *   restType: "short" | "long"
 * }
 */
export function nativeRestContext(
  message
) {
  if (
    !message ||
    message.type !== "base"
  ) {
    return null;
  }

  if (
    !/<div\s+class=["'][^"']*\bdaggerheart\b[^"']*\bchat\b[^"']*\bdowntime\b/
      .test(
        String(
          message.content ?? ""
        )
      )
  ) {
    return null;
  }

  const system =
    message.system;

  const actorUuid =
    system?.actor;

  if (
    typeof actorUuid !== "string" ||
    !/^Actor\.[^.]+$/.test(
      actorUuid
    )
  ) {
    return null;
  }

  if (
    message.speaker?.actor !==
    actorUuid.slice(6)
  ) {
    return null;
  }

  const actor =
    game.actors?.get?.(
      actorUuid.slice(6)
    );

  if (!actor) {
    return null;
  }

  const moves =
    system?.moves;

  if (
    !Array.isArray(moves) ||
    moves.length === 0
  ) {
    return null;
  }

  const paths =
    moves.map(
      move =>
        move?.movePath
    );

  if (
    !paths.every(
      path =>
        typeof path === "string"
    )
  ) {
    return null;
  }

  if (
    paths.every(
      path =>
        path.startsWith(
          "longRest.moves."
        )
    )
  ) {
    return {
      actorUuid,
      actor,
      restType: "long",
    };
  }

  if (
    paths.every(
      path =>
        path.startsWith(
          "shortRest.moves."
        )
    )
  ) {
    return {
      actorUuid,
      actor,
      restType: "short",
    };
  }

  return null;
}


/**
 * Backward-compatible detector used by existing tests / callers.
 */
export function nativeLongRestRecipient(
  message
) {
  const context =
    nativeRestContext(
      message
    );

  return (
    context?.restType === "long"
      ? context.actorUuid
      : null
  );
}


function htmlRoot(html) {
  if (
    html instanceof HTMLElement
  ) {
    return html;
  }

  if (
    html?.[0] instanceof HTMLElement
  ) {
    return html[0];
  }

  return null;
}


function toolkitApi() {
  return (
    game.modules
      .get(SCOPE)
      ?.api ??
    null
  );
}


function initializedWeapons(api) {
  const result = [];

  for (
    const actor
    of game.actors?.contents ?? []
  ) {
    for (
      const weapon
      of actor.items?.contents ?? []
    ) {
      if (
        weapon.type !== "weapon"
      ) {
        continue;
      }

      try {
        const state =
          api?.weaponAugmentState
            ?.get?.(
              weapon
            );

        if (
          !state?.initialized
        ) {
          continue;
        }

        result.push({
          actor,
          weapon,
        });
      } catch {
        // Not a supported Motherboard weapon.
      }
    }
  }

  return result;
}


function escapeHtml(value) {
  const div =
    document.createElement("div");

  div.textContent =
    String(value ?? "");

  return div.innerHTML;
}


/** P2.13h.3 - player infusion authority */
async function openInfusionDialog(
  artificer,
  restType
) {
  /** P2.13c.3b ? dynamic infusion eligibility UI */

  const api =
    toolkitApi();

  if (
    !api?.artificerInfusion ||
    !api?.artificerInfusionAuthority ||
    !api?.weaponAugmentState
  ) {
    ui.notifications?.error(
      "Campaign Toolkit : API d'infusion indisponible."
    );

    return;
  }

  const catalog =
    await api.artificerInfusion
      .availableAugments(
        artificer
      );

  const weapons =
    initializedWeapons(
      api
    );

  if (
    weapons.length === 0
  ) {
    ui.notifications?.warn(
      "Campaign Toolkit : aucune arme de chasse Motherboard initialisee."
    );

    return;
  }

  if (
    !Array.isArray(
      catalog?.augments
    ) ||
    catalog.augments.length === 0
  ) {
    ui.notifications?.warn(
      "Campaign Toolkit : aucun augment accessible a cet Artificier."
    );

    return;
  }


  function eligibleAugments(
    weapon
  ) {
    if (
      !weapon ||
      weapon.type !== "weapon"
    ) {
      return [];
    }

    const state =
      api.weaponAugmentState
        .get(
          weapon
        );

    if (!state?.initialized) {
      return [];
    }

    const permanent =
      new Set(
        Array.isArray(
          state?.state?.installed
        )
          ? state.state.installed
          : []
      );

    const infused =
      new Set(
        (
          api.artificerInfusion
            .forWeapon(
              weapon
            ) ?? []
        )
          .map(
            entry =>
              entry?.augmentId
          )
          .filter(
            id =>
              typeof id === "string" &&
              id.length > 0
          )
      );

    return catalog.augments
      .filter(
        augment =>
          augment?.id &&
          !permanent.has(
            augment.id
          ) &&
          !infused.has(
            augment.id
          )
      );
  }


  function augmentOptions(
    weapon
  ) {
    const augments =
      eligibleAugments(
        weapon
      );

    if (
      augments.length === 0
    ) {
      return {
        augments,
        html:
          '<option value="">Aucun augment disponible</option>',
      };
    }

    return {
      augments,

      html:
        augments
          .map(
            augment => `
              <option
                value="${escapeHtml(augment.id)}"
              >
                ${escapeHtml(
                  augment.name ??
                  augment.id
                )}
              </option>
            `
          )
          .join(""),
    };
  }


  const initialWeapon =
    weapons[0]?.weapon ??
    null;

  const initialAugments =
    augmentOptions(
      initialWeapon
    );


  const dialog =
    document.createElement(
      "dialog"
    );

  dialog.className =
    "application dialog dhct-artificer-infusion-dialog";

  dialog.style.width =
    "min(560px, 90vw)";

  dialog.style.padding =
    "18px";


  dialog.innerHTML = `
    <form
      method="dialog"
      style="
        display:flex;
        flex-direction:column;
        gap:12px;
      "
    >
      <h2 style="margin:0">
        Infusion d'Artificier
      </h2>

      <p style="margin:0;opacity:.8">
        ${
          restType === "long"
            ? "Repos long"
            : "Repos court"
        }
        ?
        ${escapeHtml(
          artificer.name
        )}
        ? Tier ${catalog.tier}
        ? ${catalog.capacity} infusion(s) max.
      </p>

      <label>
        <strong>
          Arme de chasse
        </strong>

        <select
          name="weaponUuid"
          style="
            width:100%;
            margin-top:4px
          "
        >
          ${
            weapons
              .map(
                ({ actor, weapon }) => `
                  <option
                    value="${escapeHtml(
                      weapon.uuid
                    )}"
                  >
                    ${escapeHtml(
                      actor.name
                    )}
                    ? ${escapeHtml(
                      weapon.name
                    )}
                  </option>
                `
              )
              .join("")
          }
        </select>
      </label>

      <label>
        <strong>
          Augment temporaire
        </strong>

        <select
          name="augmentId"
          style="
            width:100%;
            margin-top:4px
          "
        >
          ${initialAugments.html}
        </select>
      </label>

      <p
        data-dhct-infusion-status
        style="
          margin:0;
          opacity:.7;
          font-size:.9em;
        "
      ></p>

      <div
        style="
          display:flex;
          justify-content:flex-end;
          gap:8px;
          margin-top:8px;
        "
      >
        <button
          type="button"
          data-dhct-cancel
        >
          Annuler
        </button>

        <button
          type="submit"
          value="confirm"
        >
          Infuser
        </button>
      </div>
    </form>
  `;


  document.body.append(
    dialog
  );


  const form =
    dialog.querySelector(
      "form"
    );

  const weaponSelect =
    dialog.querySelector(
      'select[name="weaponUuid"]'
    );

  const augmentSelect =
    dialog.querySelector(
      'select[name="augmentId"]'
    );

  const submitButton =
    dialog.querySelector(
      'button[type="submit"]'
    );

  const status =
    dialog.querySelector(
      "[data-dhct-infusion-status]"
    );

  const cancel =
    dialog.querySelector(
      "[data-dhct-cancel]"
    );


  async function selectedWeapon() {
    const uuid =
      String(
        weaponSelect?.value ??
        ""
      );

    if (!uuid) {
      return null;
    }

    return await fromUuid(
      uuid
    );
  }


  async function refreshAugments() {
    const weapon =
      await selectedWeapon();

    const options =
      augmentOptions(
        weapon
      );

    if (augmentSelect) {
      augmentSelect.innerHTML =
        options.html;

      augmentSelect.disabled =
        options.augments.length === 0;
    }

    if (submitButton) {
      submitButton.disabled =
        options.augments.length === 0;
    }

    if (status) {
      const state =
        weapon
          ? api.weaponAugmentState
              .effective(
                weapon
              )
          : null;

      status.textContent =
        options.augments.length === 0
          ? "Aucun nouvel augment disponible pour cette arme."
          : `${options.augments.length} augment(s) disponible(s) ? ${
              state?.infusionCount ?? 0
            } infusion(s) active(s).`;
    }

    return {
      weapon,
      options,
    };
  }


  weaponSelect?.addEventListener(
    "change",
    () => {
      void refreshAugments();
    }
  );


  cancel?.addEventListener(
    "click",
    () => {
      dialog.close(
        "cancel"
      );
    }
  );


  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
    },
    {
      once: true,
    }
  );


  form?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const weapon =
        await selectedWeapon();

      if (
        !weapon ||
        weapon.type !== "weapon" ||
        weapon.parent?.documentName !==
          "Actor"
      ) {
        ui.notifications?.error(
          "Campaign Toolkit : arme introuvable."
        );

        return;
      }

      const augmentId =
        String(
          augmentSelect?.value ??
          ""
        );

      if (!augmentId) {
        ui.notifications?.warn(
          "Campaign Toolkit : aucun augment disponible pour cette arme."
        );

        return;
      }

      /*
       * UI revalidation immediately before mutation.
       * Runtime remains authoritative.
       */
      const eligible =
        eligibleAugments(
          weapon
        );

      if (
        !eligible.some(
          augment =>
            augment.id ===
            augmentId
        )
      ) {
        ui.notifications?.warn(
          "Campaign Toolkit : cet augment n'est plus disponible."
        );

        await refreshAugments();

        return;
      }

      submitButton.disabled =
        true;

      try {
        /*
         * P2.13h.3 - player infusion authority
         */
        const result =
          await api.artificerInfusionAuthority
            .request({
              artificer,
              weapon,
              augmentId,
            });

        if (!result?.green) {
          throw new Error(
            result?.reason ??
            "Infusion authority request failed."
          );
        }

        ui.notifications?.info(
          `Infusion appliquee : ${weapon.name}.`
        );

        dialog.close(
          "confirm"
        );
      } catch (error) {
        console.error(
          `${SCOPE} | infusion rest action failed`,
          error
        );

        ui.notifications?.error(
          error?.message ??
          String(error)
        );

        await refreshAugments();
      } finally {
        if (
          dialog.isConnected &&
          submitButton
        ) {
          submitButton.disabled =
            false;
        }
      }
    }
  );


  await refreshAugments();

  dialog.showModal();
}


function injectInfusionButton(
  message,
  html
) {
  const context =
    nativeRestContext(
      message
    );

  if (
    !context ||
    !actorHasArtificer(
      context.actor
    ) ||
    (
      !game.user?.isGM &&
      context.actor
        ?.testUserPermission?.(
          game.user,
          "OWNER"
        ) !== true
    )
  ) {
    return;
  }

  const root =
    htmlRoot(
      html
    );

  if (!root) {
    return;
  }

  if (
    root.querySelector(
      "[data-dhct-artificer-infusion]"
    )
  ) {
    return;
  }

  const content =
    root.querySelector(
      ".message-content"
    ) ??
    root;

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.dataset
    .dhctArtificerInfusion =
    context.restType;

  wrapper.style.marginTop =
    "8px";

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.innerHTML =
    `<i class="fa-solid fa-flask"></i> Infuser une arme`;

  button.style.width =
    "100%";

  button.addEventListener(
    "click",
    () => {
      void openInfusionDialog(
        context.actor,
        context.restType
      );
    }
  );

  wrapper.append(
    button
  );

  content.append(
    wrapper
  );
}


/**
 * Existing public registration name kept for main.mjs compatibility.
 */
export function registerNativeLongRestInfusionBridge() {
  installDowntimeDialogScrollFix();

  if (
    createHookId !== null ||
    renderHookId !== null
  ) {
    return {
      installed: true,
      version: "P2.13c.3b",
    };
  }

  /*
   * Expiration remains lead-GM only.
   */
  if (game.user?.isGM) {
    createHookId =
      Hooks.on(
        "createChatMessage",
        message => {
          if (!leadGM()) {
            return;
          }

          const context =
            nativeRestContext(
              message
            );

          if (
            context?.restType !== "long" ||
            !message.id ||
            processing.has(
              message.id
            )
          ) {
            return;
          }

          processing.add(
            message.id
          );

          queued =
            queued
              .catch(
                () => {}
              )
              .then(
                async () => {
                  try {
                    const result =
                      await expireForNativeLongRest({
                        messageId:
                          message.id,

                        recipientUuid:
                          context.actorUuid,
                      });

                    if (
                      result.handled
                    ) {
                      console.info(
                        `${SCOPE} | native long rest -> world infusions`,
                        result
                      );
                    }
                  } catch (error) {
                    console.error(
                      `${SCOPE} | native long rest bridge failed`,
                      error
                    );
                  } finally {
                    processing.delete(
                      message.id
                    );
                  }
                }
              );
        }
      );


  }

  /*
   * P2.13h.4b - player render hook
   *
   * Rendering is client-local and must be installed
   * for both GM and players. Mutation/expiration
   * authority remains GM-only above.
   */
  renderHookId =
    Hooks.on(
      "renderChatMessageHTML",
      injectInfusionButton
    );

  return {
    installed:
      createHookId !== null ||
      renderHookId !== null,

    version:
      "P2.13c.3b",
  };
}
