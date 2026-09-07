#!/usr/bin/env python3
"""
P1.3b — Deep private extraction of Hope & Fear campaign frames.

Reads the user's private Daggerheart_HF.pdf and extracts the four campaign
frames into the private corpus while preserving provenance and recording
candidate primitive evidence.

Usage from repository root:
  python tools/extract_hope_fear_campaign_frames.py "pdf/Daggerheart_HF.pdf"

Requires: pypdf
"""
from __future__ import annotations

import json, re, sys, unicodedata
from pathlib import Path
from pypdf import PdfReader

OUT=Path("data/hope-fear-private")
REG=OUT/"registry"
FRAMES=OUT/"campaign-frames"

FRAME_SPECS=[
    {
        "id":"hope-fear.campaign-frame.castle-high",
        "slug":"castle-high",
        "name":"Castle High",
        "start":116,
        "end":127,
    },
    {
        "id":"hope-fear.campaign-frame.reign-of-the-weredragon",
        "slug":"reign-of-the-weredragon",
        "name":"Reign of the Weredragon",
        "start":128,
        "end":143,
    },
    {
        "id":"hope-fear.campaign-frame.dark-heart-of-andaluria",
        "slug":"dark-heart-of-andaluria",
        "name":"Dark Heart of Andaluria",
        "start":144,
        "end":157,
    },
    {
        "id":"hope-fear.campaign-frame.journey-to-horizon",
        "slug":"journey-to-horizon",
        "name":"Journey to Horizon",
        "start":158,
        "end":179,
    },
]

CANONICAL_SECTION_HEADINGS=[
    "THE PITCH",
    "TONE & FEEL",
    "THEMES",
    "TOUCHSTONES",
    "OVERVIEW",
    "COMMUNITIES",
    "ANCESTRIES",
    "CLASSES",
    "PLAYER PRINCIPLES",
    "GM PRINCIPLES",
    "DISTINCTIONS",
    "INCITING INCIDENT",
    "CAMPAIGN MECHANICS",
    "SESSION ZERO QUESTIONS",
]

def clean(s:str)->str:
    return (s.replace("\u00ad","")
             .replace("\u200b","")
             .replace("\ufeff","")
             .replace("￾","-"))

def norm(s:str)->str:
    return re.sub(r"\s+"," ",clean(s)).strip()

def slug(s:str)->str:
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def load_pages(reader,start,end):
    parts=[]
    for printed in range(start,end+1):
        idx=printed-1
        if 0 <= idx < len(reader.pages):
            txt=reader.pages[idx].extract_text() or ""
            parts.append(txt)
    return "\n".join(parts)

def find_frame_start_page(reader, frame_name):
    """Locate the actual PDF page containing a campaign-frame opener.

    We do not trust printed-page == PDF-index here because H&F includes
    front matter and pypdf pagination can differ. The opener is identified
    by the frame name plus its Complexity Rating on the same page.
    """
    name_re=re.compile(re.escape(frame_name), re.I)
    for idx,page in enumerate(reader.pages):
        txt=clean(page.extract_text() or "")
        if name_re.search(txt) and re.search(r"Complexity\s+Rating",txt,re.I):
            return idx
    return None

def load_frame_by_boundaries(reader, spec, next_spec=None):
    start_idx=find_frame_start_page(reader,spec["name"])
    if start_idx is None:
        # Fallback to historical printed-page assumption.
        return load_pages(reader,spec["start"],spec["end"]), {
            "method":"printed_page_fallback",
            "pdf_start_index":spec["start"]-1,
            "pdf_end_index":spec["end"]-1,
        }

    end_idx=None
    if next_spec is not None:
        next_idx=find_frame_start_page(reader,next_spec["name"])
        if next_idx is not None and next_idx>start_idx:
            end_idx=next_idx-1

    if end_idx is None:
        # For the final H&F frame, stop before the Appendix/Domain Cards area
        # when possible; otherwise use the historical page-span length.
        appendix_idx=None
        for idx in range(start_idx+1,len(reader.pages)):
            txt=clean(reader.pages[idx].extract_text() or "")
            if re.search(r"DOMAIN\s+CARD",txt,re.I) and re.search(r"APPENDIX|REFERENCE",txt,re.I):
                appendix_idx=idx
                break
        end_idx=(appendix_idx-1) if appendix_idx is not None else min(
            len(reader.pages)-1,
            start_idx+(spec["end"]-spec["start"])
        )

    parts=[reader.pages[i].extract_text() or "" for i in range(start_idx,end_idx+1)]
    return "\n".join(parts), {
        "method":"content_boundary",
        "pdf_start_index":start_idx,
        "pdf_end_index":end_idx,
    }

