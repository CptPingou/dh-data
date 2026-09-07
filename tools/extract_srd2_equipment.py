#!/usr/bin/env python3
"""
P1.1d-fix1 — Clean weapon-name spillover and isolate Combat Wheelchairs.

Usage:
    python tools/extract_srd2_equipment.py "C:\path\DH_SRD_2_2026_08_25.pdf"

Dependency:
    pip install pypdf

Outputs:
    data/srd-2.0/equipment/armor.json
    data/srd-2.0/equipment/items.json
    data/srd-2.0/equipment/consumables.json
    data/srd-2.0/beastforms/beastforms.json
    data/srd-2.0/equipment/weapons-raw.json
    data/srd-2.0/equipment/manifest.json

Validation gates:
    Armor       = 69 rows
    Items       = 120 rows (60 Core + 60 Hope & Fear)
    Consumables = 120 rows (60 Core + 60 Hope & Fear)
    Beastforms  = 24 rows (6/tier)

P1.1d changes weapon extraction to strict stat-signature row segmentation.
Weapons remain candidate-only until exact table counts are independently locked.
"""
from __future__ import annotations
from pathlib import Path
import json, re, sys, unicodedata

EXPECTED = {
    "armor": 69,
    "items": 120,
    "consumables": 120,
    "beastforms": 24,
}
EXPECTED_WEAPONS = {
    "standard_total": 302,
    "standard_primary": 229,
    "standard_secondary": 73,
    "standard_by_tier": {
        1: {"primary": 37, "secondary": 13},
        2: {"primary": 67, "secondary": 20},
        3: {"primary": 59, "secondary": 20},
        4: {"primary": 66, "secondary": 20},
    },
    "combat_wheelchairs": 12,
    "combat_wheelchairs_per_tier": 3,
    "supplemental_western_entities": 5,
    "supplemental_western_variants": 20,
    "supplemental_monster_hunting_entities": 6,
    "supplemental_monster_hunting_variants": 24,
    "supplemental_variants_total": 44,
    "canonical_weapon_variants_total": 358,
}
TRAITS = r"(?:Agility|Strength|Finesse|Instinct|Presence|Knowledge|Spellcast)"
RANGES = r"(?:Melee|Very Close|Close|Far|Very Far)"
DAMAGE = r"(?:d(?:4|6|8|10|12|20)(?:\+\d+)?)"
DMGTYPE = r"(?:phy|mag|phy/mag)"
BURDEN = r"(?:One-Handed|Two-Handed)"

def slug(s):
    s = s.replace("‑","-").replace("–","-").replace("—","-")
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()

def page_text(reader, printed_start, printed_end):
    # printed page N -> PDF page index N-1 for this SRD
    return "\n".join((reader.pages[i-1].extract_text() or "") for i in range(printed_start, printed_end+1))

def clean_page_noise(text):
    text = re.sub(r"\b\d+\s+Daggerheart SRD\b", " ", text)
    text = re.sub(r"\bDaggerheart SRD\s+\d+\b", " ", text)
    text = text.replace("\u00ad","").replace("","")
    return text

def split_feature(text):
    text = norm(text)
    if text in {"—","-",""}:
        return None, None
    m = re.match(r"([^:]{1,80}):\s*(.*)$", text)
    return (norm(m.group(1)), norm(m.group(2))) if m else (None, text)

def clean_armor_name(name):
    name = norm(name)
    prefixes = (
        "Spellcast Rolls ",
        "Evasion ",
        "Finesse ",
        "Agility ",
        "Presence ",
    )
    changed = True
    while changed:
        changed = False
        for p in prefixes:
            if name.startswith(p):
                name = name[len(p):].strip()
                changed = True
                break
    return name

# ---------- ARMOR ----------
ARMOR_ROW = re.compile(
    r"(?P<name>[A-Z][A-Za-z0-9’'‑–—\- ]+?)\s+"
    r"(?P<major>\d+)\s*/\s*(?P<severe>\d+)\s+"
    r"(?P<score>\d+)\s+"
    r"(?P<feature>.*?)(?="
    r"[A-Z][A-Za-z0-9’'‑–—\- ]+?\s+\d+\s*/\s*\d+\s+\d+\s+"
    r"|TIER\s+[1-4]"
    r"|$)",
    re.S
)

