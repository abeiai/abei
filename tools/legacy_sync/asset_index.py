"""Encrypted asset payloads in a local checkpoint index; no database network access."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .package import read_chunk, load_manifest, write_manifest, write_chunk
from .assets import find_references, source_locator
from .object_transfer import SourceObjects, r2_client, transfer_one


def seal(value,key,identity):
    nonce=os.urandom(12)
    return nonce+AESGCM(key).encrypt(nonce,json.dumps(value,ensure_ascii=False,separators=(',',':')).encode(),identity.encode())


def unseal(value,key,identity):
    return json.loads(AESGCM(key).decrypt(value[:12],value[12:],identity.encode()))


def table_rows(root,manifest,key,table,restore_restricted=True):
    info=manifest['tables'][table]
    def restricted_rows():
        for chunk in info['restrictedChunks']: yield from read_chunk(root,chunk,key)
    restricted=iter(restricted_rows())
    current=next(restricted,None)
    for chunk in info['chunks']:
        for row in read_chunk(root,chunk,key):
            if current is not None and current['sourcePk']==row['sourcePk']:
                if restore_restricted: row={**row,'values':{**row['values'],**current['values']}}
                current=next(restricted,None)
            yield row


def open_index(root):
    root=Path(root).resolve()
    directory=root/'assets'
    if directory.is_symlink() or (directory/'index.sqlite').is_symlink(): raise ValueError('Asset index symlinks are forbidden')
    directory.mkdir(mode=0o700,exist_ok=True)
    if directory.resolve().parent!=root: raise ValueError('Asset index must stay inside package')
    database=sqlite3.connect(directory/'index.sqlite',timeout=30)
    os.chmod(directory/'index.sqlite',0o600)
    database.execute('PRAGMA journal_mode=WAL')
    database.execute('CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, payload BLOB NOT NULL, status TEXT NOT NULL DEFAULT "PENDING", result BLOB, sha256 TEXT, size_bytes INTEGER)')
    database.execute('CREATE INDEX IF NOT EXISTS objects_status ON objects(status)')
    database.execute('CREATE TABLE IF NOT EXISTS refs (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, source_pk TEXT NOT NULL, ordinal INTEGER NOT NULL, object_id TEXT NOT NULL, payload BLOB NOT NULL)')
    database.execute('CREATE INDEX IF NOT EXISTS refs_source ON refs(table_name,source_pk,ordinal)')
    database.execute('CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY,value TEXT NOT NULL)')
    return database


def checkpoint_identity(manifest):
    return {field:manifest.get(field) for field in ['sourceSystem','runId','schemaSha256']}


def table_digest(db,table):
    digest=hashlib.sha256();count=0
    for row in db.execute('SELECT id,source_pk,ordinal,object_id,payload FROM refs WHERE table_name=? ORDER BY source_pk,ordinal',(table,)):
        digest.update(json.dumps(row[:4],separators=(',',':')).encode());digest.update(row[4]);count+=1
    return {'count':count,'digest':digest.hexdigest()}


def validate_index(db,manifest,key,complete=True):
    entry=db.execute('SELECT value FROM state WHERE name="namespace"').fetchone()
    if not entry or unseal(bytes.fromhex(entry[0]),key,'index:namespace')!=checkpoint_identity(manifest): raise ValueError('Asset index belongs to another package')
    tables=set(manifest.get('tables',{}))-{'app_distribution_withdrawalrecord'}
    for table in tables:
        entry=db.execute('SELECT value FROM state WHERE name=?',('table:'+table,)).fetchone()
        if entry:
            if unseal(bytes.fromhex(entry[0]),key,'index:table:'+table)!=table_digest(db,table): raise ValueError('Asset reference inventory changed')
        elif complete: raise ValueError('Incomplete asset table inventory')
    if db.execute('SELECT 1 FROM refs r LEFT JOIN objects o ON o.id=r.object_id WHERE o.id IS NULL LIMIT 1').fetchone(): raise ValueError('Asset object is missing from checkpoint')
    if complete:
        counts=(db.execute('SELECT COUNT(*) FROM refs').fetchone()[0],db.execute('SELECT COUNT(*) FROM objects').fetchone()[0])
        if counts!=(manifest.get('assetReferenceCount'),manifest.get('assetObjectCount')): raise ValueError('Asset checkpoint counts do not match authenticated package')
    for identity,payload,status,result,digest,size in db.execute('SELECT id,payload,status,result,sha256,size_bytes FROM objects'):
        original=unseal(payload,key,identity)
        if hashlib.sha256(json.dumps(original['identity'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()!=identity: raise ValueError('Asset object identity changed')
        if status=='PENDING':
            if result is not None or digest is not None or size is not None: raise ValueError('Pending object contains unauthenticated completion')
        elif status in {'AVAILABLE','MISSING'}:
            if not result: raise ValueError('Completed object has no authenticated result')
            value=unseal(result,key,identity)
            if value['status']!=status or value.get('sha256')!=digest or value.get('sizeBytes')!=size: raise ValueError('Asset result checkpoint mismatch')
        else: raise ValueError('Unknown asset checkpoint status')
    return True


def build_index(root,manifest,key,origin_config,progress=None):
    if not manifest.get('validationPassed') or not manifest.get('dataSnapshotComplete'): raise ValueError('Source package must be fully validated')
    db=open_index(root)
    try:
        identity=checkpoint_identity(manifest)
        existing=db.execute('SELECT value FROM state WHERE name="namespace"').fetchone()
        if existing: validate_index(db,manifest,key,complete=False)
        else:
            if db.execute('SELECT 1 FROM refs LIMIT 1').fetchone() or db.execute('SELECT 1 FROM objects LIMIT 1').fetchone(): raise ValueError('Unbound asset checkpoint')
            db.execute('INSERT INTO state(name,value) VALUES (?,?)',('namespace',seal(identity,key,'index:namespace').hex()));db.commit()
        owners={row['sourcePk']:row['values'].get('user_id') for row in table_rows(root,manifest,key,'app_ai_chatsubject')}
        for table in manifest['tables']:
            if table=='app_distribution_withdrawalrecord': continue  # Financial records remain local encrypted archives.
            done=db.execute('SELECT value FROM state WHERE name=?',('table:'+table,)).fetchone()
            if done: continue
            count=0
            last_progress=time.monotonic()
            for row in table_rows(root,manifest,key,table):
                owner=owners.get(row['values'].get('subject_id')) if table=='app_ai_chatmessage' else None
                for ordinal,ref in enumerate(find_references(row,owner,origin_config.get('MEDIA_URL','/abei/'))):
                    policy_error=None
                    try: locator=source_locator(ref['originalUrl'],origin_config)
                    except ValueError:
                        locator={'provider':'REJECTED'}
                        policy_error={'status':'MISSING','errorCategory':'SourceURLPolicy'}
                    identity=locator if locator['provider']=='OSS' else {'url':ref['originalUrl']}
                    object_id=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
                    ref['objectId']=object_id
                    ref['ordinal']=ordinal
                    db.execute('INSERT OR IGNORE INTO objects(id,payload,status,result) VALUES (?,?,?,?)',(object_id,seal({'url':ref['originalUrl'],'hint':ref['mediaHint'],'identity':identity},key,object_id),'MISSING' if policy_error else 'PENDING',seal(policy_error,key,object_id) if policy_error else None))
                    db.execute('INSERT OR IGNORE INTO refs(id,table_name,source_pk,ordinal,object_id,payload) VALUES (?,?,?,?,?,?)',(ref['referenceId'],table,row['sourcePk'],ordinal,object_id,seal(ref,key,ref['referenceId'])))
                    count+=1
                if int(row['sourcePk'])%1000==0: db.commit()
                if progress and time.monotonic()-last_progress>=15:
                    db.commit()
                    progress({'phase':'asset-index-progress','table':table,'sourceRowsThroughPk':row['sourcePk'],'references':count})
                    last_progress=time.monotonic()
            db.execute('INSERT OR REPLACE INTO state(name,value) VALUES (?,?)',('table:'+table,seal(table_digest(db,table),key,'index:table:'+table).hex()))
            db.commit()
            if progress: progress({'phase':'asset-index','table':table,'references':count})
        manifest['assetsScanComplete']=True
        manifest['assetReferenceCount']=db.execute('SELECT COUNT(*) FROM refs').fetchone()[0]
        manifest['assetObjectCount']=db.execute('SELECT COUNT(*) FROM objects').fetchone()[0]
        write_manifest(root,manifest,key)
        return manifest
    finally: db.close()


def transfer_index(root,manifest,key,origin,client,public_base,workers=2,limit=None,retry_failed=False,progress=None,selection_id=None):
    if not manifest.get('validationPassed') or not manifest.get('dataSnapshotComplete') or not manifest.get('assetsScanComplete'): raise ValueError('Validated indexed package required')
    if not 1<=workers<=16: raise ValueError('Invalid transfer concurrency')
    db=open_index(root)
    try:
        descriptor=None
        if selection_id is not None:
            from .recent_assets import validate_selection,selection_counts,freeze_selection
            descriptor=freeze_selection(db,root,manifest,key,selection_id)
        else: validate_index(db,manifest,key)
        if retry_failed:
            if selection_id is None: db.execute('UPDATE objects SET status="PENDING",result=NULL,sha256=NULL,size_bytes=NULL WHERE status="MISSING"')
            else: db.execute('UPDATE objects SET status="PENDING",result=NULL,sha256=NULL,size_bytes=NULL WHERE status="MISSING" AND id IN (SELECT object_id FROM selected_scope_objects WHERE selection_id=?)',(selection_id,))
            db.commit()
        def execute(record):
            identity,payload=record
            value=unseal(payload,key,identity)
            try: result=transfer_one(origin,client,public_base,value['url'],value['hint'],manifest['sourceSystem'])
            except Exception as error:
                response=getattr(error,'response',None)
                details=response.get('Error') if isinstance(response,dict) else None
                code=details.get('Code') if isinstance(details,dict) else None
                result={'status':'MISSING','errorCategory':type(error).__name__,'errorCode':getattr(error,'status',None) or code,'errorReason':str(error)[:1000]}
            return identity,result
        completed=0
        after=''
        last_progress=time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            while limit is None or completed<limit:
                take=min(workers*4,limit-completed) if limit is not None else workers*4
                if selection_id is None: records=db.execute('SELECT id,payload FROM objects WHERE status="PENDING" ORDER BY rowid LIMIT ?', (take,)).fetchall()
                else: records=db.execute('SELECT o.id,o.payload FROM selected_scope_objects s CROSS JOIN objects o ON o.id=s.object_id WHERE s.selection_id=? AND s.object_id>? AND o.status="PENDING" ORDER BY s.object_id LIMIT ?',(selection_id,after,take)).fetchall()
                if not records: break
                after=records[-1][0]
                for identity,result in executor.map(execute,records):
                    db.execute('UPDATE objects SET status=?,result=?,sha256=?,size_bytes=? WHERE id=?',(result['status'],seal(result,key,identity),result.get('sha256'),result.get('sizeBytes'),identity))
                    db.commit()
                    completed+=1
                    if progress and time.monotonic()-last_progress>=15:
                        counts=selection_counts(db,selection_id,True) if selection_id is not None else dict(db.execute('SELECT status,COUNT(*) FROM objects GROUP BY status').fetchall())
                        copied=db.execute('SELECT COALESCE(SUM(size_bytes),0) FROM objects WHERE status="AVAILABLE"').fetchone()[0] if selection_id is None else db.execute('SELECT COALESCE(SUM(o.size_bytes),0) FROM selected_scope_objects s JOIN objects o ON o.id=s.object_id WHERE s.selection_id=? AND o.status="AVAILABLE"',(selection_id,)).fetchone()[0]
                        progress({'phase':'r2-transfer','selectionId':selection_id,'processedThisRun':completed,'counts':counts,'copiedBytes':copied})
                        last_progress=time.monotonic()
        if selection_id is not None:
            validate_selection(db,root,manifest,key,selection_id)
            counts=selection_counts(db,selection_id)
            report={'selection':descriptor,'coverage':'DIRECT_USER_OR_CHAT_SESSION','cohortAllAssetsRestored':False,'counts':counts,'transferFinished':not counts.get('PENDING',0),'assetsComplete':not counts.get('PENDING',0) and not counts.get('MISSING',0),'copiedBytes':db.execute('SELECT COALESCE(SUM(o.size_bytes),0) FROM selection_objects s JOIN objects o ON o.id=s.object_id WHERE s.selection_id=? AND o.status="AVAILABLE"',(selection_id,)).fetchone()[0]}
            write_chunk(root,'reports/selection-'+selection_id+'.enc',[report],key)
            if progress: progress({'phase':'selected-transfer-finished','selectionId':selection_id,'counts':counts,'transferFinished':report['transferFinished'],'assetsComplete':report['assetsComplete'],'copiedBytes':report['copiedBytes']})
            return report
        validate_index(db,manifest,key)
        counts=dict(db.execute('SELECT status,COUNT(*) FROM objects GROUP BY status').fetchall())
        manifest['assetTransferCounts']=counts
        manifest['assetTransferFinished']=counts.get('PENDING',0)==0
        manifest['assetsComplete']=manifest['assetTransferFinished'] and counts.get('MISSING',0)==0
        manifest['assetCopiedBytes']=db.execute('SELECT COALESCE(SUM(size_bytes),0) FROM objects WHERE status="AVAILABLE"').fetchone()[0]
        write_manifest(root,manifest,key)
        if progress: progress({'phase':'r2-transfer-batch-finished','counts':counts,'assetsComplete':manifest['assetsComplete']})
        return manifest
    finally: db.close()


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('--package',required=True)
    parser.add_argument('--key-file',required=True)
    parser.add_argument('--source-storage-env',action='append',required=True)
    parser.add_argument('--r2-env',required=True)
    parser.add_argument('--index-only',action='store_true')
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--retry-failed',action='store_true')
    parser.add_argument('--selection')
    args=parser.parse_args()
    key=Path(args.key_file).read_bytes()
    root=Path(args.package)
    manifest=load_manifest(root,key)
    origin=SourceObjects(args.source_storage_env)
    progress=lambda value:print(json.dumps(value),flush=True)
    if args.selection:
        if args.index_only: raise ValueError('Selection transfer cannot rebuild the index')
        with open_index(root) as db:
            from .recent_assets import validate_selection
            validate_selection(db,root,manifest,key,args.selection)
    else: manifest=build_index(root,manifest,key,origin.config,progress)
    if not args.index_only:
        client,public_base=r2_client(args.r2_env)
        transfer_index(root,manifest,key,origin,client,public_base,args.workers,args.limit,args.retry_failed,progress,selection_id=args.selection)


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'phase':'asset-transfer-failed','errorCategory':type(error).__name__}),flush=True)
        raise SystemExit(1)
