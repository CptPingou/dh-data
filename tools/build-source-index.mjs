#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const indexPath = resolve(repoRoot, "data", "source-index.json");

function fail(message) {
  throw new Error(`[build-source-index] ${message}`);
}

async function readJson(path, label) {
  let raw;
  try {
    raw = await readFile(path);
  } catch (error) {
    fail(`Impossible de lire ${label}: ${path}\n${error.message}`);
  }

  let value;
  try {
    // Windows PowerShell 5.1 can write UTF-8 JSON with a BOM.
    // Keep the raw bytes unchanged for SHA-256, but strip the BOM from
    // the decoded text before JSON.parse().
    const text = raw.toString("utf8").replace(/^\uFEFF/, "");
    value = JSON.parse(text);
  } catch (error) {
    fail(`JSON invalide dans ${label}: ${path}\n${error.message}`);
  }

  return { raw, value };
}

function assertUniqueIds(items, file) {
  const seen = new Map();

  for (let i = 0; i < items.length; i += 1) {
    const id = items[i]?._id;
    if (typeof id !== "string" || !id.trim()) {
      fail(`${file}: entrée ${i + 1} sans _id valide.`);
    }

    if (seen.has(id)) {
      fail(`${file}: _id dupliqué "${id}" aux entrées ${seen.get(id)} et ${i + 1}.`);
    }
    seen.set(id, i + 1);
  }
}

async function rebuildPack(packName, spec) {
  if (!spec || typeof spec.file !== "string" || !spec.file.trim()) {
    fail(`Pack "${packName}" sans chemin "file" valide.`);
  }

  const absolute = resolve(repoRoot, spec.file);
  const { raw, value } = await readJson(absolute, spec.file);

  if (!Array.isArray(value)) {
    fail(`${spec.file}: la racine JSON doit être un tableau.`);
  }

  assertUniqueIds(value, spec.file);

  return {
    ...spec,
    count: value.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

async function rebuildPacks(packs = {}) {
  const rebuilt = {};
  let total = 0;

  for (const [packName, spec] of Object.entries(packs)) {
    const next = await rebuildPack(packName, spec);
    rebuilt[packName] = next;
    total += next.count;
  }

  return { packs: rebuilt, total };
}

async function main() {
  const { value: index } = await readJson(indexPath, "source-index.json");

  if (index?.schema !== "daggerheart-campaign-toolkit/source-index@2") {
    fail(`Schema inattendu: ${JSON.stringify(index?.schema)}.`);
  }

  const origins = index.origins;
  if (!origins || typeof origins !== "object") {
    fail(`source-index.json ne contient pas "origins".`);
  }

  let grandTotal = 0;

  for (const [originName, origin] of Object.entries(origins)) {
    if (originName === "homebrew") {
      const namespaces = origin?.namespaces ?? {};
      const rebuiltNamespaces = {};
      let homebrewTotal = 0;

      for (const [namespaceName, namespace] of Object.entries(namespaces)) {
        const result = await rebuildPacks(namespace?.packs ?? {});
        rebuiltNamespaces[namespaceName] = {
          ...namespace,
          total: result.total,
          packs: result.packs,
        };
        homebrewTotal += result.total;
      }

      origins[originName] = {
        ...origin,
        total: homebrewTotal,
        namespaces: rebuiltNamespaces,
      };
      grandTotal += homebrewTotal;
      continue;
    }

    const result = await rebuildPacks(origin?.packs ?? {});
    origins[originName] = {
      ...origin,
      total: result.total,
      packs: result.packs,
    };
    grandTotal += result.total;
  }

  index.total = grandTotal;

  const output = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(indexPath, output, "utf8");

  console.log(`[build-source-index] GREEN`);
  for (const [originName, origin] of Object.entries(index.origins)) {
    if (originName === "homebrew") {
      console.log(`  ${originName}: ${origin.total}`);
      for (const [namespaceName, namespace] of Object.entries(origin.namespaces ?? {})) {
        console.log(`    ${namespaceName}: ${namespace.total}`);
      }
    } else {
      console.log(`  ${originName}: ${origin.total}`);
    }
  }
  console.log(`  total: ${index.total}`);
  console.log(`  écrit: ${indexPath}`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
