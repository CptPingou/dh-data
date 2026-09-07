#!/usr/bin/env python3
"""
P1.1f-b2 — Normalize the six remaining SRD 2.0 supplemental campaign mechanics.

Prerequisite:
  P1.1f-a must already have created the 11 supplemental JSON files.

Usage:
  python tools/normalize_srd2_campaign_mechanics_b2.py
"""
from __future__ import annotations
import json, re, unicodedata
from pathlib import Path

BASE=Path("data/srd-2.0/supplemental-campaign-mechanics")
REG=Path("data/srd-2.0/registry")

TARGETS=[
    "everyday-hero-starting-equipment",
    "grimdark-campaigns",
    "tech-based-campaigns",
    "western-campaigns",
    "floating-magic-school-campaigns",
    "fairy-tale-campaigns",
]

def load(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def save(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
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
    lines=clean(text).splitlines()
    chunks=[]
    current={"name":"Introduction","rules_text":[]}
    for raw in lines:
        line=norm(raw)
        if not line:
            continue
        letters=[c for c in line if c.isalpha()]
        uppercase=bool(letters) and sum(c.isupper() for c in letters)/len(letters)>=0.82
        heading=uppercase and len(line)<=90 and not line.startswith("•")
        if heading:
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

def has(text,*parts):
    low=norm(text).lower()
    return all(p.lower() in low for p in parts)

def normalize_everyday(item):
    t=item["rules_text"]
    return {
        "mechanic_type":"starting_equipment_variant",
        "subsections":split_headings(t),
        "replaces_standard_starting_equipment":
            bool(re.search(r"instead of the .*equipment tables|no access to standard weapons",t,re.I|re.S)),
        "tier":1 if re.search(r"Tier\s*1",t,re.I) else None,
        "contains_primary_weapon_table":bool(re.search(r"Primary .*Weapons",t,re.I)),
        "contains_secondary_weapon_table":bool(re.search(r"Secondary .*Weapons",t,re.I)),
        "contains_armor_table":bool(re.search(r"\bArmor\b",t,re.I)),
        "normalization_level":"structural",
    }

def normalize_grimdark(item):
    t=norm(item["rules_text"])
    crit=None
    m=re.search(r"critically succeeds on attack rolls of\s+(\d+)[–-](\d+)",t,re.I)
    if m:
        crit={"min":int(m.group(1)),"max":int(m.group(2))}
    hope=None
    m=re.search(r"each PC present gains\s+(\d+)\s+Hope",t,re.I)
    if m:
        hope=int(m.group(1))
    return {
        "mechanic_type":"grimdark_campaign",
        "subsections":split_headings(item["rules_text"]),
        "shadow_touched":{
            "adversary_feature_present":has(t,"Shadow-Touched"),
            "critical_success_range":crit,
            "pc_damage_bonus_basis":"marked_scars"
                if re.search(r"damage bonus equal to the number of scars",t,re.I) else None,
            "last_hope_scar_corruption":bool(re.search(r"last Hope slot with a scar.*succumb",t,re.I)),
        },
        "sacred_bonfires":{
            "present":has(t,"Sacred Bonfires"),
            "requires_sacred_torch_to_relight":bool(re.search(r"can't be reignited without a Sacred Torch",t,re.I)),
            "hope_on_relight":hope,
        },
        "normalization_level":"mechanical",
    }

def normalize_tech(item):
    t=norm(item["rules_text"])
    slots=None
    m=re.search(r"starts with\s+(\w+|\d+)\s+Upgrade slots at Tier 1",t,re.I)
    if m:
        words={"one":1,"two":2,"three":3,"four":4}
        raw=m.group(1).lower()
        slots=int(raw) if raw.isdigit() else words.get(raw)
    return {
        "mechanic_type":"tech_campaign",
        "subsections":split_headings(item["rules_text"]),
        # pypdf splits the initial T in "Tech" ("T ech damage").
        "tech_damage_replaces_magic":bool(
            re.search(r"T\s*ech damage is a replacement for magic damage",t,re.I)
        ),
        "iconic_weapon":{
            "replaces_standard_weapons":bool(re.search(r"don't have access to .*normal selection of primary and secondary weapons",t,re.I)),
            "two_handed":bool(re.search(r"considered two-handed weapons",t,re.I)),
            "bonded_damage_bonus_basis":"level"
                if re.search(r"bonus to your damage rolls equal to your level",t,re.I) else None,
            "tier1_upgrade_slots":slots,
            "additional_slots_per_later_tier":1
                if re.search(r"additional Upgrade slot at each subsequent tier",t,re.I) else None,
        },
        "crafting_and_trading_present":bool(re.search(r"Crafting\s*&\s*Trading",t,re.I)),
        "normalization_level":"mechanical",
    }

def normalize_western(item):
    t=norm(item["rules_text"])
    weapon_names=[
        x for x in ["Revolver","Rifle","Shotgun","Lasso","Small Revolver"]
        if re.search(r"\b"+re.escape(x)+r"\b",t,re.I)
    ]
    return {
        "mechanic_type":"western_campaign",
        "subsections":split_headings(item["rules_text"]),
        "weapon_names":weapon_names,
        "tiered_weapon_variants":bool(re.search(r"Tier\s*1:.*Tier\s*2:.*Tier\s*3:.*Tier\s*4:",t,re.I|re.S)),
        "dynamite_consumable_present":bool(re.search(r"\bDynamite\b.*Consumable",t,re.I)),
        "related_collections":{
            "weapons":"data/srd-2.0/equipment/supplemental-weapons.json",
        },
        "normalization_level":"mechanical",
    }

def normalize_floating_school(item):
    t=norm(item["rules_text"])
    return {
        "mechanic_type":"floating_magic_school_campaign",
        "subsections":split_headings(item["rules_text"]),
        "flight":{
            "artifact_created_at_character_creation":bool(re.search(r"character creation.*magic artifact.*fly",t,re.I)),
            "close_range_uses_normal_movement":bool(re.search(r"fly within Close range as part of an action roll",t,re.I)),
            "beyond_close_requires_trait_roll":bool(re.search(r"trait roll to move beyond Close range",t,re.I)),
            "any_appropriate_trait":bool(re.search(r"any appropriate trait \(not just Agility\)",t,re.I)),
        },
        "less_lethal_death_moves":{
            "present":bool(re.search(r"LESS LETHAL CAMPAIGNS",item["rules_text"],re.I)),
            "death_replaced_by_recovery":bool(re.search(r"death move.*instead puts them in the infirmary|death move.*sends them home",t,re.I)),
        },
        "normalization_level":"mechanical",
    }

def normalize_fairy_tale(item):
    # This section is intentionally conservative. Its SRD text is preserved,
    # and b2 only commits to the structural sub-systems explicitly present.
    subs=split_headings(item["rules_text"])
    names=[x["name"] for x in subs]
    return {
        "mechanic_type":"fairy_tale_campaign",
        "subsections":subs,
        "subsection_names":names,
        "normalization_level":"structural",
    }

NORMALIZERS={
    "everyday-hero-starting-equipment":normalize_everyday,
    "grimdark-campaigns":normalize_grimdark,
    "tech-based-campaigns":normalize_tech,
    "western-campaigns":normalize_western,
    "floating-magic-school-campaigns":normalize_floating_school,
    "fairy-tale-campaigns":normalize_fairy_tale,
}

def main():
    normalized={}
    missing=[]
    for key in TARGETS:
        p=BASE/f"{key}.json"
        if not p.exists():
            missing.append(key)
            continue
        item=load(p)
        mechanics=NORMALIZERS[key](item)
        item["mechanics"]=mechanics
        item.setdefault("normalization",{})
        item["normalization"].update({
            "phase":"P1.1f-b2-fix1",
            "status":"normalized",
            "source_field":"rules_text",
        })
        save(p,item)
        normalized[key]=mechanics

    everyday=normalized.get("everyday-hero-starting-equipment",{})
    grim=normalized.get("grimdark-campaigns",{})
    tech=normalized.get("tech-based-campaigns",{})
    western=normalized.get("western-campaigns",{})
    school=normalized.get("floating-magic-school-campaigns",{})
    fairy=normalized.get("fairy-tale-campaigns",{})

    checks={
        "targets_present":not missing and len(normalized)==6,

        "everyday_subsections_present":len(everyday.get("subsections",[]))>0,
        "everyday_primary_weapons_present":everyday.get("contains_primary_weapon_table") is True,

        "grimdark_shadow_touched_present":
            grim.get("shadow_touched",{}).get("adversary_feature_present") is True,
        "grimdark_crit_19_20":
            grim.get("shadow_touched",{}).get("critical_success_range")=={"min":19,"max":20},
        "grimdark_bonfire_present":
            grim.get("sacred_bonfires",{}).get("present") is True,
        "grimdark_bonfire_hope_3":
            grim.get("sacred_bonfires",{}).get("hope_on_relight")==3,

        "tech_damage_replacement":
            tech.get("tech_damage_replaces_magic") is True,
        "tech_iconic_two_handed":
            tech.get("iconic_weapon",{}).get("two_handed") is True,
        "tech_bonded_level_bonus":
            tech.get("iconic_weapon",{}).get("bonded_damage_bonus_basis")=="level",
        "tech_tier1_upgrade_slots_2":
            tech.get("iconic_weapon",{}).get("tier1_upgrade_slots")==2,

        "western_five_weapon_names":
            len(western.get("weapon_names",[]))==5,
        "western_dynamite_present":
            western.get("dynamite_consumable_present") is True,

        "floating_school_flight_artifact":
            school.get("flight",{}).get("artifact_created_at_character_creation") is True,
        "floating_school_any_trait":
            school.get("flight",{}).get("any_appropriate_trait") is True,

        "fairy_tale_subsections_present":
            len(fairy.get("subsections",[]))>0,
    }

    status={
        "phase":"P1.1f-b2-fix1",
        "targets":TARGETS,
        "normalized":list(normalized),
        "missing":missing,
        "checks":checks,
        "validation":"GREEN" if all(checks.values()) else "RED",
        "debug":{
            "everyday_subsections":[x["name"] for x in everyday.get("subsections",[])],
            "grimdark":grim,
            "tech_based":tech,
            "western_weapon_names":western.get("weapon_names",[]),
            "floating_school":school,
            "fairy_tale_subsections":[x["name"] for x in fairy.get("subsections",[])],
        },
        "notes":[
            "P1.1f-b2 normalizes the six remaining supplemental mechanics without changing P1.1f-a canonical IDs.",
            "P1.1f-b2-fix1 tolerates the SRD PDF extraction artifact `T ech damage` when validating Tech Damage.",
            "Everyday Hero and Fairy Tale remain structurally conservative where the SRD section is primarily variant content rather than a single deterministic subsystem.",
            "Western weapon entities are not duplicated; the mechanic links to the supplemental weapon collection produced in P1.1d.",
            "Raw SRD rules_text remains preserved beside normalized mechanics."
        ]
    }
    save(REG/"P1.1f-b2-status.json",status)
    print(json.dumps(status,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
