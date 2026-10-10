"""Fixed source-only delta capture; cursors advance only after offline reconciliation."""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
from .source import ReadOnlySource, read_config, identifier, selected_columns, SCHEMA_BASELINE, schema_hash
from .package import load_manifest, write_manifest, read_chunk, write_chunk, encode_value

CONTEXT_TABLES=frozenset({'app_user_user','app_ai_chatsubject'} | {'app_ai_'+p+s for p in ('llm','draw','tts','video') for s in ('model','version')})
DATE_NAMES=frozenset({'req_time','res_time','create_time','update_time','created_at','updated_at'})


def endpoint_fingerprint(config):
    port=int(config['MYSQL_PORT'])
    if not 1<=port<=65535:raise ValueError('Invalid source endpoint port')
    value={'host':config['MYSQL_URL'].strip().lower(),'port':port,'database':config['MYSQL_DATABASE']}
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def bind_baseline_endpoint(source,root,key,confirmed=False):
    baseline=load_manifest(root,key);actual=endpoint_fingerprint(source.config)
    if baseline.get('sourceEndpointFingerprint'):
        if baseline['sourceEndpointFingerprint']!=actual:raise ValueError('Source endpoint changed')
        return actual
    relative='metadata/source-endpoint.enc'
    if (Path(root)/relative).exists():
        binding=read_chunk(root,{'file':relative},key)[0]
        if binding.get('runId')!=baseline['runId'] or binding.get('sourceFingerprint')!=baseline.get('sourceFingerprint') or binding.get('sourceEndpointFingerprint')!=actual:raise ValueError('Source endpoint binding mismatch')
        return actual
    if not confirmed:raise ValueError('Legacy baseline requires explicitly confirmed endpoint binding')
    legacy=hashlib.sha256((source.config['MYSQL_URL']+'/'+source.config['MYSQL_DATABASE']).encode()).hexdigest()
    if legacy!=baseline.get('sourceFingerprint') or not baseline.get('validationPassed') or schema_hash(source.schema())!=baseline['schemaSha256']:raise ValueError('Legacy baseline source mismatch')
    info=baseline['tables']['app_user_user'];first=read_chunk(root,info['chunks'][0],key)[0];last=read_chunk(root,info['chunks'][-1],key)[-1]
    anchors={int(r['sourcePk']):r['values']['date_joined'] for r in (first,last)}
    with source.connection.cursor() as c:
        c.execute('SELECT `id`,`date_joined` FROM `app_user_user` WHERE `id` IN ('+','.join(['%s']*len(anchors))+')',tuple(anchors))
        got={int(row[0]):encode_value(row[1]) for row in c.fetchall()}
    if got!=anchors:raise ValueError('Legacy endpoint immutable anchors mismatch')
    write_chunk(root,relative,[{'runId':baseline['runId'],'sourceFingerprint':legacy,'sourceEndpointFingerprint':actual,'anchorsVerified':len(anchors),'confirmation':'explicit-existing-legacy-entry'}],key)
    return actual


def date_columns(table):
    return [c['name'] for c in SCHEMA_BASELINE[table]['columns'] if c['name'] in DATE_NAMES and c['type'].startswith(('datetime','timestamp'))]


def known_user_keys(root,manifest,key):
    declared=manifest.get('incremental',{}).get('knownUserSourceIds')
    if declared is not None:return set(declared)
    return {row['sourcePk'] for chunk in manifest['tables']['app_user_user']['chunks'] for row in read_chunk(root,chunk,key)}


def user_is_new(manifest,pk):
    value=manifest['incremental']
    return pk in value['newUserSourceIds'] if 'newUserSourceIds' in value else int(pk)>int(value['tables']['app_user_user']['fromPk'])


