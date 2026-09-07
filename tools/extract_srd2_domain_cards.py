#!/usr/bin/env python3
"""
Extract Daggerheart SRD 2.0 Domain Card Reference into neutral JSON.

Usage:
    python tools/extract_srd2_domain_cards.py DH_SRD_2_2026_08_25.pdf

Dependency:
    pip install pypdf
"""
from __future__ import annotations
from pathlib import Path
import json, re, sys, unicodedata

EXPECTED_DOMAINS = [
    "Arcana","Blade","Bone","Codex","Dread",
    "Grace","Midnight","Sage","Splendor","Valor"
]
EXPECTED_TOTAL = 210
CARD_HEADER = re.compile(
    r"(?P<name>[A-Z0-9][A-Z0-9’'‑–—\- ,:&]+?)\s*\n"
    r"Level\s+(?P<level>10|[1-9])\s+"
    r"(?P<domain>Arcana|Blade|Bone|Codex|Dread|Grace|Midnight|Sage|Splendor|Valor)\s+"
    r"(?P<type>Ability|Spell|Grimoire)\s*\n"
    r"Recall Cost:\s*(?P<recall>\d+)",
    re.MULTILINE
)

def slug(s: str) -> str:
    s = s.replace("‑","-").replace("–","-").replace("—","-")
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def clean_name(s: str) -> str:
    s = " ".join(s.split())
    # Title-case conservatively; preserve common apostrophes.
    return s.title().replace("'S","'s")

def extract_text(pdf_path: Path) -> str:
    from pypdf import PdfReader
    reader = PdfReader(str(pdf_path))
    # Printed SRD appendix starts at p.206; zero-indexed PDF page is 205.
    pages = reader.pages[205:]
    return "\n".join((p.extract_text() or "") for p in pages)

def parse_cards(text: str):
    matches = list(CARD_HEADER.finditer(text))
    cards = []
    for i,m in enumerate(matches):
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        rules_text = text[start:end].strip()

        # Trim common footer/header spill.
        rules_text = re.sub(r"\n?Daggerheart SRD\s+\d+\s*", "\n", rules_text)
        rules_text = re.sub(r"\n?APPENDIX\s*", "\n", rules_text)
        rules_text = re.sub(r"\n?[A-Z]+ DOMAIN\s*$", "", rules_text, flags=re.MULTILINE)
        rules_text = re.sub(r"\n{3,}", "\n\n", rules_text).strip()

        name = clean_name(m.group("name"))
        domain = m.group("domain").lower()
        cards.append({
            "id": f"srd-2.0.domain-card.{domain}.{slug(name)}",
            "kind": "domain_card",
            "identity": {"name": name, "slug": slug(name)},
            "source": {
                "corpus": "daggerheart-srd",
                "product": "srd",
                "version": "2.0",
                "status": "srd"
            },
            "availability": {
                "in_srd": True,
                "private_only": False,
                "deprecated": False
            },
            "rules": {
                "domain": domain,
                "level": int(m.group("level")),
                "card_type": m.group("type").lower(),
                "recall_cost": int(m.group("recall"))
            },
            "content": {
                "rules_text": rules_text,
                "notes": None
            }
        })
    return cards

def validate(cards):
    errors=[]
    ids=[x["id"] for x in cards]
    if len(cards) != EXPECTED_TOTAL:
        errors.append(f"Expected {EXPECTED_TOTAL} cards, parsed {len(cards)}")
    if len(ids) != len(set(ids)):
        errors.append("Duplicate canonical IDs detected")
    by_domain={}
    for c in cards:
        by_domain.setdefault(c["rules"]["domain"], []).append(c)
    for d in [x.lower() for x in EXPECTED_DOMAINS]:
        n=len(by_domain.get(d,[]))
        if n != 21:
            errors.append(f"{d}: expected 21 cards, parsed {n}")
    for c in cards:
        if not 1 <= c["rules"]["level"] <= 10:
            errors.append(f"{c['id']}: invalid level")
        if c["rules"]["card_type"] not in {"ability","spell","grimoire"}:
            errors.append(f"{c['id']}: invalid type")
        if c["rules"]["recall_cost"] < 0:
            errors.append(f"{c['id']}: invalid recall cost")
    return errors, by_domain

def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python tools/extract_srd2_domain_cards.py <SRD2.pdf>")
    pdf=Path(sys.argv[1])
    if not pdf.exists():
        raise SystemExit(f"File not found: {pdf}")

    text=extract_text(pdf)
    cards=parse_cards(text)
    errors, by_domain=validate(cards)

    repo = Path(__file__).resolve().parents[1]
    outdir = repo/"data/srd-2.0/domain-cards"
    outdir.mkdir(parents=True, exist_ok=True)

    for domain, rows in sorted(by_domain.items()):
        (outdir/f"{domain}.json").write_text(
            json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    manifest = {
        "source_file": pdf.name,
        "expected_total": EXPECTED_TOTAL,
        "parsed_total": len(cards),
        "counts_by_domain": {d:len(v) for d,v in sorted(by_domain.items())},
        "validation": "GREEN" if not errors else "RED",
        "errors": errors
    }
    (outdir/"manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    if errors:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
