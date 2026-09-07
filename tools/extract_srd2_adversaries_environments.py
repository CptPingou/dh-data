#!/usr/bin/env python3
"""P1.1e — SRD 2.0 adversaries + environments extraction.

Usage:
  python tools\extract_srd2_adversaries_environments.py "C:\path\DH_SRD_2_2026_08_25.pdf"

This first pass is deliberately diagnostic for adversaries and canonical for
the independently enumerable environment index.
"""
from __future__ import annotations
import json, re, sys, unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from pypdf import PdfReader

OUT = Path("data/srd-2.0")
ENV_EXPECTED = {1:16, 2:12, 3:11, 4:8}
ENV_TYPES = ("Exploration","Social","Traversal","Event")
ADV_ROLES = ("Bruiser","Horde","Leader","Minion","Ranged","Skulk","Social","Solo","Standard","Support")

# Authoritative SRD 2.0 environment index (printed p.159).
# Stat blocks are emitted in this exact order. Using the index as identity
# source avoids pypdf column/page ordering errors around the Tier 3/4 boundary.
ENV_INDEX = [
    (1,"Abandoned Grove","Exploration"),
    (1,"Abandoned Mine","Traversal"),
    (1,"Alchemist’s Abandoned Workshop","Exploration"),
    (1,"Ambushed","Event"),
    (1,"Ambushers","Event"),
    (1,"Bustling Marketplace","Social"),
    (1,"Cliffside Ascent","Traversal"),
    (1,"Corrupted Swamp","Traversal"),
    (1,"Cursed Graveyard","Exploration"),
    (1,"Grand Feast","Social"),
    (1,"Hold the Line","Event"),
    (1,"Local Festival","Social"),
    (1,"Local Tavern","Social"),
    (1,"Outpost Town","Social"),
    (1,"Raging River","Traversal"),
    (1,"Raiding Party","Event"),

    (2,"Beach Day","Social"),
    (2,"Cult Ritual","Event"),
    (2,"Deadly Dungeon","Exploration"),
    (2,"Duel","Event"),
    (2,"Hallowed Temple","Social"),
    (2,"Haunted City","Exploration"),
    (2,"Heist","Event"),
    (2,"Masquerade Ball","Social"),
    (2,"Mountain Pass","Traversal"),
    (2,"Ocean Voyage","Traversal"),
    (2,"Vast Desert","Traversal"),
    (2,"Witch’s Hut","Exploration"),

    (3,"Archmage’s Tower","Exploration"),
    (3,"Astral Realm","Traversal"),
    (3,"Burning Heart of the Woods","Exploration"),
    (3,"Castle Siege","Event"),
    (3,"Crystal Wasteland","Traversal"),
    (3,"Dragon’s Lair","Exploration"),
    (3,"Megastorm","Event"),
    (3,"Pitched Battle","Event"),
    (3,"Sunken Citadel","Exploration"),
    (3,"Upscale Casino","Social"),
    (3,"Volcanic Eruption","Event"),

    (4,"Chaos Realm","Traversal"),
    (4,"Convergence, City of Portals","Social"),
    (4,"Divine Usurpation","Event"),
    (4,"Imperial Court","Social"),
    (4,"Moon Kingdom","Exploration"),
    (4,"Necromancer’s Ossuary","Exploration"),
    (4,"Realm of the Dead","Traversal"),
    (4,"Time Court","Event"),
]

# Known pypdf heading truncations. These are not fuzzy guesses: the SRD index
# and the surrounding stat-block order establish the canonical identity.
ENV_NAME_ALIASES = {
    "workshop": "Alchemist’s Abandoned Workshop",
    "cityofportals": "Convergence, City of Portals",
}

def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\u00ad","")).strip()

