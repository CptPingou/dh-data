#!/usr/bin/env python3
"""
P1.2 — Global completeness / integrity audit for daggerheart-data SRD 2.0.

Run from the daggerheart-data repository root:

  python tools/audit_srd2_completeness.py

The audit is read-only except for:
  data/srd-2.0/registry/P1.2-status.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from collections import Counter, defaultdict

ROOT=Path(".")
SRD=ROOT/"data/srd-2.0"
REG=SRD/"registry"

EXPECTED={
    "classes":13,
    "subclasses_unique":26,
    "ancestries":24,
    "communities":15,
    "domains":10,
    "transformations":6,
    "domain_cards":210,
    "armor":69,
    "items":120,
    "consumables":120,
    "beastforms":24,
    "standard_weapons":302,
    "combat_wheelchairs":12,
    "supplemental_weapons":44,
    "fixed_weapon_variants":358,
    "adversaries":264,
    "environments":47,
    "campaign_frames":1,
    "supplemental_campaign_mechanics":11,
}

EXPECTED_BY_TIER={
    "beastforms":{"1":6,"2":6,"3":6,"4":6},
    "adversaries":{"1":86,"2":78,"3":55,"4":45},
    "environments":{"1":16,"2":12,"3":11,"4":8},
    "standard_weapons":{
        "1":{"Primary":37,"Secondary":13},
        "2":{"Primary":67,"Secondary":20},
        "3":{"Primary":59,"Secondary":20},
        "4":{"Primary":66,"Secondary":20},
    },
}

EXPECTED_DOMAINS={
    "arcana","blade","bone","codex","dread",
    "grace","midnight","sage","splendor","valor",
}

def load(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def save(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def list_or_empty(path:Path):
    if not path.exists():
        return []
    obj=load(path)
    if isinstance(obj,list):
        return obj
    # A few generated collections may use a wrapper in future versions.
    for key in ("items","entries","rows","data","entities"):
        if isinstance(obj,dict) and isinstance(obj.get(key),list):
            return obj[key]
    return []

def entity_id(x):
    if not isinstance(x,dict):
        return None
    return x.get("id") or x.get("_id")

def name_of(x):
    if not isinstance(x,dict):
        return None
    ident=x.get("identity")
    if isinstance(ident,dict) and ident.get("name"):
        return ident["name"]
    return x.get("name")

def tier_of(x):
    if not isinstance(x,dict):
        return None
    for k in ("tier","Tier"):
        if x.get(k) is not None:
            return str(x[k])
    ident=x.get("identity")
    if isinstance(ident,dict) and ident.get("tier") is not None:
        return str(ident["tier"])
    return None

def role_of(x):
    if not isinstance(x,dict):
        return None
    for k in ("role","weapon_role","slot","category"):
        if x.get(k):
            return str(x[k])
    return None

def unique_ids(rows):
    ids=[entity_id(x) for x in rows if entity_id(x)]
    return len(ids)==len(set(ids)), [k for k,v in Counter(ids).items() if v>1]

def unique_names(rows):
    names=[name_of(x) for x in rows if name_of(x)]
    return len(names)==len(set(names)), [k for k,v in Counter(names).items() if v>1]

def semantic_subclass_key(x):
    return ((x.get("class") or "").strip().casefold(), (x.get("name") or "").strip().casefold())

def domain_cards():
    base=SRD/"domain-cards"
    cards=[]
    counts={}
    missing_files=[]
    for domain in sorted(EXPECTED_DOMAINS):
        path=base/f"{domain}.json"
        if not path.exists():
            missing_files.append(str(path))
            counts[domain]=0
            continue
        rows=list_or_empty(path)
        counts[domain]=len(rows)
        cards.extend(rows)
    return cards,counts,missing_files

def standard_weapon_role(x):
    # Current P1.1d output used several names during development.
    for k in ("weapon_type","role","slot","category"):
        v=x.get(k) if isinstance(x,dict) else None
        if isinstance(v,str):
            if v.casefold()=="primary": return "Primary"
            if v.casefold()=="secondary": return "Secondary"
    # Fallback to a nested identity/system representation if adapters later add it.
    for parent in ("identity","system"):
        d=x.get(parent,{}) if isinstance(x,dict) else {}
        if isinstance(d,dict):
            for k in ("weapon_type","role","slot","category"):
                v=d.get(k)
                if isinstance(v,str):
                    if v.casefold()=="primary": return "Primary"
                    if v.casefold()=="secondary": return "Secondary"
    return None

def main():
    files={
        "classes":SRD/"indexes/classes.json",
        "subclasses_core_index":SRD/"indexes/subclasses.json",
        "subclasses_hf_index":SRD/"indexes/subclasses-hope-fear.json",
        "ancestries":SRD/"indexes/ancestries.json",
        "communities":SRD/"indexes/communities.json",
        "domains":SRD/"indexes/domains.json",
        "transformations":SRD/"indexes/transformations.json",
        "armor":SRD/"equipment/armor.json",
        "items":SRD/"equipment/items.json",
        "consumables":SRD/"equipment/consumables.json",
        "beastforms":SRD/"beastforms/beastforms.json",
        "standard_weapons":SRD/"equipment/weapons-raw.json",
        "combat_wheelchairs":SRD/"equipment/combat-wheelchairs.json",
        "supplemental_weapons":SRD/"equipment/supplemental-weapons.json",
        "adversaries":SRD/"adversaries/adversaries.json",
        "environments":SRD/"environments/environments.json",
        "campaign_frame_witherwild":SRD/"campaign-frames/witherwild.json",
        "supplemental_campaign_index":SRD/"supplemental-campaign-mechanics/index.json",
    }

    missing_files=[str(p) for p in files.values() if not p.exists()]

    collections={k:list_or_empty(p) for k,p in files.items()
                 if k not in ("campaign_frame_witherwild",) and p.exists()}

    # Subclasses deliberately exist in two historical index views.
    # Audit their semantic union rather than naively summing both files.
    subclass_rows=collections.get("subclasses_core_index",[])+collections.get("subclasses_hf_index",[])
    subclass_unique={}
    for row in subclass_rows:
        subclass_unique[semantic_subclass_key(row)]=row

    cards,domain_card_counts,missing_domain_files=domain_cards()
    missing_files.extend(missing_domain_files)

    # Campaign frame is one object, not an array.
    witherwild=load(files["campaign_frame_witherwild"]) if files["campaign_frame_witherwild"].exists() else None
    supplemental=collections.get("supplemental_campaign_index",[])

    standard=collections.get("standard_weapons",[])
    wheelchairs=collections.get("combat_wheelchairs",[])
    supplemental_weapons=collections.get("supplemental_weapons",[])

    counts={
        "classes":len(collections.get("classes",[])),
        "subclasses_unique":len(subclass_unique),
        "ancestries":len(collections.get("ancestries",[])),
        "communities":len(collections.get("communities",[])),
        "domains":len(collections.get("domains",[])),
        "transformations":len(collections.get("transformations",[])),
        "domain_cards":len(cards),
        "armor":len(collections.get("armor",[])),
        "items":len(collections.get("items",[])),
        "consumables":len(collections.get("consumables",[])),
        "beastforms":len(collections.get("beastforms",[])),
        "standard_weapons":len(standard),
        "combat_wheelchairs":len(wheelchairs),
        "supplemental_weapons":len(supplemental_weapons),
        "fixed_weapon_variants":len(standard)+len(wheelchairs)+len(supplemental_weapons),
        "adversaries":len(collections.get("adversaries",[])),
        "environments":len(collections.get("environments",[])),
        "campaign_frames":1 if isinstance(witherwild,dict) and witherwild else 0,
        "supplemental_campaign_mechanics":len(supplemental),
    }

    # Tier counts.
    beast_tiers=Counter(tier_of(x) for x in collections.get("beastforms",[]) if tier_of(x))
    adv_tiers=Counter(tier_of(x) for x in collections.get("adversaries",[]) if tier_of(x))
    env_tiers=Counter(tier_of(x) for x in collections.get("environments",[]) if tier_of(x))

    standard_tiers=defaultdict(lambda:Counter())
    for row in standard:
        t=tier_of(row)
        r=standard_weapon_role(row)
        if t and r:
            standard_tiers[t][r]+=1

    # Identity checks across canonical collections.
    id_duplicates={}
    name_duplicates={}
    canonical_identity_sets={
        "classes":collections.get("classes",[]),
        "ancestries":collections.get("ancestries",[]),
        "communities":collections.get("communities",[]),
        "domains":collections.get("domains",[]),
        "transformations":collections.get("transformations",[]),
        "domain_cards":cards,
        "armor":collections.get("armor",[]),
        "items":collections.get("items",[]),
        "consumables":collections.get("consumables",[]),
        "beastforms":collections.get("beastforms",[]),
        "adversaries":collections.get("adversaries",[]),
        "environments":collections.get("environments",[]),
        "supplemental_campaign_mechanics":supplemental,
    }
    for key,rows in canonical_identity_sets.items():
        ids_ok,id_dups=unique_ids(rows)
        names_ok,name_dups=unique_names(rows)
        if id_dups: id_duplicates[key]=id_dups
        if name_dups: name_duplicates[key]=name_dups

    all_ids=[]
    id_locations=defaultdict(list)
    for key,rows in canonical_identity_sets.items():
        for row in rows:
            eid=entity_id(row)
            if eid:
                all_ids.append(eid)
                id_locations[eid].append(key)
    global_id_dups={eid:locs for eid,locs in id_locations.items() if len(locs)>1}

    # Domain references from classes.
    class_domain_refs=[]
    known_domain_names={str(name_of(x)).casefold() for x in collections.get("domains",[]) if name_of(x)}
    for row in collections.get("classes",[]):
        refs=[]
        for key in ("domains","domain","domain_access"):
            v=row.get(key) if isinstance(row,dict) else None
            if isinstance(v,list): refs.extend(str(x) for x in v)
            elif isinstance(v,str): refs.append(v)
        for ref in refs:
            if ref.casefold() not in known_domain_names:
                class_domain_refs.append({"class":name_of(row),"domain":ref})

    # Supplemental mechanics should all have been normalized by b1/b2.
    supplemental_not_normalized=[]
    for row in supplemental:
        nm=name_of(row)
        slug=(row.get("identity") or {}).get("slug") if isinstance(row,dict) else None
        if slug:
            p=SRD/"supplemental-campaign-mechanics"/f"{slug}.json"
            if not p.exists():
                supplemental_not_normalized.append({"name":nm,"reason":"entity_file_missing"})
                continue
            full=load(p)
            if not isinstance(full.get("mechanics"),dict):
                supplemental_not_normalized.append({"name":nm,"reason":"mechanics_missing"})
            if not isinstance(full.get("normalization"),dict) or full["normalization"].get("status")!="normalized":
                supplemental_not_normalized.append({"name":nm,"reason":"normalization_status_missing"})

    checks={}
    for key,expected in EXPECTED.items():
        checks[f"count_{key}"]=counts.get(key)==expected

    checks.update({
        "required_files_present":len(missing_files)==0,
        "domain_card_21_each":all(domain_card_counts.get(d)==21 for d in EXPECTED_DOMAINS),
        "domain_card_domains_exact":set(domain_card_counts)==EXPECTED_DOMAINS,
        "beastforms_by_tier":dict(beast_tiers)==EXPECTED_BY_TIER["beastforms"],
        "adversaries_by_tier":dict(adv_tiers)==EXPECTED_BY_TIER["adversaries"],
        "environments_by_tier":dict(env_tiers)==EXPECTED_BY_TIER["environments"],
        "standard_weapons_by_tier_role":
            {t:dict(c) for t,c in standard_tiers.items()}==EXPECTED_BY_TIER["standard_weapons"],
        "canonical_collection_ids_unique":len(id_duplicates)==0,
        "global_canonical_ids_unique":len(global_id_dups)==0,
        "subclasses_semantic_unique_26":len(subclass_unique)==26,
        "class_domain_references_resolve":len(class_domain_refs)==0,
        "supplemental_all_normalized":len(supplemental_not_normalized)==0,
        "witherwild_14_sections":
            isinstance(witherwild,dict) and len(witherwild.get("sections",[]))==14,
    })

    # Distinguish hard failures from useful warnings.
    warnings=[]
    if name_duplicates:
        warnings.append({
            "type":"duplicate_names",
            "detail":name_duplicates,
            "note":"Duplicate display names are warning-only; stable IDs remain authoritative."
        })

    report={
        "phase":"P1.2",
        "scope":"SRD 2.0 canonical data integrity and completeness",
        "counts":counts,
        "expected":EXPECTED,
        "checks":checks,
        "validation":"GREEN" if all(checks.values()) else "RED",
        "debug":{
            "missing_files":sorted(set(missing_files)),
            "domain_cards_by_domain":domain_card_counts,
            "beastforms_by_tier":dict(beast_tiers),
            "adversaries_by_tier":dict(adv_tiers),
            "environments_by_tier":dict(env_tiers),
            "standard_weapons_by_tier_role":{t:dict(c) for t,c in standard_tiers.items()},
            "duplicate_ids_by_collection":id_duplicates,
            "global_duplicate_ids":global_id_dups,
            "subclass_rows_raw":len(subclass_rows),
            "subclasses_unique":len(subclass_unique),
            "unresolved_class_domain_references":class_domain_refs,
            "supplemental_not_normalized":supplemental_not_normalized,
        },
        "warnings":warnings,
        "notes":[
            "P1.2 audits the generated canonical data, not historical extractor checkpoint files.",
            "The subclass audit uses the semantic union of indexes/subclasses.json and indexes/subclasses-hope-fear.json because P1.1a intentionally added a second index view.",
            "Fixed weapon variants are 302 standard variants + 12 combat wheelchairs + 44 supplemental variants = 358.",
            "A GREEN P1.2 means the SRD 2.0 canonical layer is structurally safe to feed into adapters; it does not assert that every prose field has undergone manual editorial review.",
        ],
    }

    save(REG/"P1.2-status.json",report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
