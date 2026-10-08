"""Authenticated asset selection for users logged in within the snapshot's last 30 days."""
import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from .asset_index import checkpoint_identity, open_index, seal, unseal, validate_index
from .package import load_manifest, read_chunk


def main_rows(root,manifest,key,table):
    for chunk in manifest['tables'][table]['chunks']:
        for row in read_chunk(root,chunk,key):
            if row['sourceSystem']!=manifest['sourceSystem'] or row['sourceTable']!=table or row['sourcePk']!=row['values']['id']:
                raise ValueError('Source ownership envelope changed')
            yield row


def recent_cohort(root,manifest,key):
    end=dt.datetime.fromisoformat(manifest['startedAt'].replace('Z','+00:00'))
    if end.tzinfo is None: raise ValueError('Snapshot time must have an authoritative timezone')
    end=end.astimezone(dt.timezone.utc);start=end-dt.timedelta(days=30);users=[]
    for row in main_rows(root,manifest,key,'app_user_user'):
        value=row['values'].get('last_login')
        if not value: continue
        if not isinstance(value,dict) or value.get('type')!='datetime': raise ValueError('Invalid source login timestamp')
        moment=dt.datetime.fromisoformat(value['utc'].replace('Z','+00:00'))
        if moment.tzinfo is None: raise ValueError('Source login timestamp has no timezone')
        if start<=moment<=end: users.append(row['sourcePk'])
    return {'identity':checkpoint_identity(manifest),'criterion':'USER_LAST_LOGIN_30_DAYS','windowStart':start.isoformat(),'windowEnd':end.isoformat(),'sourceUserIds':sorted(set(users))}


