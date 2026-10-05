import {
  autonomousSourceStatus,
  syncAutonomousSources,
} from "./autonomous-source-loader.mjs";

import {
  importActorsMapped,
} from "./full-import.mjs";

import {
  importTetsucabra,
  tetsucabraStatus,
} from "./pilot-import.mjs";

const MODULE_ID =
  "daggerheart-campaign-toolkit";

export async function syncAllContent({
  forceItems = false,
  ensureTetsucabra = true,
} = {}) {
  if (!game.user?.isGM) {
    throw new Error(
      "Campaign Toolkit content sync is GM-only."
    );
  }

  console.group(
    MODULE_ID + " | FULL CONTENT SYNC"
  );

  try {
    console.info(
      MODULE_ID +
      " | step 1/3 autonomous item content"
    );

    const items =
      await syncAutonomousSources({
        force: forceItems,
      });

    console.info(
      MODULE_ID +
      " | step 2/3 SRD actors"
    );

    const actors =
      await importActorsMapped();

    let tetsucabra = null;

    if (ensureTetsucabra) {
      console.info(
        MODULE_ID +
        " | step 3/3 Monster Hunter adversaries"
      );

      const before =
        await tetsucabraStatus();

      if (!before?.green) {
        await importTetsucabra();
      }

      tetsucabra =
        await tetsucabraStatus();
    }

    const itemStatus =
      await autonomousSourceStatus();

    const green =
      Boolean(itemStatus?.green) &&
      Boolean(actors?.green) &&
      (
        !ensureTetsucabra ||
        Boolean(tetsucabra?.green)
      );

    const report = {
      green,
      items: {
        green:
          Boolean(itemStatus?.green),
        total:
          items?.total ?? null,
        changed:
          Boolean(items?.changed),
      },
      actors: {
        green:
          Boolean(actors?.green),
        adversaries:
          actors?.counts?.adversary ?? 0,
        environments:
          actors?.counts?.environment ?? 0,
        created:
          actors?.created ?? 0,
      },
      monsterHunter: {
        tetsucabra:
          ensureTetsucabra
            ? Boolean(tetsucabra?.green)
            : null,
      },
    };

    console.table({
      "Autonomous Items":
        report.items.green
          ? "GREEN"
          : "FAIL",
      "SRD Adversaries":
        actors?.counts?.adversary ?? 0,
      "SRD Environments":
        actors?.counts?.environment ?? 0,
      "Tetsucabra":
        ensureTetsucabra
          ? (
              report.monsterHunter.tetsucabra
                ? "GREEN"
                : "FAIL"
            )
          : "SKIPPED",
      "Full Sync":
        green
          ? "GREEN"
          : "FAIL",
    });

    if (!green) {
      throw new Error(
        "Campaign Toolkit full content sync is not GREEN."
      );
    }

    ui.notifications.info(
      "Campaign Toolkit : synchronisation compl\u00e8te GREEN"
    );

    return report;
  } finally {
    console.groupEnd();
  }
}

export const contentSyncApi =
  Object.freeze({
    syncAll: syncAllContent,
  });
