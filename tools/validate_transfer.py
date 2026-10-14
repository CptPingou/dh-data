#!/usr/bin/env python3
"""Validation P3.4a.1: schema + invariants cross references. pip install jsonschema"""
import json,sys
from pathlib import Path
try:
 from jsonschema import Draft202012Validator
except ImportError:
 print('DEPENDANCE MANQUANTE: python -m pip install jsonschema',file=sys.stderr);sys.exit(2)
ROOT=Path(__file__).resolve().parents[1]
def validate(data):
 schema=json.loads((ROOT/'schemas'/'expedition-transfer-v1.schema.json').read_text(encoding='utf-8'))
 errors=[f"SCHEMA {'.'.join(map(str,e.absolute_path)) or '$'}: {e.message}" for e in Draft202012Validator(schema).iter_errors(data)]
 if errors:return errors
 chars=data['characters'];ids=[x['characterId'] for x in chars];uuids=[x['foundryActorUuid'] for x in chars]
 if len(ids)!=len(set(ids)):errors.append('characterId dupliqué')
 if len(uuids)!=len(set(uuids)):errors.append('foundryActorUuid dupliqué')
 if any(x['materialKnowledgeCoverage']!='captured' for x in chars) and not data.get('metadata',{}).get('exampleOnly'):
  errors.append('Connaissances non auditées: transfert opérationnel interdit')
 containers=[x['backpack'] for x in chars]+data['caravan']['containers']
 cids=[x['containerId'] for x in containers]
 if len(cids)!=len(set(cids)):errors.append('containerId dupliqué')
 for c in containers:
  entries=[x['entryId'] for x in c['contents']]
  if len(entries)!=len(set(entries)):errors.append(f"entryId dupliqué dans {c['containerId']}")
 for ch in chars:
  if not ch['backpack']['containerId'].startswith('foundry-backpack-'):
   errors.append(f"Sac à dos non identifié pour {ch['characterId']}")
 comp=data['caravan']['structure']['components'];compids=[x['id'] for x in comp]
 if len(compids)!=len(set(compids)):errors.append('ID composant caravane dupliqué')
 linked=[x['containerId'] for x in comp if x.get('containerId')]
 caravanids=[x['containerId'] for x in data['caravan']['containers']]
 if len(linked)!=len(set(linked)):errors.append('Un container caravane lié à plusieurs composants')
 if set(linked)!=set(caravanids):errors.append('Conteneurs caravane != liens component.containerId')
 for c in comp:
  if c['hp']['value']>c['hp']['max']:errors.append(f"PV > max pour {c['id']}")
 for s in data['caravan']['structure']['cargoSlots']:
  if s['componentId'] is not None and s['componentId'] not in compids:errors.append(f"Slot {s['id']} vers composant absent")
 rev=data['research']['revelations'];rev_ids=[r['id'] for r in rev]
 if len(rev_ids)!=len(set(rev_ids)):errors.append('ID révélation dupliqué')
 for r in rev:
  for field in ['discoveredBy','sharedWith']:
   for ref in r[field]:
    if ref not in ids and ref!='party':errors.append(f"Révélation {r['id']} {field}: référence non résolue {ref}")
 return errors
if __name__=='__main__':
 if len(sys.argv)!=2:print('Usage: python tools/validate_transfer.py chemin.json');sys.exit(2)
 p=Path(sys.argv[1]);data=json.loads(p.read_text(encoding='utf-8'))
 errs=validate(data)
 if errs:
  print('INVALID',p);print('\n'.join('- '+x for x in errs));sys.exit(1)
 print('VALID',p,'(exampleOnly='+str(data.get('metadata',{}).get('exampleOnly',False))+')')
