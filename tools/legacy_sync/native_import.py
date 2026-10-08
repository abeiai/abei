"""Offline additive native import; connects exclusively to guarded local PostgreSQL."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
import sqlite3
from pathlib import Path
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb
from .asset_index import table_rows, open_index, unseal, validate_index
from .export import validate_package
from .package import load_manifest, read_chunk, write_chunk
from .native_mapping import SOURCE_SYSTEM, LOG_KINDS, native_id, identity_values, user_identity, log_row, book_row, json_value, text, timestamp
from .object_transfer import env_values

NATIVE_TABLES=frozenset({'users','legacy_ai_sessions','legacy_ai_logs','legacy_ai_session_items','legacy_ai_log_assets','media_assets','picture_books'})
JSON_FIELDS=frozenset({'metadata','parameters','messages','characters','pages'})


def verify_mp_namespace(values,context):
    return bool(values.get('WECHAT_APP_ID')) and hashlib.sha256(values['WECHAT_APP_ID'].encode()).hexdigest()==context['sourceAppIdSha256']


class BulkInsert:
    def __init__(self,connection,table,columns,progress=None):
        if table not in NATIVE_TABLES: raise ValueError('No importer exists for this target table')
        self.connection=connection; self.table=table; self.columns=list(columns); self.pending=[]; self.pending_bytes=0; self.rows=0; self.progress=progress
        self.projection=sql.SQL(',').join(map(sql.Identifier,self.columns))
        connection.execute('DROP TABLE IF EXISTS pg_temp.legacy_migration_stage')
        connection.execute(sql.SQL('CREATE TEMP TABLE legacy_migration_stage AS SELECT {} FROM {} WITH NO DATA').format(self.projection,sql.Identifier(table)))
        connection.commit()
    def add(self,row):
        if set(row)!=set(self.columns): raise ValueError('Native projection changed')
        self.pending.append(tuple(Jsonb(row[key]) if key in JSON_FIELDS and row[key] is not None else row[key] for key in self.columns))
        self.pending_bytes+=sum(len(value)*4 if isinstance(value,str) else len(json.dumps(value,ensure_ascii=False))*4 if name in JSON_FIELDS and value is not None else 32 for name,value in row.items())
        if len(self.pending)>=2000 or self.pending_bytes>=32*1024*1024: self.flush()
    def flush(self):
        if not self.pending: return
        with self.connection.cursor() as cursor:
            with cursor.copy(sql.SQL('COPY legacy_migration_stage ({}) FROM STDIN').format(self.projection)) as copy:
                for row in self.pending: copy.write_row(row)
            cursor.execute(sql.SQL('INSERT INTO {} ({}) SELECT {} FROM legacy_migration_stage ON CONFLICT (id) DO NOTHING').format(sql.Identifier(self.table),self.projection,self.projection))
            cursor.execute('TRUNCATE legacy_migration_stage')
        self.connection.commit()
        self.rows+=len(self.pending); self.pending.clear();self.pending_bytes=0
        if self.progress: self.progress({'phase':'native-import','table':self.table,'processed':self.rows})


def bulk_rows(conn,table,rows,progress=None):
    iterator=iter(rows); first=next(iterator,None)
    if first is None: return 0
    writer=BulkInsert(conn,table,first,progress)
    writer.add(first)
    for row in iterator: writer.add(row)
    writer.flush()
    return writer.rows


def refs_for(db,key,table,pk):
    result=[]
    if db is None: return result
    for identity,ordinal,object_id,payload,status,encoded in db.execute('SELECT r.id,r.ordinal,r.object_id,r.payload,o.status,o.result FROM refs r JOIN objects o ON o.id=r.object_id WHERE r.table_name=? AND r.source_pk=? ORDER BY r.ordinal',(table,pk)):
        ref=unseal(payload,key,identity)
        if ref['sourceTable']!=table or ref['sourcePk']!=pk or ref['ordinal']!=ordinal or ref['objectId']!=object_id: raise ValueError('Asset reference checkpoint mismatch')
        value=unseal(encoded,key,object_id) if encoded else {'status':'PENDING'}
        if value['status']!=status: raise ValueError('Asset transfer status checkpoint mismatch')
        result.append((ref,value))
    return result


def replacement_urls(db,key,table,pk):
    return {ref['originalUrl']:value['publicUrl'] for ref,value in refs_for(db,key,table,pk) if value['status']=='AVAILABLE'}


def version_labels(root,manifest,key):
    labels={}
    for kind,prefix in [('CHAT','llm'),('IMAGE','draw'),('AUDIO','tts'),('VIDEO','video')]:
        models={row['sourcePk']:row['values'] for row in table_rows(root,manifest,key,'app_ai_'+prefix+'model',False)}
        for row in table_rows(root,manifest,key,'app_ai_'+prefix+'version',False):
            v=row['values']; model=models.get(v.get('model_id'),{})
            labels[(kind,row['sourcePk'])]={'providerName':text(model.get('title')) or text(model.get('class_name')),'modelName':text(v.get('model_name')),'versionName':text(v.get('title')) or text(v.get('key')),'voiceName':text(v.get('role_name')) if kind=='AUDIO' else None}
    return labels


def preflight_package(root,key,target_url,mp_identity_verified=False,allow_unindexed=False):
    from .native_mapping import target_guard
    target_guard(target_url)
    manifest=load_manifest(root,key)
    if manifest.get('sourceSystem')!=SOURCE_SYSTEM or not manifest.get('validationPassed') or (not allow_unindexed and not manifest.get('assetsScanComplete')): raise ValueError('Completed indexed package required')
    validate_package(root,key)
    rows=list(table_rows(root,manifest,key,'app_user_user',False))
    imported={native_id('user',row['sourcePk']) for row in rows}
    counts={field:Counter() for field in ['email','phone','wechatMpOpenId','wechatUnionId']}
    for row in rows:
        for field,value in identity_values(row['values']).items():
            if value: counts[field][value]+=1
    with psycopg.connect(target_url.split('?')[0],connect_timeout=10) as conn:
        conn.execute('SET TRANSACTION READ ONLY')
        if conn.execute('SELECT current_database(),inet_server_port()').fetchone()!=('abei',3604): raise ValueError('Wrong native target')
        existing={field:set() for field in counts}
        for target_id,email,phone,mp,union in conn.execute('SELECT id,email,phone,"wechatMpOpenId","wechatUnionId" FROM users'):
            if target_id not in imported:
                for field,value in zip(existing,[email,phone,mp,union]):
                    if value: existing[field].add(value)
        conflicts=Counter()
        for row in rows: conflicts.update(user_identity(row['values'],counts,existing)[1])
        before={table:conn.execute(sql.SQL('SELECT COUNT(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in sorted(NATIVE_TABLES|{'ai_tasks','wallets','payment_orders','admin_users','ledger_entries'})}
        if manifest.get('assetsScanComplete'):
            with open_index(root) as db: validate_index(db,manifest,key)
        report={'phase':'native-preflight','runId':manifest['runId'],'sourceUsers':len(rows),'sourceLogs':{table:manifest['tables'][table]['count'] for table in LOG_KINDS},'sourceProducts':manifest['tables']['app_ai_product']['count'],'identityConflicts':dict(conflicts),'mpIdentityVerified':mp_identity_verified,'targetBeforeCounts':before,'assetCounts':manifest.get('assetTransferCounts',{}),'sourceTablesArchived':len(manifest['tables']),'financeActivated':False}
        write_chunk(root,'reports/native-preflight.enc',[report],key)
        return report


def import_package(root,key,target_url,testing=False,phase='all',allow_pending=False,progress=None,mp_identity_verified=False):
    from .native_mapping import target_guard
    target_guard(target_url,testing)
    root=Path(root)
    manifest=load_manifest(root,key)
    if manifest.get('sourceSystem')!=SOURCE_SYSTEM or not manifest.get('validationPassed') or (phase!='core' and not manifest.get('assetsScanComplete')): raise ValueError('Authenticated completed source package with asset index required')
    validate_package(root,key)
    if not allow_pending and not manifest.get('assetTransferFinished'): raise ValueError('Asset transfers must finish before final import')
    if phase not in {'all','records','assets','core'}: raise ValueError('Unknown import phase')
    report={'sourceSystem':SOURCE_SYSTEM,'runId':manifest['runId'],'phase':phase,'assetTransferFinished':manifest.get('assetTransferFinished',False),'sourceUserRows':manifest['tables']['app_user_user']['count'],'sourceLogRows':sum(manifest['tables'][table]['count'] for table in LOG_KINDS),'identityConflicts':Counter(),'booksArchived':Counter(),'ttsLinksUnresolved':0}
    with psycopg.connect(target_url.split('?')[0],connect_timeout=10) as conn:
        target=conn.execute('SELECT current_database(),inet_server_port()').fetchone()
        if target!=(('abei_wechat_test',3606) if testing else ('abei',3604)): raise ValueError('Target server identity mismatch')
        # Exclusive migration session lock; target application remains usable.
        if not conn.execute('SELECT pg_try_advisory_lock(626234801)').fetchone()[0]: raise ValueError('Another local legacy importer is active')
        db=None if phase=='core' else open_index(root)
        lookup=None
        try:
            if db is not None: validate_index(db,manifest,key)
            users_source=list(table_rows(root,manifest,key,'app_user_user',False))
            imported_ids={native_id('user',row['sourcePk']) for row in users_source}
            existing={field:set() for field in ['email','phone','wechatMpOpenId','wechatUnionId']}
            users={}
            for target_id,email,phone,mp,union in conn.execute('SELECT id,email,phone,"wechatMpOpenId","wechatUnionId" FROM users'):
                if target_id not in imported_ids:
                    for field,value in zip(existing,[email,phone,mp,union]):
                        if value: existing[field].add(value)
            counts={field:Counter() for field in existing}
            for row in users_source:
                for field,value in identity_values(row['values']).items():
                    if value: counts[field][value]+=1
            hashes={row['sourcePk']:row['values']['password'] for chunk in manifest['tables']['app_user_user']['credentialChunks'] for row in read_chunk(root,chunk,key)}
            if phase in {'all','records','core'}:
                def user_rows():
                    for row in users_source:
                        v=row['values']; pk=row['sourcePk']; identity,conflicts=user_identity(v,counts,existing,namespace_verified=mp_identity_verified)
                        report['identityConflicts'].update(conflicts)
                        if not mp_identity_verified:
                            report['wechatMpIdentityDeferred']=report.get('wechatMpIdentityDeferred',0)+bool(v.get('openid'))
                        password_hash=hashes[pk]
                        enabled=isinstance(password_hash,str) and bool(__import__('re').fullmatch(r'pbkdf2_sha256\$[1-9]\d{0,6}\$[^$]{1,128}\$[A-Za-z0-9+/]{43}=',password_hash)) and int(password_hash.split('$')[1])<=2000000
                        urls=replacement_urls(db,key,'app_user_user',pk)
                        yield {'id':native_id('user',pk),**identity,'passwordHash':password_hash,'passwordLoginEnabled':enabled,'nickname':text(v.get('nickname')) or text(v.get('username')) or '旧版用户 '+pk,'avatarUrl':urls.get(v.get('avatar')),'lastLoginAt':timestamp(v['last_login']) if v.get('last_login') else None,'createdAt':timestamp(v['date_joined']),'updatedAt':timestamp(v['date_joined'])}
                bulk_rows(conn,'users',user_rows(),progress)
            # Never attribute missing source owners to a local test user.
            valid_ids={row[0] for row in conn.execute('SELECT id FROM users WHERE id=ANY(%s)',(list(imported_ids),))}
            users={row['sourcePk']:native_id('user',row['sourcePk']) for row in users_source if native_id('user',row['sourcePk']) in valid_ids}
            del hashes,users_source
            subjects={row['sourcePk']:{field:row['values'].get(field) for field in ['user_id','chat_system','version_id']} for row in table_rows(root,manifest,key,'app_ai_chatsubject',False)}
            if phase in {'all','records','core'}:
                def session_rows():
                    for table in ['app_ai_chatsubject','app_ai_ttssubject']:
                        for row in table_rows(root,manifest,key,table,False):
                            v=row['values']; owner=v.get('user_id')
                            yield {'id':native_id('session:'+table,row['sourcePk']),'sourceSystem':SOURCE_SYSTEM,'sourceTable':table,'sourcePk':row['sourcePk'],'sourceMsgId':v.get('msg_id'),'sourceUserId':owner,'userId':users.get(owner),'title':None,'systemPrompt':text(v.get('chat_system')),'metadata':{'source':v},'requestedAt':timestamp(v['create_time'] if table=='app_ai_chatsubject' else v['req_time'])}
                bulk_rows(conn,'legacy_ai_sessions',session_rows(),progress)
                versions=version_labels(root,manifest,key)
                for table in LOG_KINDS:
                    bulk_rows(conn,'legacy_ai_logs',(log_row(row,users,subjects,versions) for row in table_rows(root,manifest,key,table,False)),progress)
                def chat_links():
                    positions=defaultdict(int)
                    for row in table_rows(root,manifest,key,'app_ai_chatmessage',False):
                        v=row['values']; subject=v.get('subject_id')
                        if subject not in subjects: continue
                        position=positions[subject];positions[subject]+=1
                        yield {'id':native_id('chat-link',row['sourcePk']),'sessionId':native_id('session:app_ai_chatsubject',subject),'logId':native_id('app_ai_chatmessage',row['sourcePk']),'position':position,'sourceMsgId':v.get('msg_id'),'sourceVersionId':subjects[subject].get('version_id'),'sourceHash':None}
                bulk_rows(conn,'legacy_ai_session_items',chat_links(),progress)
                # Local temporary lookup supports millions of reused TTS messages without a target schema migration.
                lookup=db if db is not None else sqlite3.connect(':memory:')
                lookup.execute('CREATE TEMP TABLE tts_lookup (msg TEXT, owner TEXT, version TEXT, hash TEXT, log_id TEXT)')
                lookup.execute('CREATE INDEX temp.tts_lookup_identity ON tts_lookup(msg,owner,version,hash)')
                for row in table_rows(root,manifest,key,'app_ai_ttsmessage',False):
                    v=row['values']; content=text(v.get('user_content'))
                    if content and v.get('user_id') and v.get('msg_id'):
                        digest=hashlib.md5((content+'_'+str(v.get('version_id'))).encode(),usedforsecurity=False).hexdigest()
                        lookup.execute('INSERT INTO tts_lookup VALUES (?,?,?,?,?)',(v['msg_id'].replace('-',''),v['user_id'],v.get('version_id'),digest,native_id('app_ai_ttsmessage',row['sourcePk'])))
                def tts_links():
                    for row in table_rows(root,manifest,key,'app_ai_ttssubject',False):
                        v=row['values']; body=json_value(v.get('body'),[])
                        if not isinstance(body,list): body=[]
                        for position,item in enumerate(body):
                            if not isinstance(item,dict): report['ttsLinksUnresolved']+=1; continue
                            msg=str(item.get('msg_id') or '').replace('-',''); version=str(item.get('version_id') or ''); digest=item.get('hash_str')
                            expected=hashlib.md5((str(item.get('user_content') or '')+'_'+version).encode(),usedforsecurity=False).hexdigest()
                            matches=lookup.execute('SELECT log_id FROM tts_lookup WHERE msg=? AND owner=? AND version=? AND hash=? LIMIT 2',(msg,v.get('user_id'),version,digest)).fetchall() if digest==expected and v.get('user_id') else []
                            log=matches[0][0] if len(matches)==1 else None
                            if not log: report['ttsLinksUnresolved']+=1
                            yield {'id':native_id('tts-link',row['sourcePk']+':'+str(position)),'sessionId':native_id('session:app_ai_ttssubject',row['sourcePk']),'logId':log,'position':position,'sourceMsgId':msg or None,'sourceVersionId':version or None,'sourceHash':digest}
                bulk_rows(conn,'legacy_ai_session_items',tts_links(),progress)
                def books():
                    for row in table_rows(root,manifest,key,'app_ai_product',False):
                        book,reason=book_row(row,users,replacement_urls(db,key,'app_ai_product',row['sourcePk']))
                        if reason: report['booksArchived'][reason]+=1
                        else: yield book
                report['compatibleBooksProcessed']=bulk_rows(conn,'picture_books',books(),progress)
            if db is not None:
                def asset_rows():
                    for table in LOG_KINDS:
                        for pk, in db.execute('SELECT DISTINCT source_pk FROM refs WHERE table_name=?',(table,)).fetchall():
                            for ref,value in refs_for(db,key,table,pk):
                                mime=value.get('mimeType'); hint=ref['mediaHint'].upper()
                                yield {'id':native_id('log-asset',ref['referenceId']),'logId':native_id(table,pk),'position':ref['ordinal'],'role':ref['role'],'fieldPath':ref['fieldPath'],'mediaType':mime.split('/')[0].upper() if mime else hint,'status':value['status'],'filename':value.get('objectKey','').split('/')[-1] or None,'mimeType':mime,'storageKey':'r2:'+value['objectKey'] if value['status']=='AVAILABLE' else None,'sha256':value.get('sha256')}
                bulk_rows(conn,'legacy_ai_log_assets',asset_rows(),progress)
            if phase in {'all','assets'}:
                def media_rows():
                    for ref_id,payload,object_id,status,encoded in db.execute('SELECT r.id,r.payload,r.object_id,o.status,o.result FROM refs r JOIN objects o ON o.id=r.object_id WHERE o.status="AVAILABLE"'):
                        ref=unseal(payload,key,ref_id); value=unseal(encoded,key,object_id)
                        if value['status']!=status or not value['objectKey'].startswith('picture-books/legacy-sync/abeiai-v1/'): raise ValueError('Invalid available R2 object')
                        owner=users.get(ref.get('sourceUserId')); filename=value['objectKey'].removeprefix('picture-books/')
                        yield {'id':native_id('media',value['objectKey']+':'+(owner or 'unowned')),'filename':filename,'originalName':value['objectKey'].split('/')[-1],'mimeType':value['mimeType'],'size':value['sizeBytes'],'url':value['publicUrl'],'mediaType':value['mimeType'].split('/')[0].upper(),'sourceType':'USER_UPLOAD','storageProvider':'S3','createdByUserId':owner}
                report['availableMediaReferences']=bulk_rows(conn,'media_assets',media_rows(),progress)
                # Only imported records are updated; interactive changes are not overwritten.
                for row in table_rows(root,manifest,key,'app_user_user',False):
                    urls=replacement_urls(db,key,'app_user_user',row['sourcePk']); avatar=urls.get(row['values'].get('avatar'))
                    if avatar: conn.execute('UPDATE users SET "avatarUrl"=%s WHERE id=%s AND "avatarUrl" IS NULL',(avatar,users.get(row['sourcePk'])))
                for row in table_rows(root,manifest,key,'app_ai_product',False):
                    book,reason=book_row(row,users,replacement_urls(db,key,'app_ai_product',row['sourcePk']))
                    if book: conn.execute('UPDATE picture_books SET pages=%s,status=%s WHERE id=%s AND version=0 AND "updatedAt"=%s',(Jsonb(book['pages']),book['status'],book['id'],book['updatedAt']))
                conn.commit()
                updates=[]
                for table in LOG_KINDS:
                    for pk, in db.execute('SELECT DISTINCT source_pk FROM refs WHERE table_name=?',(table,)).fetchall():
                        for ref,value in refs_for(db,key,table,pk):
                            updates.append((value['status'],value.get('mimeType'),'r2:'+value['objectKey'] if value['status']=='AVAILABLE' else None,value.get('sha256'),value.get('objectKey','').split('/')[-1] or None,native_id('log-asset',ref['referenceId'])))
                            if len(updates)>=2000:
                                conn.cursor().executemany('UPDATE legacy_ai_log_assets SET status=%s,"mimeType"=%s,"storageKey"=%s,sha256=%s,filename=%s WHERE id=%s',updates);conn.commit();updates=[]
                if updates: conn.cursor().executemany('UPDATE legacy_ai_log_assets SET status=%s,"mimeType"=%s,"storageKey"=%s,sha256=%s,filename=%s WHERE id=%s',updates);conn.commit()
            report['nativeLogRows']=conn.execute('SELECT COUNT(*) FROM legacy_ai_logs WHERE "sourceSystem"=%s',(SOURCE_SYSTEM,)).fetchone()[0]
            report['nativeUserRows']=len(users)
            report['identityConflicts']=dict(report['identityConflicts']);report['booksArchived']=dict(report['booksArchived'])
            write_chunk(root,'reports/native-'+phase+'.enc',[report],key)
            if progress: progress({'phase':'native-import-finished',**report})
            return report
        finally:
            if lookup is not None and lookup is not db: lookup.close()
            if db is not None: db.close()


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('--package',required=True);parser.add_argument('--key-file',required=True);parser.add_argument('--target-env',required=True)
    parser.add_argument('--phase',choices=['all','records','assets','core'],default='all');parser.add_argument('--allow-pending-assets',action='store_true');parser.add_argument('--verified-mp-identity-file')
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    values=env_values([args.target_env],{'DATABASE_URL','WECHAT_APP_ID'})
    verified=False
    if args.verified_mp_identity_file:
        context=json.loads(Path(args.verified_mp_identity_file).read_text())
        verified=verify_mp_namespace(values,context)
        if not verified: raise ValueError('Legacy/new MP identity namespace mismatch')
    key=Path(args.key_file).read_bytes()
    if args.dry_run: print(json.dumps(preflight_package(args.package,key,values['DATABASE_URL'],verified,allow_unindexed=args.phase=='core')),flush=True)
    else: import_package(args.package,key,values['DATABASE_URL'],phase=args.phase,allow_pending=args.allow_pending_assets,mp_identity_verified=verified,progress=lambda value:print(json.dumps(value),flush=True))


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'phase':'native-import-failed','errorCategory':type(error).__name__}),flush=True)
        raise SystemExit(1)