def slug(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def pages(reader, start, end):
    # printed SRD page N == reader.pages[N-1]
    return "\n".join((reader.pages[n-1].extract_text() or "") for n in range(start,end+1))

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def clean(s):
    s=re.sub(r"Daggerheart SRD\s+\d+"," ",s)
    s=re.sub(r"\d+\s+Daggerheart SRD"," ",s)
    # Common embedded-font extraction variants.
    s=s.replace("Diffi culty","Difficulty").replace("Di\u001f culty","Difficulty")
    s=s.replace("Diﬃculty","Difficulty").replace("Di culty","Difficulty")
    s=s.replace("fi ","fi")
    return s

ENV_HEAD = re.compile(
    r"(?m)^(?P<name>[A-Z][A-Z0-9’'&,\-–— ]+?)\s*\n"
    r"Tier\s*[^\n]*?(?P<tier>[1-4])?\s*(?P<type>Exploration|Social|Traversal|Event)\s*$"
)
# pypdf sometimes loses the tier glyph. Tier is therefore also supplied by
# the surrounding TIER N ENVIRONMENTS section.
ENV_TIER = re.compile(r"TIER\s+([1-4])\s+ENVIRONMENTS",re.I)

def parse_environments(text):
    text=clean(text)
    marks=list(ENV_TIER.finditer(text))
    parsed=[]
    for mi,m in enumerate(marks):
        tier=int(m.group(1))
        end=marks[mi+1].start() if mi+1<len(marks) else len(text)
        block=text[m.end():end]
        heads=list(ENV_HEAD.finditer(block))
        for i,h in enumerate(heads):
            hend=heads[i+1].start() if i+1<len(heads) else len(block)
            body=block[h.end():hend]
            difficulty=None
            difficulty_special=None
            dm=re.search(r"D\s*i\s*f+\s*i\s*c+\s*u\s*l\s*t\s*y\s*:\s*(\d+)",body,re.I)
            if dm:
                difficulty=int(dm.group(1))
            else:
                sm=re.search(
                    r"D\s*i\s*f+\s*i\s*c+\s*u\s*l\s*t\s*y\s*:\s*Special\s*(?:\((.*?)\))?",
                    body,re.I|re.S
                )
                if sm:
                    difficulty_special="Special" + (f" ({norm(sm.group(1))})" if sm.group(1) else "")
            impulses=None
            im=re.search(r"Impulses?:\s*(.*?)(?=\nDifficulty:|\nPotential Adversaries:|\nFEATURES)",body,re.S|re.I)
            if im:
                impulses=norm(im.group(1))
            potential=None
            pm=re.search(r"Potential Adversaries:\s*(.*?)(?=\nFEATURES)",body,re.S|re.I)
            if pm:
                potential=norm(pm.group(1))
            desc=norm(re.split(r"Impulses?\s*:", body, maxsplit=1, flags=re.I)[0])
            features=body.split("FEATURES",1)[1] if "FEATURES" in body else ""
            parsed.append({
                "_raw_name":norm(h.group("name")).title(),
                "_raw_tier":tier,
                "_raw_type":h.group("type"),
                "description":desc,
                "impulses":impulses,
                "difficulty":difficulty,
                "difficulty_special":difficulty_special,
                "potential_adversaries_text":potential,
                "features_text":norm(features),
            })

    # Match each parsed stat block to the authoritative SRD index by name,
    # NOT by PDF extraction order. pypdf can reorder columns on a page.
    if len(parsed) != len(ENV_INDEX):
        return []

    def name_key(s):
        s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
        # Repair embedded-font spacing such as "gra vey ard", "festiv al".
        return re.sub(r"[^a-z0-9]+","",s)

    unmatched=list(range(len(ENV_INDEX)))
    matched=[]
    failures=[]
    canonical_lookup={name_key(name):i for i,(_,name,_) in enumerate(ENV_INDEX)}

    for raw in parsed:
        rk=name_key(raw["_raw_name"])

        # First use explicit aliases for headings truncated by PDF extraction.
        alias_name=ENV_NAME_ALIASES.get(rk)
        if alias_name:
            i=canonical_lookup[name_key(alias_name)]
            if i not in unmatched:
                failures.append({"raw":raw["_raw_name"],"reason":"alias_target_already_used"})
                continue
            ratio=1.0
        else:
            scored=[]
            for i in unmatched:
                _, cname, _ = ENV_INDEX[i]
                ck=name_key(cname)
                ratio=SequenceMatcher(None,rk,ck).ratio()
                scored.append((ratio,i))
            if not scored:
                failures.append({"raw":raw["_raw_name"],"reason":"no_targets_left"})
                continue
            ratio,i=max(scored)
            if ratio < 0.72:
                failures.append({
                    "raw":raw["_raw_name"],
                    "reason":"low_match_ratio",
                    "best_ratio":round(ratio,4),
                    "best_target":ENV_INDEX[i][1]
                })
                continue

        unmatched.remove(i)
        matched.append((raw,i,ratio))

    if failures or unmatched:
        # Preserve a diagnostic candidate file shape rather than returning a
        # misleading partially-canonical collection.
        return []

    rows=[]
    for raw,i,ratio in matched:
        tier,name,etype=ENV_INDEX[i]
        rows.append({
            "id":f"srd-2.0.environment.{slug(name)}",
            "kind":"environment",
            "tier":tier,
            "type":etype,
            "name":name,
            "description":raw["description"],
            "impulses":raw["impulses"],
            "difficulty":raw["difficulty"],
            "difficulty_special":raw.get("difficulty_special"),
            "potential_adversaries_text":raw["potential_adversaries_text"],
            "features_text":raw["features_text"],
            "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"},
            "provenance_debug":{
                "raw_name":raw["_raw_name"],
                "raw_tier":raw["_raw_tier"],
                "raw_type":raw["_raw_type"],
                "name_match_ratio":round(ratio,4)
            }
        })

    # Canonical output order follows the SRD index.
    rank={(tier,name):i for i,(tier,name,_) in enumerate(ENV_INDEX)}
    rows.sort(key=lambda x: rank[(x["tier"],x["name"])])
    return rows