def parse_armor(text):
    text = clean_page_noise(text)
    text = re.sub(r"(?<!TIER)\n", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    tiers=[]
    for m in re.finditer(r"TIER\s+([1-4])\s+\([^)]+\)", text):
        tiers.append((m.start(), int(m.group(1))))
    out=[]
    for idx,(start,tier) in enumerate(tiers):
        end = tiers[idx+1][0] if idx+1 < len(tiers) else len(text)
        block=text[start:end]
        block=re.sub(r"Name\s+Base\s+Thresholds\s+Base\s+Score\s+Feature", " ", block, flags=re.S | re.I)
        for m in ARMOR_ROW.finditer(block):
            name=clean_armor_name(m.group("name"))
            upper=name.upper()
            if upper.startswith("TIER"): continue
            if any(token in upper for token in ("BASE THRESHOLDS","BASE SCORE","ARMOR TABLE","NAME BASE","FEATURE NAME")):
                continue
            if len(name) > 80:
                continue
            fname,ftext=split_feature(m.group("feature"))
            out.append({
                "id":f"srd-2.0.armor.{slug(name)}",
                "kind":"armor",
                "name":name,
                "tier":tier,
                "base_thresholds":{"major":int(m.group("major")),"severe":int(m.group("severe"))},
                "base_score":int(m.group("score")),
                "feature":{"name":fname,"text":ftext} if (fname or ftext) else None,
                "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"}
            })
    return dedupe(out, lambda x:(x["tier"],x["name"]))

# ---------- NUMBERED ITEMS / CONSUMABLES ----------
ENTRY_START = re.compile(r"(?m)^\s*(?P<n>(?:0?[1-9]|[1-5]\d|60))\s+(?P<body>\S.*)$")
DESC_STARTERS = (
    "You ","When ","This ","During ","Once ","After ","While ","Spend ","Make ",
    "Gain ","Take ","Mark ","Roll ","If ","A ","The ","At ","Before ","Your ",
    "Upon ","As ","Choose ","Touch ","Apply ","Drink ","Open ","Use ","Attach "
)

def infer_name_desc(body):
    body=norm(body)
    candidates=[]
    for starter in DESC_STARTERS:
        pos=body.find(starter)
        if pos>1:
            candidates.append(pos)
    if not candidates:
        m=re.match(r"((?:[A-Z0-9][^\s]*\s+){1,8})(.*)", body)
        if m: return norm(m.group(1)), norm(m.group(2))
        return body, ""
    pos=min(candidates)
    return norm(body[:pos]), norm(body[pos:])

def parse_numbered_table(block, corpus_label, kind):
    block=clean_page_noise(block)
    block=re.sub(r"ROLL\s+LOOT\s+description", "\n", block, flags=re.I)
    starts=list(ENTRY_START.finditer(block))
    rows=[]
    for i,m in enumerate(starts):
        n=int(m.group("n"))
        end=starts[i+1].start() if i+1<len(starts) else len(block)
        body=m.group("body") + "\n" + block[m.end():end]
        body=norm(body)
        name,desc=infer_name_desc(body)
        rows.append({
            "id":f"srd-2.0.{kind}.{slug(corpus_label)}-{n:02d}-{slug(name)}",
            "kind":kind,
            "roll":n,
            "name":name,
            "rules_text":desc,
            "source_subset":corpus_label,
            "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"}
        })
    merged = {}
    for row in rows:
        key = (row["source_subset"], row["roll"])
        prev = merged.get(key)
        if prev is None or len((row.get("name","") + row.get("rules_text",""))) > len((prev.get("name","") + prev.get("rules_text",""))):
            merged[key] = row
    return [merged[k] for k in sorted(merged, key=lambda x: x[1])]

def section_between(text, start_pat, end_pat=None):
    m=re.search(start_pat,text,re.I)
    if not m: return ""
    start=m.end()
    if end_pat:
        n=re.search(end_pat,text[start:],re.I)
        if n: return text[start:start+n.start()]
    return text[start:]

def parse_items(text):
    core=section_between(text,r"Core Set Items",r"Additional Items")
    add=section_between(text,r"Additional Items",r"(?:CONSUMABLES|Core Set Consumables)")
    return parse_numbered_table(core,"core","loot")+parse_numbered_table(add,"hope-fear","loot")

def parse_consumables(text):
    core=section_between(text,r"Core Set Consumables",r"Additional Consumables")
    add=section_between(text,r"Additional Consumables",None)
    return parse_numbered_table(core,"core","consumable")+parse_numbered_table(add,"hope-fear","consumable")

