"""Guarded history-only insertion; never executes audio providers or billing."""
import base64
import json
from psycopg import sql
from .native_mapping import native_id
from .voice_history import TASK_COLUMNS,ASSET_COLUMNS


def validate_book_baseline(manifest,baseline):
    from datetime import datetime
    if baseline.get('validationPassed') is not True or baseline.get('incremental'):raise ValueError('Validated full book reference snapshot required')
    for field in ('sourceSystem','sourceFingerprint','schemaSha256'):
        if not baseline.get(field) or baseline[field]!=manifest.get(field):raise ValueError('Book reference namespace mismatch')
    if datetime.fromisoformat(baseline['startedAt'].replace('Z','+00:00'))>datetime.fromisoformat(manifest['startedAt'].replace('Z','+00:00')):raise ValueError('Book reference snapshot is newer than source')


def voice_import_sql(tasks,assets,public,database='abei'):
    if database not in {'abei','abei_wechat_test'} or not tasks or len({t['id'] for t in tasks})!=len(tasks) or len({a['id'] for a in assets})!=len(assets):raise ValueError('Distinct isolated abei history required')
    by_asset={a['id']:a for a in assets}
    for task in tasks:
        proof=task['providerPayload'].get('legacyImport',{})
        if (set(task)!=set(TASK_COLUMNS) or proof.get('sourceSystem')!='abeiai-v1' or proof.get('sourceTable')!='app_ai_ttsmessage'
            or proof.get('logId')!=native_id('app_ai_ttsmessage',proof.get('sourcePk')) or task['id']!=native_id('voice-history:app_ai_ttsmessage',proof.get('sourcePk'))
            or task['type']!='TTS' or task['status'] not in {'SUCCEEDED','FAILED','CANCELLED'} or task['learnerId'] is not None
            or task['provider']!='abeiai-v1' or task['model']!='旧版语音合成' or task['estimatedCredits']!=0 or task['actualCredits'] is not None
            or task['providerPayload'].get('source')!='EXPERIENCE' or not proof.get('snapshotAt')):raise ValueError('Only unbilled legacy history accepted')
        if task['outputAudioAssetId']:
            asset=by_asset.get(task['outputAudioAssetId'])
            if not asset or asset['userId']!=task['userId'] or asset['storageProvider']!='S3' or asset['type']!='TTS_OUTPUT' or asset['url']!=public.rstrip('/')+'/'+asset['objectKey'] or proof.get('audioSha256')!=asset['objectKey'].rsplit('/',1)[-1].split('.')[0]:raise ValueError('Audio history media binding changed')
    if set(by_asset)!={t['outputAudioAssetId'] for t in tasks if t['outputAudioAssetId']}:raise ValueError('Unreferenced history asset')
    def stage(table,name,columns,rows):
        projection=sql.SQL(',').join(sql.Identifier(k) for k in columns).as_string()
        result=f'CREATE TEMP TABLE {name} ON COMMIT DROP AS SELECT {projection} FROM {table} WITH NO DATA;\n'
        # Only base64 is placed in SQL; user text never appears in a SQL/dollar-quoted block.
        for start in range(0,len(rows),500):
            payload=json.dumps(rows[start:start+500],ensure_ascii=False,default=lambda v:v.isoformat()).encode()
            encoded=base64.b64encode(payload).decode()
            result+=f"INSERT INTO {name} SELECT {projection} FROM jsonb_populate_recordset(NULL::{table},convert_from(decode('{encoded}','base64'),'UTF8')::jsonb);\n"
        return result+f'CREATE UNIQUE INDEX ON {name}(id);\n'
    script="""BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $history$ BEGIN
 IF current_database()<>"""+sql.Literal(database).as_string()+""" THEN RAISE EXCEPTION 'Wrong voice history database'; END IF;
 IF NOT pg_try_advisory_xact_lock(626234801) THEN RAISE EXCEPTION 'Another importer is active'; END IF;
END $history$;
"""+stage('audio_assets','legacy_voice_assets_stage',ASSET_COLUMNS,assets)+stage('audio_tasks','legacy_voice_tasks_stage',TASK_COLUMNS,tasks)
    script+="""DO $history$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_voice_tasks_stage s LEFT JOIN users u ON u.id=s."userId"
   LEFT JOIN legacy_ai_logs l ON l.id=s."providerPayload"->'legacyImport'->>'logId'
   WHERE u.id IS NULL OR l.id IS NULL OR l."userId" IS DISTINCT FROM s."userId" OR l."sourceSystem"<>'abeiai-v1'
    OR l."sourceTable"<>'app_ai_ttsmessage' OR l."sourcePk"<>s."providerPayload"->'legacyImport'->>'sourcePk'
    OR l."inputText" IS DISTINCT FROM s."inputText" OR l."requestedAt"<>s."createdAt"
 ) THEN RAISE EXCEPTION 'Voice history source ownership mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_voice_tasks_stage s JOIN audio_tasks t ON t.id=s.id
   WHERE t."userId"<>s."userId" OR t."inputText" IS DISTINCT FROM s."inputText" OR t."createdAt"<>s."createdAt"
    OR t."learnerId" IS NOT NULL OR t."organizationId" IS NOT NULL OR t."scenarioId" IS NOT NULL OR t.type<>'TTS'
    OR t.provider<>'abeiai-v1' OR t."estimatedCredits"<>0 OR t."actualCredits" IS NOT NULL
    OR t."providerPayload"->>'source' IS DISTINCT FROM 'EXPERIENCE'
    OR t."providerPayload"->'legacyImport'->>'sourceSystem' IS DISTINCT FROM 'abeiai-v1'
    OR t."providerPayload"->'legacyImport'->>'sourcePk' IS DISTINCT FROM s."providerPayload"->'legacyImport'->>'sourcePk'
    OR EXISTS (SELECT 1 FROM credit_reservations r WHERE r."taskId"=t.id)
    OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e."relatedAudioTaskId"=t.id)
 ) THEN RAISE EXCEPTION 'Existing task is not an unbilled imported history'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_voice_assets_stage s JOIN audio_assets a ON a.id=s.id
   WHERE (a."userId",a.type,a."storageProvider",a.url,a."objectKey",a."mimeType",a."sizeBytes") IS DISTINCT FROM
     (s."userId",s.type,s."storageProvider",s.url,s."objectKey",s."mimeType",s."sizeBytes")
 ) THEN RAISE EXCEPTION 'Existing history asset conflict'; END IF;
END $history$;
CREATE TEMP TABLE legacy_voice_inserted_assets ON COMMIT DROP AS
WITH added AS (INSERT INTO audio_assets ("id","userId",type,"storageProvider",url,"objectKey","mimeType","durationMs","sizeBytes","createdAt")
 SELECT "id","userId",type,"storageProvider",url,"objectKey","mimeType","durationMs","sizeBytes","createdAt" FROM legacy_voice_assets_stage
 ON CONFLICT(id) DO NOTHING RETURNING id) SELECT * FROM added;
CREATE TEMP TABLE legacy_voice_inserted_tasks ON COMMIT DROP AS
WITH added AS (INSERT INTO audio_tasks ("id","userId","learnerId",type,status,provider,model,"inputText","inputTextLength","outputAudioAssetId","estimatedCredits","actualCredits","errorCode","errorMessage","providerPayload","createdAt","updatedAt","finishedAt")
 SELECT "id","userId","learnerId",type,status,provider,model,"inputText","inputTextLength","outputAudioAssetId","estimatedCredits","actualCredits","errorCode","errorMessage","providerPayload","createdAt","updatedAt","finishedAt" FROM legacy_voice_tasks_stage
 ON CONFLICT(id) DO NOTHING RETURNING id) SELECT * FROM added;
CREATE TEMP TABLE legacy_voice_updated_tasks ON COMMIT DROP AS
WITH changed AS (UPDATE audio_tasks t SET status=s.status,"outputAudioAssetId"=s."outputAudioAssetId","errorCode"=s."errorCode","errorMessage"=s."errorMessage","providerPayload"=s."providerPayload","updatedAt"=s."updatedAt","finishedAt"=s."finishedAt"
 FROM legacy_voice_tasks_stage s WHERE t.id=s.id
  AND (t."providerPayload"->'legacyImport'->>'snapshotAt')::timestamptz <= (s."providerPayload"->'legacyImport'->>'snapshotAt')::timestamptz
  AND (t.status,t."outputAudioAssetId",t."errorCode",t."errorMessage",t."providerPayload",t."updatedAt",t."finishedAt") IS DISTINCT FROM
      (s.status,s."outputAudioAssetId",s."errorCode",s."errorMessage",s."providerPayload",s."updatedAt",s."finishedAt") RETURNING t.id) SELECT * FROM changed;
DO $history$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_voice_tasks_stage s LEFT JOIN audio_tasks t ON t.id=s.id
  WHERE t.id IS NULL OR t."userId"<>s."userId" OR t."inputText" IS DISTINCT FROM s."inputText"
   OR ((t."providerPayload"->'legacyImport'->>'snapshotAt')::timestamptz <= (s."providerPayload"->'legacyImport'->>'snapshotAt')::timestamptz
    AND (t.status,t."outputAudioAssetId",t."errorCode",t."errorMessage",t."providerPayload",t."updatedAt",t."finishedAt") IS DISTINCT FROM
        (s.status,s."outputAudioAssetId",s."errorCode",s."errorMessage",s."providerPayload",s."updatedAt",s."finishedAt"))
 ) THEN RAISE EXCEPTION 'Voice history reconciliation failed'; END IF;
END $history$;
SELECT json_build_object('plannedTasks',(SELECT COUNT(*) FROM legacy_voice_tasks_stage),'insertedTasks',(SELECT COUNT(*) FROM legacy_voice_inserted_tasks),'updatedTasks',(SELECT COUNT(*) FROM legacy_voice_updated_tasks),'insertedAssets',(SELECT COUNT(*) FROM legacy_voice_inserted_assets));
COMMIT;
"""
    return script


