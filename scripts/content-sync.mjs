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


function indexRows(index) {
  if (!index) return [];

  if (
    typeof index.values === "function"
  ) {
    return Array.from(index.values());
  }

  if (Array.isArray(index)) {
    return index;
  }

  return Array.from(index);
}

async function canonicalActorExpectedCounts() {
  const specs = [
    {
      key: "adversaries",
      path:
        "data/srd-2.0/adversaries/adversaries.json",
    },
    {
      key: "environments",
      path:
        "data/srd-2.0/environments/environments.json",
    },
  ];

  const result = {};

  for (const spec of specs) {
    const response = await fetch(
      `modules/${MODULE_ID}/${spec.path}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(
        `${spec.path} introuvable (${response.status}).`
      );
    }

    const rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error(
        `${spec.path} doit contenir un tableau.`
      );
    }

    result[spec.key] = rows.length;
  }

  return result;
}

async function actorPackStatus({
  packId,
  sourcePrefix,
  expected,
} = {}) {
  const pack =
    game.packs.get(
      `${MODULE_ID}.${packId}`
    );

  if (!pack) {
    return {
      green: false,
      expected,
      actual: null,
      total: null,
      missing: expected,
      reason: "pack-absent",
    };
  }

  const index =
    await pack.getIndex({
      fields: [
        `flags.${MODULE_ID}.managed`,
        `flags.${MODULE_ID}.sourceId`,
      ],
    });

  const rows =
    indexRows(index);

  const managed =
    rows.filter(row => {
      const managedFlag =
        foundry.utils.getProperty(
          row,
          `flags.${MODULE_ID}.managed`
        );

      const sourceId =
        foundry.utils.getProperty(
          row,
          `flags.${MODULE_ID}.sourceId`
        );

      return (
        managedFlag === true &&
        typeof sourceId === "string" &&
        sourceId.startsWith(sourcePrefix)
      );
    });

  const actual =
    managed.length;

  return {
    green:
      actual === expected,
    expected,
    actual,
    total: rows.length,
    missing:
      Math.max(
        0,
        expected - actual
      ),
    extra:
      Math.max(
        0,
        actual - expected
      ),
  };
}

function autonomousActualCount(status) {
  const packs =
    status?.packs;

  if (!packs) {
    return null;
  }

  const values =
    packs instanceof Map
      ? Array.from(packs.values())
      : Object.values(packs);

  if (!values.length) {
    return 0;
  }

  const actuals =
    values.map(row =>
      Number(row?.actual)
    );

  if (
    actuals.some(
      value =>
        !Number.isFinite(value)
    )
  ) {
    return null;
  }

  return actuals.reduce(
    (sum, value) =>
      sum + value,
    0
  );
}

export async function contentStatus() {
  const [
    items,
    expectedActors,
    tetsucabra,
  ] = await Promise.all([
    autonomousSourceStatus(),
    canonicalActorExpectedCounts(),
    tetsucabraStatus(),
  ]);

  const adversaries =
    await actorPackStatus({
      packId: "dh-adversaries",
      sourcePrefix:
        "srd-2.0.adversary.",
      expected:
        expectedActors.adversaries,
    });

  const environments =
    await actorPackStatus({
      packId: "dh-environments",
      sourcePrefix:
        "srd-2.0.environment.",
      expected:
        expectedActors.environments,
    });

  const green =
    Boolean(items?.green) &&
    Boolean(adversaries.green) &&
    Boolean(environments.green) &&
    Boolean(tetsucabra?.green);

  const result = {
    green,

    items: {
      green:
        Boolean(items?.green),
      actual:
        autonomousActualCount(items),
      detail:
        items,
    },

    adversaries,

    environments,

    monsterHunter: {
      tetsucabra: {
        green:
          Boolean(tetsucabra?.green),
        count:
          Number(
            tetsucabra?.count ?? 0
          ),
      },
    },
  };

  console.table({
    "Autonomous Items": {
      count:
        result.items.actual ?? "?",
      expected:
        "indexed",
      status:
        result.items.green
          ? "GREEN"
          : "FAIL",
    },

    "SRD Adversaries": {
      count:
        adversaries.actual ?? "?",
      expected:
        adversaries.expected,
      status:
        adversaries.green
          ? "GREEN"
          : "FAIL",
    },

    "SRD Environments": {
      count:
        environments.actual ?? "?",
      expected:
        environments.expected,
      status:
        environments.green
          ? "GREEN"
          : "FAIL",
    },

    "Tetsucabra": {
      count:
        result.monsterHunter
          .tetsucabra.count,
      expected:
        4,
      status:
        result.monsterHunter
          .tetsucabra.green
          ? "GREEN"
          : "FAIL",
    },

    "Full Content": {
      count: "",
      expected: "",
      status:
        green
          ? "GREEN"
          : "FAIL",
    },
  });

  return result;
}

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
        updated:
          actors?.updated ?? 0,
        unchanged:
          actors?.unchanged ?? 0,
        removed:
          actors?.removed ?? 0,
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
    status: contentStatus,
    syncAll: syncAllContent,
  });