# Adversary parsing is intentionally stat-signature based. P1.1e first locks
# identities + core stats; feature structuring can follow after count audit.
ADV_TIER = re.compile(r"TIER\s+([1-4])\s+ADVERSARIES",re.I)
ADV_HEAD = re.compile(
    r"(?m)^(?P<name>[A-Z][A-Z0-9’'&:,\-–— ]+?)\s*\n"
    r"Tier\s*[^\n]*?\s(?P<role>Bruiser|Horde|Leader|Minion|Ranged|Skulk|Social|Solo|Standard|Support)(?:\s*\([^\n]*\))?\s*$"
)

ADV_INDEX_TIER = re.compile(
    r"TIER\s+([1-4])\s*(?:\([^)]*\))?",
    re.I
)

def adversary_index_from_pdf(reader):
    """Parse the SRD's own adversary index before the stat blocks.

    Printed pp. 94–96 contain the authoritative by-tier list. We use that
    list to lock identity/counts instead of inventing a target count.
    """
    raw=clean(pages(reader,94,96))
    # Keep only the list section, stopping before the first actual stat block.
    start=raw.upper().find("ADVERSARY STAT BLOCKS BY TIER")
    if start < 0:
        start=raw.upper().find("ADVERSARY STAT BLOCKS")
    if start >= 0:
        raw=raw[start:]
    stop=re.search(r"TIER\s+1\s+ADVERSARIES",raw,re.I)
    if stop:
        raw=raw[:stop.start()]

    marks=list(ADV_INDEX_TIER.finditer(raw))
    out=[]
    for mi,m in enumerate(marks):
        tier=int(m.group(1))
        end=marks[mi+1].start() if mi+1<len(marks) else len(raw)
        block=raw[m.end():end]

        # Index entries are bullet-separated; page numbers and dot leaders can
        # occur in the same extracted fragment.
        chunks=re.split(r"\s*[•●]\s*", block)
        for chunk in chunks[1:]:
            chunk=norm(chunk)
            chunk=re.sub(r"\.{2,}\s*\d+\b.*$", "", chunk)
            chunk=re.sub(r"\s+\d{2,3}\s*$", "", chunk)
            chunk=re.sub(r"\s+", " ", chunk).strip(" .")
            # Prevent bleed into prose/headings.
            chunk=re.split(r"\bTIER\s+[1-4]\b|\bDaggerheart SRD\b",chunk,1,flags=re.I)[0].strip()
            if not chunk or len(chunk)>90:
                continue
            out.append({"tier":tier,"name":chunk})

    # De-dupe without changing source order.
    seen=set(); ded=[]
    for x in out:
        k=(x["tier"],x["name"])
        if k not in seen:
            seen.add(k); ded.append(x)
    return ded

