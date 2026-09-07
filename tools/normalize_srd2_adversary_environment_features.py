#!/usr/bin/env python3
"""P2.3.3j — conservative feature normalization for SRD adversaries/environments.

Run from the DH-DATA repository root:

    python tools/normalize_srd2_adversary_environment_features.py

The tool never invents feature semantics. It:
- repairs a small, explicit set of PDF extraction artifacts;
- clips a feature block only when it contains the unmistakable start of a
  *different canonical adversary* stat block;
- splits feature blocks only on explicit SRD headers (Passive/Action/Reaction);
- preserves the original ``features_text`` for provenance;
- writes neutral ``features`` arrays plus an audit report.

Exit status is non-zero if any populated feature block cannot be split or if
cross-stat-block contamination remains after normalization.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path('.')
ADV_PATH = ROOT / 'data/srd-2.0/adversaries/adversaries.json'
ENV_PATH = ROOT / 'data/srd-2.0/environments/environments.json'
AUDIT_PATH = ROOT / 'docs/audits/P2.3.3j-feature-normalization.json'

TYPE_RE = r'(Passive|Action|Reaction)'
ROLE_RE = r'(?:Bruiser|Horde|Leader|Minion|Ranged|Skulk|Social|Solo|Standard|Support)'

TOKEN_MAP = {
    '/comma.tab': ',',
    '/period.tab': '.',
    '/hyphen.tab': ' - ',
    '/one.tnum': '1',
    '/two.tnum': '2',
    '/three.tnum': '3',
    '/four.tnum': '4',
    '/five.tnum': '5',
    '/six.tnum': '6',
    '/seven.tnum': '7',
    '/eight.tnum': '8',
    '/nine.tnum': '9',
    '/zero.tnum': '0',
}

# Explicit ligature/font-extraction repairs observed in the canonical SRD 2.0
# extraction. Keep this list narrow: this is normalization, not rewriting.
TEXT_REPAIRS = {
    'Diffi culty': 'Difficulty',
    'fi nd': 'find',
    'fi ght': 'fight',
    'fi rst': 'first',
    'fi gure': 'figure',
    'fi nal': 'final',
    'fi re': 'fire',
    'fi eld': 'field',
    'fl ying': 'flying',
    'refl ect': 'reflect',
    'benefi t': 'benefit',
    'benefi ts': 'benefits',
    'T arget': 'Target',
    'T argets': 'Targets',
    'T attered': 'Tattered',
    'oﬀ ': 'off ',
    'oﬀer': 'offer',
    'aﬀ ect': 'affect',
    'aﬀect': 'affect',
    'shuﬄ e': 'shuffle',
}

HEADER_RE = re.compile(
    rf'(?P<name>[^.!?•]+?)\s+-\s+(?P<type>{TYPE_RE[1:-1]})\s*:',
    re.IGNORECASE,
)


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def normalize_ws(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip()


def clean_text(text: str) -> str:
    text = text or ''
    # Handle tokens whose suffix is attached directly to a word first.
    text = text.replace('/hyphen.tab', ' - ')
    for token, replacement in TOKEN_MAP.items():
        if token != '/hyphen.tab':
            text = text.replace(token, replacement)
    # Tokenized damage notation can contain e.g. /one.tnumd/six.tnum -> 1d6.
    text = re.sub(r'(?<=\d)d(?=\d)', 'd', text)
    for bad, good in TEXT_REPAIRS.items():
        text = text.replace(bad, good)
    # Unicode compatibility normalization without ASCII-folding names.
    text = unicodedata.normalize('NFKC', text)
    return normalize_ws(text)


def contamination_marker(text: str, current_name: str, adversary_names: list[str]):
    """Return the earliest unmistakable embedded *other* adversary stat block."""
    best = None
    for other in adversary_names:
        if other == current_name:
            continue
        # A canonical name immediately followed by Tier + role is a strong
        # boundary signal and avoids treating ordinary mentions as contamination.
        pattern = re.compile(
            rf'(?<![\w’\'-]){re.escape(other)}\s+Tier\s+[^\s]*\s*{ROLE_RE}\b',
            re.IGNORECASE,
        )
        m = pattern.search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), other, m.group(0))
    return best


def clean_feature_name(name: str) -> str:
    name = normalize_ws(name).strip(' •')
    # Phase/evolution prose can introduce a feature list with a colon. Keep only
    # the explicit feature name after that introduction.
    if ':' in name:
        tail = name.rsplit(':', 1)[-1].strip()
        if tail and '|' not in tail:
            name = tail
    # A few phase transitions insert a replacement standard attack immediately
    # before the next explicit feature header (e.g. `... 1d10+3 phy Double Swipe`).
    m = re.search(r'\b(?:phy|mag)\s+([A-Z][A-Za-z0-9’\'&() /,+\-]{1,80})$', name)
    if m:
        name = m.group(1).strip()
    # Otherwise discard complete introductory sentences swallowed by the
    # conservative header matcher.
    name = re.split(r'(?<=[.!?])\s+', name)[-1].strip(' •')
    return name


def split_features(text: str):
    """Split only explicit ``Name - Passive|Action|Reaction:`` headers."""
    matches = list(HEADER_RE.finditer(text))
    if not matches:
        return []
    features = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        name = clean_feature_name(m.group('name'))
        body = normalize_ws(text[start:end]).strip()
        features.append({
            'name': name,
            'type': m.group('type').title(),
            'text': body,
        })
    return features


def process(rows, kind: str, adversary_names: list[str]):
    report_rows = []
    unsplit = []
    contamination_removed = []
    residual_contamination = []
    feature_count = 0
    type_counts = Counter()

    for row in rows:
        raw = row.get('features_text') or ''
        cleaned = clean_text(raw)
        removed = None
        if kind == 'adversary' and cleaned:
            marker = contamination_marker(cleaned, row.get('name', ''), adversary_names)
            if marker:
                pos, other, marker_text = marker
                removed = {
                    'embedded_adversary': other,
                    'offset': pos,
                    'marker': marker_text,
                    'removed_characters': len(cleaned) - pos,
                }
                cleaned = cleaned[:pos].rstrip()
                contamination_removed.append({'id': row.get('id'), 'name': row.get('name'), **removed})

        features = split_features(cleaned) if cleaned else []
        row['features'] = features
        row['features_normalization'] = {
            'status': 'normalized' if (not cleaned or features) else 'review',
            'source_field': 'features_text',
            'feature_count': len(features),
            'contamination_removed': removed,
        }

        if cleaned and not features:
            unsplit.append({'id': row.get('id'), 'name': row.get('name'), 'sample': cleaned[:240]})

        if kind == 'adversary' and cleaned:
            marker = contamination_marker(cleaned, row.get('name', ''), adversary_names)
            if marker:
                residual_contamination.append({'id': row.get('id'), 'name': row.get('name'), 'marker': marker[2]})

        feature_count += len(features)
        type_counts.update(f.get('type') for f in features)
        report_rows.append({
            'id': row.get('id'),
            'name': row.get('name'),
            'feature_count': len(features),
            'status': row['features_normalization']['status'],
            'contamination_removed': removed,
        })

    return {
        'rows': report_rows,
        'documents': len(rows),
        'features': feature_count,
        'feature_types': dict(sorted(type_counts.items())),
        'unsplit': unsplit,
        'contamination_removed': contamination_removed,
        'residual_contamination': residual_contamination,
    }


def main():
    adversaries = load(ADV_PATH)
    environments = load(ENV_PATH)
    adversary_names = [r.get('name', '') for r in adversaries if r.get('name')]

    adv_report = process(adversaries, 'adversary', adversary_names)
    env_report = process(environments, 'environment', adversary_names)

    save(ADV_PATH, adversaries)
    save(ENV_PATH, environments)

    green = (
        not adv_report['unsplit']
        and not env_report['unsplit']
        and not adv_report['residual_contamination']
        and not env_report['residual_contamination']
        and adv_report['documents'] == 264
        and env_report['documents'] == 47
    )
    audit = {
        'milestone': 'P2.3.3j',
        'green': green,
        'policy': 'Conservative source normalization only; no Foundry embedded Items are generated in this milestone.',
        'adversaries': adv_report,
        'environments': env_report,
        'summary': {
            'documents': adv_report['documents'] + env_report['documents'],
            'normalized_features': adv_report['features'] + env_report['features'],
            'unsplit_blocks': len(adv_report['unsplit']) + len(env_report['unsplit']),
            'cross_stat_contaminations_removed': len(adv_report['contamination_removed']),
            'residual_cross_stat_contaminations': len(adv_report['residual_contamination']) + len(env_report['residual_contamination']),
        },
    }
    save(AUDIT_PATH, audit)

    print('P2.3.3j feature normalization')
    print(f"  adversaries: {adv_report['documents']} docs / {adv_report['features']} features")
    print(f"  environments: {env_report['documents']} docs / {env_report['features']} features")
    print(f"  unsplit blocks: {audit['summary']['unsplit_blocks']}")
    print(f"  cross-stat contamination removed: {audit['summary']['cross_stat_contaminations_removed']}")
    print(f"  residual contamination: {audit['summary']['residual_cross_stat_contaminations']}")
    print(f"  GREEN: {green}")
    raise SystemExit(0 if green else 1)


if __name__ == '__main__':
    main()
