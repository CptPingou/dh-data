#!/usr/bin/env python3
"""
P1.3a — Hope & Fear → SRD 2.0 differential audit.

Goal:
- inventory the H&F corpus by product section;
- classify each section as SRD-covered, private/editorial candidate, or
  requiring a deeper entity/text diff;
- establish the input surface for P1.3b private extraction and P1.4
  primitive census.

This first pass is intentionally corpus-level. It does NOT copy proprietary
rules text into the public SRD tree.

Usage:
  python tools/audit_hope_fear_delta.py "PATH/TO/Daggerheart_HF.pdf"

Requires: pypdf
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from pypdf import PdfReader

OUT=Path("data/hope-fear-private")
REG=OUT/"registry"

SECTIONS=[
 ("character.classes",7,17,"mechanical_entities","SRD_COVERED"),
 ("character.ancestries",18,25,"mechanical_entities","SRD_COVERED"),
 ("character.communities",26,33,"mechanical_entities","SRD_COVERED"),
 ("character.transformations",34,42,"mechanical_entities","SRD_COVERED"),
 ("equipment.primary_weapons",43,49,"mechanical_entities","SRD_COVERED"),
 ("equipment.secondary_weapons",50,51,"mechanical_entities","SRD_COVERED"),
 ("equipment.armor",52,53,"mechanical_entities","SRD_COVERED"),
 ("equipment.items",54,56,"mechanical_entities","SRD_COVERED"),
 ("equipment.consumables",57,60,"mechanical_entities","SRD_COVERED"),
 ("adversaries",61,97,"mechanical_entities","SRD_COVERED"),
 ("environments",98,114,"mechanical_entities","SRD_COVERED"),
 ("campaign.castle_high",116,127,"campaign_frame","DEEP_DIFF"),
 ("campaign.reign_of_the_weredragon",128,143,"campaign_frame","DEEP_DIFF"),
 ("campaign.dark_heart_of_andaluria",144,157,"campaign_frame","DEEP_DIFF"),
 ("campaign.journey_to_horizon",158,179,"campaign_frame","DEEP_DIFF"),
 ("appendix.domain_cards",180,181,"mechanical_entities","SRD_COVERED"),
 ("appendix.additional_sheets",182,186,"play_aid","PRIVATE_CANDIDATE"),
 ("appendix.campaign_frame_maps",187,191,"map_handout","PRIVATE_CANDIDATE"),
]

EXPECTED_HF={
 "classes":4,
 "ancestries":6,
 "communities":6,
 "campaign_frames":4,
}

def norm(s):
    s=s.replace("\u00ad","").replace("\ufeff","")
    return re.sub(r"\s+"," ",s).strip()

def text_pages(reader,start,end):
    # Printed H&F page numbers are expected to map to PDF index p-1 in this
    # digital source. We retain page bounds for manual verification.
    parts=[]
    for printed in range(start,end+1):
        idx=printed-1
        if 0 <= idx < len(reader.pages):
            parts.append(reader.pages[idx].extract_text() or "")
    return "\n".join(parts)

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    if len(sys.argv)<2:
        raise SystemExit("Usage: python tools/audit_hope_fear_delta.py Daggerheart_HF.pdf")
    pdf=Path(sys.argv[1])
    reader=PdfReader(str(pdf))

    inventory=[]
    for sid,start,end,kind,classification in SECTIONS:
        raw=text_pages(reader,start,end)
        inventory.append({
            "id":f"hope-fear.{sid}",
            "section":sid,
            "printed_pages":{"start":start,"end":end},
            "kind":kind,
            "classification":classification,
            "text_present":bool(norm(raw)),
            "text_length":len(norm(raw)),
            "next_action":{
                "SRD_COVERED":"identity/mechanics diff only; do not duplicate by default",
                "DEEP_DIFF":"compare SRD mechanics against full private campaign-frame content",
                "PRIVATE_CANDIDATE":"index privately; determine whether it is data, UI primitive, or reference asset",
            }[classification],
        })

    campaign=[x for x in inventory if x["kind"]=="campaign_frame"]
    private=[x for x in inventory if x["classification"]=="PRIVATE_CANDIDATE"]
    deep=[x for x in inventory if x["classification"]=="DEEP_DIFF"]

    # Primitive hypotheses are explicitly hypotheses, not schema commitments.
    # P1.4 will accept/reject them from observed mechanics.
    primitive_hypotheses=[
      {"primitive":"campaign_frame","evidence":["four H&F campaign frames"],"status":"candidate"},
      {"primitive":"campaign_mechanic","evidence":["specialized mechanics inside campaign frames"],"status":"candidate"},
      {"primitive":"play_aid","evidence":["Additional Sheets"],"status":"candidate"},
      {"primitive":"map_or_handout","evidence":["Campaign Frame Maps"],"status":"candidate"},
      {"primitive":"transformation","evidence":["H&F transformations"],"status":"already_observed"},
      {"primitive":"evolution_or_state_transition","evidence":["H&F adversary Evolution features"],"status":"candidate"},
    ]

    checks={
      "pdf_readable":len(reader.pages)>0,
      "all_sections_have_text":all(x["text_present"] for x in inventory),
      "four_campaign_frames_indexed":len(campaign)==4,
      "private_candidates_present":len(private)>=2,
      "deep_diff_targets_present":len(deep)==4,
    }

    report={
      "phase":"P1.3a",
      "source":{
        "corpus":"hope-fear",
        "product":"Daggerheart: Hope & Fear",
        "status":"published_private",
        "source_file":pdf.name,
        "pdf_pages":len(reader.pages),
      },
      "policy":{
        "canonical_public_baseline":"SRD 2.0",
        "default":"do not duplicate SRD-covered H&F entities",
        "private_delta_states":[
          "IDENTICAL",
          "SRD_ERRATA_NEWER",
          "PRIVATE_EXTRA_TEXT",
          "PRIVATE_MECHANIC",
          "PRIVATE_REFERENCE_ASSET",
          "CONFLICT"
        ],
      },
      "inventory":inventory,
      "primitive_hypotheses":primitive_hypotheses,
      "checks":checks,
      "validation":"GREEN" if all(checks.values()) else "RED",
      "next_phase":"P1.3b — deep diff of the four H&F campaign frames and private appendix assets",
    }
    save(REG/"P1.3a-status.json",report)
    save(OUT/"hope-fear-corpus-index.json",{
      "source":report["source"],
      "sections":inventory,
      "primitive_hypotheses":primitive_hypotheses,
    })
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