def baseline_watermarks(manifest):
    values=manifest.get('incremental',{}).get('watermarks')
    if values is None:values={t:v['maxPk'] or '0' for t,v in manifest['tables'].items()}
    if set(values)!=set(SCHEMA_BASELINE) or any(not re.fullmatch(r'\d+',str(v)) for v in values.values()):raise ValueError('Invalid baseline high watermarks')
    return {t:int(v) for t,v in values.items()}


def predicate(table,previous,lower):
    if table in CONTEXT_TABLES:return '',()
    dates=date_columns(table)
    return ' AND (`id` > %s'+''.join(' OR '+identifier(c)+' >= %s' for c in dates)+')',(previous,)+(lower,)*len(dates)


def delta_query(table,columns,after,upper,previous,lower,limit,credential=False):
    if table not in SCHEMA_BASELINE or not isinstance(limit,int) or not 1<=limit<=500 or not all(isinstance(n,int) and n>=0 for n in (after,upper,previous)) or 'id' not in columns:raise ValueError('Invalid delta query')
    if credential:
        from .tables import CREDENTIAL_COLUMNS
        if table not in CREDENTIAL_COLUMNS or set(columns)-({'id'}|CREDENTIAL_COLUMNS[table]):raise ValueError('Invalid delta credential projection')
    elif selected_columns(table,columns)!=columns:raise ValueError('Invalid delta projection')
    clause,params=predicate(table,previous,lower)
    return 'SELECT '+','.join(identifier(c) for c in columns)+' FROM '+identifier(table)+' WHERE `id` > %s AND `id` <= %s'+clause+' ORDER BY `id` LIMIT %s',(after,upper)+params+(limit,)


def validate_incremental_manifest(manifest):
    value=manifest.get('incremental')
    if value is None:return
    if value.get('protocol')!=1 or not value.get('parentRunId') or value['parentRunId']==manifest['runId'] or value.get('parentSchemaSha256')!=manifest['schemaSha256'] or value.get('sourceFingerprint')!=manifest.get('sourceFingerprint') or not re.fullmatch(r'[a-f0-9]{64}',value.get('sourceFingerprint','')) or value.get('overlapMinutes')!=10:raise ValueError('Invalid delta parent binding')
    if value.get('sourceEndpointFingerprint')!=manifest.get('sourceEndpointFingerprint') or not re.fullmatch(r'[a-f0-9]{64}',value.get('sourceEndpointFingerprint','')):raise ValueError('Delta endpoint binding required')
    since=dt.datetime.fromisoformat(value['since'].replace('Z','+00:00'));end=dt.datetime.fromisoformat(manifest['startedAt'].replace('Z','+00:00'))
    if since.tzinfo is None or end.tzinfo is None or since>=end:raise ValueError('Delta snapshot time must advance')
    if 'knownUserSourceIds' in value:
        known=value['knownUserSourceIds'];new=value.get('newUserSourceIds')
        if not isinstance(known,list) or not isinstance(new,list) or any(not isinstance(k,str) or not re.fullmatch(r'[1-9]\d*',k) for k in known+new) or known!=sorted(set(known),key=int) or new!=sorted(set(new),key=int) or not set(new)<=set(known):raise ValueError('Invalid authenticated user membership')
    upper=baseline_watermarks(manifest)
    if set(value.get('tables',{}))!=set(SCHEMA_BASELINE):raise ValueError('Incomplete delta rule inventory')
    for table,info in value['tables'].items():
        if info.get('mode')!=('CONTEXT' if table in CONTEXT_TABLES else 'DELTA') or not re.fullmatch(r'\d+',str(info.get('fromPk',''))) or upper[table]<int(info['fromPk']):raise ValueError('Invalid delta table cursor')
        data=manifest['tables'][table]
        if data['maxPk'] is not None and int(data['maxPk'])>upper[table]:raise ValueError('Delta row exceeds capture fence')


