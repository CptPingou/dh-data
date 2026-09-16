#!/usr/bin/env python3
"""P2.6.6d3 one-shot: consolidate d2a/d2b/d2c candidate files into canonical locale overlays."""
import json
from pathlib import Path

HERE=Path(__file__).resolve().parents[1]
LOCALE=HERE/"data/locales/fr"
SOURCES=[LOCALE/"d2a.json",LOCALE/"d2b.json",LOCALE/"d2c.json"]
TARGET=LOCALE/"character-options.json"

def candidate_overlay(entry):
    out={}
    # d2a: {"system.description": "..."}
    if isinstance(entry,dict) and "system.description" in entry:
        out["description"]=entry["system.description"]
        return out
    # d2b/d2c: metadata + fields[path] = {en,fr,kind}
    fields=entry.get("fields",{}) if isinstance(entry,dict) else {}
    for path, field in fields.items():
        fr=field.get("fr") if isinstance(field,dict) else None
        if not fr:
            continue
        if path=="name":
            out["name"]=fr
        elif path=="system.description":
            out["description"]=fr
        else:
            # Preserve explicit Foundry leaf path for native action/effect localization.
            out[path]=fr
    return out

merged={}
for p in SOURCES:
    if not p.exists():
        raise SystemExit(f"Missing candidate: {p}")
    data=json.loads(p.read_text(encoding="utf-8"))
    if data.get("locale")!="fr" or not isinstance(data.get("entries"),dict):
        raise SystemExit(f"Invalid candidate: {p}")
    for cid, entry in data["entries"].items():
        ov=candidate_overlay(entry)
        if not ov:
            raise SystemExit(f"Empty canonical overlay for {cid} from {p.name}")
        if cid in merged and merged[cid]!=ov:
            raise SystemExit(f"Conflicting candidate entry: {cid}")
        merged[cid]=ov

payload={
  "locale":"fr",
  "version":"P2.6.6d3",
  "scope":"native-character-options",
  "entries":dict(sorted(merged.items()))
}
TARGET.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({
  "phase":"P2.6.6d3-consolidate",
  "sources":[p.name for p in SOURCES],
  "target":str(TARGET),
  "entries":len(merged),
  "green":len(merged)==102
},ensure_ascii=False,indent=2))
