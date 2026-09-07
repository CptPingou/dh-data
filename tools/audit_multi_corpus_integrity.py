#!/usr/bin/env python3
"""
P1.6-fix1 — Multi-corpus integrity audit.

Fix1 distinguishes:
- canonical entity IDs (top-level entities in canonical collections),
- local/nested IDs,
- generated/intermediate/index/status/debug artifacts.

Usage:
  python tools/audit_multi_corpus_integrity.py
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any

ROOT = Path(".")
DATA = ROOT / "data"
REG = DATA / "registry"

REQUIRED = [
    DATA / "srd-2.0/registry/P1.2-status.json",
    DATA / "hope-fear-private/registry/P1.3b-status.json",
    DATA / "registry/P1.3c-status.json",
    DATA / "registry/P1.4-status.json",
    DATA / "registry/P1.5-status.json",
    DATA / "primitive-census/primitive-census.json",
    DATA / "primitive-census/primitive-coverage.json",
    DATA / "homebrew/monster-hunter/primitive-coverage-input.json",
]

NONCANONICAL_DIRS = {
    "registry", "indexes", "primitive-census", "debug", "tmp", "temp",
}
NONCANONICAL_NAME_TOKENS = (
    "candidate", "candidates", "raw", "debug", "status", "index",
    "manifest", "audit", "coverage", "evidence",
)

def load(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))

def walk_json_files(root: Path):
    return sorted(p for p in root.rglob("*.json") if p.is_file())

def is_noncanonical_artifact(path: Path) -> bool:
    parts = {x.lower() for x in path.parts}
    if parts & NONCANONICAL_DIRS:
        return True
    stem = path.stem.lower()
    return any(tok in stem for tok in NONCANONICAL_NAME_TOKENS)

def top_level_entity_rows(obj: Any):
    """
    Return only IDs that can plausibly represent canonical entities.

    Accepted shapes:
      {"id": "...", ...}
      [{ "id": "..."}, ...]
      {"entities": [{ "id": "..."}, ...]} and equivalent collection arrays.

    Nested section/feature/mechanic IDs are intentionally not promoted to
    global canonical IDs.
    """
    rows = []
    if isinstance(obj, dict):
        if isinstance(obj.get("id"), str):
            rows.append((obj["id"], "$"))
            return rows

        # Canonical extractor files are often dicts whose values contain lists.
        # Only direct list members are considered entity rows.
        for key, value in obj.items():
            if isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict) and isinstance(item.get("id"), str):
                        rows.append((item["id"], f"$.{key}[{i}]"))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                rows.append((item["id"], f"$[{i}]"))
    return rows

def provenance_status(path: Path, obj: Any):
    issues = []
    if is_noncanonical_artifact(path):
        return issues
    if isinstance(obj, dict) and "id" in obj:
        source = obj.get("source")
        if not isinstance(source, dict):
            issues.append("missing source object")
        else:
            if not source.get("corpus"):
                issues.append("missing source.corpus")
            if not source.get("status"):
                issues.append("missing source.status")
    return issues

def main():
    errors = []
    warnings = []

    missing = [str(p) for p in REQUIRED if not p.exists()]
    errors.extend(f"missing required artifact: {p}" for p in missing)

    phase_gates = {}
    phase_files = {
        "P1.2": DATA / "srd-2.0/registry/P1.2-status.json",
        "P1.3b": DATA / "hope-fear-private/registry/P1.3b-status.json",
        "P1.3c": DATA / "registry/P1.3c-status.json",
        "P1.4": DATA / "registry/P1.4-status.json",
        "P1.5": DATA / "registry/P1.5-status.json",
    }
    for phase, p in phase_files.items():
        if p.exists():
            val = load(p).get("validation")
            phase_gates[phase] = val
            if val != "GREEN":
                errors.append(f"{phase} is not GREEN: {val}")

    boundary_checks = {
        "srd_public_layer_exists": (DATA / "srd-2.0").exists(),
        "hope_fear_private_layer_exists": (DATA / "hope-fear-private").exists(),
        "playtest_layer_exists": (DATA / "playtest").exists(),
        "homebrew_layer_exists": (DATA / "homebrew").exists(),
    }

    roots = [
        DATA / "srd-2.0",
        DATA / "hope-fear-private",
        DATA / "playtest",
        DATA / "homebrew",
        DATA / "primitive-census",
    ]

    canonical_rows = []
    ignored_id_artifacts = []
    provenance_issues = []
    parse_errors = []
    json_count = 0

    for r in roots:
        if not r.exists():
            continue
        for p in walk_json_files(r):
            json_count += 1
            try:
                obj = load(p)
            except Exception as exc:
                parse_errors.append(f"{p}: {type(exc).__name__}: {exc}")
                continue

            if is_noncanonical_artifact(p):
                ignored_id_artifacts.append(str(p))
            else:
                for ident, jpath in top_level_entity_rows(obj):
                    canonical_rows.append({
                        "id": ident,
                        "file": str(p),
                        "json_path": jpath,
                    })

            for issue in provenance_status(p, obj):
                provenance_issues.append({"file": str(p), "issue": issue})

    id_map = {}
    for row in canonical_rows:
        id_map.setdefault(row["id"], []).append(row)

    # A collision is hard only when the same canonical ID is defined in more
    # than one canonical file. Repetition within one collection file is still
    # reported because it is an actual duplicate row.
    hard_collisions = {}
    for ident, rows in id_map.items():
        files = {r["file"] for r in rows}
        if len(rows) > 1:
            hard_collisions[ident] = rows

    census_path = DATA / "primitive-census/primitive-census.json"
    coverage_path = DATA / "primitive-census/primitive-coverage.json"
    census = load(census_path) if census_path.exists() else {}
    coverage = load(coverage_path) if coverage_path.exists() else {}

    primitive_ids = {
        p["primitive_id"] for p in census.get("primitives", [])
        if p.get("primitive_id")
    }
    evidence_bad = [
        p.get("primitive_id")
        for p in census.get("primitives", [])
        if p.get("evidence_count", 0) != len(p.get("evidence", []))
    ]

    coverage_missing = coverage.get("monster_hunter", {}).get("missing_primitives", [])
    mh_gap = coverage.get("monster_hunter", {}).get("requirements_gap")

    mh_fixture_path = DATA / "homebrew/monster-hunter/primitive-coverage-input.json"
    mh_fixture = load(mh_fixture_path) if mh_fixture_path.exists() else {}
    mh_needs = {
        primitive
        for req in mh_fixture.get("requirements", [])
        for primitive in req.get("needs", [])
    }
    single_target_review = []
    for row in coverage.get("single_corpus_review_targets", []):
        pid = row.get("primitive_id")
        single_target_review.append({
            **row,
            "used_by_monster_hunter_fixture": pid in mh_needs,
            "review": "SUPPORTED_EXTERNALLY" if pid in mh_needs else "REVIEW_IN_P2",
        })

    corpus_boundary_violations = []
    srd_root = DATA / "srd-2.0"
    if srd_root.exists():
        for p in walk_json_files(srd_root):
            try:
                obj = load(p)
            except Exception:
                continue
            if isinstance(obj, dict):
                src = obj.get("source")
                if isinstance(src, dict) and src.get("corpus") in {
                    "hope-fear", "blood-hunter", "monster-hunter"
                }:
                    corpus_boundary_violations.append({
                        "file": str(p),
                        "source_corpus": src.get("corpus"),
                    })

    checks = {
        "all_required_artifacts_present": not missing,
        "previous_phase_gates_green":
            len(phase_gates) == 5 and all(v == "GREEN" for v in phase_gates.values()),
        "corpus_boundaries_present": all(boundary_checks.values()),
        "all_json_parseable": not parse_errors,
        "no_hard_canonical_id_collisions": not hard_collisions,
        "no_public_private_boundary_violations": not corpus_boundary_violations,
        "primitive_evidence_counts_consistent": not evidence_bad,
        "monster_hunter_coverage_has_no_gap": mh_gap == 0 and not coverage_missing,
        "observed_primitives_nonempty": bool(primitive_ids),
    }

    if hard_collisions:
        errors.append(f"{len(hard_collisions)} canonical ID collision(s)")
    if corpus_boundary_violations:
        errors.append(
            f"{len(corpus_boundary_violations)} public/private corpus boundary violation(s)"
        )
    if parse_errors:
        errors.append(f"{len(parse_errors)} JSON parse error(s)")
    if evidence_bad:
        errors.append(f"primitive evidence count mismatch: {evidence_bad}")

    if provenance_issues:
        warnings.append(
            f"{len(provenance_issues)} canonical top-level entity file(s) lack full "
            "source provenance; defer migration to P2 adapter-contract cleanup."
        )

    result = {
        "phase": "P1.6-fix1",
        "audit_semantics": {
            "canonical_id": "top-level entity ID from a canonical collection/file",
            "local_nested_id": "not globally collision-checked",
            "intermediate_artifact": "excluded from canonical collision census",
        },
        "json_file_count_audited": json_count,
        "phase_gates": phase_gates,
        "boundary_checks": boundary_checks,
        "id_census": {
            "canonical_id_occurrences": len(canonical_rows),
            "unique_canonical_ids": len(id_map),
            "ignored_intermediate_artifact_files": len(set(ignored_id_artifacts)),
            "hard_canonical_collisions": hard_collisions,
        },
        "provenance": {
            "issue_count": len(provenance_issues),
            "issues": provenance_issues[:100],
        },
        "primitive_integrity": {
            "observed_primitive_count": len(primitive_ids),
            "evidence_count_mismatches": evidence_bad,
            "monster_hunter_missing_primitives": coverage_missing,
            "monster_hunter_requirements_gap": mh_gap,
            "single_corpus_review_targets": single_target_review,
        },
        "corpus_boundary_violations": corpus_boundary_violations,
        "parse_errors": parse_errors,
        "checks": checks,
        "warnings": warnings,
        "errors": errors,
        "validation": "GREEN" if all(checks.values()) else "RED",
        "decision": {
            "GREEN": "P1 is closed. Proceed to P2 — Foundryborne Primitive Module + adapters.",
            "RED": "Inspect only the remaining canonical collisions/integrity failures before P2.",
        },
        "next_phase": "P2 — Foundryborne Primitive Module + adapters",
    }

    REG.mkdir(parents=True, exist_ok=True)
    (REG / "P1.6-status.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
