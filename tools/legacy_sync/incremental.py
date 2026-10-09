"""Fixed source-only delta capture; cursors advance only after offline reconciliation."""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
from .source import ReadOnlySource, read_config, identifier, selected_columns, SCHEMA_BASELINE
from .package import load_manifest, write_manifest

CONTEXT_TABLES=frozenset({'app_user_user','app_ai_chatsubject','app_ai_ttssubject'} | {'app_ai_'+p+s for p in ('llm','draw','tts','video') for s in ('model','version')})
DATE_NAMES=frozenset({'req_time','res_time','create_time','update_time','created_at','updated_at'})


def date_columns(table):
    return [c['name'] for c in SCHEMA_BASELINE[table]['columns'] if c['name'] in DATE_NAMES and c['type'].startswith(('datetime','timestamp'))]


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
    since=dt.datetime.fromisoformat(value['since'].replace('Z','+00:00'));end=dt.datetime.fromisoformat(manifest['startedAt'].replace('Z','+00:00'))
    if since.tzinfo is None or end.tzinfo is None or since>=end:raise ValueError('Delta snapshot time must advance')
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
    if table=='app_user_user':return int(row['sourcePk'])>int(info['fromPk'])
    if table=='app_ai_chatmessage':return True
    if not v.get('user_id'):return False
    if info['mode']=='CONTEXT':
        if int(row['sourcePk'])>int(info['fromPk']):return True
        lower=dt.datetime.fromisoformat(value['since'].replace('Z','+00:00'))-dt.timedelta(minutes=10)
        return any(isinstance(v.get(c),dict) and v[c].get('utc') and dt.datetime.fromisoformat(v[c]['utc'].replace('Z','+00:00'))>=lower for c in date_columns(table))
    return True


class IncrementalSource:
    def __init__(self,source,baseline,fingerprint):
        if baseline.get('sourceFingerprint')!=fingerprint or not baseline.get('validationPassed'):raise ValueError('Delta source must match validated baseline')
        self.source=source;self.version=source.version;self.previous=baseline_watermarks(baseline);self.cache={}
        self.lower=(dt.datetime.fromisoformat(baseline['startedAt'].replace('Z','+00:00'))-dt.timedelta(minutes=10)).astimezone(dt.timezone(dt.timedelta(hours=8))).replace(tzinfo=None)
        self.metadata={'protocol':1,'parentRunId':baseline['runId'],'parentSchemaSha256':baseline['schemaSha256'],'sourceFingerprint':fingerprint,'since':baseline['startedAt'],'overlapMinutes':10,'watermarks':{},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in self.previous.items()}}
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
        with self.source.connection.cursor() as c:c.execute(sql,params);return c.fetchall()
    def close(self):self.source.close()


def main():
    from .export import export_snapshot,validate_package
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument('--source-env',action='append',required=True);p.add_argument('--baseline-package',required=True);p.add_argument('--baseline-key-file',required=True);p.add_argument('--output',required=True);p.add_argument('--key-file',required=True);p.add_argument('--run-id',required=True);p.add_argument('--confirmed-legacy-entry',action='store_true')
    a=p.parse_args();root=Path(a.output).resolve();key_path=Path(a.key_file).resolve()
    if key_path.is_relative_to(root):raise ValueError('Delta key must stay outside package')
    key=key_path.read_bytes()
    if len(key)!=32:raise ValueError('Expected 256-bit delta key')
    baseline=load_manifest(a.baseline_package,Path(a.baseline_key_file).read_bytes())
    config=read_config(a.source_env);fingerprint=hashlib.sha256((config['MYSQL_URL']+'/'+config['MYSQL_DATABASE']).encode()).hexdigest()
    if baseline.get('sourceFingerprint')!=fingerprint:raise ValueError('Source fingerprint mismatch')
    source=ReadOnlySource(config,a.confirmed_legacy_entry)
    try:
        wrapped=IncrementalSource(source,baseline,fingerprint)
        m=export_snapshot(wrapped,root,key,baseline['sourceSystem'],a.run_id,lambda v:print(json.dumps(v),flush=True),incremental=wrapped.metadata,source_fingerprint=fingerprint)
        validate_incremental_manifest(m);validate_package(root,key)
        print(json.dumps({'phase':'delta-snapshot-validated','runId':a.run_id,'rows':sum(t['count'] for t in m['tables'].values())}),flush=True)
    finally:source.close()

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'phase':'delta-snapshot-failed','errorCategory':type(error).__name__}),flush=True);raise SystemExit(1)
