from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
TARGET = ROOT / "scripts" / "expedition-foundry-items.mjs"

if not TARGET.exists():
    raise SystemExit("[FAIL] scripts/expedition-foundry-items.mjs absent")

text = TARGET.read_text(encoding="utf-8-sig")

IMPORT = '''import {
  captureActorInventory,
  captureManifestState,
  rollbackExpeditionTransfer,
} from "./expedition-transaction.mjs";
'''

if 'from "./expedition-transaction.mjs"' not in text:
    text = IMPORT + text

def find_function(src: str, name: str):
    m = re.search(rf'async\s+{re.escape(name)}\s*\([^)]*\)\s*\{{', src)
    if not m:
        return None

    start = m.start()
    brace = src.find("{", m.end() - 1)
    depth = 0
    quote = None
    template = False
    escape = False
    i = brace

    while i < len(src):
        ch = src[i]

        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
        elif template:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "`":
                template = False
        else:
            if ch in ("'", '"'):
                quote = ch
            elif ch == "`":
                template = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return start, brace, i + 1

        i += 1

    return None

def patch_function(src: str, name: str) -> tuple[str, bool]:
    found = find_function(src, name)
    if not found:
        raise RuntimeError(f"fonction {name} introuvable")

    start, brace, end = found
    fn = src[start:end]

    marker = f"P2.10h.5 transaction {name}"
    if marker in fn:
        return src, False

    actor_decl = re.search(r'(?m)^(\s*)const\s+actor\s*=\s*[^;]+;\s*$', fn)
    if not actor_decl:
        raise RuntimeError(
            f"{name}: déclaration 'const actor = ...;' introuvable; aucun fichier modifié"
        )

    indent = actor_decl.group(1)
    snap = (
        "\n"
        + indent + f"// {marker}\n"
        + indent + "const __txManifestSnapshot = captureManifestState(manifest);\n"
        + indent + "const __txActorInventorySnapshot = captureActorInventory(actor);\n"
    )

    pos = actor_decl.end()
    fn = fn[:pos] + snap + fn[pos:]

    local_brace = fn.find("{")
    local_end = len(fn) - 1

    if fn[local_end] != "}":
        raise RuntimeError(f"{name}: fermeture de fonction inattendue")

    body = fn[local_brace + 1 : local_end]

    wrapped = (
        "{\n"
        "  try {"
        + body
        + "\n  } catch (__txError) {\n"
        "    try {\n"
        "      if (\n"
        '        typeof __txManifestSnapshot !== "undefined" &&\n'
        '        typeof __txActorInventorySnapshot !== "undefined" &&\n'
        '        typeof actor !== "undefined"\n'
        "      ) {\n"
        "        const __txRollback = await rollbackExpeditionTransfer({\n"
        "          manifest,\n"
        "          manifestSnapshot: __txManifestSnapshot,\n"
        "          actor,\n"
        "          actorInventorySnapshot: __txActorInventorySnapshot,\n"
        "        });\n\n"
        "        if (!__txRollback.green) {\n"
        "          console.error(\n"
        '            "daggerheart-campaign-toolkit | rollback partiel en échec",\n'
        "            __txRollback.errors\n"
        "          );\n"
        "        }\n"
        "      }\n"
        "    } catch (__txRollbackError) {\n"
        "      console.error(\n"
        '        "daggerheart-campaign-toolkit | rollback transactionnel en échec",\n'
        "        __txRollbackError\n"
        "      );\n"
        "    }\n\n"
        "    throw __txError;\n"
        "  }\n"
        "}"
    )

    fn = fn[:local_brace] + wrapped
    return src[:start] + fn + src[end:], True

changed = False

for name in ("loadFromActor", "unloadToActor"):
    text, did = patch_function(text, name)
    changed = changed or did

if not changed:
    print("[ OK ] P2.10h.5 déjà appliqué")
    raise SystemExit(0)

TARGET.write_text(text, encoding="utf-8")

print("[ OK ] transactions ajoutées à loadFromActor / unloadToActor")
print("[ OK ] rollback manifest + inventaire Actor")
print("[ OK ] P2.10h.5 appliqué")
