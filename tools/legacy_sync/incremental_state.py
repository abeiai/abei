"""Read-only local reconciliation, authenticated receipts, and atomic cursor CAS."""
import argparse
from collections import Counter
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import tempfile
from urllib.parse import urlparse
import psycopg
from psycopg import sql
import requests
from .package import load_manifest,read_chunk,write_chunk
from .export import validate_package
from .asset_index import open_index,validate_index,table_rows,unseal
from .native_import import version_labels,refs_for,replacement_urls
from .native_mapping import SOURCE_SYSTEM,LOG_KINDS,target_guard,native_id,log_row,book_row
from .book_styles import resolve_book_styles
from .book_ratios import resolve_book_ratios
from .book_prompts import resolve_book_prompts
from .object_transfer import env_values,pinned_adapter
from .assets import validate_download_url
from .incremental import user_is_new


def read_cursor(path):
    path=Path(path)
    if path.is_symlink():raise ValueError('Cursor symlink is forbidden')
    return json.loads(path.read_text())


def atomic_cursor(path,value):
    path=Path(path)
    if path.is_symlink():raise ValueError('Cursor symlink is forbidden')
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with tempfile.NamedTemporaryFile(dir=path.parent,delete=False,mode='w') as out:
        temporary=Path(out.name);json.dump(value,out);out.flush();os.fsync(out.fileno())
    temporary.chmod(0o600);temporary.replace(path)


def initialize_cursor(path,root,key_file,missing_report=None):
    if not missing_report:raise ValueError("Explicit completed baseline asset scope is required")
    if Path(key_file).resolve().is_relative_to(Path(root).resolve()):raise ValueError("Baseline key must remain outside package")
    key=Path(key_file).read_bytes();m=load_manifest(root,key)
    report=read_chunk(root,{'file':'reports/native-core.enc'},key)[0]
    if not m.get('validationPassed') or report['runId']!=m['runId'] or report['nativeLogRows']!=report['sourceLogRows'] or report['nativeUserRows']!=report['sourceUserRows']:raise ValueError('Applied baseline receipt required')
    pending=[]
    if missing_report:
        assets=read_chunk(root,{'file':missing_report},key)[0]
        sid=assets['selection'].get('selectionId')
        if not re.fullmatch(r'[a-f0-9]{64}',sid or '') or assets['selection']['identity']['runId']!=m['runId'] or not assets['transferFinished'] or assets['counts'].get('PENDING',0):raise ValueError('Baseline asset receipt mismatch')
        reconciled=read_chunk(root,{'file':'reports/reconciliation-'+sid+'.enc'},key)[0]
        if reconciled.get('runId')!=m['runId'] or reconciled.get('selectionId')!=sid or reconciled.get('counts')!=assets['counts']:raise ValueError('Verified baseline scope reconciliation required')
        if assets['counts'].get('MISSING'):pending=[{'runId':m['runId'],'package':str(Path(root).resolve()),'keyFile':str(Path(key_file).resolve()),'receiptFile':missing_report,'missingCount':assets['counts']['MISSING']}]
    endpoint=m.get('sourceEndpointFingerprint')
    if not endpoint:
        binding=read_chunk(root,{'file':'metadata/source-endpoint.enc'},key)[0]
        if binding.get('runId')!=m['runId'] or binding.get('sourceFingerprint')!=m['sourceFingerprint']:raise ValueError('Baseline endpoint receipt mismatch')
        endpoint=binding.get('sourceEndpointFingerprint')
    if not re.fullmatch(r'[a-f0-9]{64}',endpoint or ''):raise ValueError('Baseline endpoint required')
    value={'protocol':1,'sourceEndpointFingerprint':endpoint,'runId':m['runId'],'sourceFingerprint':m['sourceFingerprint'],'package':str(Path(root).resolve()),'keyFile':str(Path(key_file).resolve()),'snapshotAt':m['startedAt'],'incompleteAssetPackages':pending}
    lock_path=Path(str(path)+'.lock');lock_path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with lock_path.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if Path(path).exists():
            if read_cursor(path)!=value:raise ValueError('Existing cursor must not be reinitialized')
        else:atomic_cursor(path,value)
    return value


