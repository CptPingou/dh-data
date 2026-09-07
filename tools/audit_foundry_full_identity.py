#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

TARGETS = {"domain_card", "adversary"}
CORPUS = Path("data/srd-2.0")


def collect(value, source_path, out):
    if isinstance(value, dict):
        kind = value.get("kind")
        ident = value.get("id")
        if kind in TARGETS and ident:
            out.append({
                "kind": kind,
                "id": str(ident),
                "name": str(value.get("name") or value.get("label") or ""),
                "source_path": source_path,
                "data": value,
            })
            return
        for v in value.values():
            collect(v, source_path, out)
    elif isinstance(value, list):
        for v in value:
            collect(v, source_path, out)


def simplified(e):
    d = e["data"]
    return {
        "kind": e["kind"],
        "id": e["id"],
        "name": e["name"],
        "source_path": e["source_path"],
        "tier": d.get("tier"),
        "domain": d.get("domain"),
        "level": d.get("level"),
        "role": d.get("role") or d.get("type"),
        "source": d.get("source"),
        "status": d.get("status"),
    }


def main():
    root = Path.cwd()
    corpus_root = root / CORPUS
    if not corpus_root.exists():
        raise SystemExit(f"ERROR missing corpus root: {corpus_root}")

    raw = []
    parse_errors = []
    scanned = 0
    for path in sorted(corpus_root.rglob("*.json")):
        rel = path.relative_to(root).as_posix()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            parse_errors.append({"path": rel, "error": str(exc)})
            continue
        scanned += 1
        collect(payload, rel, raw)

    occurrences = defaultdict(list)
    for e in raw:
        occurrences[(e["kind"], e["id"])].append(e)

    unique = [vals[0] for vals in occurrences.values()]
    unique.sort(key=lambda e: (e["kind"], e["id"]))

    by_file = defaultdict(Counter)
    for e in unique:
        by_file[e["source_path"]][e["kind"]] += 1

    duplicate_ids = []
    for (kind, ident), vals in sorted(occurrences.items()):
        if len(vals) > 1:
            duplicate_ids.append({
                "kind": kind,
                "id": ident,
                "occurrences": [simplified(v) for v in vals],
            })

    names = defaultdict(list)
    for e in unique:
        if e["name"]:
            names[(e["kind"], e["name"].casefold())].append(e)
    duplicate_names = []
    for (kind, _), vals in sorted(names.items()):
        ids = {v["id"] for v in vals}
        if len(ids) > 1:
            duplicate_names.append({
                "kind": kind,
                "name": vals[0]["name"],
                "entries": [simplified(v) for v in vals],
            })

    suspicious_tokens = ("raw", "index", "candidate", "audit", "manifest", "extract", "normalized", "fix")
    suspicious_files = []
    for path, counts in sorted(by_file.items()):
        low = path.casefold()
        if any(tok in low for tok in suspicious_tokens):
            suspicious_files.append({"path": path, "counts": dict(counts)})

    report = {
        "phase": "P2.3.3a-identity-audit",
        "corpus": "srd-2.0",
        "files_scanned": scanned,
        "parse_errors": parse_errors,
        "raw_occurrences": dict(Counter(e["kind"] for e in raw)),
        "unique_ids": dict(Counter(e["kind"] for e in unique)),
        "by_file": [
            {"path": path, "counts": dict(sorted(counts.items())), "total": sum(counts.values())}
            for path, counts in sorted(by_file.items())
        ],
        "duplicate_id_groups": duplicate_ids,
        "duplicate_name_groups": duplicate_names,
        "suspicious_files": suspicious_files,
        "entries": {
            kind: [simplified(e) for e in unique if e["kind"] == kind]
            for kind in sorted(TARGETS)
        },
    }

    out_dir = root / "docs" / "audits"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "P2.3.3a-identity-audit.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "phase": report["phase"],
        "output": str(out),
        "files_scanned": scanned,
        "raw_occurrences": report["raw_occurrences"],
        "unique_ids": report["unique_ids"],
        "by_file": report["by_file"],
        "duplicate_id_groups": len(duplicate_ids),
        "duplicate_name_groups": len(duplicate_names),
        "suspicious_files": suspicious_files,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
