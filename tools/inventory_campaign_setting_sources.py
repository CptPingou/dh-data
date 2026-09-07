#!/usr/bin/env python3
"""
P1.3c — Inventory additional campaign-setting / campaign-frame sources.

Scans a local PDF directory and builds a source-level registry without
extracting proprietary campaign content.

Usage from repository root:
  python tools/inventory_campaign_setting_sources.py "pdf"

Requires: pypdf
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from pypdf import PdfReader

OUT = Path("data/registry")
OUT.mkdir(parents=True, exist_ok=True)

# Known corpus classification. This is source-level metadata only.
KNOWN = {
    "dh_srd_2_2026_08_25.pdf": {
        "corpus_id": "srd-2.0",
        "product": "Daggerheart SRD 2.0",
        "publication_status": "srd",
        "campaign_setting_role": "baseline",
        "expected_campaign_frames": ["The Witherwild"],
        "expected_setting_mechanics": [
            "Supplemental Campaign Mechanics",
        ],
        "next_action": "already_extracted",
    },
    "daggerheart_hf.pdf": {
        "corpus_id": "hope-fear",
        "product": "Daggerheart: Hope & Fear",
        "publication_status": "published_private",
        "campaign_setting_role": "private_delta",
        "expected_campaign_frames": [
            "Castle High",
            "Reign of the Weredragon",
            "Dark Heart of Andaluria",
            "Journey to Horizon",
        ],
        "expected_setting_mechanics": [],
        "next_action": "already_extracted_P1.3b",
    },
    "daggerheart_hf_full_art_and_printer_friendly_cards_-_8-14-26.pdf": {
        "corpus_id": "hope-fear-cards",
        "product": "Hope & Fear Full Art / Printer Friendly Cards",
        "publication_status": "published_private",
        "campaign_setting_role": "reference_asset",
        "expected_campaign_frames": [],
        "expected_setting_mechanics": [],
        "next_action": "reference_only",
    },
    "daggerheart-homebrew-kit-v1.0-july-31-2025.pdf": {
        "corpus_id": "homebrew-kit-v1.0",
        "product": "Daggerheart Homebrew Kit v1.0",
        "publication_status": "published_private",
        "campaign_setting_role": "design_guidance",
        "expected_campaign_frames": [],
        "expected_setting_mechanics": [],
        "next_action": "primitive_design_reference_P1.4",
    },
    "bloodhunter-v1.5-the-void.pdf": {
        "corpus_id": "blood-hunter-v1.5",
        "product": "Blood Hunter / The Void v1.5",
        "publication_status": "playtest",
        "campaign_setting_role": "class_playtest",
        "expected_campaign_frames": [],
        "expected_setting_mechanics": [],
        "next_action": "primitive_coverage_input_P1.5",
    },
}

FRAME_PATTERNS = [
    re.compile(r"\bCAMPAIGN\s+FRAME\b", re.I),
    re.compile(r"\bCAMPAIGN\s+FRAMES\b", re.I),
]
SETTING_PATTERNS = [
    re.compile(r"\bCAMPAIGN\s+MECHANICS\b", re.I),
    re.compile(r"\bSUPPLEMENTAL\s+CAMPAIGN\s+MECHANICS\b", re.I),
    re.compile(r"\bCAMPAIGN\s+SETTING\b", re.I),
]

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def clean_text(s: str) -> str:
    s = s.replace("\u00ad", "").replace("\u200b", "").replace("\ufeff", "")
    return re.sub(r"\s+", " ", s)

def safe_pdf_probe(path: Path) -> dict[str, Any]:
    try:
        reader = PdfReader(str(path))
        page_count = len(reader.pages)

        # Probe front matter + sampled pages. This is an inventory pass, not extraction.
        sample_indexes = set(range(min(12, page_count)))
        if page_count:
            step = max(1, page_count // 12)
            sample_indexes.update(range(0, page_count, step))
            sample_indexes.add(page_count - 1)

        chunks = []
        for i in sorted(sample_indexes):
            try:
                chunks.append(reader.pages[i].extract_text() or "")
            except Exception:
                pass

        sample = clean_text("\n".join(chunks))
        campaign_frame_signal = any(p.search(sample) for p in FRAME_PATTERNS)
        campaign_mechanics_signal = any(p.search(sample) for p in SETTING_PATTERNS)

        return {
            "readable": True,
            "page_count": page_count,
            "campaign_frame_signal": campaign_frame_signal,
            "campaign_mechanics_signal": campaign_mechanics_signal,
            "probe_error": None,
        }
    except Exception as exc:
        return {
            "readable": False,
            "page_count": None,
            "campaign_frame_signal": False,
            "campaign_mechanics_signal": False,
            "probe_error": f"{type(exc).__name__}: {exc}",
        }

def classify_unknown(probe: dict[str, Any]) -> dict[str, Any]:
    if probe["campaign_frame_signal"]:
        return {
            "corpus_id": None,
            "product": None,
            "publication_status": "unknown",
            "campaign_setting_role": "candidate_campaign_frame_source",
            "expected_campaign_frames": [],
            "expected_setting_mechanics": [],
            "next_action": "register_then_extract_P1.3d",
        }
    if probe["campaign_mechanics_signal"]:
        return {
            "corpus_id": None,
            "product": None,
            "publication_status": "unknown",
            "campaign_setting_role": "candidate_campaign_mechanics_source",
            "expected_campaign_frames": [],
            "expected_setting_mechanics": [],
            "next_action": "register_then_extract_P1.3d",
        }
    return {
        "corpus_id": None,
        "product": None,
        "publication_status": "unknown",
        "campaign_setting_role": "non_setting_or_unresolved",
        "expected_campaign_frames": [],
        "expected_setting_mechanics": [],
        "next_action": "manual_classification_if_relevant",
    }

def main() -> None:
    pdf_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("pdf")
    if not pdf_dir.exists():
        raise SystemExit(f"PDF directory not found: {pdf_dir}")

    pdfs = sorted(pdf_dir.glob("*.pdf"))
    sources = []
    errors = []

    for path in pdfs:
        probe = safe_pdf_probe(path)
        key = path.name.lower()
        base = KNOWN.get(key, classify_unknown(probe)).copy()

        entry = {
            "filename": path.name,
            "relative_path": str(path),
            "sha256": sha256_file(path),
            **base,
            "probe": probe,
        }
        sources.append(entry)

        if not probe["readable"]:
            errors.append(f"{path.name}: unreadable PDF")

    additional_candidates = [
        s for s in sources
        if s["campaign_setting_role"] in {
            "candidate_campaign_frame_source",
            "candidate_campaign_mechanics_source",
        }
    ]

    known_setting_sources = [
        s for s in sources
        if s["campaign_setting_role"] in {"baseline", "private_delta"}
    ]

    checks = {
        "pdf_directory_found": pdf_dir.exists(),
        "at_least_one_pdf_found": bool(pdfs),
        "all_pdfs_readable": all(s["probe"]["readable"] for s in sources),
        "srd2_present": any(s["corpus_id"] == "srd-2.0" for s in sources),
        "hope_fear_present": any(s["corpus_id"] == "hope-fear" for s in sources),
        "known_setting_sources_registered": len(known_setting_sources) >= 2,
        "all_additional_candidates_have_next_action": all(
            s["next_action"] == "register_then_extract_P1.3d"
            for s in additional_candidates
        ),
    }

    report = {
        "phase": "P1.3c",
        "purpose": (
            "Inventory local campaign-setting sources before extraction; "
            "no proprietary campaign text is copied."
        ),
        "pdf_directory": str(pdf_dir),
        "pdf_count": len(pdfs),
        "sources": sources,
        "known_setting_source_count": len(known_setting_sources),
        "additional_campaign_setting_candidate_count": len(additional_candidates),
        "additional_campaign_setting_candidates": [
            {
                "filename": s["filename"],
                "campaign_setting_role": s["campaign_setting_role"],
                "publication_status": s["publication_status"],
                "next_action": s["next_action"],
            }
            for s in additional_candidates
        ],
        "checks": checks,
        "validation": "GREEN" if all(checks.values()) and not errors else "RED",
        "errors": errors,
        "interpretation": (
            "GREEN with zero additional candidates means the current local PDF corpus "
            "contains no new campaign-setting source beyond SRD 2.0 and Hope & Fear. "
            "P1.3d should only begin after additional setting PDFs are added, or may be "
            "recorded as NO-OP for the current corpus."
        ),
        "next_phase_if_candidates": "P1.3d — extract additional campaign-setting sources",
        "next_phase_if_zero_candidates": "P1.4 — Primitive Census",
    }

    out = OUT / "campaign-setting-sources.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "P1.3c-status.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