def collect_voice_plan(root,key,target,public,book_root=None,book_key=None):
    from .package import load_manifest
    from .asset_index import table_rows
    from .native_mapping import target_guard
    from .voice_history import book_audio_keys,voice_history_row
    from collections import Counter
    import psycopg
    target_guard(target,'/abei_wechat_test' in target)
    manifest=load_manifest(root,key)
    if manifest.get('sourceSystem')!='abeiai-v1' or not manifest.get('validationPassed'):raise ValueError('Verified abeiai source snapshot required')
    references=book_audio_keys(table_rows(root,manifest,key,'app_ai_product',False),table_rows(root,manifest,key,'app_cms_case',False),table_rows(root,manifest,key,'app_cms_pages',False))
    if manifest.get('incremental') and (not book_root or not book_key):raise ValueError('Incremental voice mapping needs the original book reference snapshot')
    if book_root:
        baseline=load_manifest(book_root,book_key)
        validate_book_baseline(manifest,baseline)
        references|=book_audio_keys(table_rows(book_root,baseline,book_key,'app_ai_product',False),table_rows(book_root,baseline,book_key,'app_cms_case',False),table_rows(book_root,baseline,book_key,'app_cms_pages',False))
    with psycopg.connect(target.split('?')[0]) as connection:
        connection.execute('SET TRANSACTION READ ONLY')
        users={row[0] for row in connection.execute('SELECT id FROM users')};outputs={}
        query="""SELECT l.id,l."userId",a."storageKey",a.sha256,a.role,a."fieldPath",m.url,m."mimeType",m.size
        FROM legacy_ai_log_assets a JOIN legacy_ai_logs l ON l.id=a."logId" JOIN media_assets m
        ON m."createdByUserId"=l."userId" AND 'picture-books/'||m.filename=substring(a."storageKey" from 4)
        WHERE l."sourceTable"='app_ai_ttsmessage' AND a.status='AVAILABLE' AND a.role='OUTPUT' AND a."fieldPath"='/assistant_content'"""
        for identity,owner,storage,digest,role,path,url,mime,size in connection.execute(query):
            output={'userId':owner,'objectKey':storage.removeprefix('r2:'),'sha256':digest,'role':role,'fieldPath':path,'url':url,'mimeType':mime,'sizeBytes':size}
            if identity in outputs and outputs[identity]!=output:raise ValueError('Ambiguous voice output')
            outputs[identity]=output
        connection.rollback()
    tasks=[];assets={};excluded=Counter()
    for row in table_rows(root,manifest,key,'app_ai_ttsmessage',True):
        raw_owner=row['values'].get('user_id');owner=native_id('user',raw_owner) if raw_owner else None
        task,asset,reason=voice_history_row(row,{raw_owner:owner} if owner in users else {},references,public,outputs.get(native_id('app_ai_ttsmessage',row['sourcePk'])),manifest['startedAt'])
        if reason:excluded[reason]+=1;continue
        task['providerPayload']['legacyImport']['logId']=native_id('app_ai_ttsmessage',row['sourcePk'])
        if asset:task['providerPayload']['legacyImport']['audioSha256']=outputs[native_id('app_ai_ttsmessage',row['sourcePk'])]['sha256'];assets.setdefault(asset['id'],asset)
        tasks.append(task)
    return tasks,list(assets.values()),{'runId':manifest['runId'],'snapshotAt':manifest['startedAt'],'eligibleTasks':len(tasks),'playableTasks':sum(bool(t['outputAudioAssetId']) for t in tasks),'excluded':dict(excluded)}