def validate_delta_row(manifest,row):
    value=manifest.get('incremental')
    if value is None:return
    table=row['sourceTable'];rule=value['tables'][table]
    if rule['mode']=='CONTEXT' or int(row['sourcePk'])>int(rule['fromPk']):return
    lower=dt.datetime.fromisoformat(value['since'].replace('Z','+00:00'))-dt.timedelta(minutes=10)
    for c in date_columns(table):
        field=row['values'].get(c)
        if isinstance(field,dict) and field.get('type')=='datetime' and field.get('utc'):
            moment=dt.datetime.fromisoformat(field['utc'].replace('Z','+00:00'))
            if moment.tzinfo is None:raise ValueError('Delta row time has no timezone')
            if moment>=lower:return
    raise ValueError('Unchanged row outside delta range')


def index_row_allowed(manifest,row):
    value=manifest.get('incremental')
    if value is None:return True
    table=row['sourceTable'];info=value['tables'][table];v=row['values']
    if table=='app_user_user':return user_is_new(manifest,row['sourcePk'])
    if not table.startswith('app_ai_'):return False
    if table=='app_ai_chatmessage':return True
    if not v.get('user_id'):return False
    if info['mode']=='CONTEXT':
        if int(row['sourcePk'])>int(info['fromPk']):return True
        lower=dt.datetime.fromisoformat(value['since'].replace('Z','+00:00'))-dt.timedelta(minutes=10)
        return any(isinstance(v.get(c),dict) and v[c].get('utc') and dt.datetime.fromisoformat(v[c]['utc'].replace('Z','+00:00'))>=lower for c in date_columns(table))
    return True


class IncrementalSource:
    def __init__(self,source,baseline,fingerprint,known_users=None):
        if baseline.get('sourceFingerprint')!=fingerprint or not baseline.get('validationPassed'):raise ValueError('Delta source must match validated baseline')
        endpoint=endpoint_fingerprint(source.config)
        if baseline.get('sourceEndpointFingerprint')!=endpoint:raise ValueError('Delta source endpoint does not match parent')
        self.known_users=set(known_users) if known_users is not None else set()
        self.new_users=set()
        self.source=source;self.version=source.version;self.previous=baseline_watermarks(baseline);self.cache={}
        self.lower=(dt.datetime.fromisoformat(baseline['startedAt'].replace('Z','+00:00'))-dt.timedelta(minutes=10)).astimezone(dt.timezone(dt.timedelta(hours=8))).replace(tzinfo=None)
        self.metadata={'protocol':1,'parentRunId':baseline['runId'],'parentSchemaSha256':baseline['schemaSha256'],'sourceFingerprint':fingerprint,'sourceEndpointFingerprint':endpoint,'since':baseline['startedAt'],'overlapMinutes':10,'knownUserSourceIds':sorted(self.known_users,key=int),'newUserSourceIds':[],'watermarks':{},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in self.previous.items()}}
    def schema(self):return self.source.schema()
    def bounds(self,table):
        if table in self.cache:return self.cache[table]
        _,upper,_=self.source.bounds(table);upper=int(upper or 0)
        if upper<self.previous[table]:raise ValueError('Source table high watermark regressed')
        self.metadata['watermarks'][table]=str(upper)
        clause,params=predicate(table,self.previous[table],self.lower)
        with self.source.connection.cursor() as c:
            c.execute('SELECT MIN(`id`),MAX(`id`),COUNT(`id`) FROM '+identifier(table)+' WHERE `id` <= %s'+clause,(upper,)+params)
            self.cache[table]=c.fetchone()
        return self.cache[table]
    def rows(self,table,columns,after,upper,limit):return self._rows(table,columns,after,upper,limit,False)
    def credentials(self,table,columns,after,upper,limit):return self._rows(table,columns,after,upper,limit,True)
    def _rows(self,table,columns,after,upper,limit,credential):
        sql,params=delta_query(table,columns,after,upper,self.previous[table],self.lower,limit,credential)
        with self.source.connection.cursor() as c:c.execute(sql,params);rows=c.fetchall()
        if table=='app_user_user' and not credential:
            keys={str(row[columns.index('id')]) for row in rows};self.new_users.update(keys-self.known_users);self.known_users.update(keys)
            self.metadata['knownUserSourceIds']=sorted(self.known_users,key=int);self.metadata['newUserSourceIds']=sorted(self.new_users,key=int)
        return rows
    def close(self):self.source.close()


