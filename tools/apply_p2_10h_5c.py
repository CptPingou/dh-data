from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
SCRIPTS = ROOT / "scripts"

MENU = SCRIPTS / "item-backpack-menu.mjs"
ITEMS = SCRIPTS / "expedition-foundry-items.mjs"

for path in (MENU, ITEMS):
    if not path.exists():
        raise SystemExit(f"[FAIL] {path.relative_to(ROOT)} absent")

IMPORT = """import {
  captureActorInventory,
  captureManifestState,
  rollbackExpeditionTransfer,
} from "./expedition-transaction.mjs";
"""

def ensure_import(text):
    if 'from "./expedition-transaction.mjs"' not in text:
        return IMPORT + text
    return text

def find_matching_brace(text, open_index):
    depth = 0
    quote = None
    template = False
    escape = False
    i = open_index

    while i < len(text):
        ch = text[i]

        if quote is not None:
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
                    return i

        i += 1

    return None

# ---------------------------------------------------------------------------
# A. Actor -> Backpack
# ---------------------------------------------------------------------------

menu = ensure_import(MENU.read_text(encoding="utf-8-sig"))

if "P2.10h.5 transaction actor-to-backpack" not in menu:
    call_needle = "const result = await api.expeditionItems.loadFromActor(manifest, {"
    call_index = menu.find(call_needle)

    if call_index < 0:
        raise RuntimeError(
            "Actor->Backpack: appel loadFromActor attendu introuvable; aucun fichier modifié"
        )

    # The existing action already has a try/catch around loadFromActor.
    try_index = menu.rfind("try {", 0, call_index)
    if try_index < 0:
        raise RuntimeError(
            "Actor->Backpack: try { précédent introuvable; aucun fichier modifié"
        )

    line_start = menu.rfind("\n", 0, try_index) + 1
    indent = menu[line_start:try_index]

    snapshots = (
        f"{indent}// P2.10h.5 transaction actor-to-backpack\n"
        f"{indent}const __txManifestSnapshot = captureManifestState(manifest);\n"
        f"{indent}const __txActorInventorySnapshot = captureActorInventory(actor);\n\n"
    )

    menu = menu[:line_start] + snapshots + menu[line_start:]

    # Recalculate the call position after insertion.
    call_index = menu.find(call_needle)

    catch_needle = "} catch (error) {"
    catch_index = menu.find(catch_needle, call_index)

    if catch_index < 0:
        raise RuntimeError(
            "Actor->Backpack: catch (error) introuvable; aucun fichier modifié"
        )

    catch_body_start = catch_index + len(catch_needle)

    rollback = (
        "\n"
        f"{indent}  try {{\n"
        f"{indent}    const __txRollback = await rollbackExpeditionTransfer({{\n"
        f"{indent}      manifest,\n"
        f"{indent}      manifestSnapshot: __txManifestSnapshot,\n"
        f"{indent}      actor,\n"
        f"{indent}      actorInventorySnapshot: __txActorInventorySnapshot,\n"
        f"{indent}    }});\n"
        f"{indent}    if (!__txRollback.green) {{\n"
        f'{indent}      console.error("daggerheart-campaign-toolkit | rollback Actor -> Backpack incomplet", __txRollback.errors);\n'
        f"{indent}    }}\n"
        f"{indent}  }} catch (__txRollbackError) {{\n"
        f'{indent}    console.error("daggerheart-campaign-toolkit | rollback Actor -> Backpack en échec", __txRollbackError);\n'
        f"{indent}  }}\n"
    )

    menu = menu[:catch_body_start] + rollback + menu[catch_body_start:]

# ---------------------------------------------------------------------------
# B. Backpack -> Actor
# ---------------------------------------------------------------------------

items = ensure_import(ITEMS.read_text(encoding="utf-8-sig"))

if "P2.10h.5 transaction backpack-to-actor" not in items:
    signature = "async unloadToActor("
    start = items.find(signature)

    if start < 0:
        raise RuntimeError(
            "Backpack->Actor: signature unloadToActor introuvable; aucun fichier modifié"
        )

    open_brace = items.find("{", start)
    if open_brace < 0:
        raise RuntimeError(
            "Backpack->Actor: accolade d'ouverture introuvable; aucun fichier modifié"
        )

    close_brace = find_matching_brace(items, open_brace)
    if close_brace is None:
        raise RuntimeError(
            "Backpack->Actor: accolade de fermeture introuvable; aucun fichier modifié"
        )

    fn = items[start:close_brace + 1]

    actor_needle = "const actor = actorFromContainer(container);"
    actor_index = fn.find(actor_needle)

    if actor_index < 0:
        raise RuntimeError(
            "Backpack->Actor: déclaration actor introuvable; aucun fichier modifié"
        )

    actor_line_start = fn.rfind("\n", 0, actor_index) + 1
    actor_line_end = fn.find("\n", actor_index)
    if actor_line_end < 0:
        actor_line_end = actor_index + len(actor_needle)

    actor_indent = fn[actor_line_start:actor_index]

    snapshots = (
        "\n"
        f"{actor_indent}// P2.10h.5 transaction backpack-to-actor\n"
        f"{actor_indent}const __txManifestSnapshot = captureManifestState(manifest);\n"
        f"{actor_indent}const __txActorInventorySnapshot = captureActorInventory(actor);\n"
    )

    fn = fn[:actor_line_end] + snapshots + fn[actor_line_end:]

    # Wrap the complete function body. Snapshot variables are declared before
    # any Actor inventory mutation.
    local_open = fn.find("{")
    local_close = find_matching_brace(fn, local_open)

    if local_close is None:
        raise RuntimeError(
            "Backpack->Actor: fonction modifiée invalide; aucun fichier modifié"
        )

    body = fn[local_open + 1:local_close]

    wrapped_body = (
        "\n  try {"
        + body
        + "\n  } catch (__txError) {\n"
        "    try {\n"
        '      if (typeof actor !== "undefined" && typeof __txManifestSnapshot !== "undefined") {\n'
        "        const __txRollback = await rollbackExpeditionTransfer({\n"
        "          manifest,\n"
        "          manifestSnapshot: __txManifestSnapshot,\n"
        "          actor,\n"
        "          actorInventorySnapshot: __txActorInventorySnapshot,\n"
        "        });\n"
        "        if (!__txRollback.green) {\n"
        '          console.error("daggerheart-campaign-toolkit | rollback Backpack -> Actor incomplet", __txRollback.errors);\n'
        "        }\n"
        "      }\n"
        "    } catch (__txRollbackError) {\n"
        '      console.error("daggerheart-campaign-toolkit | rollback Backpack -> Actor en échec", __txRollbackError);\n'
        "    }\n"
        "    throw __txError;\n"
        "  }\n"
    )

    fn = fn[:local_open + 1] + wrapped_body + fn[local_close:]
    items = items[:start] + fn + items[close_brace + 1:]

# Write only after both transformations succeeded.
MENU.write_text(menu, encoding="utf-8")
ITEMS.write_text(items, encoding="utf-8")

print("[ OK ] Actor -> Backpack protégé")
print("[ OK ] Backpack -> Actor protégé")
print("[ OK ] P2.10h.5c appliqué")
