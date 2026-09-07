#!/usr/bin/env python3
"""
Extract Daggerheart SRD 2.0 campaign-frame and supplemental campaign mechanics.

Usage:
  python tools/extract_srd2_campaign_mechanics.py "C:\path\DH_SRD_2_2026_08_25.pdf"
"""
from __future__ import annotations
import json, re, sys, unicodedata
from pathlib import Path
from pypdf import PdfReader

OUT=Path("data/srd-2.0")
SOURCE_VERSION="2.0"

WITHERWILD_EXPECTED_SECTIONS=[
    "The Pitch",
    "Tone & Feel",
    "Themes",
    "Touchstones",
    "Overview",
    "Communities",
    "Ancestries",
    "Classes",
    "Player Principles",
    "GM Principles",
    "Distinctions",
    "Inciting Incident",
    "Campaign Mechanics",
    "Session Zero Questions",
]

WITHERWILD_HEADING_ALIASES={
    "The Pitch":["THE PITCH"],
    "Tone & Feel":["TONE & FEEL"],
    "Themes":["THEMES"],
    "Touchstones":["TOUCHSTONES"],
    "Overview":["OVERVIEW"],
    "Communities":["COMMUNITIES"],
    "Ancestries":["ANCESTRIES"],
    "Classes":["CLASSES"],
    "Player Principles":["PLAYER PRINCIPLES"],
    "GM Principles":["GM PRINCIPLES"],
    "Distinctions":["DISTINCTIONS"],
    "Inciting Incident":["THE INCITING INCIDENT","INCITING INCIDENT"],
    "Campaign Mechanics":["CAMPAIGN MECHANICS","WITHERWILD CAMPAIGN MECHANICS"],
    "Session Zero Questions":["SESSION ZERO QUESTIONS"],
}

SUPPLEMENTAL_EXPECTED=[
    ("Faction Tracking",190),
    ("Everyday Hero Starting Equipment",191),
    ("Feasts",192),
    ("Grimdark Campaigns",195),
    ("Tech-Based Campaigns",195),
    ("Western Campaigns",197),
    ("Colossal Adversaries",198),
    ("Floating Magic School Campaigns",199),
    ("Fairy Tale Campaigns",200),
    ("Monster Hunting Campaigns",201),
    ("Hex Crawl Campaigns",203),
]

def clean(s:str)->str:
    s=s.replace("\u00ad","").replace("\u200b","").replace("\ufeff","")
    s=s.replace("￾","-")
    return s

def norm(s:str)->str:
    return re.sub(r"\s+"," ",clean(s)).strip()