# ---------- BEASTFORMS ----------
BF_HEADING = re.compile(
    r"(?m)^\s*[■•]?\s*(?P<name>[A-Z][A-Z ]{2,})\s*$\s*"
    r"^\s*\((?P<examples>[^)]+)\)\s*$"
)
BF_STATS = re.compile(
    r"(?P<trait>Agility|Strength|Finesse|Instinct|Presence|Knowledge)\s+\+(?P<tbonus>\d+)\s*\|\s*"
    r"Evasion\s+\+(?P<evasion>\d+)\s+"
    r"(?:(?P<range>Melee|Very Close|Close|Far|Very Far)\s+"
    r"(?P<attacktrait>Agility|Strength|Finesse|Instinct|Presence|Knowledge)|"
    r"(?P<attacktrait2>Agility|Strength|Finesse|Instinct|Presence|Knowledge)\s+"
    r"(?P<range2>Melee|Very Close|Close|Far|Very Far))\s+"
    r"(?P<damage>d(?:4|6|8|10|12|20)(?:\+\d+)?)\s+(?P<dtype>phy|mag)",
    re.I | re.S
)
BF_ADV = re.compile(r"Gain advantage on:\s*(?P<advantages>[A-Za-z, ]+?)(?=(?:[A-Z][A-Za-z ]+:)|$)", re.S)

def parse_beastforms(text):
    text=clean_page_noise(text)
    start=text.find("BEASTFORM OPTIONS")
    if start>=0:
        text=text[start:]

    tier_marks=list(re.finditer(r"(?m)^\s*TIER\s+([1-4])\s*$",text))
    rows=[]
    for ti,m in enumerate(tier_marks):
        tier=int(m.group(1))
        end=tier_marks[ti+1].start() if ti+1<len(tier_marks) else len(text)
        block=text[m.end():end]

        heads=list(BF_HEADING.finditer(block))
        for i,h in enumerate(heads):
            fend=heads[i+1].start() if i+1<len(heads) else len(block)
            body=norm(block[h.end():fend])
            name=norm(h.group("name")).title()
            row={
                "id":f"srd-2.0.beastform.{slug(name)}",
                "kind":"beastform",
                "tier":tier,
                "name":name,
                "examples":norm(h.group("examples")),
                "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"}
            }

            sm=BF_STATS.search(body)
            if sm:
                row["trait"]={"name":sm.group("trait").title(),"bonus":int(sm.group("tbonus"))}
                row["evasion_bonus"]=int(sm.group("evasion"))
                row["attack"]={
                    "range":(sm.group("range") or sm.group("range2")).title(),
                    "trait":(sm.group("attacktrait") or sm.group("attacktrait2")).title(),
                    "damage":sm.group("damage"),
                    "damage_type":sm.group("dtype").lower()
                }
                am=BF_ADV.search(body)
                if am:
                    row["advantages"]=[norm(x) for x in am.group("advantages").split(",") if norm(x)]
            else:
                row["special_form"]=True

            row["features_text"]=body
            rows.append(row)

    return dedupe(rows, lambda x:(x["tier"],x["name"]))

# ---------- WEAPONS: strict row segmentation ----------
# pypdf does not preserve weapon-table line breaks reliably. Instead of using
# newline lookaheads, first detect every complete stat signature and then slice
# the feature text between consecutive signatures.

WEAPON_ROW_START = re.compile(
    rf"(?P<name>[A-Z][A-Za-z0-9’'‑–—\- &]{{1,80}}?)\s+"
    rf"(?P<trait>{TRAITS})\s+"
    rf"(?P<range>{RANGES})\s+"
    rf"(?P<damage>{DAMAGE})\s+(?P<dtype>{DMGTYPE})\s+"
    rf"(?P<burden>{BURDEN})\b"
)

WEAPON_NOISE = re.compile(
    r"(?:Name\s+Trait\s+Range\s+Damage\s+Burden\s+Feature|"
    r"Physical\s+Weapons|Magic\s+Weapons|"
    r"PRIMARY\s+WEAPON\s+TABLES|SECONDARY\s+WEAPON\s+TABLES)",
    re.I
)

def _weapon_flatten(block):
    block = clean_page_noise(block)
    block = WEAPON_NOISE.sub(" ", block)
    return norm(block)

def _clean_weapon_feature(raw):
    raw = norm(raw)
    raw = re.sub(r"\bTIER\s+[1-4](?:\s*\([^)]+\))?\s*$", "", raw, flags=re.I)
    raw = WEAPON_NOISE.sub(" ", raw)
    raw = norm(raw)
    return split_feature(raw)

