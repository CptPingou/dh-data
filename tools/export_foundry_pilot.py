#!/usr/bin/env python3
"""
P2.3.1 — build a tiny Foundry pilot payload from daggerheart-data.

Run from the DH Data repository root:

  python tools\export_foundry_pilot.py "C:\path\to\FoundryVTT\Data\modules\daggerheart-campaign-toolkit"

The script writes:
  <module>/data/pilot.json

It does not modify the canonical source data.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(".")
DATA = ROOT / "data"

def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))

def iter_dicts(obj: Any) -> Iterable[dict]:
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from iter_dicts(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from iter_dicts(value)

def has_identity(row: dict) -> bool:
    return bool(
        row.get("id")
        or row.get("name")
        or isinstance(row.get("identity"), dict) and row["identity"].get("name")
    )

def kind_matches(row: dict, wanted: str) -> bool:
    k = str(row.get("kind") or row.get("entity_type") or row.get("type") or "").lower()
    aliases = {
        "domain_card": {"domain_card", "domain-card", "domaincard", "card"},
        "class": {"class"},
        "subclass": {"subclass"},
        "weapon": {"weapon"},
        "armor": {"armor"},
        "adversary": {"adversary"},
        "environment": {"environment"},
    }
    return k in aliases.get(wanted, {wanted})

def pick_from_file(path: Path, wanted: str, *, allow_untyped=True) -> dict:
    obj = load(path)
    rows = [r for r in iter_dicts(obj) if has_identity(r)]
    typed = [r for r in rows if kind_matches(r, wanted)]
    if typed:
        return typed[0]
    if allow_untyped and rows:
        # Prefer rows with mechanics/rules over manifest-ish metadata.
        rows.sort(key=lambda r: (
            0 if any(k in r for k in ("rules","mechanics","thresholds","attack","content")) else 1,
            0 if "id" in r else 1,
        ))
        return rows[0]
    raise RuntimeError(f"No {wanted} candidate found in {path}")

def first_existing(*paths: Path) -> Path:
    for p in paths:
        if p.exists():
            return p
    raise FileNotFoundError("None of these source files exist:\n" + "\n".join(map(str, paths)))

def entry(key: str, kind: str, source: Path, raw: dict) -> dict:
    return {
        "key": key,
        "kind": kind,
        "source_path": source.as_posix(),
        "source_id": raw.get("id"),
        "data": raw,
    }

def main():
    if len(sys.argv) != 2:
        raise SystemExit(
            'Usage: python tools\\export_foundry_pilot.py '
            '"C:\\...\\FoundryVTT\\Data\\modules\\daggerheart-campaign-toolkit"'
        )

    module_root = Path(sys.argv[1])
    if not (module_root / "module.json").exists():
        raise SystemExit(f"module.json not found in: {module_root}")

    sources = {
        "class": DATA / "playtest/blood-hunter-v1.5/classes/blood-hunter.json",
        "subclass": DATA / "playtest/blood-hunter-v1.5/subclasses/order-of-the-ghost-slayer.json",
        "domain_card": first_existing(
            DATA / "srd-2.0/domain-cards/arcana.json",
            DATA / "playtest/blood-hunter-v1.5/domains/blood/cards/01-blood-spike.json",
        ),
        "weapon": first_existing(
            DATA / "srd-2.0/equipment/supplemental-weapons.json",
            DATA / "srd-2.0/equipment/weapons-raw.json",
        ),
        "armor": DATA / "srd-2.0/equipment/armor.json",
        "adversary": DATA / "srd-2.0/adversaries/adversaries.json",
        "environment": DATA / "srd-2.0/environments/environments.json",
    }

    missing = [str(p) for p in sources.values() if not p.exists()]
    if missing:
        raise SystemExit("Missing source files:\n" + "\n".join(missing))

    entries = []
    for kind, path in sources.items():
        raw = pick_from_file(path, kind)
        entries.append(entry(f"pilot-{kind}", kind, path, raw))

    payload = {
        "phase": "P2.3.1",
        "source": "daggerheart-data",
        "purpose": "Foundryborne native-document pilot only",
        "entries": entries,
        "expected": {
            "item_count": 5,
            "actor_count": 2,
            "kinds": [e["kind"] for e in entries],
        },
    }

    out = module_root / "data/pilot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "validation": "GREEN",
        "output": str(out),
        "entries": [
            {
                "kind": e["kind"],
                "name": (
                    e["data"].get("identity", {}).get("name")
                    if isinstance(e["data"].get("identity"), dict)
                    else None
                ) or e["data"].get("name") or e["data"].get("label") or e["key"],
                "source_path": e["source_path"],
            }
            for e in entries
        ],
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
