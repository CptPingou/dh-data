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

SOURCE_HEADING_ALIASES={
    "THE INCITING INCIDENT":"INCITING INCIDENT",
}

def clean(s:str)->str:
    s=(s.replace("\u00ad","")
       .replace("\u200b","")
       .replace("\ufeff","")
       .replace("￾","-"))

    # P2.4.2d-1: remove deterministic H&F running page footers.
    # The extracted footer is a standalone line beginning with the printed
    # page number followed by "Chapter 4: ...". Removing the whole line is
    # safe and reproducible; ordinary prose mentioning Chapter 4 is untouched.
    s=re.sub(
        r"(?mi)^[ \t]*\d{2,3}[ \t]*(?:\r?\n[ \t]*)?Chapter[ \t]+4:[^\r\n]*(?:\r?\n|$)",
        "",
        s,
    )

    # P2.4.2d-2: deterministic OCR repairs confirmed against source context.
    # Repair pronoun line breaks such as "(he/\nhim)" while preserving the
    # actual pronoun pair.
    s=re.sub(
        r"\((he|she|they)/[ \t]*\r?\n[ \t]*(him|her|them)\)",
        lambda m: f"({m.group(1)}/{m.group(2)})",
        s,
        flags=re.I,
    )

    # Repair the recurrent Type1 extraction artifact "T o" -> "To".
    # Deliberately narrow: capital T + horizontal whitespace + lowercase o.
    s=re.sub(r"\bT[ \t]+o\b", "To", s)

    return s

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

def find_frame_start_page(reader, frame_name, expected_start=None, expected_end=None, margin=6):
    """Locate the actual PDF page containing a campaign-frame opener.

    Printed page numbers are treated as approximate anchors, not exact PDF
    indexes. Restricting the search to a small window prevents overview pages
    that mention several frames from being mistaken for individual openers.
    """
    name_re=re.compile(re.escape(frame_name), re.I)

    if expected_start is not None and expected_end is not None:
        approx_start=max(0, expected_start-1-margin)
        approx_end=min(len(reader.pages)-1, expected_end-1+margin)
        indexes=range(approx_start, approx_end+1)
    else:
        indexes=range(len(reader.pages))

    for idx in indexes:
        txt=clean(reader.pages[idx].extract_text() or "")
        if name_re.search(txt) and re.search(r"Complexity\s+Rating",txt,re.I):
            return idx
    return None

