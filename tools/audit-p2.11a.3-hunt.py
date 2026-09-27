#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

TARGET_NAMES = [
    "Appui défensif",
    "Conversion",
    "Couverture",
    "Cuistot",
    "Diversion",
    "Extracteur",
    "Feinte d’approche",
    "Frappe d’épuisement",
    "Frappe de rupture",
    "Frappe mutilante",
    "Guidage du finisher",
    "Naturaliste",
    "Ouverture",
    "Ouverture précise",
    "Provocation",
    "Tacticien",
    "Traqueur",
]

def norm(v):
    s = str(v or "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[’‘`´]", "'", s)
    return re.sub(r"\s+", " ", s).strip().lower()

TARGET_KEYS = {norm(n): n for n in TARGET_NAMES}

def role_from_card(card: dict) -> str:
    hay = " ".join([
        str(card.get("_id") or ""),
        str(card.get("name") or ""),
        str(card.get("system", {}).get("description") or ""),
        json.dumps(card.get("system", {}).get("actions", {}), ensure_ascii=False),
    ]).lower()

    # Prefer explicit Monster Hunter role vocabulary / stable id prefixes.
    if "support" in hay or "guidage du finisher" in hay or "appui défensif" in hay or "couverture" in hay or "diversion" in hay:
        return "Support"
    if "finisher" in hay or "finish" in hay or "conversion" in hay or "frappe d’épuisement" in hay or "frappe de rupture" in hay or "frappe mutilante" in hay:
        return "Finisher"
    if "opener" in hay or "opening" in hay or "ouverture" in hay or "provocation" in hay or "feinte d’approche" in hay:
        return "Opener"
    return "Utilitaire"

def action_summary(card: dict) -> tuple[int, str]:
    actions = card.get("system", {}).get("actions", {})
    if isinstance(actions, dict):
        vals = list(actions.values())
    elif isinstance(actions, list):
        vals = actions
    else:
        vals = []
    kinds = []
    for a in vals:
        if not isinstance(a, dict):
            continue
        kinds.append(str(a.get("type") or a.get("actionType") or "?"))
    return len(vals), ", ".join(sorted(Counter(kinds).elements())) if kinds else ""

def effect_count(card: dict) -> int:
    effects = card.get("effects", [])
    return len(effects) if isinstance(effects, list) else 0

def has_runtime_terms(card: dict) -> list[str]:
    text = " ".join([
        str(card.get("system", {}).get("description") or ""),
        json.dumps(card.get("system", {}).get("actions", {}), ensure_ascii=False),
        json.dumps(card.get("flags", {}), ensure_ascii=False),
    ]).lower()
    terms = []
    for key, label in [
        ("opportunity", "Opportunity"),
        ("monster hunter", "Monster Hunter"),
        ("opener", "Opener"),
        ("finisher", "Finisher"),
        ("support", "Support"),
        ("fear", "Fear"),
        ("hope", "Hope"),
    ]:
        if key in text:
            terms.append(label)
    return terms