def main():
    import argparse
    import psycopg
    from pathlib import Path
    from .object_transfer import env_values
    from .native_mapping import target_guard
    from .package import write_chunk
    parser=argparse.ArgumentParser(description='Import only standalone legacy TTS history, without generating or billing')
    for flag in ('package','key-file','target-env','r2-public-env'):parser.add_argument('--'+flag,required=True)
    parser.add_argument('--book-reference-package');parser.add_argument('--book-reference-key-file');parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();key=Path(args.key_file).read_bytes();target=env_values([args.target_env],{'DATABASE_URL'})['DATABASE_URL'];target_guard(target)
    public=env_values([args.r2_public_env],{'S3_PUBLIC_BASE_URL'})['S3_PUBLIC_BASE_URL'];book_key=Path(args.book_reference_key_file).read_bytes() if args.book_reference_key_file else None
    tasks,assets,report=collect_voice_plan(args.package,key,target,public,args.book_reference_package,book_key)
    if args.apply:
        receipt={'plannedTasks':0,'insertedTasks':0,'updatedTasks':0,'insertedAssets':0}
        if tasks:
            with psycopg.connect(target.split('?')[0],autocommit=True) as connection:
                if connection.execute("SELECT current_database(),current_setting('port')").fetchone()!=('abei','3604'):raise ValueError('Unexpected target identity')
                cursor=connection.execute(voice_import_sql(tasks,assets,public))
                while True:
                    if cursor.description:receipt=cursor.fetchone()[0]
                    if not cursor.nextset():break
        report.update(receipt=receipt,voiceHistoryVerified=True)
        write_chunk(args.package,'reports/voice-history-import.enc',[report],key)
    print(json.dumps({'phase':'voice-history-applied' if args.apply else 'voice-history-preflight',**report},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'phase':'voice-history-failed','errorType':type(error).__name__}));raise SystemExit(1)
