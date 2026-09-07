#!/usr/bin/env python3
"""
P1.4 — Primitive Census

Builds an empirical census of reusable mechanical primitives from the
normalized Daggerheart corpus already present in the repository.

Usage from repository root:
  python tools/build_primitive_census.py

No PDF parsing is required in this phase: the script consumes normalized JSON
produced by P1.1–P1.3 and the Blood Hunter playtest layer.

Important:
- This is a census, not the final runtime ontology.
- Candidate primitives require concrete evidence.
- P1.5 will try to express all target corpora using this vocabulary and expose
  missing primitives / special cases.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(".")
DATA = ROOT / "data"
OUT = DATA / "primitive-census"
REG = DATA / "registry"

PRIMITIVES = {
    "resource": {
        "label": "Resource",
        "level": "mechanical",
        "description": "Named quantity that can be gained, spent, marked, cleared, or capped.",
        "keywords": ["hope", "fear", "stress", "hit point", "hp", "resource", "ingredient", "scrap"],
    },
    "counter_or_track": {
        "label": "Counter / Track / Countdown",
        "level": "mechanical",
        "description": "Ordered numeric or stepped progress state.",
        "keywords": ["track", "countdown", "clock", "progress"],
    },
    "state_or_condition": {
        "label": "State / Condition",
        "level": "mechanical",
        "description": "Named state that changes available rules or effects.",
        "keywords": ["state", "condition", "broken", "destroyed", "bloodied", "fractured", "cursed"],
    },
    "tag": {
        "label": "Tag",
        "level": "data",
        "description": "Semantic label used by rules for filtering, eligibility, or interaction.",
        "keywords": ["tag", "tags"],
    },
    "slot_capacity": {
        "label": "Slot / Capacity",
        "level": "mechanical",
        "description": "Finite capacity expressed as slots or equivalent bounded storage.",
        "keywords": ["slot", "slots", "capacity", "inventory"],
    },
    "spend_gain": {
        "label": "Spend / Gain / Mark / Clear",
        "level": "mechanical",
        "description": "Atomic mutation of a resource or track.",
        "keywords": ["spend", "gain", "mark", "clear"],
    },
    "die_or_dice_pool": {
        "label": "Die / Dice Pool",
        "level": "mechanical",
        "description": "Die-valued quantity or composable pool used by a procedure.",
        "keywords": ["d4", "d6", "d8", "d10", "d12", "d20", "dice", "die"],
    },
    "result_table": {
        "label": "Result Table",
        "level": "mechanical",
        "description": "Roll/input mapped to discrete outcomes.",
        "keywords": ["table", "result", "roll"],
    },
    "tier_progression": {
        "label": "Tier Progression",
        "level": "mechanical",
        "description": "Rules or values that scale by character/campaign tier.",
        "keywords": ["tier 1", "tier 2", "tier 3", "tier 4", "each tier"],
    },
    "linked_entity": {
        "label": "Linked Entity",
        "level": "data",
        "description": "Rule object that references another entity rather than duplicating it.",
        "keywords": ["weapon", "armor", "adversary", "environment", "companion", "vehicle", "ship", "mount"],
    },
    "recipe_or_craft": {
        "label": "Recipe / Craft",
        "level": "mechanical",
        "description": "Inputs transformed into an item, upgrade, or effect.",
        "keywords": ["craft", "recipe", "ingredient", "scrap"],
    },
    "upgrade_slot": {
        "label": "Upgrade Slot",
        "level": "mechanical",
        "description": "Bounded socket/slot that grants selected improvements.",
        "keywords": ["upgrade slot", "upgrade", "socket"],
    },
    "segmented_entity": {
        "label": "Segmented Entity",
        "level": "mechanical",
        "description": "Entity composed of independently addressable parts/segments.",
        "keywords": ["segment", "part", "body part"],
    },
    "graph_or_hex_travel": {
        "label": "Graph / Hex Travel",
        "level": "mechanical",
        "description": "Movement procedure over nodes, routes, hexes, or locations.",
        "keywords": ["hex", "travel", "journey", "route", "location", "map"],
    },
    "rest_rule": {
        "label": "Rest Rule",
        "level": "mechanical",
        "description": "Constraint or modifier on short/long rests and recovery.",
        "keywords": ["short rest", "long rest", "rest"],
    },
    "phase_or_procedure": {
        "label": "Phase / Procedure",
        "level": "mechanical",
        "description": "Ordered multi-step gameplay procedure or named phase.",
        "keywords": ["phase", "arrival", "investigation", "escalation", "confrontation", "epilogue"],
    },
    "form_or_state_transition": {
        "label": "Form / State Transition",
        "level": "mechanical",
        "description": "Rule-driven transition between forms, modes, or states.",
        "keywords": ["transform", "transformation", "evolution", "form"],
    },
    "relation_or_faction": {
        "label": "Relation / Faction",
        "level": "mechanical",
        "description": "Persistent relationship value between entities/groups.",
        "keywords": ["faction", "relationship", "reputation"],
    },
    "threshold": {
        "label": "Threshold",
        "level": "mechanical",
        "description": "Numeric boundary that changes result/state once crossed.",
        "keywords": ["threshold", "major", "severe"],
    },
    "triggered_rule": {
        "label": "Triggered Rule",
        "level": "mechanical",
        "description": "Rule that activates on an event or condition.",
        "keywords": ["when you", "whenever", "if you", "after you", "before you"],
    },
    "campaign_rule_modifier": {
        "label": "Campaign Rule Modifier",
        "level": "mechanical",
        "description": "Campaign-level override or modifier to otherwise global rules.",
        "keywords": ["campaign", "replace", "instead", "critical", "death move"],
    },
    "play_aid": {
        "label": "Play Aid",
        "level": "runtime_ui",
        "description": "Sheet/reference aid used by a mechanic or campaign procedure.",
        "keywords": ["sheet", "tracker"],
    },
    "map_or_handout": {
        "label": "Map / Handout",
        "level": "runtime_ui",
        "description": "Referenced visual asset attached to a campaign procedure.",
        "keywords": ["map", "handout"],
    },
}

# High-value known normalized sources. Each is evidence, not hardcoded final semantics.
SOURCE_GLOBS = [
    ("srd2_supplemental", "data/srd-2.0/supplemental-campaign-mechanics/*.json"),
    ("srd2_campaign_frame", "data/srd-2.0/campaign-frames/*.json"),
    ("srd2_adversaries", "data/srd-2.0/adversaries/adversaries.json"),
    ("srd2_environments", "data/srd-2.0/environments/environments.json"),
    ("srd2_equipment", "data/srd-2.0/equipment/*.json"),
    ("srd2_transformations", "data/srd-2.0/indexes/transformations.json"),
    ("hope_fear_frames", "data/hope-fear-private/campaign-frames/*.json"),
    ("hope_fear_assets", "data/hope-fear-private/appendix-assets.json"),
    ("blood_hunter", "data/playtest/blood-hunter-v1.5/**/*.json"),
]

def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))

def flatten_text(obj: Any) -> str:
    bits: list[str] = []
    def walk(v: Any):
        if isinstance(v, dict):
            for k, x in v.items():
                bits.append(str(k))
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, (str, int, float, bool)):
            bits.append(str(v))
    walk(obj)
    return "\n".join(bits)

def source_identity(path: Path, obj: Any) -> str:
    if isinstance(obj, dict):
        for key in ("id", "name", "title"):
            if obj.get(key):
                return str(obj[key])
    return path.stem

def detect_primitives(text: str) -> list[str]:
    low = text.lower()
    found = []
    for pid, spec in PRIMITIVES.items():
        if any(k.lower() in low for k in spec["keywords"]):
            found.append(pid)
    return found

def direct_hf_evidence() -> list[dict[str, Any]]:
    """Use P1.3b's explicit primitive_evidence when available."""
    rows = []
    mapping = {
        "track_or_countdown": "counter_or_track",
        "resource_or_slot": "resource",
        "relationship_or_faction": "relation_or_faction",
        "result_table": "result_table",
        "craft_or_upgrade": "recipe_or_craft",
        "state_or_phase": "state_or_condition",
        "travel_or_map": "graph_or_hex_travel",
        "linked_actor_or_vehicle": "linked_entity",
        "downtime_procedure": "phase_or_procedure",
        "core_resource_hook": "resource",
        "unclassified_mechanic": None,
    }
    for path in sorted(Path("data/hope-fear-private/campaign-frames").glob("*.json")):
        obj = load_json(path)
        for ev in obj.get("primitive_evidence", []):
            for raw in ev.get("candidate_primitives", []):
                pid = mapping.get(raw, raw if raw in PRIMITIVES else None)
                if pid:
                    rows.append({
                        "primitive_id": pid,
                        "corpus": "hope_fear_frames",
                        "source_path": str(path),
                        "source_entity": ev.get("frame") or source_identity(path, obj),
                        "evidence_kind": "explicit_P1.3b_candidate",
                        "evidence_ref": ev.get("mechanic_block_name"),
                    })
    return rows

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REG.mkdir(parents=True, exist_ok=True)

    evidence: list[dict[str, Any]] = []
    scanned_files = []
    missing_globs = []

    # Explicit H&F candidate evidence first.
    evidence.extend(direct_hf_evidence())

    for corpus, pattern in SOURCE_GLOBS:
        files = sorted(ROOT.glob(pattern))
        if not files:
            missing_globs.append({"corpus": corpus, "pattern": pattern})
            continue
        for path in files:
            try:
                obj = load_json(path)
            except Exception:
                continue
            text = flatten_text(obj)
            pids = detect_primitives(text)
            scanned_files.append({
                "corpus": corpus,
                "path": str(path),
                "primitive_hits": pids,
            })
            ident = source_identity(path, obj)
            for pid in pids:
                evidence.append({
                    "primitive_id": pid,
                    "corpus": corpus,
                    "source_path": str(path),
                    "source_entity": ident,
                    "evidence_kind": "keyword_structural_hit",
                    "evidence_ref": None,
                })

    # De-duplicate exact evidence rows.
    unique = []
    seen = set()
    for row in evidence:
        key = (
            row["primitive_id"], row["corpus"], row["source_path"],
            row["source_entity"], row["evidence_kind"], row["evidence_ref"]
        )
        if key not in seen:
            seen.add(key)
            unique.append(row)
    evidence = unique

    by_primitive: dict[str, list[dict[str, Any]]] = {pid: [] for pid in PRIMITIVES}
    for row in evidence:
        by_primitive.setdefault(row["primitive_id"], []).append(row)

    census = []
    for pid, spec in PRIMITIVES.items():
        rows = by_primitive.get(pid, [])
        corpora = sorted({r["corpus"] for r in rows})
        census.append({
            "id": f"primitive.{pid}",
            "primitive_id": pid,
            **spec,
            "status": "candidate",
            "evidence_count": len(rows),
            "corpora": corpora,
            "cross_corpus": len(corpora) >= 2,
            "evidence": rows,
        })

    # A primitive must have at least one observation to remain in the census.
    observed = [p for p in census if p["evidence_count"] > 0]
    unobserved = [p["primitive_id"] for p in census if p["evidence_count"] == 0]

    corpus_names = sorted({r["corpus"] for r in evidence})
    cross = [p["primitive_id"] for p in observed if p["cross_corpus"]]

    # Monster Hunter is intentionally not fabricated here. It becomes a P1.5
    # coverage input unless a normalized evidence file is added later.
    mh_paths = list(Path("data").glob("**/*monster*hunter*.json")) + list(Path("data").glob("**/*chasse*.json"))
    monster_hunter_evidence_present = bool(mh_paths)

    checks = {
        "normalized_sources_scanned": len(scanned_files) > 0,
        "hope_fear_explicit_evidence_consumed": any(
            r["evidence_kind"] == "explicit_P1.3b_candidate" for r in evidence
        ),
        "primitive_candidates_observed": len(observed) >= 10,
        "cross_corpus_candidates_present": len(cross) >= 5,
        "no_duplicate_primitive_ids": len({p["primitive_id"] for p in census}) == len(census),
        "census_written_from_evidence": all(p["evidence_count"] > 0 for p in observed),
    }

    census_doc = {
        "phase": "P1.4",
        "status": "candidate_census",
        "principle": "Observed mechanics first; runtime ontology later.",
        "primitive_count_defined": len(PRIMITIVES),
        "primitive_count_observed": len(observed),
        "primitive_count_cross_corpus": len(cross),
        "corpora_observed": corpus_names,
        "primitives": observed,
        "unobserved_candidate_ids": unobserved,
        "coverage_notes": {
            "homebrew_kit": (
                "The Homebrew Kit remains design-guidance evidence and is not automatically "
                "treated as playable mechanics in this census."
            ),
            "monster_hunter": (
                "No Monster Hunter/Chasse primitive evidence is fabricated from memory. "
                "If no normalized local file exists, P1.5 will add it as an explicit coverage corpus."
            ),
            "monster_hunter_local_evidence_present": monster_hunter_evidence_present,
            "monster_hunter_paths": [str(p) for p in mh_paths],
        },
    }

    (OUT/"primitive-census.json").write_text(
        json.dumps(census_doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT/"primitive-evidence.json").write_text(
        json.dumps({"evidence": evidence}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    report = {
        "phase": "P1.4",
        "primitive_count_defined": len(PRIMITIVES),
        "primitive_count_observed": len(observed),
        "primitive_count_cross_corpus": len(cross),
        "cross_corpus_primitives": cross,
        "corpora_observed": corpus_names,
        "scanned_file_count": len(scanned_files),
        "missing_source_globs": missing_globs,
        "unobserved_candidate_ids": unobserved,
        "monster_hunter_local_evidence_present": monster_hunter_evidence_present,
        "checks": checks,
        "validation": "GREEN" if all(checks.values()) else "RED",
        "next_phase": "P1.5 — Primitive Coverage Test",
    }

    (REG/"P1.4-status.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