def main():
    p = argparse.ArgumentParser(description="Audit fonctionnel P2.11a.3 du domaine Chasse.")
    p.add_argument("--root", default=".", help="Racine du dépôt dh-data.")
    p.add_argument("--json", default="data/homebrew/monster-hunter/dh-domain-cards.json")
    p.add_argument("--out", default="reports/p2.11a.3-hunt-audit")
    args = p.parse_args()

    root = Path(args.root).resolve()
    source = root / args.json
    if not source.exists():
        raise SystemExit(f"[FAIL] source introuvable: {source}")

    payload = json.loads(source.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, list):
        raise SystemExit("[FAIL] dh-domain-cards.json doit être une liste.")

    found = {}
    for card in payload:
        if not isinstance(card, dict):
            continue
        key = norm(card.get("name"))
        if key in TARGET_KEYS:
            found.setdefault(key, []).append(card)

    missing = [name for name in TARGET_NAMES if norm(name) not in found]
    duplicates = {TARGET_KEYS[k]: v for k, v in found.items() if len(v) != 1}
    if missing or duplicates:
        print("[FAIL] corpus non déterministe")
        if missing:
            print("  missing:", ", ".join(missing))
        if duplicates:
            print("  duplicates:", ", ".join(duplicates))
        raise SystemExit(2)

    rows = []
    for expected in TARGET_NAMES:
        card = found[norm(expected)][0]
        sys = card.get("system", {}) if isinstance(card.get("system"), dict) else {}
        n_actions, action_types = action_summary(card)
        terms = has_runtime_terms(card)
        rows.append({
            "name": card.get("name"),
            "id": card.get("_id"),
            "domain": sys.get("domain"),
            "level": sys.get("level"),
            "recallCost": sys.get("recallCost"),
            "cardType": sys.get("type"),
            "role": role_from_card(card),
            "actions": n_actions,
            "actionTypes": action_types,
            "effects": effect_count(card),
            "runtimeTerms": ", ".join(terms),
            "description": sys.get("description", ""),
        })

    outdir = root / args.out
    outdir.mkdir(parents=True, exist_ok=True)

    json_path = outdir / "hunt-audit.json"
    csv_path = outdir / "hunt-audit.csv"
    md_path = outdir / "hunt-audit.md"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    by_role = Counter(r["role"] for r in rows)
    by_level = Counter(r["level"] for r in rows)

    md = []
    md.append("# P2.11a.3 — Audit fonctionnel du domaine Chasse")
    md.append("")
    md.append(f"- Cartes auditées : **{len(rows)}**")
    md.append(f"- Domaine attendu : `hunt`")
    md.append(f"- Cartes hors `hunt` : **{sum(1 for r in rows if r['domain'] != 'hunt')}**")
    md.append("")
    md.append("## Répartition")
    md.append("")
    md.append("| Rôle | Nombre |")
    md.append("|---|---:|")
    for role in ["Opener", "Finisher", "Support", "Utilitaire"]:
        md.append(f"| {role} | {by_role.get(role, 0)} |")
    md.append("")
    md.append("## Par niveau")
    md.append("")
    md.append("| Niveau | Nombre |")
    md.append("|---:|---:|")
    for lvl in sorted(by_level, key=lambda x: (x is None, x)):
        md.append(f"| {lvl} | {by_level[lvl]} |")
    md.append("")
    md.append("## Cartes")
    md.append("")
    md.append("| Nom | Rôle | Niv. | Recall | Actions | Effects | Runtime terms |")
    md.append("|---|---|---:|---:|---:|---:|---|")
    for r in rows:
        md.append(
            f"| {r['name']} | {r['role']} | {r['level']} | {r['recallCost']} | "
            f"{r['actions']} | {r['effects']} | {r['runtimeTerms'] or '—'} |"
        )
    md.append("")
    md.append("## Points de contrôle")
    md.append("")
    md.append("- Vérifier que toutes les cartes sont désormais dans `hunt`.")
    md.append("- Vérifier que les rôles détectés correspondent bien à l'intention de design.")
    md.append("- Les cartes sans mention runtime explicite ne sont pas forcément mauvaises : elles peuvent utiliser uniquement des primitives Daggerheart.")
    md.append("- Les cartes avec 0 action / 0 effect peuvent être purement textuelles, ou signaler une automatisation à compléter.")
    md.append("- Cet audit ne modifie aucune donnée.")
    md.append("")
    md_path.write_text("\n".join(md) + "\n", encoding="utf-8")

    print()
    print(f"[GREEN] Audit généré pour {len(rows)} cartes.")
    print(f"  JSON : {json_path.relative_to(root)}")
    print(f"  CSV  : {csv_path.relative_to(root)}")
    print(f"  MD   : {md_path.relative_to(root)}")
    print()
    print("Répartition rôles :", dict(by_role))
    print("Répartition niveaux :", dict(by_level))

if __name__ == "__main__":
    main()
