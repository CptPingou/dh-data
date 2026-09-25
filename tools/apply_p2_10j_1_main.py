from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
MAIN = ROOT / "scripts" / "main.mjs"

if not MAIN.exists():
    raise SystemExit("[FAIL] scripts/main.mjs introuvable; aucun fichier modifié")

text = MAIN.read_text(encoding="utf-8-sig")
changed = False

import_line = 'import { installExpeditionInventoryUx } from "./expedition-inventory-ux.mjs";\n'

if import_line not in text:
    text = import_line + text
    changed = True

if "installExpeditionInventoryUx();" not in text:
    # Install at module evaluation time; helper itself defers DOM work to ready.
    text = text.rstrip() + "\n\ninstallExpeditionInventoryUx();\n"
    changed = True

if not changed:
    print("[ OK ] main.mjs déjà branché sur expedition-inventory-ux")
    raise SystemExit(0)

MAIN.write_text(text, encoding="utf-8")
print("[ OK ] scripts/main.mjs branché sur expedition-inventory-ux")
