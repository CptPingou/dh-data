from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "data/locales/fr/weapon.json", ROOT / "data/locales/fr/armor.json"]

issues = []
summary = []
for path in FILES:
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data.get("entries", {})
    count = 0
    for source_id, overlay in entries.items():
        system = overlay.get("system") if isinstance(overlay, dict) else None
        if isinstance(system, dict) and isinstance(system.get("description"), str) and system["description"].strip():
            count += 1
            issues.append((path.name, source_id))
    summary.append((path.name, len(entries), count))

print("P2.3.4e-fix1 — audit doublons description équipement")
for name, entries, descriptions in summary:
    print(f"  {name}: entries={entries} localized_system_descriptions={descriptions}")
print(f"  duplicateCandidates={len(issues)}")
if issues:
    for name, source_id in issues[:25]:
        print(f"  - {name}: {source_id}")
    raise SystemExit(1)
print("GREEN: aucune description générique FR ne double le renderer natif des features.")
