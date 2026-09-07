#!/usr/bin/env python3
import glob, json, sys
from collections import Counter, defaultdict
from pathlib import Path

MANIFEST = Path("config/foundry-import-manifest.json")


def records(value, forced_kind):
    """Yield top-level DH-DATA entities of the requested family.

    Canonical files may be arrays, wrappers, or one entity per file. Entity
    recognition therefore follows DH-DATA's stable `kind` + `id` contract,
    rather than requiring presentation fields such as name/title.
    """
    if isinstance(value, dict):
        ident = value.get("id")
        kind = value.get("kind")
        if ident and kind == forced_kind:
            yield value
            return
        for child in value.values():
            yield from records(child, forced_kind)
    elif isinstance(value, list):
        for child in value:
            yield from records(child, forced_kind)


def expand(root, pattern):
    return [Path(p) for p in sorted(glob.glob(str(root / pattern), recursive=True)) if Path(p).is_file()]


def main():
    root = Path.cwd()
    module = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if module is None:
        raise SystemExit('Usage: python tools\\export_foundry_full.py "<module daggerheart-campaign-toolkit>"')

    manifest_path = root / MANIFEST
    if not manifest_path.exists():
        raise SystemExit(f"ERROR missing canonical import manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = manifest["expected_counts"]

    entries, seen = [], set()
    by_file = []
    by_corpus = defaultdict(Counter)
    missing_patterns = []

    for source in manifest["sources"]:
        corpus, kind = source["corpus"], source["kind"]
        for pattern in source["paths"]:
            paths = expand(root, pattern)
            if not paths:
                missing_patterns.append(pattern)
                continue
            for path in paths:
                rel = path.relative_to(root).as_posix()
                payload = json.loads(path.read_text(encoding="utf-8"))
                found = list(records(payload, kind))
                accepted = 0
                for data in found:
                    ident = data.get("id")
                    key = (kind, ident)
                    if key in seen:
                        continue
                    seen.add(key)
                    entries.append({"kind":kind,"key":ident,"corpus":corpus,"source_path":rel,"data":data})
                    by_corpus[corpus][kind] += 1
                    accepted += 1
                by_file.append({"path":rel,"kind":kind,"records":len(found),"accepted_unique":accepted})

    entries.sort(key=lambda e: (e["kind"], e["key"]))
    counts = Counter(e["kind"] for e in entries)
    check = {k:{"expected":v,"actual":counts.get(k,0),"ok":counts.get(k,0)==v} for k,v in expected.items()}
    expected_total = sum(expected.values())
    green = not missing_patterns and len(entries)==expected_total and all(v["ok"] for v in check.values())

    active_blood_hunter = [e for e in entries if e.get("corpus") == "blood-hunter-2026-07-09"]
    active_blood_hunter_counts = Counter(e["kind"] for e in active_blood_hunter)
    active_blood_hunter_ok = (
        active_blood_hunter_counts.get("class", 0) == 1 and
        active_blood_hunter_counts.get("subclass", 0) == 3 and
        active_blood_hunter_counts.get("domain_card", 0) == 21 and
        not any(e.get("corpus") == "blood-hunter-v1.5" for e in entries)
    )

    report = {
        "phase":"BH-2026-07-09-active",
        "manifest":MANIFEST.as_posix(),
        "total":len(entries), "expected_total":expected_total,
        "counts":dict(sorted(counts.items())), "expected_counts":expected,
        "count_check":check,
        "by_corpus":{c:dict(sorted(v.items())) for c,v in sorted(by_corpus.items())},
        "by_file":by_file,
        "missing_patterns":missing_patterns,
        "active_blood_hunter": {
            "corpus": "blood-hunter-2026-07-09",
            "counts": dict(sorted(active_blood_hunter_counts.items())),
            "legacy_v1_5_active": any(e.get("corpus") == "blood-hunter-v1.5" for e in entries),
            "ok": active_blood_hunter_ok
        },
        "green": green and active_blood_hunter_ok
    }
    green = report["green"]
    if not green:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit("RED: canonical manifest export failed; full-import.json was NOT written")

    out = module / "data" / "full-import.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"phase":"BH-2026-07-09-active","manifest":manifest,"audit":report,"entries":entries}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output":str(out), **report}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