def main():
    from .export import export_snapshot,validate_package
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument('--source-env',action='append',required=True);p.add_argument('--baseline-package');p.add_argument('--baseline-key-file');p.add_argument('--cursor-file');p.add_argument('--bind-legacy-endpoint',action='store_true');p.add_argument('--output',required=True);p.add_argument('--key-file',required=True);p.add_argument('--run-id',required=True);p.add_argument('--confirmed-legacy-entry',action='store_true')
    a=p.parse_args();root=Path(a.output).resolve();key_path=Path(a.key_file).resolve()
    if key_path.is_relative_to(root):raise ValueError('Delta key must stay outside package')
    key=key_path.read_bytes()
    if len(key)!=32:raise ValueError('Expected 256-bit delta key')
    if a.cursor_file:
        if a.baseline_package or a.baseline_key_file:raise ValueError('Use either a cursor or an explicit parent')
        from .incremental_state import read_cursor
        cursor=read_cursor(a.cursor_file);a.baseline_package=cursor['package'];a.baseline_key_file=cursor['keyFile']
    if not a.baseline_package or not a.baseline_key_file:raise ValueError('Explicit baseline or cursor required')
    baseline_key=Path(a.baseline_key_file).read_bytes()
    baseline=load_manifest(a.baseline_package,baseline_key)
    if a.cursor_file and (cursor['runId']!=baseline['runId'] or cursor['sourceFingerprint']!=baseline.get('sourceFingerprint') or cursor['snapshotAt']!=baseline['startedAt']):raise ValueError('Cursor does not match authenticated parent')
    config=read_config(a.source_env);fingerprint=hashlib.sha256((config['MYSQL_URL']+'/'+config['MYSQL_DATABASE']).encode()).hexdigest()
    if baseline.get('sourceFingerprint')!=fingerprint:raise ValueError('Source fingerprint mismatch')
    declared=baseline.get('sourceEndpointFingerprint')
    binding_file=Path(a.baseline_package)/'metadata/source-endpoint.enc'
    if not declared and binding_file.exists():
        binding=read_chunk(a.baseline_package,{'file':'metadata/source-endpoint.enc'},baseline_key)[0]
        if binding.get('runId')!=baseline['runId'] or binding.get('sourceFingerprint')!=fingerprint:raise ValueError('Parent endpoint receipt mismatch')
        declared=binding.get('sourceEndpointFingerprint')
    if declared and declared!=endpoint_fingerprint(config):raise ValueError('Parent source endpoint changed')
    if not declared and not a.bind_legacy_endpoint:raise ValueError('Explicit legacy endpoint binding required')
    source=ReadOnlySource(config,a.confirmed_legacy_entry)
    try:
        baseline['sourceEndpointFingerprint']=bind_baseline_endpoint(source,a.baseline_package,baseline_key,a.bind_legacy_endpoint)
        wrapped=IncrementalSource(source,baseline,fingerprint,known_user_keys(a.baseline_package,baseline,baseline_key))
        m=export_snapshot(wrapped,root,key,baseline['sourceSystem'],a.run_id,lambda v:print(json.dumps(v),flush=True),incremental=wrapped.metadata,source_fingerprint=fingerprint)
        validate_incremental_manifest(m);validate_package(root,key)
        print(json.dumps({'phase':'delta-snapshot-validated','runId':a.run_id,'rows':sum(t['count'] for t in m['tables'].values())}),flush=True)
    finally:source.close()

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'phase':'delta-snapshot-failed','errorCategory':type(error).__name__}),flush=True);raise SystemExit(1)
