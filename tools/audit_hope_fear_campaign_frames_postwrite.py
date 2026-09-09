#!/usr/bin/env python3
"""
P2.4.2c — Post-write audit of Hope & Fear campaign-frame JSON.

Read-only. Does not modify canonical data.
Run from DH Data repository root:
  python tools/audit_hope_fear_campaign_frames_postwrite.py
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path("data/hope-fear-private/campaign-frames")

EXPECTED = [
    ("castle-high.json", "hope-fear.campaign-frame.castle-high", "Castle High"),
    ("reign-of-the-weredragon.json", "hope-fear.campaign-frame.reign-of-the-weredragon", "Reign of the Weredragon"),
    ("dark-heart-of-andaluria.json", "hope-fear.campaign-frame.dark-heart-of-andaluria", "Dark Heart of Andaluria"),
    ("journey-to-horizon.json", "hope-fear.campaign-frame.journey-to-horizon", "Journey to Horizon"),
]

EXPECTED_SECTION_IDS = [
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

SUSPICIOUS = {
    "page_footer": re.compile(r"\bChapter\s+4\s*:", re.I),
    "pdf_footer_number": re.compile(r"(?:^|\n)\s*\d{2,3}\s+Chapter\s+4\s*:", re.I),
    "split_pronoun": re.compile(r"\((?:he|she|they)/\s*\n\s*(?:him|her|them)\)", re.I),
    "split_word_T": re.compile(r"\bT\s+[a-z]\b"),
    "mojibake": re.compile(r"â€™|â€œ|â€|Ã.|Â."),
}

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def text_hash(obj):
    payload = "\n".join(
        f'{s.get("id","")}::{s.get("rules_text","")}'
        for s in obj.get("sections", [])
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def mechanic_section(obj):
    return next(
        (s for s in obj.get("sections", []) if s.get("id") == "campaign-mechanics"),
        None,
    )

def main():
    print("P2.4.2c — Hope & Fear Campaign Frame post-write audit")
    print("=" * 76)

    errors = []
    warnings = []
    content_hashes = {}
    rows = []

    for filename, expected_id, expected_name in EXPECTED:
        path = ROOT / filename
        if not path.exists():
            errors.append(f"{filename}: file missing")
            continue

        try:
            obj = load_json(path)
        except Exception as exc:
            errors.append(f"{filename}: invalid JSON: {exc}")
            continue

        sections = obj.get("sections")
        if not isinstance(sections, list):
            errors.append(f"{filename}: sections is not an array")
            continue

        ids = [s.get("id") for s in sections]
        names = [s.get("name") for s in sections]
        lengths = [len(s.get("rules_text", "")) for s in sections]
        digest = text_hash(obj)
        content_hashes.setdefault(digest, []).append(filename)

        frame_errors = []
        frame_warnings = []

        if obj.get("kind") != "campaign_frame":
            frame_errors.append(f'kind={obj.get("kind")!r}')
        if obj.get("id") != expected_id:
            frame_errors.append(f'id={obj.get("id")!r}, expected={expected_id!r}')
        if obj.get("name") != expected_name:
            frame_errors.append(f'name={obj.get("name")!r}, expected={expected_name!r}')

        if len(sections) != 13:
            frame_errors.append(f"sections={len(sections)}, expected=13")
        if ids != EXPECTED_SECTION_IDS:
            frame_errors.append(f"section order/ids differ: {ids}")
        if len(ids) != len(set(ids)):
            frame_errors.append("duplicate section ids")
        if "player-principles" in ids:
            frame_errors.append("unexpected PLAYER PRINCIPLES section")
        if "inciting-incident" not in ids:
            frame_errors.append("INCITING INCIDENT missing")

        giant = [
            (s.get("id"), len(s.get("rules_text", "")))
            for s in sections
            if len(s.get("rules_text", "")) > 50000
        ]
        if giant:
            frame_errors.append(f"giant section(s): {giant}")

        session_zero = next(
            (s for s in sections if s.get("id") == "session-zero-questions"),
            None,
        )
        if not session_zero:
            frame_errors.append("SESSION ZERO QUESTIONS missing")
        elif len(session_zero.get("rules_text", "")) > 10000:
            frame_errors.append(
                f'SESSION ZERO QUESTIONS implausibly large: '
                f'{len(session_zero.get("rules_text",""))}'
            )

        mechanics = mechanic_section(obj)
        top_mechanics = obj.get("campaign_mechanics", {})
        blocks = top_mechanics.get("blocks", []) if isinstance(top_mechanics, dict) else []
        if not mechanics:
            frame_errors.append("CAMPAIGN MECHANICS section missing")
        if not isinstance(blocks, list) or not blocks:
            frame_errors.append("campaign_mechanics.blocks missing/empty")

        for section in sections:
            sid = section.get("id", "?")
            body = section.get("rules_text", "")
            if not isinstance(body, str) or not body.strip():
                frame_errors.append(f"{sid}: empty rules_text")
                continue

            for label, pattern in SUSPICIOUS.items():
                count = len(pattern.findall(body))
                if count:
                    frame_warnings.append(f"{sid}: {label} x{count}")

        source = obj.get("source", {})
        boundary = source.get("pdf_boundary", {}) if isinstance(source, dict) else {}
        if boundary.get("method") != "content_boundary":
            frame_errors.append(f"boundary method={boundary.get('method')!r}")

        print()
        print(f"### {filename}")
        print(f"name: {obj.get('name')}")
        print(f"id: {obj.get('id')}")
        print(f"boundary: {boundary}")
        print(f"sections: {len(sections)}")
        print(f"content_sha256: {digest[:16]}")
        print(f"mechanic_blocks: {len(blocks) if isinstance(blocks, list) else 'INVALID'}")
        for i, section in enumerate(sections, 1):
            print(
                f"{i:02d}. {section.get('id')}: "
                f"{len(section.get('rules_text',''))} chars "
                f"| raw_heading={section.get('raw_heading')!r}"
            )

        if frame_warnings:
            print("WARNINGS:")
            for item in frame_warnings:
                print(f"  - {item}")

        if frame_errors:
            print("ERRORS:")
            for item in frame_errors:
                print(f"  - {item}")

        errors.extend(f"{filename}: {x}" for x in frame_errors)
        warnings.extend(f"{filename}: {x}" for x in frame_warnings)
        rows.append((filename, len(sections), digest, frame_errors))

    for digest, files in content_hashes.items():
        if len(files) > 1:
            errors.append(
                "duplicate frame content hash: "
                + ", ".join(files)
                + f" ({digest[:16]})"
            )

    exact_boundaries = []
    for filename, _, _ in EXPECTED:
        path = ROOT / filename
        if not path.exists():
            continue
        try:
            obj = load_json(path)
            b = obj.get("source", {}).get("pdf_boundary", {})
            exact_boundaries.append(
                (filename, b.get("pdf_start_index"), b.get("pdf_end_index"))
            )
        except Exception:
            pass

    starts = [x[1] for x in exact_boundaries if isinstance(x[1], int)]
    if len(starts) != len(set(starts)):
        errors.append(f"duplicate PDF start indexes: {exact_boundaries}")
    if starts and starts != sorted(starts):
        errors.append(f"PDF start indexes not increasing: {exact_boundaries}")

    print()
    print("=" * 76)
    print(f"files_audited: {len(rows)}/4")
    print(f"unique_content_hashes: {len(content_hashes)}")
    print(f"warnings: {len(warnings)}")
    print(f"errors: {len(errors)}")

    if warnings:
        print()
        print("WARNING SUMMARY")
        for item in warnings:
            print(f"- {item}")

    if errors:
        print()
        print("ERROR SUMMARY")
        for item in errors:
            print(f"- {item}")

    green = len(rows) == 4 and len(content_hashes) == 4 and not errors
    print()
    print(f"POSTWRITE_AUDIT={'GREEN' if green else 'RED'}")
    raise SystemExit(0 if green else 1)

if __name__ == "__main__":
    main()
