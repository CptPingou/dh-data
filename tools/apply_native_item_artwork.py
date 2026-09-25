#!/usr/bin/env python3
"""
Apply Foundryborne native item artwork paths to toolkit-owned FR JSON sources.

Conservative deterministic matcher:
1. nativeId
2. canonical native name
3. sourceId slug aliases -> native name slug aliases
4. sourceId prefix -> native name aliases (for source IDs carrying rules text)
5. duplicate names only when all candidates share the exact same image
6. current translated/current name only as exact normalized fallback

Possessives expose BOTH aliases:
  "Adder's Fang"   -> "adders-fang" AND "adder-s-fang"
  "Alistair's Torch" -> "alistairs-torch" AND "alistair-s-torch"

No fuzzy matching.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

TARGETS = {
    "weapons": ROOT / "data" / "core" / "fr" / "dh-weapons.json",
    "armor": ROOT / "data" / "core" / "fr" / "dh-armor.json",
    "consumables": ROOT / "data" / "core" / "fr" / "dh-consumables.json",
    "loot": ROOT / "data" / "core" / "fr" / "dh-loot.json",
}

TOOLKIT_FLAG = "daggerheart-campaign-toolkit"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_flag(doc: dict[str, Any]) -> dict[str, Any]:
    return doc.get("flags", {}).get(TOOLKIT_FLAG, {})


def ascii_text(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", str(value))
    return "".join(ch for ch in value if not unicodedata.combining(ch)).casefold()


def slug_basic(value: str | None) -> str:
    """Historical behavior: apostrophe is removed: Adder's -> adders."""
    value = ascii_text(value)
    value = re.sub(r"[’'`]", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def slug_possessive(value: str | None) -> str:
    """Alternative source-id behavior: Adder's -> adder-s."""
    value = ascii_text(value)
    value = re.sub(r"[’'`]s\b", "-s", value)
    value = re.sub(r"[’'`]", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def slug_aliases(value: str | None) -> list[str]:
    result = []
    for fn in (slug_basic, slug_possessive):
        slug = fn(value)
        if slug and slug not in result:
            result.append(slug)
    return result


def strip_source_prefixes(slug: str) -> list[str]:
    variants = [slug]
    transforms = [
        lambda s: re.sub(r"^(?:core|hope-fear|hf|srd)-\d+-", "", s),
        lambda s: re.sub(r"^\d+-", "", s),
        lambda s: re.sub(r"^(?:primary|secondary|armor|weapon|consumable|loot)-", "", s),
    ]
    for transform in transforms:
        v = transform(slug).strip("-")
        if v and v not in variants:
            variants.append(v)
    return variants


def source_slug_candidates(doc: dict[str, Any]) -> list[str]:
    flag = get_flag(doc)
    result = []

    for source_id in (flag.get("canonicalSourceId"), flag.get("sourceId")):
        if not source_id:
            continue
        tail = str(source_id).split(".")[-1]
        # source IDs themselves normally contain no apostrophe, but treat both forms.
        for alias in slug_aliases(tail):
            for variant in strip_source_prefixes(alias):
                if variant and variant not in result:
                    result.append(variant)

    return result


def candidate_native_ids(doc: dict[str, Any]) -> list[str]:
    flag = get_flag(doc)
    result = []

    mechanics = flag.get("mechanicsReconstruction")
    if isinstance(mechanics, dict) and mechanics.get("nativeId"):
        result.append(str(mechanics["nativeId"]))

    artwork = flag.get("artworkSource")
    if isinstance(artwork, dict) and artwork.get("nativeId"):
        result.append(str(artwork["nativeId"]))

    return result


def canonical_names(doc: dict[str, Any]) -> list[str]:
    flag = get_flag(doc)
    result = []

    mechanics = flag.get("mechanicsReconstruction")
    if isinstance(mechanics, dict) and mechanics.get("nativeName"):
        result.append(str(mechanics["nativeName"]))

    for key in ("canonicalName", "sourceName", "englishName"):
        if flag.get(key):
            result.append(str(flag[key]))

    return result


def build_indexes(entries: list[dict[str, Any]]):
    by_id = {}
    by_name = {}
    by_slug = {}

    for entry in entries:
        if entry.get("id"):
            by_id[str(entry["id"])] = entry

        name = entry.get("name")
        if not name:
            continue

        by_name.setdefault(str(name).casefold(), []).append(entry)

        for alias in slug_aliases(str(name)):
            bucket = by_slug.setdefault(alias, [])
            # Avoid adding same document twice when aliases collapse.
            if not any(e.get("id") == entry.get("id") for e in bucket):
                bucket.append(entry)

    return by_id, by_name, by_slug


def common_image_hit(entries):
    if not entries:
        return None
    images = {e.get("img") for e in entries if e.get("img")}
    if len(images) != 1:
        return None
    return entries[0]


def single_or_same_image(index, key):
    hits = index.get(key, [])
    if len(hits) == 1:
        return hits[0], "unique"
    hit = common_image_hit(hits)
    if hit:
        return hit, "sameImageDuplicate"
    return None, None


def source_prefix_match(candidates, by_slug):
    matches = []

    for source_slug in candidates:
        for native_slug, entries in by_slug.items():
            if source_slug == native_slug or source_slug.startswith(native_slug + "-"):
                matches.append((len(native_slug), native_slug, entries))

    if not matches:
        return None, None

    max_len = max(length for length, _, _ in matches)
    best = [(slug, entries) for length, slug, entries in matches if length == max_len]

    entries_by_id = {}
    for _, entries in best:
        for entry in entries:
            entries_by_id[entry.get("id")] = entry

    candidate_entries = list(entries_by_id.values())

    if len(candidate_entries) == 1:
        return candidate_entries[0], "sourceIdPrefix"

    hit = common_image_hit(candidate_entries)
    if hit:
        return hit, "sourceIdPrefixSameImage"

    return None, None


def match_native(doc, by_id, by_name, by_slug):
    for native_id in candidate_native_ids(doc):
        if native_id in by_id:
            return by_id[native_id], "nativeId"

    for name in canonical_names(doc):
        hit, mode = single_or_same_image(by_name, name.casefold())
        if hit:
            return hit, "nativeName" if mode == "unique" else "nativeNameSameImage"

    candidates = source_slug_candidates(doc)

    for candidate in candidates:
        hit, mode = single_or_same_image(by_slug, candidate)
        if hit:
            return hit, "sourceIdSlug" if mode == "unique" else "sourceIdSlugSameImage"

    hit, method = source_prefix_match(candidates, by_slug)
    if hit:
        return hit, method

    current_name = doc.get("name")
    if current_name:
        for alias in slug_aliases(str(current_name)):
            hit, mode = single_or_same_image(by_slug, alias)
            if hit:
                return hit, "currentNameSlug" if mode == "unique" else "currentNameSlugSameImage"

    return None, None


def ensure_artwork_flag(doc, *, entry, pack_id, matched_by):
    flags = doc.setdefault("flags", {})
    toolkit = flags.setdefault(TOOLKIT_FLAG, {})
    toolkit["artworkSource"] = {
        "kind": "foundryborne-native",
        "pack": pack_id,
        "nativeId": entry.get("id"),
        "nativeName": entry.get("name"),
        "path": entry.get("img"),
        "matchedBy": matched_by,
    }


def apply_kind(kind, target, pack_data, dry_run):
    if not target.exists():
        return {"kind": kind, "target": str(target), "present": False}

    data = load_json(target)
    if not isinstance(data, list):
        raise SystemExit(f"{target}: expected top-level JSON array")

    entries = pack_data.get("entries", [])
    by_id, by_name, by_slug = build_indexes(entries)

    updated = unchanged = unmatched = 0
    matched_by = Counter()
    unmatched_samples = []

    for doc in data:
        if not isinstance(doc, dict):
            continue

        entry, method = match_native(doc, by_id, by_name, by_slug)

        if not entry or not entry.get("img"):
            unmatched += 1
            if len(unmatched_samples) < 30:
                unmatched_samples.append({
                    "name": doc.get("name"),
                    "sourceId": get_flag(doc).get("sourceId"),
                    "slugCandidates": source_slug_candidates(doc),
                })
            continue

        before = copy.deepcopy(doc)
        doc["img"] = entry["img"]
        ensure_artwork_flag(
            doc,
            entry=entry,
            pack_id=pack_data.get("packId"),
            matched_by=method,
        )

        matched_by[method] += 1
        if doc != before:
            updated += 1
        else:
            unchanged += 1

    if not dry_run and updated:
        write_json(target, data)

    return {
        "kind": kind,
        "target": str(target),
        "present": True,
        "updated": updated,
        "unchanged": unchanged,
        "unmatched": unmatched,
        "total": len(data),
        "matchedBy": dict(matched_by),
        "unmatchedSamples": unmatched_samples,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mapping", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = load_json(args.mapping)
    if payload.get("schema") != "daggerheart-campaign-toolkit/native-item-artwork-map@1":
        raise SystemExit("Unsupported artwork mapping schema")

    packs = payload.get("packs", {})
    reports = []

    for kind, target in TARGETS.items():
        pack_data = packs.get(kind)
        if not isinstance(pack_data, dict):
            reports.append({
                "kind": kind,
                "target": str(target),
                "present": target.exists(),
                "error": "mapping-pack-missing",
            })
            continue
        reports.append(apply_kind(kind, target, pack_data, args.dry_run))

    print(json.dumps({
        "green": all(r.get("present", False) and "error" not in r for r in reports),
        "dryRun": args.dry_run,
        "reports": reports,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
