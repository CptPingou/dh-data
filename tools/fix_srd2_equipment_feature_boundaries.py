#!/usr/bin/env python3
"""
P2.3.3o-a-fix1
Post-extraction integrity repair for four confirmed residual boundary leaks.

Run after extract_srd2_equipment.py and before canonical Foundry export.
It patches only exact item/feature pairs and fails loudly if the expected
records are absent. This keeps the correction deterministic and auditable.
"""
from pathlib import Path
import json, sys

ROOT = Path(__file__).resolve().parents[1] / "data" / "srd-2.0" / "equipment"

FIXES = {
    "Blackblood Tendril": {
        "feature": "Poisonous",
        "text": "When a target marks any number of Hit Points from an attack you rolled with Fear, they mark an equal number of Stress.",
    },
    "Storm God’s Greataxe": {
        "feature": "Bouncing",
        "text": "Mark any number of Stress to target that many additional creatures in range of the attack.",
    },
    "Legendary Light-Frame Wheelchair": {
        "feature": "Quick",
        "text": "When you make an attack, you can mark a Stress to target another creature within range.",
    },
    "Legendary Heavy-Frame Wheelchair": {
        "feature": "Heavy",
        "text": "−1 to Evasion.",
    },
}

FILES = ["weapons-raw.json", "combat-wheelchairs.json", "armor.json"]

seen = set()
changed = 0

for filename in FILES:
    path = ROOT / filename
    if not path.exists():
        continue
    data = json.loads(path.read_text(encoding="utf-8"))
    dirty = False
    for row in data:
        name = row.get("name")
        if name not in FIXES:
            continue
        fix = FIXES[name]
        feature = row.get("feature") or {}
        if feature.get("name") != fix["feature"]:
            raise SystemExit(
                f"{filename}: {name}: expected feature {fix['feature']!r}, "
                f"found {feature.get('name')!r}"
            )
        feature["text"] = fix["text"]
        row["feature"] = feature
        row.setdefault("feature_integrity", {})
        row["feature_integrity"].update({
            "status": "boundary-repaired",
            "patch": "P2.3.3o-a-fix1",
        })
        seen.add(name)
        changed += 1
        dirty = True
    if dirty:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

missing = sorted(set(FIXES) - seen)
if missing:
    raise SystemExit("Missing expected equipment records: " + ", ".join(missing))

print("P2.3.3o-a-fix1 residual boundary repair")
print(f"  repaired: {changed}")
print("  missing: 0")
print("  GREEN: True")