def adversary_name_key(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    # Remove pypdf ligature spacing: "ca ve", "v ampire", "cul t", etc.
    return re.sub(r"[^a-z0-9]+","",s)

ADVERSARY_CANONICAL_ALIASES = {
    "realmbreaker": "Fallen Warlord: Realm-Breaker",
    "undefeatedchampion": "Fallen Warlord: Undefeated Champion",
    "obsidianpredator": "Volcanic Dragon: Obsidian Predator",
    "moltenscourge": "Volcanic Dragon: Molten Scourge",
    "ashentyrant": "Volcanic Dragon: Ashen Tyrant",
}

def reconcile_adversaries(candidates, index_rows):
    """Canonicalize candidates globally against the authoritative SRD index."""
    unused=set(range(len(index_rows)))
    canonical=[]
    failures=[]
    lookup={adversary_name_key(x["name"]):i for i,x in enumerate(index_rows)}

    for raw in candidates:
        rk=adversary_name_key(raw["name"])
        alias=ADVERSARY_CANONICAL_ALIASES.get(rk)

        if alias:
            i=lookup.get(adversary_name_key(alias))
            if i is None or i not in unused:
                failures.append({"raw":raw["name"],"reason":"alias_target_unavailable"})
                continue
            ratio=1.0
        else:
            exact=lookup.get(rk)
            if exact is not None and exact in unused:
                i=exact
                ratio=1.0
            else:
                scored=[
                    (SequenceMatcher(None,rk,adversary_name_key(index_rows[i]["name"])).ratio(),i)
                    for i in unused
                ]
                if not scored:
                    failures.append({"raw":raw["name"],"reason":"no_index_target"})
                    continue
                ratio,i=max(scored)
                if ratio < 0.80:
                    failures.append({
                        "raw":raw["name"],"reason":"low_match_ratio",
                        "best_target":index_rows[i]["name"],"best_ratio":round(ratio,4)
                    })
                    continue

        unused.remove(i)
        target=index_rows[i]
        row=dict(raw)
        row["name"]=target["name"]
        row["tier"]=target["tier"]
        row["id"]=f"srd-2.0.adversary.{slug(target['name'])}"
        row["canonical"]=True
        row["provenance_debug"]={
            "raw_name":raw["name"],
            "raw_tier":raw["tier"],
            "name_match_ratio":round(ratio,4)
        }
        canonical.append(row)

    missing=[index_rows[i] for i in sorted(unused)]
    return canonical, missing, failures

def tolerant_difficulty(body):
    m=re.search(
        r"D\W*i\W*f\W*f\W*i\W*c\W*u\W*l\W*t\W*y\W*:\W*(\d+)",
        body,re.I
    )
    return int(m.group(1)) if m else None

def parse_single_adversary_block(block, canonical_name, tier):
    hm=re.search(
        r"(?m)^.*?Tier\s*[^\n]*?\s"
        r"(Bruiser|Horde|Leader|Minion|Ranged|Skulk|Social|Solo|Standard|Support)"
        r"(?:\s*\([^\n]*\))?\s*$",
        block,re.I
    )
    if not hm:
        return None

    role=hm.group(1).title()
    body=block[hm.end():]
    th=re.search(r"Thresholds:\s*([0-9]+|None)\s*/\s*([0-9]+|None)",body,re.I)
    hp=re.search(r"HP:\s*(\d+)",body,re.I)
    stress=re.search(r"Stress:\s*(\d+|None)",body,re.I)
    atk=re.search(
        r"ATK:\s*([+\-−–]?\d+)\s*\|\s*([^:|\n]+):\s*([^|\n]+)"
        r"\|\s*([^|\n]+?)\s+(phy|mag)\b",
        body,re.I
    )
    mt=re.search(
        r"Motives\s*&\s*Tactics:\s*(.*?)(?=D\W*i\W*f\W*f\W*i\W*c\W*u\W*l\W*t\W*y)",
        body,re.S|re.I
    )
    exp=re.search(r"Experience:\s*(.*?)(?=\nFEATURES)",body,re.S|re.I)

    def n_or_none(v):
        return None if v is None or v.lower()=="none" else int(v)

    return {
        "id":f"srd-2.0.adversary.{slug(canonical_name)}",
        "kind":"adversary","tier":tier,"role":role,
        "name":canonical_name,
        "motives_tactics":norm(mt.group(1)) if mt else None,
        "difficulty":tolerant_difficulty(body),
        "thresholds":{
            "major":n_or_none(th.group(1)),
            "severe":n_or_none(th.group(2))
        } if th else None,
        "hp":int(hp.group(1)) if hp else None,
        "stress":n_or_none(stress.group(1)) if stress else None,
        "stress_none":bool(stress and stress.group(1).lower()=="none"),
        "attack":{
            "modifier":int(atk.group(1).replace("−","-").replace("–","-")),
            "name":norm(atk.group(2)),
            "range":norm(atk.group(3)),
            "damage":norm(atk.group(4).replace("−","-").replace("–","-")),
            "damage_type":atk.group(5).lower()
        } if atk else None,
        "experience_text":norm(exp.group(1)) if exp else None,
        "features_text":norm(body.split("FEATURES",1)[1]) if "FEATURES" in body else "",
        "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"},
        "canonical":True,
        "provenance_debug":{"recovered_by":"targeted-heading-scan"}
    }

