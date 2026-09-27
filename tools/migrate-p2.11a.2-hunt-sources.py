#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

TARGET_NAMES = [
    "Appui défensif",
    "Conversion",
    "Couverture",
    "Cuistot",
    "Diversion",
    "Extracteur",
    "Feinte d’approche",
    "Frappe d’épuisement",
    "Frappe de rupture",
    "Frappe mutilante",
    "Guidage du finisher",
    "Naturaliste",
    "Ouverture",
    "Ouverture précise",
    "Provocation",
    "Tacticien",
    "Traqueur",
]

TEMP_HUNT_ICON = "icons/tools/navigation/map-chart-tan.webp"

def norm(value: object) -> str:
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[’‘`´]", "'", text)
    return re.sub(r"\s+", " ", text).strip().lower()

TARGET_KEYS = {norm(name): name for name in TARGET_NAMES}

def object_name(node: dict) -> str | None:
    value = node.get("name")
    return value if isinstance(value, str) else None

def get_domain(node: dict) -> tuple[str | None, str | None]:
    if isinstance(node.get("domain"), str):
        return "domain", node["domain"]
    system = node.get("system")
    if isinstance(system, dict) and isinstance(system.get("domain"), str):
        return "system.domain", system["domain"]
    return None, None

def set_domain(node: dict, path: str, value: str) -> None:
    if path == "domain":
        node["domain"] = value
    elif path == "system.domain":
        node.setdefault("system", {})["domain"] = value
    else:
        raise ValueError(path)

def maybe_set_temp_icon(node: dict) -> bool:
    img = node.get("img")
    if not isinstance(img, str):
        return False
    normalized = img.replace("\\", "/").lower()
    if normalized.endswith("/domains/valor.png") or normalized.endswith("/domains/valor.webp") or normalized.endswith("/domains/valor.svg"):
        node["img"] = TEMP_HUNT_ICON
        return True
    return False

def walk(node: object, file_path: Path, breadcrumb: str, matches: list[dict]) -> None:
    if isinstance(node, dict):
        name = object_name(node)
        domain_path, domain = get_domain(node)

        # Only actual domain-card records are migration candidates.
        # Embedded actions can share the card name but have no domain and must
        # never be interpreted as duplicate source cards.
        if name and domain_path and norm(name) in TARGET_KEYS:
            matches.append({
                "file": file_path,
                "breadcrumb": breadcrumb or "<root>",
                "name": name,
                "canonical_name": TARGET_KEYS[norm(name)],
                "node": node,
                "domain_path": domain_path,
                "domain": domain,
            })

        for key, value in node.items():
            walk(value, file_path, f"{breadcrumb}.{key}" if breadcrumb else str(key), matches)

    elif isinstance(node, list):
        for index, value in enumerate(node):
            walk(value, file_path, f"{breadcrumb}[{index}]", matches)

def main() -> int:
    parser = argparse.ArgumentParser(
        description="P2.11a.2 — migrate les 17 cartes Monster Hunter de Valor vers Chasse dans les sources JSON."
    )
    parser.add_argument("--root", default=".", help="Racine du dépôt dh-data.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit les modifications. Sans --apply, mode audit uniquement.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    search_roots = [
        root / "data" / "homebrew" / "monster-hunter",
    ]
    json_files = []
    for search_root in search_roots:
        if search_root.exists():
            json_files.extend(search_root.rglob("*.json"))

    matches: list[dict] = []
    parsed: dict[Path, object] = {}

    for path in sorted(set(json_files)):
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        parsed[path] = payload
        walk(payload, path, "", matches)

    by_key = {}
    for match in matches:
        key = norm(match["canonical_name"])
        by_key.setdefault(key, []).append(match)

    missing = [name for name in TARGET_NAMES if norm(name) not in by_key]
    ambiguous = {
        TARGET_KEYS[key]: rows
        for key, rows in by_key.items()
        if len(rows) > 1
    }

    print("P2.11a.2 — audit sources Valor -> Chasse")
    print(f"Racine : {root}")
    print(f"Cartes attendues : {len(TARGET_NAMES)}")
    print(f"Cartes trouvées  : {len(by_key)}")
    print()

    for name in TARGET_NAMES:
        rows = by_key.get(norm(name), [])
        if not rows:
            print(f"[MISSING] {name}")
            continue
        if len(rows) > 1:
            print(f"[AMBIGUOUS x{len(rows)}] {name}")
            for row in rows:
                print(f"  - {row['file'].relative_to(root)} :: {row['breadcrumb']} :: domain={row['domain']!r}")
            continue

        row = rows[0]
        rel = row["file"].relative_to(root)
        print(f"[FOUND] {name} :: {rel} :: {row['breadcrumb']} :: domain={row['domain']!r}")

    if missing or ambiguous:
        print()
        if missing:
            print("Migration non appliquée : cartes absentes :", ", ".join(missing))
        if ambiguous:
            print("Migration non appliquée : doublons source à résoudre :", ", ".join(ambiguous))
        return 2

    bad_domain = [
        row
        for rows in by_key.values()
        for row in rows
        if norm(row["domain"]) not in {"valor", "hunt"}
    ]
    if bad_domain:
        print()
        print("Migration non appliquée : domaine inattendu.")
        for row in bad_domain:
            print(f"  - {row['name']}: {row['domain']!r}")
        return 3

    if not args.apply:
        print()
        print("[AUDIT GREEN] Les 17 sources sont identifiées sans ambiguïté.")
        print("Relancer avec --apply pour migrer valor -> hunt.")
        return 0

    changed_files: set[Path] = set()
    migrated = 0
    already_hunt = 0

    for rows in by_key.values():
        row = rows[0]
        node = row["node"]
        domain = norm(row["domain"])
        if domain == "hunt":
            already_hunt += 1
            continue

        set_domain(node, row["domain_path"], "hunt")
        maybe_set_temp_icon(node)
        migrated += 1
        changed_files.add(row["file"])

    for path in sorted(changed_files):
        payload = parsed[path]
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print()
    print(f"[APPLY GREEN] {migrated} carte(s) migrée(s), {already_hunt} déjà Chasse.")
    print(f"Fichiers source modifiés : {len(changed_files)}")
    for path in sorted(changed_files):
        print(f"  - {path.relative_to(root)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
