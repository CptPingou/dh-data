#!/usr/bin/env python3
import argparse, json
from pathlib import Path

DRAFT_NAMES = {"d2a.json", "d2b.json", "d2c.json"}

def load_entries(locale_dir: Path):
    merged = {}

    for p in sorted(locale_dir.glob("*.json")):
        if p.name in DRAFT_NAMES:
            continue

        data = json.loads(p.read_text(encoding="utf-8"))

        if data.get("locale") != "fr" or not isinstance(data.get("entries"), dict):
            raise SystemExit(f"Invalid locale source: {p}")

        for cid, overlay in data["entries"].items():
            if not isinstance(overlay, dict):
                raise SystemExit(f"Invalid locale entry in {p}: {cid}")

            target = merged.setdefault(cid, {})

            for field, value in overlay.items():
                if field in target and target[field] != value:
                    raise SystemExit(
                        f"Conflicting locale field: {cid}.{field} in {p}"
                    )

                target[field] = value

    return merged

def active_foundry_ids(repo: Path):
    ids=set()
    for name in ("classes.json","subclasses.json","subclasses-hope-fear.json","ancestries.json","communities.json"):
        for row in json.loads((repo/"data/srd-2.0/indexes"/name).read_text(encoding="utf-8")):
            ids.add(row["id"])
    for folder in (repo/"data/playtest/blood-hunter-2026-07-09/classes", repo/"data/playtest/blood-hunter-2026-07-09/subclasses"):
        for p in folder.glob("*.json"):
            ids.add(json.loads(p.read_text(encoding="utf-8"))["id"])
    for p in (repo/"data/srd-2.0/domain-cards").glob("*.json"):
        if p.name != "manifest.json":
            for row in json.loads(p.read_text(encoding="utf-8")):
                ids.add(row["id"])
    for p in (repo/"data/playtest/blood-hunter-2026-07-09/domains/blood/cards").glob("*.json"):
        ids.add(json.loads(p.read_text(encoding="utf-8"))["id"])
    for row in json.loads((repo/"data/srd-2.0/equipment/armor.json").read_text(encoding="utf-8")):
        ids.add(row["id"])
    for name in ("weapons-raw.json", "supplemental-weapons.json", "combat-wheelchairs.json"):
        for row in json.loads((repo/"data/srd-2.0/equipment"/name).read_text(encoding="utf-8")):
            ids.add(row["id"])
    ids |= {"srd-2.0.adversary.bear","srd-2.0.environment.abandoned-grove"}

    # Native Foundryborne Ancestry/Community Features are active Foundry content.
    # They have canonical locale IDs but no standalone DH Data identity indexes.
    character_options = repo / "data/locales/fr/character-options.json"
    if character_options.exists():
        data = json.loads(character_options.read_text(encoding="utf-8"))
        ids.update(data.get("entries", {}).keys())

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
    payload={"schemaVersion":1,"locale":"fr","fallback":"en","entries":exported}
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

    ancestry_ids={r["id"] for r in json.loads((repo/"data/srd-2.0/indexes/ancestries.json").read_text(encoding="utf-8"))}
    community_ids={r["id"] for r in json.loads((repo/"data/srd-2.0/indexes/communities.json").read_text(encoding="utf-8"))}
    print(json.dumps({
      "phase":"P2.6.6d3-character-options-locale",
      "canonicalLocaleEntries":len(all_entries),
      "foundryLocaleEntries":len(exported),
      "deferredNotInFoundry":len(all_entries)-len(exported),
      "ancestryRootsExported":len(ancestry_ids & exported.keys()),
      "communityRootsExported":len(community_ids & exported.keys()),
      "target":str(target),
      "schemaVersion":payload["schemaVersion"],
      "locale":payload["locale"],
      "fallback":payload["fallback"],
      "entries":len(payload["entries"]),
      "green": ancestry_ids <= exported.keys() and community_ids <= exported.keys(),
    },ensure_ascii=False,indent=2))
if __name__=="__main__": main()