WEAPON_NAME_PREFIXES = (
    "All require a Spellcast trait ",
    "Severe damage threshold ",
    "Very Close range ",
    "Melee range ",
    "Armor Score ",
    "Evasion ",
    "Finesse ",
)

def clean_weapon_name(name):
    """Remove deterministic pypdf spillover from the preceding Feature column."""
    name = norm(name)
    changed = True
    while changed:
        changed = False
        for prefix in WEAPON_NAME_PREFIXES:
            if name.startswith(prefix):
                name = name[len(prefix):].strip()
                changed = True
                break
    return name

def normalize_wheelchair_name(name):
    """Strip table-header noise and embedded tier number from wheelchair rows."""
    name = norm(name)
    name = re.sub(
        r"^Name\s+Tier\s+Trait\s+Range\s+Damage\s+Burden\s+Feature\s+",
        "",
        name,
        flags=re.I
    )
    name = re.sub(r"\s+[1-4]\s*$", "", name)
    return clean_weapon_name(name)

def wheelchair_tier_from_name(name, fallback=1):
    m = re.search(r"\s([1-4])\s*$", norm(name))
    if m:
        return int(m.group(1))
    n = norm(name)
    if n.startswith("Improved "):
        return 2
    if n.startswith("Advanced "):
        return 3
    if n.startswith("Legendary "):
        return 4
    return fallback

def parse_weapon_candidates(text):
    text=clean_page_noise(text)
    rows=[]
    sections=[]

    for label,pat in [
        ("primary",r"PRIMARY\s+WEAPON\s+TABLES"),
        ("secondary",r"SECONDARY\s+WEAPON\s+TABLES"),
    ]:
        m=re.search(pat,text,re.I)
        if m:
            sections.append((m.start(),label))

    sections.sort()

    for si,(s,label) in enumerate(sections):
        e=sections[si+1][0] if si+1<len(sections) else len(text)
        sec=text[s:e]

        tiers=list(re.finditer(r"TIER\s+([1-4])(?:\s*\([^)]+\))?",sec,re.I))
        for ti,t in enumerate(tiers):
            tier=int(t.group(1))
            te=tiers[ti+1].start() if ti+1<len(tiers) else len(sec)
            block=_weapon_flatten(sec[t.end():te])

            starts=list(WEAPON_ROW_START.finditer(block))
            for i,m in enumerate(starts):
                feature_end=starts[i+1].start() if i+1<len(starts) else len(block)
                raw_feature=block[m.end():feature_end]
                fname,ftext=_clean_weapon_feature(raw_feature)

                raw_name=norm(m.group("name"))
                name=normalize_wheelchair_name(raw_name) if "Wheelchair" in raw_name else clean_weapon_name(raw_name)
                upper=name.upper()
                if len(name)>80:
                    continue
                if any(token in upper for token in (
                    "WEAPON TABLE","PHYSICAL WEAPONS","MAGIC WEAPONS",
                    "NAME TRAIT","DAGGERHEART SRD"
                )):
                    continue

                rows.append({
                    "id":f"srd-2.0.weapon.{label}.{tier}.{slug(name)}",
                    "kind":"weapon",
                    "slot":label,
                    "tier":tier,
                    "name":name,
                    "trait":m.group("trait"),
                    "range":m.group("range"),
                    "damage":m.group("damage"),
                    "damage_type":m.group("dtype"),
                    "burden":m.group("burden"),
                    "feature":{"name":fname,"text":ftext} if (fname or ftext) else None,
                    "source_subset":"combat-wheelchair" if "Wheelchair" in raw_name else "standard-equipment",
                    "_raw_name":raw_name,
                    "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"},
                    "canonical":False
                })

    # Isolate Combat Wheelchairs from the normal secondary table spillover.
    # They are primary weapons with their own 3-model × 4-tier table.
    standard=[]
    wheelchairs=[]
    for row in rows:
        raw_name=row.pop("_raw_name", row["name"])
        if row.get("source_subset")=="combat-wheelchair":
            row["slot"]="primary"
            row["tier"]=wheelchair_tier_from_name(raw_name, row["tier"])
            row["name"]=normalize_wheelchair_name(raw_name)
            row["id"]=f"srd-2.0.weapon.combat-wheelchair.{row['tier']}.{slug(row['name'])}"
            wheelchairs.append(row)
        else:
            standard.append(row)

    standard=dedupe(standard, lambda x:(x["slot"],x["tier"],x["name"]))
    wheelchairs=dedupe(wheelchairs, lambda x:(x["tier"],x["name"]))
    return standard, wheelchairs