def selection_id(cohort):
    return hashlib.sha256(json.dumps(cohort,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def ensure_tables(db):
    db.execute('CREATE TABLE IF NOT EXISTS asset_selections (id TEXT PRIMARY KEY, payload BLOB NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS selection_refs (selection_id TEXT NOT NULL,reference_id TEXT NOT NULL,PRIMARY KEY(selection_id,reference_id))')
    db.execute('CREATE TABLE IF NOT EXISTS selection_objects (selection_id TEXT NOT NULL,object_id TEXT NOT NULL,PRIMARY KEY(selection_id,object_id))')


def reference_inventory(db,sid):
    digest=hashlib.sha256();count=0
    for row in db.execute('SELECT r.id,r.table_name,r.source_pk,r.ordinal,r.object_id,r.payload FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=? ORDER BY s.reference_id',(sid,)):
        digest.update(json.dumps(row[:5],separators=(',',':')).encode());digest.update(row[5]);count+=1
    return {'referenceCount':count,'referenceDigest':digest.hexdigest()}


def validate_object(identity,payload,status,result,digest,size,key):
    original=unseal(payload,key,identity)
    if hashlib.sha256(json.dumps(original['identity'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()!=identity: raise ValueError('Asset identity changed')
    if status=='PENDING':
        if result is not None or digest is not None or size is not None: raise ValueError('Unauthenticated pending result')
    elif status in {'AVAILABLE','MISSING'}:
        value=unseal(result,key,identity) if result else None
        if not value or value['status']!=status or value.get('sha256')!=digest or value.get('sizeBytes')!=size: raise ValueError('Asset result changed')
    else: raise ValueError('Unknown asset status')


def validate_selection(db,root,manifest,key,sid):
    if not re.fullmatch(r'[a-f0-9]{64}',sid or ''): raise ValueError('Invalid asset selection')
    entry=db.execute('SELECT value FROM state WHERE name="namespace"').fetchone()
    if not entry or unseal(bytes.fromhex(entry[0]),key,'index:namespace')!=checkpoint_identity(manifest): raise ValueError('Asset index belongs to another package')
    ensure_tables(db)
    row=db.execute('SELECT payload FROM asset_selections WHERE id=?',(sid,)).fetchone()
    if not row: raise ValueError('Unknown asset selection')
    descriptor=unseal(row[0],key,'selection:'+sid)
    cohort=recent_cohort(root,manifest,key)
    if selection_id(cohort)!=sid or any(descriptor.get(k)!=v for k,v in cohort.items()): raise ValueError('Asset selection belongs to another cohort or snapshot')
    inventory=reference_inventory(db,sid)
    members=db.execute('SELECT COUNT(*) FROM selection_refs WHERE selection_id=?',(sid,)).fetchone()[0]
    if members!=inventory['referenceCount'] or any(descriptor.get(k)!=v for k,v in inventory.items()): raise ValueError('Asset selection reference inventory changed')
    users=set(cohort['sourceUserIds'])
    for identity,table,pk,ordinal,object_id,payload in db.execute('SELECT r.id,r.table_name,r.source_pk,r.ordinal,r.object_id,r.payload FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=?',(sid,)):
        ref=unseal(payload,key,identity)
        if ref['sourceTable']!=table or ref['sourcePk']!=pk or ref['ordinal']!=ordinal or ref['objectId']!=object_id or ref.get('sourceUserId') not in users: raise ValueError('Selected reference ownership changed')
    # Both sets must agree, including empty selections; an empty scope never means all assets.
    if db.execute('SELECT object_id FROM selection_objects WHERE selection_id=? EXCEPT SELECT r.object_id FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=? LIMIT 1',(sid,sid)).fetchone(): raise ValueError('Unreferenced object added to selection')
    if db.execute('SELECT r.object_id FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=? EXCEPT SELECT object_id FROM selection_objects WHERE selection_id=? LIMIT 1',(sid,sid)).fetchone(): raise ValueError('Object removed from selection')
    objects=db.execute('SELECT COUNT(*) FROM selection_objects WHERE selection_id=?',(sid,)).fetchone()[0]
    if objects!=descriptor['objectCount']: raise ValueError('Asset selection object count changed')
    covered=0
    for row in db.execute('SELECT o.id,o.payload,o.status,o.result,o.sha256,o.size_bytes FROM selection_objects s JOIN objects o ON o.id=s.object_id WHERE s.selection_id=?',(sid,)):
        validate_object(*row,key);covered+=1
    if covered!=objects: raise ValueError('Selected object missing from checkpoint')
    return descriptor


def selection_counts(db,sid,frozen=False):
    table='selected_scope_objects' if frozen else 'selection_objects'
    return dict(db.execute('SELECT o.status,COUNT(*) FROM '+table+' s JOIN objects o ON o.id=s.object_id WHERE s.selection_id=? GROUP BY o.status',(sid,)))


def freeze_selection(db,root,manifest,key,sid,receipt_allow_pending=None):
    """Authenticate and copy membership within one SQLite read snapshot."""
    if db.in_transaction: raise ValueError('Selection snapshot requires an idle checkpoint connection')
    db.execute('BEGIN')
    try:
        descriptor=validate_selection(db,root,manifest,key,sid)
        if receipt_allow_pending is not None: selection_receipt(root,key,descriptor,db,receipt_allow_pending)
        db.execute('CREATE TEMP TABLE selected_scope_refs (selection_id TEXT,reference_id TEXT,PRIMARY KEY(selection_id,reference_id))')
        db.execute('CREATE TEMP TABLE selected_scope_objects (selection_id TEXT,object_id TEXT,PRIMARY KEY(selection_id,object_id))')
        db.execute('INSERT INTO selected_scope_refs SELECT selection_id,reference_id FROM selection_refs WHERE selection_id=?',(sid,))
        db.execute('INSERT INTO selected_scope_objects SELECT selection_id,object_id FROM selection_objects WHERE selection_id=?',(sid,))
        db.commit()
        return descriptor
    except Exception:
        db.rollback()
        raise


def build_recent_selection(root,manifest,key,progress=None):
    if manifest.get('sourceSystem')!='abeiai-v1' or not manifest.get('validationPassed') or not manifest.get('dataSnapshotComplete') or not manifest.get('assetsScanComplete'): raise ValueError('Validated complete asset index required')
    cohort=recent_cohort(root,manifest,key);sid=selection_id(cohort);users=set(cohort['sourceUserIds'])
    with open_index(root) as db:
        ensure_tables(db)
        if db.execute('SELECT 1 FROM asset_selections WHERE id=?',(sid,)).fetchone(): return validate_selection(db,root,manifest,key,sid)
        db.execute('BEGIN IMMEDIATE')
        if progress: progress({'phase':'recent-selection-validating-index','userCount':len(users)})
        validate_index(db,manifest,key)
        # Owner values exist only in memory and authenticated payloads, never new plaintext files.
        db.execute('PRAGMA temp_store=MEMORY')
        db.execute('CREATE TEMP TABLE recent_sources (table_name TEXT,source_pk TEXT,owner TEXT,PRIMARY KEY(table_name,source_pk))')
        subjects={row['sourcePk']:row['values'].get('user_id') for row in main_rows(root,manifest,key,'app_ai_chatsubject') if row['values'].get('user_id') in users}
        for table,info in manifest['tables'].items():
            if table=='app_distribution_withdrawalrecord': continue
            if table not in {'app_user_user','app_ai_chatmessage'} and 'user_id' not in info['columns']: continue
            owned=0
            for row in main_rows(root,manifest,key,table):
                owner=row['sourcePk'] if table=='app_user_user' else subjects.get(row['values'].get('subject_id')) if table=='app_ai_chatmessage' else row['values'].get('user_id')
                if owner in users:
                    db.execute('INSERT INTO recent_sources VALUES (?,?,?)',(table,row['sourcePk'],owner));owned+=1
            if progress: progress({'phase':'recent-selection-source','table':table,'ownedRows':owned})
        db.execute('INSERT INTO selection_refs SELECT ?,r.id FROM recent_sources s JOIN refs r ON r.table_name=s.table_name AND r.source_pk=s.source_pk',(sid,))
        for identity,payload,owner in db.execute('SELECT r.id,r.payload,c.owner FROM selection_refs s JOIN refs r ON r.id=s.reference_id JOIN recent_sources c ON c.table_name=r.table_name AND c.source_pk=r.source_pk WHERE s.selection_id=?',(sid,)):
            if unseal(payload,key,identity).get('sourceUserId')!=owner: raise ValueError('Source/reference owner mismatch')
        db.execute('INSERT INTO selection_objects SELECT DISTINCT ?,r.object_id FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=?',(sid,sid))
        descriptor={**cohort,'selectionId':sid,**reference_inventory(db,sid),'objectCount':db.execute('SELECT COUNT(*) FROM selection_objects WHERE selection_id=?',(sid,)).fetchone()[0]}
        db.execute('INSERT INTO asset_selections VALUES (?,?)',(sid,seal(descriptor,key,'selection:'+sid)))
        validate_selection(db,root,manifest,key,sid)
        db.commit()
        if progress: progress({'phase':'recent-selection-finished','selectionId':sid,'userCount':len(users),'referenceCount':descriptor['referenceCount'],'objectCount':descriptor['objectCount'],'counts':selection_counts(db,sid)})
        return descriptor


def selection_receipt(root,key,descriptor,db,allow_pending=False):
    path='reports/selection-'+descriptor['selectionId']+'.enc'
    if allow_pending and not (Path(root)/path).exists(): return None
    receipt=read_chunk(root,{'file':path},key)[0]
    if receipt.get('selection')!=descriptor or receipt.get('counts')!=selection_counts(db,descriptor['selectionId']): raise ValueError('Selection receipt is stale or belongs to another selection')
    if not allow_pending and (not receipt.get('transferFinished') or receipt['counts'].get('PENDING',0)): raise ValueError('Selected transfers are not finished')
    return receipt


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--package',required=True);parser.add_argument('--key-file',required=True)
    args=parser.parse_args();key=Path(args.key_file).read_bytes();manifest=load_manifest(args.package,key)
    scope=build_recent_selection(args.package,manifest,key,progress=lambda value:print(json.dumps(value),flush=True))
    print(json.dumps({'selectionId':scope['selectionId']}),flush=True)


if __name__=='__main__':
    import os
    os.umask(0o077)
    try: main()
    except Exception as error:
        print(json.dumps({'phase':'recent-selection-failed','errorCategory':type(error).__name__}),flush=True)
        raise SystemExit(1)