def slug(s:str)->str:
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def write_json(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def printed_pages(reader,start:int,end:int)->str:
    # Printed page N == reader.pages[N-1].
    return "\n".join((reader.pages[n-1].extract_text() or "") for n in range(start,end+1))

def compact_with_map(text:str):
    """Collapse whitespace while preserving a mapping back to raw offsets."""
    out=[]
    rawpos=[]
    in_ws=False
    for i,ch in enumerate(clean(text)):
        if ch.isspace():
            if not in_ws:
                out.append(" ")
                rawpos.append(i)
                in_ws=True
        else:
            out.append(ch)
            rawpos.append(i)
            in_ws=False
    return "".join(out), rawpos

def locate_literal_headings(text:str, canonical_to_aliases:dict[str,list[str]]):
    """Locate uppercase headings without trusting PDF line boundaries.

    pypdf can wrap a heading, prepend page furniture, or append it to prose.
    Uppercase literal matching is much more stable for this SRD layout.
    """
    compact, rawmap=compact_with_map(text)
    hits=[]
    for canonical,aliases in canonical_to_aliases.items():
        best=None
        for alias in aliases:
            # whitespace-flexible, but case-sensitive to avoid prose mentions
            pat=re.compile(r"(?<![A-Za-z])"+r"\s+".join(re.escape(x) for x in alias.split())+r"(?![a-z])")
            for m in pat.finditer(compact):
                cand=(m.start(),m.end(),alias)
                if best is None or cand[0]<best[0]:
                    best=cand
        if best is not None:
            cs,ce,alias=best
            rs=rawmap[cs]
            re_=rawmap[min(ce-1,len(rawmap)-1)]+1
            hits.append((rs,re_,canonical,alias))
    hits.sort()

    sections=[]
    for i,(rs,re_,canonical,alias) in enumerate(hits):
        rend=hits[i+1][0] if i+1<len(hits) else len(text)
        sections.append({
            "title":canonical,
            "raw_heading":alias,
            "text":clean(text[re_:rend]).strip(),
        })
    return sections

def locate_supplemental(reader):
    """Extract supplemental subsystems from authoritative TOC start pages.

    Headings in this PDF are not consistently uppercase (for example `Feasts`
    and `Grimdark CampaignS`), and two sections can start on the same page.
    Matching is therefore case-insensitive inside the authoritative page
    window, with the next same-page heading used as the local end boundary.
    """
    rows=[]
    failures=[]

    def title_pattern(title):
        return re.compile(
            r"(?<![A-Za-z])"
            + r"\s+".join(re.escape(x) for x in title.split())
            + r"(?![A-Za-z])",
            re.I
        )

    for i,(title,start_page) in enumerate(SUPPLEMENTAL_EXPECTED):
        next_title,next_page=(SUPPLEMENTAL_EXPECTED[i+1]
                              if i+1<len(SUPPLEMENTAL_EXPECTED)
                              else (None,206))

        # If the next subsystem begins on the same printed page, that page
        # necessarily contains both headings. Otherwise stop before next page.
        end_page=start_page if next_page==start_page else min(next_page-1,205)
        raw=clean(printed_pages(reader,start_page,end_page))
        compact,rawmap=compact_with_map(raw)

        m=title_pattern(title).search(compact)
        if not m:
            failures.append({
                "name":title,
                "printed_page":start_page,
                "reason":"heading_not_found_on_authoritative_start_page"
            })
            continue

        raw_start=rawmap[m.start()]
        raw_end=rawmap[min(m.end()-1,len(rawmap)-1)]+1
        body_end=len(raw)

        # Split same-page neighbors explicitly (Grimdark / Tech-Based).
        if next_title and next_page==start_page:
            nm=title_pattern(next_title).search(compact,m.end())
            if nm:
                body_end=rawmap[nm.start()]

        body=raw[raw_end:body_end].strip()

        rows.append({
            "id":f"srd-2.0.supplemental-campaign-mechanic.{slug(title)}",
            "kind":"supplemental_campaign_mechanic",
            "identity":{"name":title,"slug":slug(title)},
            "source":{"corpus":"daggerheart-srd","version":SOURCE_VERSION,"status":"srd"},
            "provenance":{"start_printed_page":start_page,"end_printed_page":end_page},
            "rules_text":body,
            "raw_heading":norm(raw[raw_start:raw_end]),
        })

    return rows,failures

def extract_witherwild(reader):
    text=clean(printed_pages(reader,184,189))
    # Campaign-frame data starts at "The Witherwild".
    m=re.search(r"(?im)^\s*The\s+Witherwild\s*$",text)
    if m:
        text=text[m.start():]

    sections=locate_literal_headings(text,WITHERWILD_HEADING_ALIASES)

    complexity=None
    cm=re.search(r"COMPLEXITY\s+RATING\s*:\s*([•●]+|\d+)",text,re.I)
    if cm:
        raw=cm.group(1)
        complexity=len(raw) if not raw.isdigit() else int(raw)

    # Preserve public SRD copy as source text; structural fields are separate.
    return {
        "id":"srd-2.0.campaign-frame.witherwild",
        "kind":"campaign_frame",
        "identity":{"name":"The Witherwild","slug":"witherwild"},
        "source":{"corpus":"daggerheart-srd","version":SOURCE_VERSION,"status":"srd"},
        "provenance":{"printed_pages":[184,189]},
        "complexity_rating":complexity,
        "sections":[
            {
                "id":f"srd-2.0.campaign-frame.witherwild.{slug(x['title'])}",
                "name":x["title"],
                "rules_text":x["text"],
                "raw_heading":x["raw_heading"],
            } for x in sections
        ],
        "section_names":[x["title"] for x in sections],
    }

def extract_supplemental(reader):
    return locate_supplemental(reader)

def main():
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python tools/extract_srd2_campaign_mechanics.py <SRD2.pdf>")
    pdf=Path(sys.argv[1])
    reader=PdfReader(str(pdf))

    frame=extract_witherwild(reader)
    supplemental, failures=extract_supplemental(reader)

    frame_names=frame["section_names"]
    supplemental_names=[x["identity"]["name"] for x in supplemental]

    checks={
        "witherwild_identity":frame["identity"]["name"]=="The Witherwild",
        "witherwild_complexity_present":frame["complexity_rating"] is not None,
        "witherwild_sections_all_present":all(x in frame_names for x in WITHERWILD_EXPECTED_SECTIONS),
        "witherwild_section_ids_unique":len({x["id"] for x in frame["sections"]})==len(frame["sections"]),
        "supplemental_total":len(supplemental)==len(SUPPLEMENTAL_EXPECTED),
        "supplemental_identity":supplemental_names==[x[0] for x in SUPPLEMENTAL_EXPECTED],
        "supplemental_ids_unique":len({x["id"] for x in supplemental})==len(supplemental),
        "supplemental_text_nonempty":all(bool(x["rules_text"]) for x in supplemental),
    }

    status={
        "source_file":pdf.name,
        "phase":"P1.1f-a-fix2",
        "counts":{
            "campaign_frames":1,
            "witherwild_sections":len(frame["sections"]),
            "supplemental_campaign_mechanics":len(supplemental),
        },
        "expected":{
            "campaign_frames":1,
            "witherwild_sections":len(WITHERWILD_EXPECTED_SECTIONS),
            "supplemental_campaign_mechanics":len(SUPPLEMENTAL_EXPECTED),
        },
        "checks":checks,
        "campaign_frame_validation":"GREEN" if all(checks[k] for k in checks if k.startswith("witherwild_")) else "RED",
        "supplemental_validation":"GREEN" if all(checks[k] for k in checks if k.startswith("supplemental_")) else "RED",
        "debug":{
            "witherwild_sections_found":frame_names,
            "witherwild_sections_missing":[x for x in WITHERWILD_EXPECTED_SECTIONS if x not in frame_names],
            "supplemental_sections_found":supplemental_names,
            "supplemental_heading_failures":failures,
        },
        "notes":[
            "P1.1f-a extracts the SRD 2.0 Witherwild campaign frame as one canonical campaign_frame entity.",
            "P1.1f-a-fix1 stops relying on PDF line boundaries: Witherwild uses uppercase literal headings, while supplemental sections use authoritative TOC page ranges.",
            "P1.1f-a-fix2 makes supplemental heading matching case-insensitive and handles multiple subsystems beginning on the same printed page.",
            "Its fourteen expected structural sections follow the campaign-frame structure documented by Daggerheart.",
            "Supplemental campaign mechanics are indexed as eleven canonical top-level sections from printed pages 190–205.",
            "This pass preserves source rules text and locks section identity; deeper subsystem normalization can follow without changing canonical IDs.",
        ],
    }

    write_json(OUT/"campaign-frames/witherwild.json",frame)
    write_json(OUT/"supplemental-campaign-mechanics/index.json",supplemental)
    for item in supplemental:
        write_json(OUT/f"supplemental-campaign-mechanics/{item['identity']['slug']}.json",item)
    write_json(OUT/"registry/P1.1f-status.json",status)

    print(json.dumps(status,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