# ---------- SUPPLEMENTAL CAMPAIGN WEAPONS ----------
# Western and Monster Hunting tables define one named weapon with four tier
# damage lines. For the neutral DB we expand each named weapon into four
# tier-specific variants so its shape matches the normal equipment tables.

CAMPAIGN_WEAPON_START = re.compile(
    rf"(?P<name>[A-Z][A-Za-z0-9’'‑–—\- &]+?)\s+"
    rf"(?P<trait>{TRAITS})\s+"
    rf"(?P<range>{RANGES})\s+"
    rf"Tier\s+1:\s*(?P<d1>{DAMAGE})\s+(?P<t1>{DMGTYPE})\s+"
    rf"Tier\s+2:\s*(?P<d2>{DAMAGE})\s+(?P<t2>{DMGTYPE})\s+"
    rf"Tier\s+3:\s*(?P<d3>{DAMAGE})\s+(?P<t3>{DMGTYPE})\s+"
    rf"Tier\s+4:\s*(?P<d4>{DAMAGE})\s+(?P<t4>{DMGTYPE})\s+"
    rf"(?P<burden>{BURDEN})\b"
)

def parse_campaign_weapon_section(block, subset, slot):
    block = clean_page_noise(block)
    block = re.sub(r"Name\s+Trait\s+Range\s+Damage\s+Burden\s+Feature", " ", block, flags=re.I)
    block = norm(block)
    starts = list(CAMPAIGN_WEAPON_START.finditer(block))
    rows = []
    entities = []

    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(block)
        raw_feature = norm(block[m.end():end])
        # Structural headings belong to the next section, not the feature.
        raw_feature = re.sub(r"\b(?:Secondary Weapons|Armor|You can also make.*)$", "", raw_feature, flags=re.I)
        fname, ftext = split_feature(raw_feature)
        base_name = norm(m.group("name"))
        entities.append(base_name)

        for tier in range(1, 5):
            damage = m.group(f"d{tier}")
            dtype = m.group(f"t{tier}").lower()
            rows.append({
                "id": f"srd-2.0.weapon.{subset}.{slot}.{tier}.{slug(base_name)}",
                "kind": "weapon",
                "slot": slot,
                "tier": tier,
                "name": base_name,
                "trait": m.group("trait"),
                "range": m.group("range"),
                "damage": damage,
                "damage_type": dtype,
                "burden": m.group("burden"),
                "feature": {"name": fname, "text": ftext} if (fname or ftext) else None,
                "source_subset": subset,
                "source": {"corpus": "daggerheart-srd", "version": "2.0", "status": "srd"},
                "canonical": True
            })

    return rows, entities

def parse_supplemental_campaign_weapons(western_text, monster_text):
    # Western: 3 primary + 2 secondary weapon entities.
    wp = section_between(western_text, r"Primary Weapons", r"Secondary Weapons")
    ws = section_between(western_text, r"Secondary Weapons", r"You can also make")
    western_primary, wp_names = parse_campaign_weapon_section(wp, "supplemental-western", "primary")
    western_secondary, ws_names = parse_campaign_weapon_section(ws, "supplemental-western", "secondary")

    # Monster Hunting: 3 primary + 3 secondary weapon entities.
    mp = section_between(monster_text, r"Primary Weapons", r"Secondary Weapons")
    ms = section_between(monster_text, r"Secondary Weapons", r"\bArmor\b")
    monster_primary, mp_names = parse_campaign_weapon_section(mp, "supplemental-monster-hunting", "primary")
    monster_secondary, ms_names = parse_campaign_weapon_section(ms, "supplemental-monster-hunting", "secondary")

    rows = western_primary + western_secondary + monster_primary + monster_secondary
    meta = {
        "western_entities": wp_names + ws_names,
        "western_primary_entities": wp_names,
        "western_secondary_entities": ws_names,
        "monster_hunting_entities": mp_names + ms_names,
        "monster_hunting_primary_entities": mp_names,
        "monster_hunting_secondary_entities": ms_names,
    }
    return rows, meta


