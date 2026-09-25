from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
SCRIPTS = ROOT / "scripts"

validation_needle = 'if (!Number.isInteger(entry?.quantity) || entry.quantity < 1) errors.push(`container ${id}/${entry?.entryId ?? "?"}: quantity must be >= 1`);'

target = None
text = None

for path in SCRIPTS.glob("*.mjs"):
    candidate = path.read_text(encoding="utf-8-sig")
    if validation_needle in candidate and "usedSlotsForTransfer(to)" in candidate:
        target = path
        text = candidate
        break

if target is None:
    raise SystemExit("[FAIL] moteur expedition-manifest introuvable; aucun fichier modifié")

changed = False

replacement = """const lifecycleState = entry?.itemRef?.lifecycle?.state ?? "legacy";
      const terminalLifecycle =
        lifecycleState === "consumed" || lifecycleState === "deleted";
      const minimumQuantity = terminalLifecycle ? 0 : 1;
      if (
        !Number.isInteger(entry?.quantity) ||
        entry.quantity < minimumQuantity
      ) {
        errors.push(
          `container ${id}/${entry?.entryId ?? "?"}: quantity must be >= ${minimumQuantity}`
        );
      }"""

if validation_needle in text:
    text = text.replace(validation_needle, replacement, 1)
    changed = True

capacity_expr = """(to.contents ?? []).filter((candidate) => {
      const state = candidate?.itemRef?.lifecycle?.state ?? "legacy";
      return (
        Number(candidate?.quantity) > 0 &&
        state !== "consumed" &&
        state !== "deleted"
      );
    }).length"""

if "usedSlotsForTransfer(to) >= capacity" in text:
    text = text.replace(
        "usedSlotsForTransfer(to) >= capacity",
        capacity_expr + " >= capacity",
        1
    )
    changed = True

if not changed:
    print("[ OK ] règles lifecycle manifest déjà présentes")
    raise SystemExit(0)

target.write_text(text, encoding="utf-8")
print(f"[ OK ] moteur manifest patché : {target.relative_to(ROOT)}")
print("[ OK ] quantity 0 terminale autorisée")
print("[ OK ] consumed/deleted exclus de la capacité")