def split_sections(text:str):
    compact=clean(text)
    matches=[]
    for heading in CANONICAL_SECTION_HEADINGS:
        # tolerate PDF spacing artifacts inside headings
        words=heading.split()
        patt=r"\s+".join(re.escape(w) for w in words)
        m=re.search(patt,compact,re.I)
        if m:
            matches.append((m.start(),m.end(),heading))
    matches.sort()

    sections=[]
    for i,(start,end,heading) in enumerate(matches):
        nxt=matches[i+1][0] if i+1<len(matches) else len(compact)
        body=compact[end:nxt].strip()
        sections.append({
            "id":slug(heading),
            "name":heading.title(),
            "raw_heading":heading,
            "rules_text":body,
        })
    return sections

def subsection_candidates(campaign_mechanics_text:str):
    """
    Conservative structural split of the CAMPAIGN MECHANICS block.
    Short uppercase lines are treated as mechanic headings.
    """
    lines=clean(campaign_mechanics_text).splitlines()
    out=[]
    current=None

    def flush():
        nonlocal current
        if current and current["rules_text"]:
            current["rules_text"]="\n".join(current["rules_text"]).strip()
            out.append(current)
        current=None

    for raw in lines:
        line=norm(raw)
        if not line:
            continue
        letters=[c for c in line if c.isalpha()]
        uppercase=bool(letters) and sum(c.isupper() for c in letters)/len(letters)>=0.80
        looks_heading=uppercase and len(line)<=90 and not line.startswith("•")
        if looks_heading:
            flush()
            current={
                "id":slug(line),
                "name":line.title(),
                "raw_heading":line,
                "rules_text":[],
            }
        else:
            if current is None:
                current={
                    "id":"introduction",
                    "name":"Introduction",
                    "rules_text":[],
                }
            current["rules_text"].append(line)
    flush()
    return out

def primitive_hypotheses(frame_name, mechanic_blocks):
    hyps=[]
    for block in mechanic_blocks:
        name=block["name"]
        body=norm(block["rules_text"])
        low=(name+" "+body).lower()

        # Candidate tags only; P1.4 decides the actual ontology.
        tags=[]
        if any(k in low for k in ("track","countdown","clock")):
            tags.append("track_or_countdown")
        if any(k in low for k in ("resource","spend","gain","mark","clear","slot")):
            tags.append("resource_or_slot")
        if any(k in low for k in ("relationship","faction","reputation")):
            tags.append("relationship_or_faction")
        if any(k in low for k in ("table","roll d","roll a d","result")):
            tags.append("result_table")
        if any(k in low for k in ("upgrade","craft","recipe","ingredient","scrap")):
            tags.append("craft_or_upgrade")
        if any(k in low for k in ("phase","segment","state","form","transform")):
            tags.append("state_or_phase")
        if any(k in low for k in ("travel","journey","map","route","location")):
            tags.append("travel_or_map")
        if any(k in low for k in ("companion","vehicle","ship","mount")):
            tags.append("linked_actor_or_vehicle")
        if any(k in low for k in ("downtime","rest")):
            tags.append("downtime_procedure")
        if any(k in low for k in ("fear","hope","stress","hit point","hp")):
            tags.append("core_resource_hook")

        hyps.append({
            "frame":frame_name,
            "mechanic_block_id":block["id"],
            "mechanic_block_name":name,
            "candidate_primitives":tags or ["unclassified_mechanic"],
            "status":"candidate",
        })
    return hyps

