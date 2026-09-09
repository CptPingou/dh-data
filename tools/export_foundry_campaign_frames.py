#!/usr/bin/env python3
"""
P2.4.2e — Export all validated Campaign Frames to the Foundry toolkit.

Canonical sources remain in DH Data.
This script writes one derived payload:
  <module-root>/data/campaign-frames/index.json

Usage from DH Data root:
  python tools/export_foundry_campaign_frames.py "E:\\FoundryvttDataV14\\Data\\modules\\daggerheart-campaign-toolkit"
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

FRAME_SPECS = [
    {
        "path": Path("data/srd-2.0/campaign-frames/witherwild.json"),
        "id": "srd-2.0.campaign-frame.witherwild",
        "name": "The Witherwild",
        "slug": "witherwild",
        "corpus": "srd-2.0",
        "expected_sections": 14,
        "expected_section_ids": [
            "the-pitch",
            "tone-feel",
            "themes",
            "touchstones",
            "overview",
            "communities",
            "ancestries",
            "classes",
            "player-principles",
            "gm-principles",
            "distinctions",
            "inciting-incident",
            "campaign-mechanics",
            "session-zero-questions",
        ],
    },
    {
        "path": Path("data/hope-fear-private/campaign-frames/castle-high.json"),
        "id": "hope-fear.campaign-frame.castle-high",
        "name": "Castle High",
        "slug": "castle-high",
        "corpus": "hope-fear-private",
        "expected_sections": 13,
    },
    {
        "path": Path("data/hope-fear-private/campaign-frames/reign-of-the-weredragon.json"),
        "id": "hope-fear.campaign-frame.reign-of-the-weredragon",
        "name": "Reign of the Weredragon",
        "slug": "reign-of-the-weredragon",
        "corpus": "hope-fear-private",
        "expected_sections": 13,
    },
    {
        "path": Path("data/hope-fear-private/campaign-frames/dark-heart-of-andaluria.json"),
        "id": "hope-fear.campaign-frame.dark-heart-of-andaluria",
        "name": "Dark Heart of Andaluria",
        "slug": "dark-heart-of-andaluria",
        "corpus": "hope-fear-private",
        "expected_sections": 13,
    },
    {
        "path": Path("data/hope-fear-private/campaign-frames/journey-to-horizon.json"),
        "id": "hope-fear.campaign-frame.journey-to-horizon",
        "name": "Journey to Horizon",
        "slug": "journey-to-horizon",
        "corpus": "hope-fear-private",
        "expected_sections": 13,
    },
]

HF_SECTION_IDS = [
    "the-pitch",
    "tone-feel",
    "themes",
    "touchstones",
    "overview",
    "communities",
    "ancestries",
    "classes",
    "gm-principles",
    "distinctions",
    "inciting-incident",
    "campaign-mechanics",
    "session-zero-questions",
]

def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))

def canonical_name(frame: dict[str, Any]) -> str | None:
    identity = frame.get("identity")
    if isinstance(identity, dict) and identity.get("name"):
        return identity["name"]
    return frame.get("name")

def canonical_slug(frame: dict[str, Any], fallback: str) -> str:
    identity = frame.get("identity")
    if isinstance(identity, dict) and identity.get("slug"):
        return identity["slug"]
    return frame.get("slug") or fallback

def short_section_id(frame_id: str, raw_id: str | None) -> str | None:
    if not raw_id:
        return raw_id
    prefix = frame_id + "."
    if raw_id.startswith(prefix):
        return raw_id[len(prefix):]
    return raw_id

def frame_hash(frame: dict[str, Any]) -> str:
    encoded = json.dumps(frame, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

def audit_frame(spec: dict[str, Any], frame: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []

    if frame.get("kind") != "campaign_frame":
        errors.append(f"kind={frame.get('kind')!r}, expected='campaign_frame'")
    if frame.get("id") != spec["id"]:
        errors.append(f"id={frame.get('id')!r}, expected={spec['id']!r}")
    if canonical_name(frame) != spec["name"]:
        errors.append(f"name={canonical_name(frame)!r}, expected={spec['name']!r}")

    sections = frame.get("sections")
    if not isinstance(sections, list):
        errors.append("sections is not an array")
        sections = []

    if len(sections) != spec["expected_sections"]:
        errors.append(f"sections={len(sections)}, expected={spec['expected_sections']}")

    section_ids = [short_section_id(spec["id"], s.get("id")) for s in sections if isinstance(s, dict)]
    expected_ids = spec.get("expected_section_ids", HF_SECTION_IDS)
    if section_ids != expected_ids:
        errors.append(f"section order/ids differ: {section_ids}")

    if len(section_ids) != len(set(section_ids)):
        errors.append("duplicate section ids")

    for i, section in enumerate(sections):
        if not isinstance(section, dict):
            errors.append(f"section[{i}] is not an object")
            continue
        if not section.get("id"):
            errors.append(f"section[{i}] missing id")
        if not section.get("name"):
            errors.append(f"section[{i}] missing name")
        body = section.get("rules_text")
        if not isinstance(body, str) or not body.strip():
            errors.append(f"section[{i}] missing/empty rules_text")

    if spec["corpus"] == "hope-fear-private":
        if "player-principles" in section_ids:
            errors.append("unexpected player-principles in Hope & Fear frame")
        if "inciting-incident" not in section_ids:
            errors.append("inciting-incident missing")

    summary = {
        "id": spec["id"],
        "name": spec["name"],
        "slug": canonical_slug(frame, spec["slug"]),
        "corpus": spec["corpus"],
        "sections": len(sections),
        "sha256": frame_hash(frame),
        "green": not errors,
        "errors": errors,
    }
    return errors, summary

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "module_root",
        type=Path,
        help="Root of daggerheart-campaign-toolkit Foundry module",
    )
    args = parser.parse_args()

    module_root: Path = args.module_root
    output = module_root / "data" / "campaign-frames" / "index.json"

    all_errors: list[str] = []
    frames: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []

    for spec in FRAME_SPECS:
        path = spec["path"]
        if not path.exists():
            all_errors.append(f"{path}: missing canonical source")
            continue

        try:
            frame = read_json(path)
        except Exception as exc:
            all_errors.append(f"{path}: invalid JSON: {exc}")
            continue

        errors, summary = audit_frame(spec, frame)
        all_errors.extend(f"{path}: {error}" for error in errors)
        summaries.append(summary)

        # Keep canonical data intact. Add only adapter metadata around it.
        frames.append({
            "source_path": str(path).replace("\\", "/"),
            "corpus": spec["corpus"],
            "slug": canonical_slug(frame, spec["slug"]),
            "data": frame,
        })

    ids = [entry["data"].get("id") for entry in frames]
    names = [canonical_name(entry["data"]) for entry in frames]
    hashes = [frame_hash(entry["data"]) for entry in frames]

    if len(frames) != 5:
        all_errors.append(f"frames={len(frames)}, expected=5")
    if len(ids) != len(set(ids)):
        all_errors.append("duplicate frame ids")
    if len(names) != len(set(names)):
        all_errors.append("duplicate frame names")
    if len(hashes) != len(set(hashes)):
        all_errors.append("duplicate canonical frame hashes")

    audit = {
        "expected_frames": 5,
        "frames_found": len(frames),
        "unique_ids": len(set(ids)),
        "unique_names": len(set(names)),
        "unique_hashes": len(set(hashes)),
        "total_sections": sum(len(entry["data"].get("sections", [])) for entry in frames),
        "frame_summaries": summaries,
        "errors": all_errors,
        "green": not all_errors and len(frames) == 5,
    }

    payload = {
        "phase": "P2.4.2e",
        "mapping_version": "P2.4.2e",
        "audit": audit,
        "frames": frames,
    }

    print(json.dumps(audit, ensure_ascii=False, indent=2))

    # Write only on a fully green audit.
    if not audit["green"]:
        print("\nEXPORT=RED — output not written")
        return 1

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"\nOUTPUT={output}")
    print("EXPORT=GREEN")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