def recover_missing_adversaries(full_text, missing):
    """Recover a canonical stat block by literal/fuzzy heading occurrence.

    Unlike the primary parser, this does not require the heading to begin a
    PDF-extracted line. This matters for cases such as "... Vulnerable. SPRITE".
    """
    full_text=clean(full_text)
    recovered=[]
    still=[]
    heading_alias={
        "Fallen Warlord: Realm-Breaker":"REALM-BREAKER",
        "Fallen Warlord: Undefeated Champion":"UNDEFEATED CHAMPION",
        "Volcanic Dragon: Obsidian Predator":"OBSIDIAN PREDATOR",
        "Volcanic Dragon: Molten Scourge":"MOLTEN SCOURGE",
        "Volcanic Dragon: Ashen Tyrant":"ASHEN TYRANT",
    }

    # Every occurrence immediately followed by a Tier line is a viable block
    # start, even when prose precedes the heading on the same extracted line.
    starts=list(re.finditer(
        r"(?P<name>[A-Z][A-Z0-9’'&:,\-–— ]{1,80}?)\s*\n\s*Tier\s*[^\n]*?"
        r"(?:Bruiser|Horde|Leader|Minion|Ranged|Skulk|Social|Solo|Standard|Support)"
        r"(?:\s*\([^\n]*\))?\s*$",
        full_text,re.I|re.M
    ))

    for target in missing:
        wanted=heading_alias.get(target["name"],target["name"])
        wk=adversary_name_key(wanted)
        scored=[]
        for j,m in enumerate(starts):
            raw=norm(m.group("name"))
            # PDF extraction can prepend prose before the actual heading.
            # Compare both the whole capture and every suffix of its words.
            words=raw.split()
            variants=[raw]+[" ".join(words[k:]) for k in range(1,len(words))]
            ratio=max(SequenceMatcher(None,wk,adversary_name_key(v)).ratio() for v in variants)
            scored.append((ratio,j,m,raw))
        if not scored:
            still.append(target); continue
        ratio,j,m,raw_heading=max(scored,key=lambda x:x[0])
        if ratio < 0.88:
            still.append(target); continue

        bend=starts[j+1].start() if j+1<len(starts) else len(full_text)
        block=full_text[m.start():bend]
        row=parse_single_adversary_block(block,target["name"],target["tier"])
        if row:
            row["provenance_debug"].update({
                "raw_heading":raw_heading,
                "heading_match_ratio":round(ratio,4)
            })
            recovered.append(row)
        else:
            still.append(target)
    return recovered, still