def advance_cursor(path,root,key_file,key,manifest):
    if Path(key_file).resolve().is_relative_to(Path(root).resolve()):raise ValueError('Cursor key must remain outside package')
    report=read_chunk(root,{'file':'reports/incremental-reconciliation.enc'},key)[0]
    parent=manifest['incremental']['parentRunId']
    if report.get('runId')!=manifest['runId'] or report.get('parentRunId')!=parent or report.get('sourceFingerprint')!=manifest['sourceFingerprint'] or report.get('sourceEndpointFingerprint')!=manifest['sourceEndpointFingerprint'] or report.get('snapshotAt')!=manifest['startedAt'] or report.get('dataVerified') is not True or report.get('assetTransferFinished') is not True or report.get('assetCounts',{}).get('PENDING',0):raise ValueError('Verified finished delta receipt required')
    lock_path=Path(str(path)+'.lock')
    with lock_path.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX);current=read_cursor(path)
        if current.get('sourceFingerprint')!=manifest['sourceFingerprint'] or current.get('sourceEndpointFingerprint')!=manifest['sourceEndpointFingerprint']:raise ValueError('Cursor source mismatch')
        if current.get('runId')==manifest['runId']:
            if current.get('package')!=str(Path(root).resolve()) or current.get('keyFile')!=str(Path(key_file).resolve()):raise ValueError('Replayed cursor path mismatch')
            return current
        if current.get('runId')!=parent or current.get('snapshotAt')!=manifest['incremental']['since']:raise ValueError('Cursor parent is stale or branched')
        pending=list(current.get('incompleteAssetPackages',[]));missing=report['assetCounts'].get('MISSING',0)
        if missing:pending.append({'runId':manifest['runId'],'package':str(Path(root).resolve()),'keyFile':str(Path(key_file).resolve()),'receiptFile':'reports/incremental-reconciliation.enc','missingCount':missing})
        value={'protocol':1,'sourceEndpointFingerprint':manifest['sourceEndpointFingerprint'],'runId':manifest['runId'],'sourceFingerprint':manifest['sourceFingerprint'],'package':str(Path(root).resolve()),'keyFile':str(Path(key_file).resolve()),'snapshotAt':manifest['startedAt'],'incompleteAssetPackages':pending}
        atomic_cursor(path,value);return value


ASSET_FIELDS=('id','logId','position','role','fieldPath','mediaType','status','filename','mimeType','storageKey','sha256')

def verify_asset_batch(conn,expected):
    projection=sql.SQL(',').join(map(sql.Identifier,ASSET_FIELDS))
    rows=list(conn.execute(sql.SQL('SELECT {} FROM legacy_ai_log_assets WHERE id=ANY(%s)').format(projection),(list(expected),)))
    if len(rows)!=len(expected) or any(tuple(row)!=expected.get(row[0]) for row in rows):raise ValueError('Delta asset mapping or ownership mismatch')