# ---------- P2.3.3o-a EQUIPMENT FEATURE INTEGRITY ----------
# pypdf's plain extraction can interleave table columns. These repairs are
# deliberately limited to deterministic feature families whose omitted suffix
# is explicit in the SRD 2.0 equipment tables. They repair extraction, not rules.
def repair_equipment_feature(row):
    feature = row.get("feature")
    if not isinstance(feature, dict):
        return row
    name = norm(feature.get("name"))
    text = norm(feature.get("text"))
    if not name or not text:
        return row

    # Stable SRD feature semantics where the table extractor dropped the final column token.
    if name == "Heavy" and text == "−1 to": text = "−1 to Evasion"
    elif name == "Cumbersome" and text == "−1 to": text = "−1 to Finesse"
    elif name == "Flexible" and text == "+1 to": text = "+1 to Evasion"
    elif name == "Very Heavy" and text == "−2 to Evasion; −1 to": text = "−2 to Evasion; −1 to Agility"
    elif name == "Channeling" and text == "+1 to": text = "+1 to Spellcast Rolls"
    elif name == "Gilded" and text == "+1 to": text = "+1 to Presence"
    elif name == "Vigilant" and text == "+2 to": text = "+2 to Evasion"
    elif name == "Brave" and text == "−1 to Evasion; +3 to": text = "−1 to Evasion; +3 to Severe damage threshold"
    elif name == "Protective":
        text = re.sub(r"^(\+\d+) to(?: your)?$", r"\1 to Armor Score", text)
    elif name == "Barrier":
        text = re.sub(r"^(\+\d+ to Armor Score; −1 to)$", r"\1 Evasion", text)
    elif name == "Paired" and text.endswith("targets within"):
        text += " Melee range"
    elif name == "Focused" and text.endswith("targets within"):
        text += " Very Close range"
    elif name == "Double Duty" and text.endswith("damage within"):
        text += " Melee range"

    feature["text"] = text
    return row

def repair_equipment_features(rows):
    return [repair_equipment_feature(row) for row in rows]

def suspicious_feature_tail(row):
    feature = row.get("feature") or {}
    name = norm(feature.get("name"))
    text = norm(feature.get("text"))
    known = {
        "Heavy": {"−1 to"},
        "Cumbersome": {"−1 to"},
        "Flexible": {"+1 to"},
        "Very Heavy": {"−2 to Evasion; −1 to"},
        "Channeling": {"+1 to"},
        "Gilded": {"+1 to"},
        "Vigilant": {"+2 to"},
        "Brave": {"−1 to Evasion; +3 to"},
    }
    if text in known.get(name, set()): return True
    if name in {"Protective", "Barrier"} and re.search(r"\bto$", text): return True
    if name in {"Paired", "Focused"} and text.endswith("targets within"): return True
    if name == "Double Duty" and text.endswith("damage within"): return True
    return False

def dedupe(rows,key):
    seen=set(); out=[]
    for r in rows:
        k=key(r)
        if k not in seen:
            seen.add(k); out.append(r)
    return out

def validate_numbered(rows, subset):
    nums=sorted(r["roll"] for r in rows if r["source_subset"]==subset)
    return nums == list(range(1,61))

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding="utf-8")