SRD2_TARGETED_CORE_STATS = {
    # Printed pp. 101–102. These six blocks are split across PDF extraction
    # columns, so their identity parses correctly while their stat line is
    # attached to the neighboring block.
    "Harpy": {
        "difficulty":12, "thresholds":{"major":3,"severe":7}, "hp":3, "stress":3,
        "attack":{"modifier":0,"name":"Talons","range":"Melee","damage":"1d8+1","damage_type":"phy"},
    },
    "Harrier": {
        "difficulty":12, "thresholds":{"major":5,"severe":9}, "hp":3, "stress":3,
        "attack":{"modifier":1,"name":"Javelin","range":"Close","damage":"1d6+2","damage_type":"phy"},
    },
    "Jagged Knife Bandit": {
        "difficulty":12, "thresholds":{"major":8,"severe":14}, "hp":5, "stress":3,
        "attack":{"modifier":1,"name":"Daggers","range":"Melee","damage":"1d8+1","damage_type":"phy"},
    },
    "Jagged Knife Hexer": {
        "difficulty":13, "thresholds":{"major":5,"severe":9}, "hp":4, "stress":4,
        "attack":{"modifier":2,"name":"Staff","range":"Far","damage":"1d6+2","damage_type":"mag"},
    },
    "Jagged Knife Kneebreaker": {
        "difficulty":12, "thresholds":{"major":7,"severe":14}, "hp":7, "stress":4,
        "attack":{"modifier":-3,"name":"Club","range":"Melee","damage":"1d4+6","damage_type":"phy"},
    },
    "Jagged Knife Lackey": {
        "difficulty":9, "thresholds":None, "hp":1, "stress":1,
        "attack":{"modifier":-2,"name":"Daggers","range":"Melee","damage":"2","damage_type":"phy"},
    },
}

def apply_srd2_targeted_core_stats(adversaries):
    """Repair only SRD blocks proven to be split by PDF column extraction."""
    repaired=[]
    for row in adversaries:
        data=SRD2_TARGETED_CORE_STATS.get(row["name"])
        if not data:
            continue
        row["difficulty"]=data["difficulty"]
        row["thresholds"]=data["thresholds"]
        row["hp"]=data["hp"]
        row["stress"]=data["stress"]
        row["stress_none"]=False
        row["attack"]=dict(data["attack"])
        row.setdefault("provenance_debug",{})["core_stats_repaired_from_srd2_targeted_override"]=True
        repaired.append(row["name"])
    return adversaries,repaired

def repair_candidate_core_stats(adversaries, full_text):
    needs=[x for x in adversaries if
           x.get("difficulty") is None or x.get("hp") is None or
           (x.get("stress") is None and not x.get("stress_none")) or
           x.get("attack") is None]
    targets=[{"tier":x["tier"],"name":x["name"]} for x in needs]
    recovered,_=recover_missing_adversaries(full_text,targets)
    by_name={adversary_name_key(x["name"]):x for x in recovered}
    repaired=[]
    for row in adversaries:
        rep=by_name.get(adversary_name_key(row["name"]))
        if not rep: continue
        changed=False
        for field in ("difficulty","thresholds","hp","stress","stress_none","attack"):
            missing=(row.get("stress") is None and not row.get("stress_none")) if field=="stress" else row.get(field) is None
            if missing and rep.get(field) is not None:
                row[field]=rep[field]; changed=True
        if changed:
            row.setdefault("provenance_debug",{})["core_stats_repaired"]=True
            repaired.append(row["name"])
    return adversaries,repaired

def parse_adversaries(text):
    text=clean(text)
    marks=list(ADV_TIER.finditer(text))
    rows=[]
    for mi,m in enumerate(marks):
        tier=int(m.group(1))
        end=marks[mi+1].start() if mi+1<len(marks) else len(text)
        block=text[m.end():end]
        heads=list(ADV_HEAD.finditer(block))
        for i,h in enumerate(heads):
            hend=heads[i+1].start() if i+1<len(heads) else len(block)
            body=block[h.end():hend]
            name=norm(h.group("name")).title()
            diff_value=tolerant_difficulty(body)
            th=re.search(r"Thresholds:\s*([0-9]+)\s*/\s*([0-9]+)",body,re.I)
            hp=re.search(r"HP:\s*(\d+)",body,re.I)
            stress=re.search(r"Stress:\s*(\d+|None)",body,re.I)
            atk=re.search(r"ATK:\s*([+\-]?\d+)\s*\|\s*([^:|\n]+):\s*([^|\n]+)\|\s*([0-9dD+\-]+)\s+(phy|mag)",body,re.I)
            mt=re.search(r"Motives\s*&\s*Tactics:\s*(.*?)(?=\nDifficulty:)",body,re.S|re.I)
            exp=re.search(r"Experience:\s*(.*?)(?=\nFEATURES)",body,re.S|re.I)
            rows.append({
                "id":f"srd-2.0.adversary.{slug(name)}",
                "kind":"adversary","tier":tier,"role":h.group("role"),
                "name":name,
                "motives_tactics":norm(mt.group(1)) if mt else None,
                "difficulty":diff_value,
                "thresholds":{"major":int(th.group(1)),"severe":int(th.group(2))} if th else None,
                "hp":int(hp.group(1)) if hp else None,
                "stress":(None if stress and stress.group(1).lower()=="none" else int(stress.group(1))) if stress else None,
                "stress_none":bool(stress and stress.group(1).lower()=="none"),
                "attack":{
                    "modifier":int(atk.group(1)),"name":norm(atk.group(2)),
                    "range":norm(atk.group(3)),"damage":atk.group(4),
                    "damage_type":atk.group(5).lower()
                } if atk else None,
                "experience_text":norm(exp.group(1)) if exp else None,
                "features_text":norm(body.split("FEATURES",1)[1]) if "FEATURES" in body else "",
                "source":{"corpus":"daggerheart-srd","version":"2.0","status":"srd"},
                "canonical":False
            })
    out={}
    for r in rows: out[(r["tier"],r["name"])]=r
    return list(out.values())

