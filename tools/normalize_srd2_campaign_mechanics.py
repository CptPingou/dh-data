#!/usr/bin/env python3
"""
P1.1f-b1 — Normalize the five system-heavy SRD 2.0 supplemental mechanics.

Prerequisite:
  Run tools/extract_srd2_campaign_mechanics.py first.

Usage:
  python tools/normalize_srd2_campaign_mechanics.py
"""
from __future__ import annotations
import json, re, unicodedata
from pathlib import Path

BASE=Path("data/srd-2.0/supplemental-campaign-mechanics")
REG=Path("data/srd-2.0/registry")
TARGETS=[
    "faction-tracking",
    "feasts",
    "colossal-adversaries",
    "monster-hunting-campaigns",
    "hex-crawl-campaigns",
]

def load(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def save(path:Path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def clean(s:str)->str:
    return (s.replace("\u00ad","").replace("\u200b","")
             .replace("\ufeff","").replace("￾","-"))

def norm(s:str)->str:
    return re.sub(r"\s+"," ",clean(s)).strip()

def slug(s:str)->str:
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def split_headings(text:str):
    """Conservative heading split.

    Only lines that are overwhelmingly uppercase and short are considered
    headings. This preserves source text without inventing hierarchy.
    """
    lines=clean(text).splitlines()
    chunks=[]
    current={"name":"Introduction","rules_text":[]}
    for raw in lines:
        line=norm(raw)
        if not line:
            continue
        letters=[c for c in line if c.isalpha()]
        uppercase=bool(letters) and sum(c.isupper() for c in letters)/len(letters)>=0.85
        looks_heading=uppercase and len(line)<=80 and not line.startswith("•")
        if looks_heading:
            if current["rules_text"]:
                current["rules_text"]="\n".join(current["rules_text"]).strip()
                chunks.append(current)
            current={"name":line.title(),"raw_heading":line,"rules_text":[]}
        else:
            current["rules_text"].append(line)
    if current["rules_text"] or current.get("raw_heading"):
        current["rules_text"]="\n".join(current["rules_text"]).strip()
        chunks.append(current)
    for c in chunks:
        c["id"]=slug(c["name"])
    return chunks

def find_int(pattern,text):
    m=re.search(pattern,text,re.I|re.S)
    return int(m.group(1)) if m else None

def normalize_faction(item):
    # Do not infer track semantics from numbers alone. Preserve the SRD's own
    # named subsections as the canonical structured layer.
    return {
        "mechanic_type":"faction_tracking",
        "subsections":split_headings(item["rules_text"]),
        "normalization_level":"structural",
    }

def normalize_feasts(item):
    text=norm(item["rules_text"])
    flavor_pairs={}
    for name,die in re.findall(
        r"\b(Sweet|Salty|Bitter|Sour|Savory|Weird)\s*\(?(d(?:4|6|8|10|12|20))\)?",
        text,re.I):
        flavor_pairs[name.title()]=die.lower()

    # The SRD explicitly gives HP bands → ingredient count.
    hp_guide=[]
    for band,count in re.findall(r"\b(1[–-]4|5[–-]7|8[–-]10|12\+)\s+(\d)\b",text):
        hp_guide.append({"max_hp_band":band.replace("-","–"),"ingredients":int(count)})

    return {
        "mechanic_type":"feast",
        "subsections":split_headings(item["rules_text"]),
        "flavors":flavor_pairs,
        "ingredient_strength":{"min":1,"max":3} if re.search(r"value between 1 and 3",text,re.I) else None,
        "inventory_capacity_basis":"highest_trait" if re.search(r"maximum number of ingredients.*highest trait",text,re.I) else None,
        "harvest_hp_to_ingredients":hp_guide,
        "normalization_level":"mechanical",
    }

def normalize_colossal(item):
    text=norm(item["rules_text"])
    return {
        "mechanic_type":"colossal_adversary",
        "subsections":split_headings(item["rules_text"]),
        "uses_framework_stat_block":bool(re.search(r"colossus framework.*stat block",text,re.I)),
        "uses_segment_stat_blocks":bool(re.search(r"multiple adversary stat blocks.*segment",text,re.I)),
        "segment_states":{
            "broken":{
                "present":bool(re.search(r"\bBroken\b",text)),
                "blocks_actions_reactions":bool(re.search(r"Broken.*can't use actions or reactions",text,re.I)),
            },
            "destroyed":{
                "present":bool(re.search(r"\bDestroyed\b",text)),
                "trigger":"last_hp" if re.search(r"marks its last Hit Point.*Destroyed",text,re.I) else None,
                "blocks_features":bool(re.search(r"Destroyed.*no longer use any of its features",text,re.I)),
            },
        },
        "default_defeat_condition":"all_segments_destroyed"
            if re.search(r"defeated when all .*segments are Destroyed",text,re.I) else None,
        "alternate_defeat_condition_possible":bool(re.search(r"alternative way to be defeated",text,re.I)),
        "normalization_level":"mechanical",
    }

def normalize_monster_hunting(item):
    text=norm(item["rules_text"])
    beats=[]
    for n,name in re.findall(
        r"\b([1-5])\.\s*(Arrival|Investigation|Escalation|Confrontation|Epilogue)\s*:",
        text,re.I):
        beats.append({"order":int(n),"name":name.title()})

    monster_questions=[]
    for q in [
        "What is it?",
        "What does it want?",
        "Where can you find it?",
        "How can you defeat it?",
        "What else should you worry about?",
    ]:
        if q.lower() in text.lower():
            monster_questions.append(q)

    clue_range=None
    m=re.search(r"devise\s+(\d+)[–-](\d+)\s+pieces of information",text,re.I)
    if m:
        clue_range={"min":int(m.group(1)),"max":int(m.group(2))}

    return {
        "mechanic_type":"monster_hunt",
        "subsections":split_headings(item["rules_text"]),
        "hunt_beats":beats,
        "monster_design_questions":monster_questions,
        "liminal_clues":{
            "recommended_count":clue_range,
            "manifest_on_discovery":bool(re.search(r"exists in potential until it manifests",text,re.I)),
            "location_agnostic":bool(re.search(r"not bound to a particular place",text,re.I)),
        },
        "related_collections":{
            "weapons":"data/srd-2.0/equipment/supplemental-weapons.json",
        },
        "normalization_level":"mechanical",
    }

def normalize_hex(item):
    text=norm(item["rules_text"])
    miles=find_int(r"represents roughly\s+(\d+)\s+miles",text)

    short_rests=None
    m=re.search(r"take up to\s+(\d+|one|two|three|four|five)\s+short rests",text,re.I)
    if m:
        wordmap={"one":1,"two":2,"three":3,"four":4,"five":5}
        raw=m.group(1).lower()
        short_rests=int(raw) if raw.isdigit() else wordmap[raw]

    ocean={}
    for result,days in re.findall(
        r"result of\s+([1-4]).{0,140}?takes?\s+(\w+|\d+)\s+days?",
        text,re.I|re.S):
        wordmap={"a":1,"one":1,"two":2,"three":3,"four":4}
        ocean[int(result)]=wordmap.get(days.lower(), int(days) if days.isdigit() else None)

    return {
        "mechanic_type":"hex_crawl",
        "subsections":split_headings(item["rules_text"]),
        "hex_scale_miles":miles,
        "movement_unit":"one_hex_at_a_time" if re.search(r"moves? one hex at a time",text,re.I) else None,
        "wilderness_short_rest_limit":short_rests,
        "long_rest_requires_sanctuary":bool(re.search(r"restricted from taking long rests outside a sanctuary",text,re.I)),
        "ocean_travel_days_by_d4":ocean,
        "doom_track_present":bool(re.search(r"\bDOOM TRACKS?\b",item["rules_text"],re.I)),
        "normalization_level":"mechanical",
    }

NORMALIZERS={
    "faction-tracking":normalize_faction,
    "feasts":normalize_feasts,
    "colossal-adversaries":normalize_colossal,
    "monster-hunting-campaigns":normalize_monster_hunting,
    "hex-crawl-campaigns":normalize_hex,
}

def main():
    results={}
    missing=[]
    for key in TARGETS:
        path=BASE/f"{key}.json"
        if not path.exists():
            missing.append(key)
            continue
        item=load(path)
        mechanics=NORMALIZERS[key](item)
        item["mechanics"]=mechanics
        item.setdefault("normalization",{})
        item["normalization"].update({
            "phase":"P1.1f-b1-fix1",
            "status":"normalized",
            "source_field":"rules_text",
        })
        save(path,item)
        results[key]=mechanics

    feast=results.get("feasts",{})
    colossal=results.get("colossal-adversaries",{})
    hunt=results.get("monster-hunting-campaigns",{})
    hexcrawl=results.get("hex-crawl-campaigns",{})
    faction=results.get("faction-tracking",{})

    checks={
        "targets_present":not missing and len(results)==5,
        "faction_subsections_present":len(faction.get("subsections",[]))>0,
        "feast_six_flavors":len(feast.get("flavors",{}))==6,
        "feast_strength_range":feast.get("ingredient_strength")=={"min":1,"max":3},
        "feast_inventory_capacity":feast.get("inventory_capacity_basis")=="highest_trait",
        "colossal_segment_blocks":colossal.get("uses_segment_stat_blocks") is True,
        "colossal_broken_present":colossal.get("segment_states",{}).get("broken",{}).get("present") is True,
        "colossal_destroyed_present":colossal.get("segment_states",{}).get("destroyed",{}).get("present") is True,
        "monster_hunt_five_beats":len(hunt.get("hunt_beats",[]))==5,
        "monster_hunt_four_core_questions":len(hunt.get("monster_design_questions",[]))>=4,
        "hex_scale_present":hexcrawl.get("hex_scale_miles") is not None,
        "hex_short_rest_limit_present":hexcrawl.get("wilderness_short_rest_limit") is not None,
        "hex_long_rest_rule_present":hexcrawl.get("long_rest_requires_sanctuary") is True,
    }

    # Fix Python's bool-expression typo safely without weakening validation.
    checks["monster_hunt_four_core_questions"]=len(
        hunt.get("monster_design_questions",[])
    ) >= 4

    status={
        "phase":"P1.1f-b1-fix1",
        "targets":TARGETS,
        "normalized":list(results),
        "missing":missing,
        "checks":checks,
        "validation":"GREEN" if all(checks.values()) else "RED",
        "debug":{
            "faction_subsections":[x["name"] for x in faction.get("subsections",[])],
            "feast_flavors":feast.get("flavors",{}),
            "feast_harvest_guide":feast.get("harvest_hp_to_ingredients",[]),
            "monster_hunt_beats":hunt.get("hunt_beats",[]),
            "hex_ocean_travel_days_by_d4":hexcrawl.get("ocean_travel_days_by_d4",{}),
        },
        "notes":[
            "Faction Tracking is intentionally structural in b1: no numeric semantics are inferred from incidental PDF numbers.",
            "P1.1f-b1-fix1 accepts spelled-out short-rest limits such as the SRD wording `three short rests`.",
            "Feasts, Colossal Adversaries, Monster Hunting, and Hex Crawl receive deterministic mechanical fields in addition to preserved SRD rules_text.",
            "Monster Hunting equipment remains linked to the existing equipment extraction instead of being duplicated.",
            "Canonical supplemental IDs from P1.1f-a are unchanged."
        ]
    }
    REG.mkdir(parents=True,exist_ok=True)
    save(REG/"P1.1f-b1-status.json",status)
    print(json.dumps(status,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
