#!/usr/bin/env python3
import json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/'data/playtest/blood-hunter-v1.5'
NEW=ROOT/'data/playtest/blood-hunter-2026-07-09'

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def all_json(root): return [p for p in root.rglob('*.json') if '/registry/' not in p.as_posix()]
new_docs=[load(p) for p in all_json(NEW)]
old_docs=[load(p) for p in all_json(OLD)]
ids=[d['id'] for d in new_docs]
old_ids={d['id'] for d in old_docs}
issues=[]
if len(ids)!=26: issues.append(f'expected 26 source entities, got {len(ids)}')
if len(set(ids))!=len(ids): issues.append('duplicate IDs in new source')
if set(ids)&old_ids: issues.append('ID collision with v1.5')
for d in new_docs:
    s=d.get('source',{})
    if (s.get('corpus'),s.get('product'),s.get('version'),s.get('status')) != ('the-void','blood-hunter','2026-07-09','playtest'):
        issues.append(f"bad provenance: {d.get('id')}")
counts={k:sum(1 for d in new_docs if d.get('kind')==k) for k in ['class','subclass','domain','domain_card']}
expected={'class':1,'subclass':3,'domain':1,'domain_card':21}
if counts!=expected: issues.append(f'bad counts {counts}')
klass=next(d for d in new_docs if d.get('kind')=='class')
if klass['rules'].get('domains')!=['blood','bone'] or klass['rules'].get('starting_evasion')!=11:
    issues.append('Blood Hunter class oracle failed')
subnames={d['identity']['name'] for d in new_docs if d.get('kind')=='subclass'}
if subnames!={'Order of the Specter','Order of the Mutant','Order of the Lycan'}:
    issues.append(f'bad subclass set {sorted(subnames)}')
reg=load(NEW/'registry/migration-v1.5.json')
print(json.dumps({'phase':'blood-hunter-2026-07-09-source-ingest','counts':counts,'newIds':len(ids),'collisions':len(set(ids)&old_ids),'activeInFoundryManifest':reg['active_in_foundry_manifest'],'issues':issues,'green':not issues},indent=2,ensure_ascii=False))
sys.exit(1 if issues else 0)