def milliseconds(moment):
    return moment.replace(microsecond=0)+dt.timedelta(milliseconds=(moment.microsecond+500)//1000)


def reconcile_increment(root,key,target,public,testing=False):
    target_guard(target,testing);m=load_manifest(root,key);validate_package(root,key,record_validation=False)
    if not m.get('incremental') or not m.get('assetTransferFinished'):raise ValueError('Finished incremental package required')
    for phase in ('core','assets'):
        native=read_chunk(root,{'file':'reports/native-'+phase+'.enc'},key)[0]
        if native['runId']!=m['runId'] or native['nativeLogRows']!=native['sourceLogRows']:raise ValueError('Native delta receipt mismatch')
    with open_index(root) as db:
        validate_index(db,m,key);asset_counts=dict(db.execute('SELECT status,COUNT(*) FROM objects GROUP BY status'))
        if asset_counts.get('PENDING') or asset_counts!=m['assetTransferCounts']:raise ValueError('Unfinished or stale asset checkpoint')
        source_users=list(table_rows(root,m,key,'app_user_user',False));subject={r['sourcePk']:{k:r['values'].get(k) for k in ('user_id','version_id','chat_system')} for r in table_rows(root,m,key,'app_ai_chatsubject',False)}
        ids=[native_id('user',r['sourcePk']) for r in source_users];expected_assets=Counter();actual_assets=Counter();new_counts={};book_counts=Counter();media_want={}
        with psycopg.connect(target.split('?')[0],connect_timeout=10) as conn:
            conn.execute('SET TRANSACTION READ ONLY')
            if conn.execute('SELECT current_database(),inet_server_port()').fetchone()!=(('abei_wechat_test',3606) if testing else ('abei',3604)):raise ValueError('Wrong reconciliation target')
            present={r[0] for r in conn.execute('SELECT id FROM users WHERE id=ANY(%s)',(ids,))};users={r['sourcePk']:native_id('user',r['sourcePk']) for r in source_users if native_id('user',r['sourcePk']) in present}
            previous_user=int(m['incremental']['tables']['app_user_user']['fromPk'])
            if any(user_is_new(m,r['sourcePk']) and r['sourcePk'] not in users for r in source_users):raise ValueError('New source user coverage mismatch')
            versions=version_labels(root,m,key);fields=('sourceSystem','sourceTable','sourcePk','sourceUserId','userId','status','inputText','outputText','requestedAt','respondedAt');projection=sql.SQL(',').join(map(sql.Identifier,fields))
            for table in LOG_KINDS:
                for row in table_rows(root,m,key,table,False):
                    want=log_row(row,users,subject,versions)
                    got=conn.execute(sql.SQL('SELECT {} FROM legacy_ai_logs WHERE id=%s').format(projection),(want['id'],)).fetchone()
                    expected=tuple(milliseconds(want[k]) if k in ('requestedAt','respondedAt') and want[k] else want[k] for k in fields)
                    if got!=expected:raise ValueError('Generated log source reconciliation mismatch')
            for table in m['tables']:
                prior=int(m['incremental']['tables'][table]['fromPk']);new_counts[table]=sum(user_is_new(m,r['sourcePk']) if table=='app_user_user' else int(r['sourcePk'])>prior for r in table_rows(root,m,key,table,False))
            batch={}
            def check_assets():
                verify_asset_batch(conn,batch)
                for row in batch.values():actual_assets[row[6]]+=1
                batch.clear()
            for table in LOG_KINDS:
                for pk, in db.execute('SELECT DISTINCT source_pk FROM refs WHERE table_name=?',(table,)):
                    for ref,value in refs_for(db,key,table,pk):
                        mime=value.get('mimeType');filename=value.get('objectKey','').split('/')[-1] or None
                        row=(native_id('log-asset',ref['referenceId']),native_id(table,pk),ref['ordinal'],ref['role'],ref['fieldPath'],mime.split('/')[0].upper() if mime else ref['mediaHint'].upper(),value['status'],filename,mime,'r2:'+value['objectKey'] if value['status']=='AVAILABLE' else None,value.get('sha256'))
                        expected_assets[row[6]]+=1;batch[row[0]]=row
                        if len(batch)>=2000:check_assets()
            if batch:check_assets()
            if actual_assets!=expected_assets:raise ValueError('Delta asset association mismatch')
            for identity,payload,object_id,encoded in db.execute('SELECT r.id,r.payload,r.object_id,o.result FROM refs r JOIN objects o ON o.id=r.object_id WHERE o.status="AVAILABLE"'):
                ref=unseal(payload,key,identity);value=unseal(encoded,key,object_id)
                if ref['objectId']!=object_id or value['publicUrl']!=public.rstrip('/')+'/'+value['objectKey']:raise ValueError('Media identity or domain mismatch')
                owner=users.get(ref.get('sourceUserId'));media_want[native_id('media',value['objectKey']+':'+(owner or 'unowned'))]=(owner,value['publicUrl'],value['sizeBytes'],value['mimeType'])
            keys=list(media_want)
            for start in range(0,len(keys),2000):
                rows=conn.execute('SELECT id,"createdByUserId",url,size,"mimeType" FROM media_assets WHERE id=ANY(%s)',(keys[start:start+2000],)).fetchall()
                if len(rows)!=len(keys[start:start+2000]) or any(tuple(row[1:])!=media_want[row[0]] for row in rows):raise ValueError('Owned media reconciliation mismatch')
            styles=resolve_book_styles(conn,table_rows(root,m,key,'app_ai_product',False),table_rows(root,m,key,'app_ai_onetaketask',False))
            ratios=resolve_book_ratios(conn,table_rows(root,m,key,'app_ai_product',False),table_rows(root,m,key,'app_ai_onetaketask',False))
            prompts=resolve_book_prompts(conn,table_rows(root,m,key,'app_ai_product',False),table_rows(root,m,key,'app_ai_onetaketask',False))
            prior=int(m['incremental']['tables']['app_ai_product']['fromPk'])
            for row in table_rows(root,m,key,'app_ai_product',False):
                if int(row['sourcePk'])<=prior:book_counts['existingPreserved']+=1;continue
                book,reason=book_row(row,users,replacement_urls(db,key,'app_ai_product',row['sourcePk']),styles,ratios,prompts)
                if reason:book_counts['archived:'+reason]+=1
                else:
                    got=conn.execute('SELECT "userId",pages,style FROM picture_books WHERE id=%s',(book['id'],)).fetchone()
                    if got!=(book['userId'],book['pages'],book['style']):raise ValueError('New compatible book reconciliation mismatch')
                    book_counts['newCompatible']+=1
            target_counts={table:conn.execute(sql.SQL('SELECT COUNT(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in ('users','legacy_ai_logs','legacy_ai_log_assets','media_assets','picture_books','wallets','ledger_entries','payment_orders','admin_users','ai_tasks')}
        samples=[];seen=set()
        with requests.Session() as session:
            session.trust_env=False;session.mount('https://',pinned_adapter()[0])
            for identity,encoded in db.execute('SELECT id,result FROM objects WHERE status="AVAILABLE" ORDER BY id'):
                value=unseal(encoded,key,identity);kind=value['mimeType'].split('/')[0]
                if kind in seen:continue
                url=validate_download_url(value['publicUrl'],{urlparse(public).hostname})
                with session.get(url,stream=True,timeout=(10,60),allow_redirects=False) as response:
                    if response.status_code!=200:raise ValueError('R2 public readback failed')
                    digest=hashlib.sha256();size=0
                    for chunk in response.iter_content(1024*1024):digest.update(chunk);size+=len(chunk)
                    if digest.hexdigest()!=value['sha256'] or size!=value['sizeBytes']:raise ValueError('R2 readback hash mismatch')
                samples.append({'kind':kind,'sizeBytes':size,'sha256Matches':True});seen.add(kind)
                if len(seen)==3:break
        report={'sourceEndpointFingerprint':m['sourceEndpointFingerprint'],'runId':m['runId'],'parentRunId':m['incremental']['parentRunId'],'sourceFingerprint':m['sourceFingerprint'],'snapshotAt':m['startedAt'],'dataVerified':True,'assetTransferFinished':True,'assetCounts':asset_counts,'availableBytes':db.execute('SELECT COALESCE(SUM(size_bytes),0) FROM objects WHERE status="AVAILABLE"').fetchone()[0],'newSourceRows':new_counts,'bookCounts':dict(book_counts),'expectedLogAssetCounts':dict(expected_assets),'actualLogAssetCounts':dict(actual_assets),'publicReadbackSamples':samples,'targetCounts':target_counts,'fullSourceMirror':False}
        write_chunk(root,'reports/incremental-reconciliation.enc',[report],key);return report


def main():
    os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--package',required=True);p.add_argument('--key-file',required=True);p.add_argument('--cursor-file',required=True);p.add_argument('--target-env');p.add_argument('--r2-public-env');p.add_argument('--initialize',action='store_true');p.add_argument('--baseline-missing-report')
    a=p.parse_args()
    if a.initialize:initialize_cursor(a.cursor_file,a.package,a.key_file,a.baseline_missing_report);print(json.dumps({'phase':'increment-cursor-initialized'}));return
    if not a.target_env or not a.r2_public_env:raise ValueError('Explicit local target and public R2 configuration required')
    m=load_manifest(a.package,Path(a.key_file).read_bytes());cursor=read_cursor(a.cursor_file)
    if cursor['sourceFingerprint']!=m['sourceFingerprint'] or cursor.get('sourceEndpointFingerprint')!=m['sourceEndpointFingerprint'] or cursor['runId'] not in {m['incremental']['parentRunId'],m['runId']} or cursor['snapshotAt']!=(m['startedAt'] if cursor['runId']==m['runId'] else m['incremental']['since']):raise ValueError('Delta cursor parent mismatch')
    key=Path(a.key_file).read_bytes();target=env_values([a.target_env],{'DATABASE_URL'})['DATABASE_URL'];public=env_values([a.r2_public_env],{'S3_PUBLIC_BASE_URL'})['S3_PUBLIC_BASE_URL']
    r=reconcile_increment(a.package,key,target,public);advance_cursor(a.cursor_file,a.package,a.key_file,key,m)
    print(json.dumps({'phase':'increment-reconciled','runId':r['runId'],'assetCounts':r['assetCounts'],'availableBytes':r['availableBytes'],'newSourceRows':r['newSourceRows'],'bookCounts':r['bookCounts'],'publicReadbackSamples':r['publicReadbackSamples']}),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'phase':'increment-reconciliation-failed','errorCategory':type(error).__name__}),flush=True);raise SystemExit(1)
