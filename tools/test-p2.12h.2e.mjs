import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const features = JSON.parse(fs.readFileSync(path.join(root, "data/homebrew/monster-hunter/dh-features.json"), "utf8"));
const feature = features.find((x) => x._id === "MHARTWORKSHOP001");
if (!feature) throw new Error("Workshop feature missing");
if (Object.keys(feature.system?.actions ?? {}).length !== 0) throw new Error("Workshop feature must not define native Daggerheart actions");

const runtime = fs.readFileSync(path.join(root, "scripts/hunt-artisan-workshop-feature.mjs"), "utf8");
if (!runtime.includes('Hooks.on("renderChatMessageHTML", renderWorkshopChatButton)')) throw new Error("Chat launcher hook missing");
if (!runtime.includes('await api.weaponAugmentWorkshop.open(actor)')) throw new Error("Direct workshop open missing");
if (runtime.includes('MHARTWORKACT0001')) throw new Error("Legacy native workshop action still referenced");

const menu = fs.readFileSync(path.join(root, "scripts/item-backpack-menu.mjs"), "utf8");
if (!menu.includes('label: "Atelier d’armes de chasse"')) throw new Error("Direct feature context-menu launcher missing");
if (!menu.includes('await api.weaponAugmentWorkshop.open(actor)')) throw new Error("Context menu does not open workshop directly");

console.log("P2.12h.2e TESTS GREEN: workshop feature is passive; direct Toolkit launchers remain on context menu and chat card.");
