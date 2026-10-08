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
from .package import read_chunk, load_manifest, write_manifest
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


def build_index(root,manifest,key,origin_config,progress=None):
    if not manifest.get('validationPassed') or not manifest.get('dataSnapshotComplete'): raise ValueError('Source package must be fully validated')
    db=open_index(root)
    try:
        owners={row['sourcePk']:row['values'].get('user_id') for row in table_rows(root,manifest,key,'app_ai_chatsubject')}
        for table in manifest['tables']:
            if table=='app_distribution_withdrawalrecord': continue  # Financial records remain local encrypted archives.
            done=db.execute('SELECT value FROM state WHERE name=?',('table:'+table,)).fetchone()
            if done: continue
            count=0
            for row in table_rows(root,manifest,key,table):
                owner=owners.get(row['values'].get('subject_id')) if table=='app_ai_chatmessage' else None
                for ordinal,ref in enumerate(find_references(row,owner)):
                    policy_error=None
                    try: locator=source_locator(ref['originalUrl'],origin_config)
                    except ValueError:
                        locator={'provider':'REJECTED'}
                        policy_error={'status':'MISSING','errorCategory':'SourceURLPolicy'}
                    identity=locator if locator['provider']=='OSS' else {'url':ref['originalUrl']}
                    object_id=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
                    ref['objectId']=object_id
                    ref['ordinal']=ordinal
                    db.execute('INSERT OR IGNORE INTO objects(id,payload,status,result) VALUES (?,?,?,?)',(object_id,seal({'url':ref['originalUrl'],'hint':ref['mediaHint']},key,object_id),'MISSING' if policy_error else 'PENDING',seal(policy_error,key,object_id) if policy_error else None))
                    db.execute('INSERT OR IGNORE INTO refs(id,table_name,source_pk,ordinal,object_id,payload) VALUES (?,?,?,?,?,?)',(ref['referenceId'],table,row['sourcePk'],ordinal,object_id,seal(ref,key,ref['referenceId'])))
                    count+=1
                if int(row['sourcePk'])%1000==0: db.commit()
            db.execute('INSERT OR REPLACE INTO state(name,value) VALUES (?,?)',('table:'+table,str(count)))
            db.commit()
            if progress: progress({'phase':'asset-index','table':table,'references':count})
        manifest['assetsScanComplete']=True
        manifest['assetReferenceCount']=db.execute('SELECT COUNT(*) FROM refs').fetchone()[0]
        manifest['assetObjectCount']=db.execute('SELECT COUNT(*) FROM objects').fetchone()[0]
        write_manifest(root,manifest,key)
        return manifest
    finally: db.close()


def transfer_index(root,manifest,key,origin,client,public_base,workers=2,limit=None,retry_failed=False,progress=None):
    if not manifest.get('validationPassed') or not manifest.get('dataSnapshotComplete') or not manifest.get('assetsScanComplete'): raise ValueError('Validated indexed package required')
    if not 1<=workers<=16: raise ValueError('Invalid transfer concurrency')
    db=open_index(root)
    try:
        if retry_failed:
            db.execute('UPDATE objects SET status="PENDING" WHERE status="MISSING"')
            db.commit()
        def execute(record):
            identity,payload=record
            value=unseal(payload,key,identity)
            try: result=transfer_one(origin,client,public_base,value['url'],value['hint'],manifest['sourceSystem'])
            except Exception as error:
                result={'status':'MISSING','errorCategory':type(error).__name__,'errorCode':getattr(error,'status',None) or getattr(error,'response',{}).get('Error',{}).get('Code')}
            return identity,result
        completed=0
        last_progress=time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            while limit is None or completed<limit:
                take=min(workers*4,limit-completed) if limit is not None else workers*4
                records=db.execute('SELECT id,payload FROM objects WHERE status="PENDING" ORDER BY rowid LIMIT ?', (take,)).fetchall()
                if not records: break
                for identity,result in executor.map(execute,records):
                    db.execute('UPDATE objects SET status=?,result=?,sha256=?,size_bytes=? WHERE id=?',(result['status'],seal(result,key,identity),result.get('sha256'),result.get('sizeBytes'),identity))
                    db.commit()
                    completed+=1
                    if progress and time.monotonic()-last_progress>=15:
                        progress({'phase':'r2-transfer','processedThisRun':completed,'counts':dict(db.execute('SELECT status,COUNT(*) FROM objects GROUP BY status').fetchall()),'copiedBytes':db.execute('SELECT COALESCE(SUM(size_bytes),0) FROM objects WHERE status="AVAILABLE"').fetchone()[0]})
                        last_progress=time.monotonic()
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
    args=parser.parse_args()
    key=Path(args.key_file).read_bytes()
    root=Path(args.package)
    manifest=load_manifest(root,key)
    origin=SourceObjects(args.source_storage_env)
    progress=lambda value:print(json.dumps(value),flush=True)
    manifest=build_index(root,manifest,key,origin.config,progress)
    if not args.index_only:
        client,public_base=r2_client(args.r2_env)
        transfer_index(root,manifest,key,origin,client,public_base,args.workers,args.limit,args.retry_failed,progress)


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'phase':'asset-transfer-failed','errorCategory':type(error).__name__}),flush=True)
        raise SystemExit(1)
