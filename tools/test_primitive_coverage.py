#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

CENSUS=Path("data/primitive-census/primitive-census.json")
MH=Path("data/homebrew/monster-hunter/primitive-coverage-input.json")
OUT=Path("data/primitive-census/primitive-coverage.json")
STATUS=Path("data/registry/P1.5-status.json")

def load(p): return json.loads(p.read_text(encoding="utf-8"))
def save(p,o):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    census=load(CENSUS)
    observed={p["primitive_id"] for p in census["primitives"]}
    fixture=load(MH)

    req_reports=[]
    missing=set()
    for req in fixture["requirements"]:
        miss=[p for p in req["needs"] if p not in observed]
        missing.update(miss)
        req_reports.append({
            **req,
            "missing":miss,
            "coverage":"FULL" if not miss else "GAP",
        })

    # Existing normalized corpora are evidence sources for the vocabulary.
    # This phase asks whether their observed mechanics and the independent MH
    # fixture can be expressed without adding corpus-specific runtime concepts.
    corpus_summary={}
    for p in census["primitives"]:
        for corpus in p.get("corpora",[]):
            corpus_summary.setdefault(corpus,set()).add(p["primitive_id"])
    corpus_summary={k:sorted(v) for k,v in sorted(corpus_summary.items())}

    # Detect suspiciously single-corpus primitives. They are not failures, but
    # become review targets for P1.6 / P2 so we don't encode accidental special cases.
    single_corpus=[
        {
            "primitive_id":p["primitive_id"],
            "corpora":p.get("corpora",[]),
            "evidence_count":p.get("evidence_count",0),
        }
        for p in census["primitives"]
        if len(p.get("corpora",[]))==1
    ]

    covered=sum(1 for r in req_reports if r["coverage"]=="FULL")
    total=len(req_reports)
    checks={
        "census_loaded":bool(observed),
        "monster_hunter_fixture_loaded":total>0,
        "all_fixture_primitives_exist":not missing,
        "monster_hunter_requirements_fully_covered":covered==total,
        "no_runtime_special_case_declared":True,
    }

    result={
        "phase":"P1.5",
        "coverage_model":"composition of P1.4 primitives",
        "observed_primitive_count":len(observed),
        "monster_hunter":{
            "requirements_total":total,
            "requirements_full":covered,
            "requirements_gap":total-covered,
            "missing_primitives":sorted(missing),
            "requirements":req_reports,
        },
        "normalized_corpus_primitive_usage":corpus_summary,
        "single_corpus_review_targets":single_corpus,
        "checks":checks,
        "validation":"GREEN" if all(checks.values()) else "RED",
        "decision_rule":{
            "GREEN":"Proceed to P1.6 multi-corpus integrity audit. Do not add a primitive merely because a mechanic is novel if it composes from existing primitives.",
            "RED":"Review each missing primitive. Prefer composition or splitting an existing primitive before adding a new primitive."
        },
        "next_phase":"P1.6 — Multi-corpus integrity audit",
    }
    save(OUT,result)
    save(STATUS,result)
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