def load_frame_by_boundaries(reader, spec, next_spec=None):
    start_idx=find_frame_start_page(
        reader,
        spec["name"],
        expected_start=spec["start"],
        expected_end=spec["end"],
    )
    if start_idx is None:
        # Fallback to historical printed-page assumption.
        return load_pages(reader,spec["start"],spec["end"]), {
            "method":"printed_page_fallback",
            "pdf_start_index":spec["start"]-1,
            "pdf_end_index":spec["end"]-1,
        }

    end_idx=None
    if next_spec is not None:
        next_idx=find_frame_start_page(
            reader,
            next_spec["name"],
            expected_start=next_spec["start"],
            expected_end=next_spec["end"],
        )
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
    """Split a frame on plausible standalone canonical heading lines.

    The previous extractor searched the first occurrence of every heading
    anywhere in the full text. That allowed ordinary prose mentions such as
    "classes" or "overview" to become false boundaries.

    This pass scans extracted lines in source order. A boundary is accepted
    only when the normalized line exactly equals a canonical heading and its
    canonical position comes after the last accepted heading. Missing headings
    are allowed; out-of-order/repeated prose matches are ignored.
    """
    compact=clean(text)
    canonical_index={heading:i for i,heading in enumerate(CANONICAL_SECTION_HEADINGS)}
    matches=[]
    last_canonical=-1

    offset=0
    for raw_line in compact.splitlines(keepends=True):
        line_without_eol=raw_line.rstrip("\r\n")
        normalized=norm(line_without_eol).upper()
        heading=None
        raw_heading=None

        for candidate in CANONICAL_SECTION_HEADINGS:
            if normalized == candidate:
                heading=candidate
                raw_heading=candidate
                break

        if heading is None and normalized in SOURCE_HEADING_ALIASES:
            raw_heading=normalized
            heading=SOURCE_HEADING_ALIASES[normalized]

        if heading is not None:
            idx=canonical_index[heading]
            if idx > last_canonical:
                start=offset
                end=offset+len(line_without_eol)
                matches.append((start,end,heading,raw_heading))
                last_canonical=idx

        offset += len(raw_line)

    sections=[]
    for i,(start,end,heading,raw_heading) in enumerate(matches):
        nxt=matches[i+1][0] if i+1<len(matches) else len(compact)
        body=compact[end:nxt].strip()
        sections.append({
            "id":slug(heading),
            "name":heading.title(),
            "raw_heading":raw_heading,
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
            'Usage: python tools/extract_hope_fear_campaign_frames.py "pdf/Daggerheart_HF.pdf" '
            '[--diagnose-boundaries|--diagnose-sections|--diagnose-headings|--diagnose-ocr|--diagnose-footers]'
        )

    pdf=Path(sys.argv[1])
    reader=PdfReader(str(pdf))

    if "--diagnose-boundaries" in sys.argv[2:]:
        print("Detected frame starts:")
        for spec in FRAME_SPECS:
            idx=find_frame_start_page(
                reader,
                spec["name"],
                expected_start=spec["start"],
                expected_end=spec["end"],
            )
            print(
                f'{spec["name"]}: pdf_index={idx} '
                f'expected_printed={spec["start"]}-{spec["end"]}'
            )
        return

    if "--diagnose-footers" in sys.argv[2:]:
        print("Hope & Fear residual footer diagnostic (read-only):")
        pattern=re.compile(r"(?mi)(?:^|\n)[ \t]*\d{2,3}[ \t]*(?:\r?\n[ \t]*)?Chapter[ \t]+4:[^\r\n]*")
        total=0

        for idx,spec in enumerate(FRAME_SPECS):
            next_spec=FRAME_SPECS[idx+1] if idx+1<len(FRAME_SPECS) else None
            raw,boundary_info=load_frame_by_boundaries(reader,spec,next_spec)
            sections=split_sections(raw)

            print()
            print(f'[{spec["name"]}]')
            print(f'  boundary={boundary_info}')
            frame_total=0

            for section in sections:
                body=section.get("rules_text","")
                for match in pattern.finditer(body):
                    frame_total+=1
                    total+=1
                    lo=max(0,match.start()-80)
                    hi=min(len(body),match.end()+100)
                    context=re.sub(r"\s+", " ", body[lo:hi]).strip()
                    print(f'  {section["id"]} | match={match.group(0)!r}')
                    print(f'    ...{context}...')

            if frame_total==0:
                print("  no residual footers")

        print()
        print(f"RESIDUAL_FOOTERS={total}")
        return

    if "--diagnose-ocr" in sys.argv[2:]:
        print("Hope & Fear OCR artifact diagnostic (read-only):")
        patterns={
            "split_pronoun":re.compile(
                r"\((?:he|she|they)/\s*\n\s*(?:him|her|them)\)",
                re.I,
            ),
            "split_word_T":re.compile(r"\bT\s+[a-z]\b"),
        }
        total=0

        for idx,spec in enumerate(FRAME_SPECS):
            next_spec=FRAME_SPECS[idx+1] if idx+1<len(FRAME_SPECS) else None
            raw,boundary_info=load_frame_by_boundaries(reader,spec,next_spec)
            sections=split_sections(raw)

            print()
            print(f'[{spec["name"]}]')
            print(f'  boundary={boundary_info}')

            frame_total=0
            for section in sections:
                body=section.get("rules_text","")
                for label,pattern in patterns.items():
                    for match in pattern.finditer(body):
                        frame_total+=1
                        total+=1
                        lo=max(0,match.start()-110)
                        hi=min(len(body),match.end()+150)
                        context=body[lo:hi]
                        context=re.sub(r"\s+", " ", context).strip()
                        print(
                            f'  {section["id"]} | {label} | '
                            f'match={match.group(0)!r}'
                        )
                        print(f'    ...{context}...')

            if frame_total==0:
                print("  no OCR candidates")

        print()
        print(f"OCR_CANDIDATES={total}")
        return

    if "--diagnose-headings" in sys.argv[2:]:
        print("Campaign-frame heading diagnostic (read-only):")
        targets=[
            "PLAYER PRINCIPLES",
            "INCITING INCIDENT",
            "DISTINCTIONS",
            "CAMPAIGN MECHANICS",
            "SESSION ZERO QUESTIONS",
        ]

        overall_green=True

        for idx,spec in enumerate(FRAME_SPECS):
            next_spec=FRAME_SPECS[idx+1] if idx+1<len(FRAME_SPECS) else None
            raw,boundary_info=load_frame_by_boundaries(reader,spec,next_spec)
            cleaned=clean(raw)
            lines=cleaned.splitlines()

            print()
            print(f'[{spec["name"]}]')
            print(f'  boundary={boundary_info}')

            frame_hits={}
            for target in targets:
                exact=[]
                anywhere=[]
                target_re=re.compile(re.escape(target),re.I)

                for line_no,line in enumerate(lines,1):
                    normalized=norm(line)
                    if normalized.upper()==target:
                        exact.append(line_no)
                    elif target_re.search(normalized):
                        anywhere.append((line_no,normalized))

                frame_hits[target]=(exact,anywhere)
                print(
                    f'  {target}: exact_lines={exact or []} '
                    f'anywhere_count={len(anywhere)}'
                )

                for line_no,normalized in anywhere[:5]:
                    snippet=normalized
                    if len(snippet)>220:
                        snippet=snippet[:217]+"..."
                    print(f'    mention line {line_no}: {snippet}')

            # Show source-line neighborhoods around the three large-block boundaries.
            print("  boundary_contexts:")
            for target in ("DISTINCTIONS","CAMPAIGN MECHANICS","SESSION ZERO QUESTIONS"):
                exact,_=frame_hits[target]
                if not exact:
                    print(f'    {target}: NO EXACT HEADING LINE')
                    overall_green=False
                    continue

                line_no=exact[0]
                lo=max(1,line_no-2)
                hi=min(len(lines),line_no+2)
                print(f'    {target} @ line {line_no}:')
                for n in range(lo,hi+1):
                    snippet=norm(lines[n-1])
                    if len(snippet)>180:
                        snippet=snippet[:177]+"..."
                    prefix=">" if n==line_no else " "
                    print(f'      {prefix} {n:04d}: {snippet}')

            # The two questioned headings are allowed to be absent, but if they
            # exist only as exact standalone headings and split_sections missed
            # them, the diagnostic must fail.
            for target in ("PLAYER PRINCIPLES","INCITING INCIDENT"):
                exact,_=frame_hits[target]
                section_names=[s["raw_heading"] for s in split_sections(raw)]
                if exact and target not in section_names:
                    overall_green=False

        print()
        print(f'HEADING_DIAGNOSTIC={"GREEN" if overall_green else "RED"}')
        return

    if "--diagnose-sections" in sys.argv[2:]:
        import hashlib

        print("Campaign-frame section diagnostic (read-only):")
        seen_hashes=set()
        diagnostic_green=True

        for idx,spec in enumerate(FRAME_SPECS):
            next_spec=FRAME_SPECS[idx+1] if idx+1<len(FRAME_SPECS) else None
            raw,boundary_info=load_frame_by_boundaries(reader,spec,next_spec)
            sections=split_sections(raw)
            digest=hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
            duplicate_hash=digest in seen_hashes
            seen_hashes.add(digest)

            names=[section["raw_heading"] for section in sections]
            lengths=[len(section["rules_text"]) for section in sections]
            giant=[(section["raw_heading"],len(section["rules_text"]))
                   for section in sections if len(section["rules_text"])>50000]

            frame_green=(
                not duplicate_hash
                and len(sections)>=10
                and not giant
                and len(names)==len(set(names))
            )
            diagnostic_green = diagnostic_green and frame_green

            print()
            print(f'[{spec["name"]}]')
            print(f'  boundary={boundary_info}')
            print(f'  raw_chars={len(raw)} sha256={digest} duplicate_hash={duplicate_hash}')
            print(f'  sections={len(sections)} frame_green={frame_green}')
            for number,section in enumerate(sections,1):
                print(
                    f'  {number:02d}. {section["raw_heading"]}: '
                    f'{len(section["rules_text"])} chars'
                )
            if giant:
                print(f'  GIANT_SECTIONS={giant}')

        print()
        print(f'DIAGNOSTIC={"GREEN" if diagnostic_green else "RED"}')
        return

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