def main():
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python tools\\extract_srd2_adversaries_environments.py <SRD2.pdf>")
    pdf=Path(sys.argv[1])
    reader=PdfReader(str(pdf))

    # SRD adversary rules/list/stat blocks occupy printed pp. 93–157.
    # Environment list/stat blocks occupy pp. 158–182.
    adversary_index=adversary_index_from_pdf(reader)
    adversary_candidates=parse_adversaries(pages(reader,96,158))
    adversaries, adversary_missing, adversary_match_failures = reconcile_adversaries(
        adversary_candidates, adversary_index
    )
    recovered, adversary_missing = recover_missing_adversaries(
        pages(reader,96,158), adversary_missing
    )
    adversaries.extend(recovered)
    adversaries, adversary_core_stats_repaired = repair_candidate_core_stats(
        adversaries, pages(reader,96,158)
    )
    adversaries, adversary_targeted_core_stats_repaired = apply_srd2_targeted_core_stats(adversaries)
    adv_rank={adversary_name_key(x["name"]):i for i,x in enumerate(adversary_index)}
    adversaries.sort(key=lambda x:adv_rank.get(adversary_name_key(x["name"]),9999))
    environments=parse_environments(pages(reader,158,182))

    adv_index_counts={t:sum(1 for x in adversary_index if x["tier"]==t) for t in range(1,5)}
    adv_counts={t:sum(1 for x in adversaries if x["tier"]==t) for t in range(1,5)}
    env_counts={t:sum(1 for x in environments if x["tier"]==t) for t in range(1,5)}
    checks={
        "environment_total":len(environments)==47,
        "environment_by_tier":env_counts==ENV_EXPECTED,
        "environment_ids_unique":len({x["id"] for x in environments})==len(environments),
        "environment_types_valid":all(x["type"] in ENV_TYPES for x in environments),
        "environment_difficulty_present":all(x["difficulty"] is not None or x.get("difficulty_special") for x in environments),
        "environment_index_identity":all((x["tier"],x["name"],x["type"])==ENV_INDEX[i] for i,x in enumerate(environments)),
        "adversary_index_nonzero":len(adversary_index)>0,
        "adversary_candidates_nonzero":len(adversary_candidates)>0,
        "adversary_count_matches_index":len(adversaries)==len(adversary_index),
        "adversary_by_tier_matches_index":adv_counts==adv_index_counts,
        "adversary_index_all_matched":len(adversary_missing)==0 and len(adversary_match_failures)==0,
        "adversary_ids_unique":len({x["id"] for x in adversaries})==len(adversaries),
        "adversary_roles_valid":all(x["role"] in ADV_ROLES for x in adversaries),
        "adversary_difficulty_present":all(x["difficulty"] is not None for x in adversaries),
        "adversary_hp_stress_present":all(x["hp"] is not None and (x["stress"] is not None or x.get("stress_none")) for x in adversaries),
    }
    env_green=all(checks[k] for k in checks if k.startswith("environment_"))

    write_json(OUT/"environments/environments.json",environments)
    write_json(OUT/"adversaries/adversaries-candidate.json",adversary_candidates)
    write_json(OUT/"adversaries/adversaries.json",adversaries)
    write_json(OUT/"adversaries/adversary-index.json",adversary_index)

    manifest={
        "source_file":pdf.name,"phase":"P1.1e-adversaries-fix4",
        "counts":{"environments":len(environments),"environments_by_tier":env_counts,
                  "adversary_index":len(adversary_index),
                  "adversary_candidates":len(adversary_candidates),
                  "adversaries_matched":len(adversaries),
                  "adversaries_by_tier":adv_counts},
        "expected":{"environments":47,"environments_by_tier":ENV_EXPECTED,
                    "adversaries_from_srd_index":len(adversary_index),
                    "adversaries_by_tier_from_srd_index":adv_index_counts},
        "checks":checks,
        "environments_validation":"GREEN" if env_green else "RED",
        "adversaries_validation":"GREEN" if all(
            checks[k] for k in checks if k.startswith("adversary_")
        ) else "RED",
        "debug":{
            "environment_names_by_tier":{str(t):[x["name"] for x in environments if x["tier"]==t] for t in range(1,5)},
            "environments_missing_difficulty":[x["name"] for x in environments if x["difficulty"] is None and not x.get("difficulty_special")],
            "environments_special_difficulty":[{"name":x["name"],"value":x.get("difficulty_special")} for x in environments if x.get("difficulty_special")],
            "environment_name_matches":[{"name":x["name"],"raw":x["provenance_debug"]["raw_name"],"ratio":x["provenance_debug"]["name_match_ratio"]} for x in environments],
            "adversary_index_names_by_tier":{str(t):[x["name"] for x in adversary_index if x["tier"]==t] for t in range(1,5)},
            "adversary_names_by_tier":{str(t):[x["name"] for x in adversaries if x["tier"]==t] for t in range(1,5)},
            "adversary_recovered_by_targeted_scan":[x["name"] for x in recovered],
            "adversary_core_stats_repaired":adversary_core_stats_repaired,
            "adversary_targeted_core_stats_repaired":adversary_targeted_core_stats_repaired,
            "adversary_missing_from_stat_parser":adversary_missing,
            "adversary_match_failures":adversary_match_failures,
            "adversaries_missing_difficulty":[x["name"] for x in adversaries if x["difficulty"] is None],
            "adversaries_missing_hp_or_stress":[x["name"] for x in adversaries if x["hp"] is None or (x["stress"] is None and not x.get("stress_none"))],
            "adversaries_missing_attack":[x["name"] for x in adversaries if x["attack"] is None]
        },
        "notes":[
            "Environment identity/tier/type are reconciled against the authoritative SRD 2.0 index on printed page 159.",
            "P1.1e-fix1 repairs the Tier 3/4 Volcanic Eruption boundary and pypdf ligature/name corruption.",
            "P1.1e-fix2 makes Difficulty parsing tolerant of embedded-font spacing corruption and reports any remaining misses explicitly.",
            "P1.1e-fix3 matches stat blocks to the SRD index by fuzzy-normalized name instead of PDF order and supports Special Difficulty environments.",
            "P1.1e-fix4 adds deterministic aliases for the two headings pypdf truncates to Workshop and City of Portals.",
            "Adversary expected identities/counts are now derived from the SRD 2.0 adversary index on printed pages 94–96.",
            "Candidate stat blocks are reconciled globally by normalized name; raw pypdf tier placement is not trusted.",
            "P1.1e-adversaries-fix1 recovers stat blocks missed at PDF ordering boundaries and treats explicit Stress: None as valid.",
            "P1.1e-adversaries-fix2 uses line-driven targeted recovery, repairs malformed core stat lines, and supports flat Minion attack damage.",
            "P1.1e-adversaries-fix3 includes printed page 158 and recovers headings even when pypdf appends them to preceding prose.",
            "P1.1e-adversaries-fix4 applies source-verified SRD 2.0 core stats to the six Tier-1 blocks split by PDF column extraction.",
            "No hard-coded adversary count is used; missing or unmatched entries stay RED and are reported explicitly.",
            "P1.1e adversary audit extracts identity, role, core stats, attack, experiences and raw feature text."
        ]
    }
    write_json(OUT/"registry/P1.1e-status.json",manifest)
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
    if not env_green:
        raise SystemExit(2)

if __name__=="__main__":
    main()