def save(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    if len(sys.argv)<2:
        raise SystemExit(
            'Usage: python tools/extract_hope_fear_campaign_frames.py "pdf/Daggerheart_HF.pdf"'
        )

    pdf=Path(sys.argv[1])
    reader=PdfReader(str(pdf))
    all_hypotheses=[]
    frame_reports=[]
    errors=[]

    for idx,spec in enumerate(FRAME_SPECS):
        next_spec=FRAME_SPECS[idx+1] if idx+1<len(FRAME_SPECS) else None
        raw,boundary_info=load_frame_by_boundaries(reader,spec,next_spec)
        sections=split_sections(raw)
        section_map={x["id"]:x for x in sections}
        mechanics=section_map.get("campaign-mechanics")

        mechanic_blocks=[]
        if mechanics:
            mechanic_blocks=subsection_candidates(mechanics["rules_text"])

        entity={
            "id":spec["id"],
            "kind":"campaign_frame",
            "name":spec["name"],
            "source":{
                "corpus":"hope-fear",
                "product":"Daggerheart: Hope & Fear",
                "status":"published_private",
                "source_file":pdf.name,
                "printed_pages":{"start":spec["start"],"end":spec["end"]},
                "pdf_boundary":boundary_info,
            },
            "sections":sections,
            "campaign_mechanics":{
                "blocks":mechanic_blocks,
                "normalization_status":"structural",
            },
            "primitive_evidence":primitive_hypotheses(spec["name"],mechanic_blocks),
        }
        save(FRAMES/f'{spec["slug"]}.json',entity)

        all_hypotheses.extend(entity["primitive_evidence"])

        report={
            "id":spec["id"],
            "name":spec["name"],
            "sections_found":len(sections),
            "campaign_mechanics_found":mechanics is not None,
            "mechanic_blocks_found":len(mechanic_blocks),
            "output":str(FRAMES/f'{spec["slug"]}.json'),
            "pdf_boundary":boundary_info,
        }
        frame_reports.append(report)

        if len(sections)<10:
            errors.append(f'{spec["name"]}: only {len(sections)} canonical sections found')
        if mechanics is None:
            errors.append(f'{spec["name"]}: CAMPAIGN MECHANICS section missing')
        elif not mechanic_blocks:
            errors.append(f'{spec["name"]}: no mechanic blocks found')

    # Private appendix assets are indexed here but not copied/extracted as images.
    appendix_assets=[
        {
            "id":"hope-fear.appendix.additional-sheets",
            "kind":"play_aid_collection",
            "printed_pages":{"start":182,"end":186},
            "status":"private_reference_asset",
            "primitive_candidate":"play_aid",
        },
        {
            "id":"hope-fear.appendix.campaign-frame-maps",
            "kind":"map_handout_collection",
            "printed_pages":{"start":187,"end":191},
            "status":"private_reference_asset",
            "primitive_candidate":"map_or_handout",
        },
    ]
    save(OUT/"appendix-assets.json",{
        "source":{
            "corpus":"hope-fear",
            "product":"Daggerheart: Hope & Fear",
            "status":"published_private",
            "source_file":pdf.name,
        },
        "assets":appendix_assets,
    })

    # Cross-frame primitive candidate summary.
    primitive_counts={}
    for row in all_hypotheses:
        for p in row["candidate_primitives"]:
            primitive_counts[p]=primitive_counts.get(p,0)+1

    checks={
        "pdf_readable":len(reader.pages)>0,
        "four_frames_written":len(frame_reports)==4,
        "all_frames_have_campaign_mechanics":
            all(x["campaign_mechanics_found"] for x in frame_reports),
        "all_frames_have_mechanic_blocks":
            all(x["mechanic_blocks_found"]>0 for x in frame_reports),
        "appendix_assets_indexed":len(appendix_assets)==2,
        "primitive_evidence_present":len(all_hypotheses)>0,
        "no_structural_errors":len(errors)==0,
    }

    report={
        "phase":"P1.3b-fix2",
        "source_file":pdf.name,
        "frames":frame_reports,
        "appendix_assets":appendix_assets,
        "primitive_candidate_counts":primitive_counts,
        "primitive_evidence_count":len(all_hypotheses),
        "checks":checks,
        "validation":"GREEN" if all(checks.values()) else "RED",
        "errors":errors,
        "notes":[
            "This pass extracts private H&F campaign-frame structure and mechanics only into data/hope-fear-private.",
            "Campaign mechanic sub-blocks are structural evidence, not yet final primitives.",
            "P1.4 Primitive Census will merge evidence from SRD, H&F, other settings, Blood Hunter, and Monster Hunter before committing to an ontology.",
            "Appendix sheets/maps are indexed as private reference assets; this script does not export copyrighted artwork or layout."
        ],
        "next_phase":"P1.3c — inventory additional campaign-setting sources",
    }
    save(REG/"P1.3b-status.json",report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
