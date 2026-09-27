#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import re
import unicodedata
from pathlib import Path

ROLE_SCHEMA_VERSION = 1
ROLE_CONTRACT = {
    "Appui défensif": {"combatRole": "support", "huntRole": None},
    "Conversion": {"combatRole": "finisher", "huntRole": None},
    "Couverture": {"combatRole": "support", "huntRole": None},
    "Cuistot": {"combatRole": None, "huntRole": "preparation"},
    "Diversion": {"combatRole": "support", "huntRole": None},
    "Extracteur": {"combatRole": None, "huntRole": "extraction"},
    "Feinte d’approche": {"combatRole": "opener", "huntRole": None},
    "Frappe d’épuisement": {"combatRole": "finisher", "huntRole": None},
    "Frappe de rupture": {"combatRole": "finisher", "huntRole": None},
    "Frappe mutilante": {"combatRole": "finisher", "huntRole": None},
    "Guidage du finisher": {"combatRole": "support", "huntRole": None},
    "Naturaliste": {"combatRole": None, "huntRole": "knowledge"},
    "Ouverture": {"combatRole": "opener", "huntRole": None},
    "Ouverture précise": {"combatRole": "opener", "huntRole": None},
    "Provocation": {"combatRole": "opener", "huntRole": None},
    "Tacticien": {"combatRole": "support", "huntRole": "logistics"},
    "Traqueur": {"combatRole": None, "huntRole": "tracking"},
}

def norm(v):
    s = str(v or "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[’‘`´]", "'", s)
    return re.sub(r"\s+", " ", s).strip().lower()

KEYS = {norm(k): k for k in ROLE_CONTRACT}

def main():
    p = argparse.ArgumentParser(description="P2.11a.4 — normalise le double axe combatRole/huntRole.")
    p.add_argument("--root", default=".")
    p.add_argument("--source", default="data/homebrew/monster-hunter/dh-domain-cards.json")
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    root = Path(args.root).resolve()
    path = root / args.source
    if not path.exists():
        raise SystemExit(f"[FAIL] source introuvable: {path}")

    cards = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(cards, list):
        raise SystemExit("[FAIL] la source doit être une liste JSON")

    found = {}
    for card in cards:
        if not isinstance(card, dict):
            continue
        key = norm(card.get("name"))
        if key in KEYS:
            found.setdefault(key, []).append(card)

    missing = [name for name in ROLE_CONTRACT if norm(name) not in found]
    duplicate = [KEYS[k] for k, rows in found.items() if len(rows) != 1]
    wrong_domain = []
    for key, rows in found.items():
        if len(rows) != 1:
            continue
        card = rows[0]
        if card.get("system", {}).get("domain") != "hunt":
            wrong_domain.append((KEYS[key], card.get("system", {}).get("domain")))

    if missing or duplicate or wrong_domain:
        if missing:
            print("[FAIL] missing:", ", ".join(missing))
        if duplicate:
            print("[FAIL] duplicates:", ", ".join(duplicate))
        if wrong_domain:
            print("[FAIL] wrong domain:", wrong_domain)
        raise SystemExit(2)

    changed = 0
    rows_out = []

    for name, roles in ROLE_CONTRACT.items():
        card = found[norm(name)][0]
        flags = card.setdefault("flags", {})
        scope = flags.setdefault("daggerheart-campaign-toolkit", {})
        expected = {
            "schemaVersion": ROLE_SCHEMA_VERSION,
            "combatRole": roles["combatRole"],
            "huntRole": roles["huntRole"],
        }
        current = scope.get("huntingCardRoles")
        if current != expected:
            changed += 1
            if args.apply:
                scope["huntingCardRoles"] = expected
        rows_out.append({
            "name": card.get("name"),
            **expected,
        })

    for row in rows_out:
        print(
            f"{row['name']}: combatRole={row['combatRole']!r}, "
            f"huntRole={row['huntRole']!r}"
        )

    print()
    if args.apply:
        path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[GREEN] double axe appliqué à {len(rows_out)} cartes ({changed} modification(s)).")
    else:
        print(f"[AUDIT GREEN] 17 cartes valides ; {changed} nécessitent la normalisation.")
        print("Relancer avec --apply pour écrire les métadonnées.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