def main():
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python tools/extract_srd2_equipment.py <SRD2.pdf>")
    pdf=Path(sys.argv[1])
    if not pdf.exists(): raise SystemExit(f"File not found: {pdf}")

    from pypdf import PdfReader
    reader=PdfReader(str(pdf))

    beast_text=page_text(reader,15,18)

    armor=repair_equipment_features(parse_armor(page_text(reader,72,74)))
    items=parse_items(page_text(reader,75,79))
    consumables=parse_consumables(page_text(reader,80,84))
    beasts=parse_beastforms(beast_text)
    weapons,wheelchairs=parse_weapon_candidates(page_text(reader,55,71))
    weapons=repair_equipment_features(weapons)
    wheelchairs=repair_equipment_features(wheelchairs)
    supplemental_weapons,supplemental_meta=parse_supplemental_campaign_weapons(
        page_text(reader,197,197),
        page_text(reader,201,201)
    )
    supplemental_weapons=repair_equipment_features(supplemental_weapons)

    repo=Path(__file__).resolve().parents[1]
    out=repo/"data/srd-2.0"

    write_json(out/"equipment/armor.json",armor)
    write_json(out/"equipment/items.json",items)
    write_json(out/"equipment/consumables.json",consumables)
    write_json(out/"beastforms/beastforms.json",beasts)
    write_json(out/"equipment/weapons-raw.json",weapons)
    write_json(out/"equipment/combat-wheelchairs.json",wheelchairs)
    write_json(out/"equipment/supplemental-weapons.json",supplemental_weapons)

    checks={
        "armor_count":len(armor)==EXPECTED["armor"],
        "armor_names_clean":all(not r["name"].startswith(("Evasion ","Finesse ","Agility ","Presence ","Spellcast Rolls ")) for r in armor),
        "items_count":len(items)==EXPECTED["items"],
        "items_core_sequence":validate_numbered(items,"core"),
        "items_hf_sequence":validate_numbered(items,"hope-fear"),
        "consumables_count":len(consumables)==EXPECTED["consumables"],
        "consumables_core_sequence":validate_numbered(consumables,"core"),
        "consumables_hf_sequence":validate_numbered(consumables,"hope-fear"),
        "beastforms_count":len(beasts)==EXPECTED["beastforms"],
        "beastforms_six_per_tier":all(sum(1 for x in beasts if x["tier"]==t)==6 for t in range(1,5)),
        "weapon_candidates_nonzero":len(weapons)>0,
        "weapon_ids_unique":len({x["id"] for x in weapons})==len(weapons),
        "weapon_shadowblade_detected":any(x["name"]=="Shadowblade" for x in weapons),
        "weapon_phy_mag_supported":any(x["damage_type"]=="phy/mag" for x in weapons),
        "weapon_names_clean":all(not any(x["name"].startswith(p) for p in WEAPON_NAME_PREFIXES) for x in weapons),
        "combat_wheelchair_count":len(wheelchairs)==12,
        "combat_wheelchair_three_per_tier":all(sum(1 for x in wheelchairs if x["tier"]==t)==3 for t in range(1,5)),
        "combat_wheelchair_primary":all(x["slot"]=="primary" for x in wheelchairs),
        "weapon_standard_total":len(weapons)==EXPECTED_WEAPONS["standard_total"],
        "weapon_standard_primary":sum(1 for x in weapons if x["slot"]=="primary")==EXPECTED_WEAPONS["standard_primary"],
        "weapon_standard_secondary":sum(1 for x in weapons if x["slot"]=="secondary")==EXPECTED_WEAPONS["standard_secondary"],
        "weapon_standard_by_tier":all(
            sum(1 for x in weapons if x["tier"]==tier and x["slot"]==slot)==expected
            for tier, slots in EXPECTED_WEAPONS["standard_by_tier"].items()
            for slot, expected in slots.items()
        ),
        "supplemental_western_entities":len(set(supplemental_meta["western_entities"]))==EXPECTED_WEAPONS["supplemental_western_entities"],
        "supplemental_western_variants":sum(1 for x in supplemental_weapons if x["source_subset"]=="supplemental-western")==EXPECTED_WEAPONS["supplemental_western_variants"],
        "supplemental_monster_hunting_entities":len(set(supplemental_meta["monster_hunting_entities"]))==EXPECTED_WEAPONS["supplemental_monster_hunting_entities"],
        "supplemental_monster_hunting_variants":sum(1 for x in supplemental_weapons if x["source_subset"]=="supplemental-monster-hunting")==EXPECTED_WEAPONS["supplemental_monster_hunting_variants"],
        "supplemental_variants_total":len(supplemental_weapons)==EXPECTED_WEAPONS["supplemental_variants_total"],
        "supplemental_ids_unique":len({x["id"] for x in supplemental_weapons})==len(supplemental_weapons),
        "canonical_weapon_variants_total":len(weapons)+len(wheelchairs)+len(supplemental_weapons)==EXPECTED_WEAPONS["canonical_weapon_variants_total"],
        "equipment_feature_tails_complete":not any(suspicious_feature_tail(x) for x in armor+weapons+wheelchairs+supplemental_weapons),
    }

    canonical_checks=[k for k in checks if not k.startswith("weapon_") and not k.startswith("supplemental_") and not k.startswith("combat_wheelchair")]
    canonical_green=all(checks[k] for k in canonical_checks)
    weapon_checks=[
        "weapon_candidates_nonzero","weapon_ids_unique","weapon_shadowblade_detected",
        "weapon_phy_mag_supported","weapon_names_clean","combat_wheelchair_count",
        "combat_wheelchair_three_per_tier","combat_wheelchair_primary",
        "weapon_standard_total","weapon_standard_primary","weapon_standard_secondary",
        "weapon_standard_by_tier","supplemental_western_entities",
        "supplemental_western_variants","supplemental_monster_hunting_entities",
        "supplemental_monster_hunting_variants","supplemental_variants_total",
        "supplemental_ids_unique","canonical_weapon_variants_total","equipment_feature_tails_complete"
    ]
    weapons_green=all(checks[k] for k in weapon_checks)

    weapon_debug={
        str(t):{
            "primary":[x["name"] for x in weapons if x["slot"]=="primary" and x["tier"]==t],
            "secondary":[x["name"] for x in weapons if x["slot"]=="secondary" and x["tier"]==t],
        }
        for t in range(1,5)
    }

    manifest={
        "source_file":pdf.name,
        "phase":"P1.1d-fix2",
        "counts":{
            "armor":len(armor),
            "items":len(items),
            "consumables":len(consumables),
            "beastforms":len(beasts),
            "weapon_candidates":len(weapons),
            "weapon_primary":sum(1 for x in weapons if x["slot"]=="primary"),
            "weapon_secondary":sum(1 for x in weapons if x["slot"]=="secondary"),
            "combat_wheelchairs":len(wheelchairs),
            "supplemental_weapons":len(supplemental_weapons),
            "supplemental_western":sum(1 for x in supplemental_weapons if x["source_subset"]=="supplemental-western"),
            "supplemental_monster_hunting":sum(1 for x in supplemental_weapons if x["source_subset"]=="supplemental-monster-hunting"),
            "canonical_weapon_variants_total":len(weapons)+len(wheelchairs)+len(supplemental_weapons),
        },
        "expected":{
            "armor":69,
            "items":120,
            "consumables":120,
            "beastforms":24,
            "weapons":{
                "standard_total":EXPECTED_WEAPONS["standard_total"],
                "standard_primary":EXPECTED_WEAPONS["standard_primary"],
                "standard_secondary":EXPECTED_WEAPONS["standard_secondary"],
                "combat_wheelchairs":EXPECTED_WEAPONS["combat_wheelchairs"],
                "supplemental_western_variants":EXPECTED_WEAPONS["supplemental_western_variants"],
                "supplemental_monster_hunting_variants":EXPECTED_WEAPONS["supplemental_monster_hunting_variants"],
                "canonical_weapon_variants_total":EXPECTED_WEAPONS["canonical_weapon_variants_total"]
            }
        },
        "checks":checks,
        "canonical_collections_validation":"GREEN" if canonical_green else "RED",
        "weapons_validation":"GREEN" if weapons_green else "RED",
        "debug":{
            "item_rolls_core":sorted(r["roll"] for r in items if r["source_subset"]=="core"),
            "item_rolls_hf":sorted(r["roll"] for r in items if r["source_subset"]=="hope-fear"),
            "consumable_rolls_core":sorted(r["roll"] for r in consumables if r["source_subset"]=="core"),
            "consumable_rolls_hf":sorted(r["roll"] for r in consumables if r["source_subset"]=="hope-fear"),
            "beastforms_by_tier":{str(t):[r["name"] for r in beasts if r["tier"]==t] for t in range(1,5)},
            "armor_by_tier":{str(t):[r["name"] for r in armor if r["tier"]==t] for t in range(1,5)},
            "weapons_by_tier":weapon_debug,
            "combat_wheelchairs_by_tier":{str(t):[r["name"] for r in wheelchairs if r["tier"]==t] for t in range(1,5)},
            "supplemental_campaign_weapons":supplemental_meta
        },
        "notes":[
            "P1.1c canonical collections remain validated.",
            "P1.1d replaces newline-dependent weapon parsing with stat-signature segmentation.",
            "P1.1d-fix1 removes deterministic Feature-column spillover from weapon names.",
            "Combat Wheelchairs are isolated into equipment/combat-wheelchairs.json and removed from standard weapon counts.",
            "P1.1d-fix2 locks 302 standard weapon variants, 12 Combat Wheelchairs, and 44 supplemental Western/Monster-Hunting variants.",
            "Canonical weapon-variant total for this scope is 358.",
            "Tech-Based Iconic Weapons are mechanics/templates rather than fixed weapon rows and are intentionally outside this collection."
        ]
    }
    write_json(out/"equipment/manifest.json",manifest)
    print(json.dumps(manifest,indent=2,ensure_ascii=False))
    if not canonical_green or not weapons_green:
        raise SystemExit(2)

if __name__=="__main__":
    main()
