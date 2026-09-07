#!/usr/bin/env python3
import argparse, json
from pathlib import Path

def load_entries(locale_dir: Path):
    merged={}
    for p in sorted(locale_dir.glob("*.json")):
        data=json.loads(p.read_text(encoding="utf-8"))
        if data.get("locale") != "fr" or not isinstance(data.get("entries"), dict):
            raise SystemExit(f"Invalid locale source: {p}")
        for cid, overlay in data["entries"].items():
            if cid in merged and merged[cid] != overlay:
                raise SystemExit(f"Conflicting locale entry: {cid}")
            merged[cid]=overlay
    return merged

def active_foundry_ids(repo: Path):
    ids=set()
    # Current Foundry families relevant to this locale lot.
    for name in ("classes.json","subclasses.json","subclasses-hope-fear.json"):
        for row in json.loads((repo/"data/srd-2.0/indexes"/name).read_text(encoding="utf-8")):
            ids.add(row["id"])
    for folder in (repo/"data/playtest/blood-hunter-2026-07-09/classes", repo/"data/playtest/blood-hunter-2026-07-09/subclasses"):
        for p in folder.glob("*.json"):
            ids.add(json.loads(p.read_text(encoding="utf-8"))["id"])
    # Domain cards are active Foundry content too (210 SRD + active Blood 21).
    for p in (repo/"data/srd-2.0/domain-cards").glob("*.json"):
        if p.name == "manifest.json":
            continue
        for row in json.loads(p.read_text(encoding="utf-8")):
            ids.add(row["id"])
    for p in (repo/"data/playtest/blood-hunter-2026-07-09/domains/blood/cards").glob("*.json"):
        ids.add(json.loads(p.read_text(encoding="utf-8"))["id"])
    # Armor is active Foundry content (69 SRD entries).
    for row in json.loads((repo/"data/srd-2.0/equipment/armor.json").read_text(encoding="utf-8")):
        ids.add(row["id"])
    # Weapons are active Foundry content (302 standard + 44 supplemental + 12 combat wheelchairs).
    for name in ("weapons-raw.json", "supplemental-weapons.json", "combat-wheelchairs.json"):
        for row in json.loads((repo/"data/srd-2.0/equipment"/name).read_text(encoding="utf-8")):
            ids.add(row["id"])
    # Existing pilot actor overlays are active too.
    ids |= {"srd-2.0.adversary.bear","srd-2.0.environment.abandoned-grove"}
    return ids

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("toolkit", help="Path to daggerheart-campaign-toolkit module")
    args=ap.parse_args()
    repo=Path(__file__).resolve().parents[1]
    all_entries=load_entries(repo/"data/locales/fr")
    active=active_foundry_ids(repo)
    exported={k:v for k,v in sorted(all_entries.items()) if k in active}
    target=Path(args.toolkit)/"locales/fr.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    payload={
      "schemaVersion": 1,
      "locale": "fr",
      "fallback": "en",
      "entries": exported,
    }
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
      "phase":"P2.3.4e-lot1-weapon-identities",
      "canonicalLocaleEntries":len(all_entries),
      "foundryLocaleEntries":len(exported),
      "deferredNotInFoundry":len(all_entries)-len(exported),
      "target":str(target),
      "schemaVersion":payload["schemaVersion"],
      "locale":payload["locale"],
      "fallback":payload["fallback"],
      "entries":len(payload["entries"]),
      "green": all(k in exported for k in [row["id"] for row in json.loads((repo/"data/srd-2.0/equipment/armor.json").read_text(encoding="utf-8"))]),
    },ensure_ascii=False,indent=2))
if __name__=="__main__": main()
