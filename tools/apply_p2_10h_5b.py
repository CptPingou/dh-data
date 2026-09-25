from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
SCRIPTS = ROOT / "scripts"
MENU = SCRIPTS / "item-backpack-menu.mjs"
ITEMS = SCRIPTS / "expedition-foundry-items.mjs"

for p in (MENU, ITEMS):
    if not p.exists():
        raise SystemExit(f"[FAIL] {p.relative_to(ROOT)} absent")

IMPORT = (
    'import {\\n'
    '  captureActorInventory,\\n'
    '  captureManifestState,\\n'
    '  rollbackExpeditionTransfer,\\n'
    '} from "./expedition-transaction.mjs";\\n'
)

def ensure_import(text):
    if 'from "./expedition-transaction.mjs"' not in text:
        return IMPORT + text
    return text

def find_matching_brace(src, brace):
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
            elif ch == "\\\\":
                escape = True
            elif ch == quote:
                quote = None
        elif template:
            if escape:
                escape = False
            elif ch == "\\\\":
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
                    return i + 1
        i += 1
    return None

# ---------------- Actor -> Backpack ----------------
menu = ensure_import(MENU.read_text(encoding="utf-8-sig"))

if "P2.10h.5 transaction actor-to-backpack" not in menu:
    call = re.search(
        r'(?ms)^(\\s*)try\\s*\\{\\s*\\r?\\n'
        r'\\1\\s*const result = await api\\.expeditionItems\\.loadFromActor\\(manifest,\\s*\\{',
        menu
    )
    if not call:
        raise RuntimeError("Actor->Backpack: appel loadFromActor introuvable")

    indent = call.group(1)
    insert = (
        f"{indent}// P2.10h.5 transaction actor-to-backpack\\n"
        f"{indent}const __txManifestSnapshot = captureManifestState(manifest);\\n"
        f"{indent}const __txActorInventorySnapshot = captureActorInventory(actor);\\n\\n"
    )
    menu = menu[:call.start()] + insert + menu[call.start():]

    search_from = menu.find("await api.expeditionItems.loadFromActor")
    catch = re.search(
        r'(?m)^(\\s*)\\}\\s*catch\\s*\\(\\s*error\\s*\\)\\s*\\{\\s*$',
        menu[search_from:]
    )
    if not catch:
        raise RuntimeError("Actor->Backpack: catch(error) introuvable")

    absolute = search_from + catch.end()
    ci = catch.group(1)
    rollback = (
        "\\n"
        f"{ci}  try {{\\n"
        f"{ci}    const __txRollback = await rollbackExpeditionTransfer({{\\n"
        f"{ci}      manifest,\\n"
        f"{ci}      manifestSnapshot: __txManifestSnapshot,\\n"
        f"{ci}      actor,\\n"
        f"{ci}      actorInventorySnapshot: __txActorInventorySnapshot,\\n"
        f"{ci}    }});\\n"
        f"{ci}    if (!__txRollback.green) console.error(\\n"
        f"{ci}      \"daggerheart-campaign-toolkit | rollback Actor -> Backpack incomplet\",\\n"
        f"{ci}      __txRollback.errors\\n"
        f"{ci}    );\\n"
        f"{ci}  }} catch (__txRollbackError) {{\\n"
        f"{ci}    console.error(\\n"
        f"{ci}      \"daggerheart-campaign-toolkit | rollback Actor -> Backpack en échec\",\\n"
        f"{ci}      __txRollbackError\\n"
        f"{ci}    );\\n"
        f"{ci}  }}\\n"
    )
    menu = menu[:absolute] + rollback + menu[absolute:]

# ---------------- Backpack -> Actor ----------------
items = ensure_import(ITEMS.read_text(encoding="utf-8-sig"))

if "P2.10h.5 transaction backpack-to-actor" not in items:
    m = re.search(r'async\\s+unloadToActor\\s*\\([^)]*\\)\\s*\\{', items)
    if not m:
        raise RuntimeError("Backpack->Actor: unloadToActor introuvable")

    start = m.start()
    brace = items.find("{", m.end() - 1)
    end = find_matching_brace(items, brace)
    if end is None:
        raise RuntimeError("Backpack->Actor: fermeture unloadToActor introuvable")

    fn = items[start:end]
    actor_decl = re.search(r'(?m)^(\\s*)const\\s+actor\\s*=\\s*[^;]+;\\s*$', fn)
    if not actor_decl:
        raise RuntimeError("Backpack->Actor: const actor introuvable")

    indent = actor_decl.group(1)
    snapshots = (
        "\\n"
        f"{indent}// P2.10h.5 transaction backpack-to-actor\\n"
        f"{indent}const __txManifestSnapshot = captureManifestState(manifest);\\n"
        f"{indent}const __txActorInventorySnapshot = captureActorInventory(actor);\\n"
    )
    pos = actor_decl.end()
    fn = fn[:pos] + snapshots + fn[pos:]

    local_brace = fn.find("{")
    body = fn[local_brace + 1:-1]

    wrapped = (
        "{\\n"
        "  try {"
        + body +
        "\\n  } catch (__txError) {\\n"
        "    try {\\n"
        '      if (typeof actor !== "undefined") {\\n'
        "        const __txRollback = await rollbackExpeditionTransfer({\\n"
        "          manifest,\\n"
        "          manifestSnapshot: __txManifestSnapshot,\\n"
        "          actor,\\n"
        "          actorInventorySnapshot: __txActorInventorySnapshot,\\n"
        "        });\\n"
        "        if (!__txRollback.green) console.error(\\n"
        '          "daggerheart-campaign-toolkit | rollback Backpack -> Actor incomplet",\\n'
        "          __txRollback.errors\\n"
        "        );\\n"
        "      }\\n"
        "    } catch (__txRollbackError) {\\n"
        "      console.error(\\n"
        '        "daggerheart-campaign-toolkit | rollback Backpack -> Actor en échec",\\n'
        "        __txRollbackError\\n"
        "      );\\n"
        "    }\\n"
        "    throw __txError;\\n"
        "  }\\n"
        "}"
    )

    fn = fn[:local_brace] + wrapped
    items = items[:start] + fn + items[end:]

MENU.write_text(menu, encoding="utf-8")
ITEMS.write_text(items, encoding="utf-8")

print("[ OK ] Actor -> Backpack protégé")
print("[ OK ] Backpack -> Actor protégé")
print("[ OK ] P2.10h.5b appliqué")
