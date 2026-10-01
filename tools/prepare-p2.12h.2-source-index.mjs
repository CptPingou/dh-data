#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const indexPath = resolve(repoRoot, "data", "source-index.json");

const index = JSON.parse((await readFile(indexPath, "utf8")).replace(/^\uFEFF/, ""));
const mh = index?.origins?.homebrew?.namespaces?.["monster-hunter"];
if (!mh?.packs) throw new Error("Namespace homebrew/monster-hunter absent du source-index.");

mh.packs["dh-features"] = {
  count: 1,
  file: "data/homebrew/monster-hunter/dh-features.json",
  sha256: "pending-build-source-index"
};

await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log("P2.12h.2 SOURCE INDEX PREPARED: monster-hunter/dh-features registered; run node tools/build-source-index.mjs next.");
