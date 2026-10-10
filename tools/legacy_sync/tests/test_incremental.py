import copy
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from tools.legacy_sync.package import load_manifest
from tools.legacy_sync.export import export_snapshot, validate_package
from tools.legacy_sync.tests.test_native_import import SyntheticSource, KEY

class IncrementalContract(unittest.TestCase):
    def test_fixed_delta_query_uses_parameters_and_rejects_unapproved_columns(self):
        from tools.legacy_sync.incremental import delta_query
        lower=dt.datetime(2026,10,8,10,51)
        sql,params=delta_query('app_ai_drawmessage',['id','req_time','res_time'],0,999,888,lower,250)
        self.assertTrue(sql.startswith('SELECT '));self.assertNotIn('SELECT *',sql)
        self.assertIn('`id` > %s AND `id` <= %s',sql)
        self.assertIn('`req_time` >= %s',sql);self.assertIn('`res_time` >= %s',sql)
        self.assertEqual(params,(0,999,888,lower,lower,250))
        for table,cols in [('django_session',['id']),('app_user_user',['id','password']),('app_ai_drawmessage; DELETE FROM x',['id'])]:
            with self.assertRaises(ValueError):delta_query(table,cols,0,9,5,lower,250)

    def test_context_rows_do_not_expand_incremental_media_scope(self):
        from tools.legacy_sync.incremental import index_row_allowed
        manifest={'incremental':{'tables':{'app_user_user':{'mode':'CONTEXT','fromPk':'10'},'app_ai_chatsubject':{'mode':'CONTEXT','fromPk':'20'},'app_ai_drawversion':{'mode':'CONTEXT','fromPk':'1'},'app_ai_drawmessage':{'mode':'DELTA','fromPk':'100'}}}}
        def row(table,pk,owner=None):return {'sourceTable':table,'sourcePk':str(pk),'values':{'id':str(pk),'user_id':owner}}
        self.assertFalse(index_row_allowed(manifest,row('app_user_user',10)))
        self.assertTrue(index_row_allowed(manifest,row('app_user_user',11)))
        self.assertFalse(index_row_allowed(manifest,row('app_ai_drawversion',2)))
        self.assertTrue(index_row_allowed(manifest,row('app_ai_drawmessage',95,'1')))
        self.assertFalse(index_row_allowed(manifest,row('app_ai_drawmessage',101)))

    def test_delta_media_excludes_updated_gallery_and_financial_rows(self):
        from tools.legacy_sync.incremental import index_row_allowed
        from tools.legacy_sync.asset_index import checkpoint_identity
        manifest={'sourceSystem':'abeiai-v1','runId':'child','schemaSha256':'a'*64,'incremental':{'tables':{t:{'mode':'DELTA','fromPk':'1'} for t in ('app_piazza_realproduct','app_user_memberorder','app_ai_product')}}}
        for table in ('app_piazza_realproduct','app_user_memberorder'):
            self.assertFalse(index_row_allowed(manifest,{'sourceTable':table,'sourcePk':'2','values':{'user_id':'1'}}))
        self.assertTrue(index_row_allowed(manifest,{'sourceTable':'app_ai_product','sourcePk':'2','values':{'user_id':'1'}}))
        self.assertEqual(checkpoint_identity(manifest)['incrementalMediaScope'],'AI_GENERATION_AND_NEW_USER_V1')
        self.assertNotIn('incrementalMediaScope',checkpoint_identity({k:v for k,v in manifest.items() if k!='incremental'}))

    def test_incremental_watermarks_keep_empty_table_cursor_and_parent_binding(self):
        from tools.legacy_sync.incremental import baseline_watermarks, validate_incremental_manifest
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','baseline')
            parent=validate_package(root,KEY);parent['sourceFingerprint']='a'*64
            parent['incremental']={'watermarks':{t:'91' for t in parent['tables']}}
            self.assertEqual(baseline_watermarks(parent)['app_ai_works'],91)
            child=copy.deepcopy(parent);child['runId']='child'
            child['incremental']={'protocol':1,'parentRunId':'baseline','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:'91' for t in parent['tables']},'tables':{t:{'mode':'DELTA','fromPk':'91'} for t in parent['tables']}}
            with self.assertRaises(ValueError):validate_incremental_manifest(child)

    def test_valid_empty_delta_retains_watermarks_and_skips_old_context_assets(self):
        from tools.legacy_sync.incremental import CONTEXT_TABLES, baseline_watermarks
        from tools.legacy_sync.asset_index import build_index, open_index, unseal
        from tools.legacy_sync.tests.test_native_import import CONFIG, NOW
        with tempfile.TemporaryDirectory() as location:
            parent_root=Path(location)/'parent';root=Path(location)/'delta'
            export_snapshot(SyntheticSource(),parent_root,KEY,'abeiai-v1','parent',source_fingerprint='a'*64)
            parent=validate_package(parent_root,KEY);previous=baseline_watermarks(parent)
            source=SyntheticSource()
            for t in list(source.data):
                if t not in CONTEXT_TABLES:source.data[t]=[]
            source.data['app_user_user'][0]['avatar']='https://cdn.abeiai.com/abei/old-avatar.png'
            meta={'protocol':1,'parentRunId':'parent','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:str(n) for t,n in previous.items()},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in previous.items()}}
            export_snapshot(source,root,KEY,'abeiai-v1','empty-delta',incremental=meta,source_fingerprint='a'*64)
            valid=validate_package(root,KEY);built=build_index(root,valid,KEY,CONFIG)
            self.assertEqual(built['assetObjectCount'],0)
            self.assertEqual(baseline_watermarks(built),previous)

    def test_delta_cannot_smuggle_unchanged_old_row_inside_authenticated_package(self):
        from tools.legacy_sync.incremental import CONTEXT_TABLES, baseline_watermarks
        with tempfile.TemporaryDirectory() as location:
            parent_root=Path(location)/'parent';root=Path(location)/'delta'
            export_snapshot(SyntheticSource(),parent_root,KEY,'abeiai-v1','parent',source_fingerprint='a'*64)
            parent=validate_package(parent_root,KEY);previous=baseline_watermarks(parent)
            meta={'protocol':1,'parentRunId':'parent','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:str(n) for t,n in previous.items()},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in previous.items()}}
            export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','invalid-delta',incremental=meta,source_fingerprint='a'*64)
            with self.assertRaises(ValueError):validate_package(root,KEY)

    def test_source_binding_distinguishes_ports_and_rejects_foreign_endpoint(self):
        from tools.legacy_sync.incremental import endpoint_fingerprint, IncrementalSource
        a={'MYSQL_URL':'Synthetic.Invalid','MYSQL_PORT':'3606','MYSQL_DATABASE':'synthetic'}
        b={**a,'MYSQL_PORT':'3607'}
        self.assertNotEqual(endpoint_fingerprint(a),endpoint_fingerprint(b))
        self.assertEqual(endpoint_fingerprint(a),endpoint_fingerprint({**a,'MYSQL_URL':'synthetic.invalid'}))
        with tempfile.TemporaryDirectory() as root:
            export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','parent',source_fingerprint='a'*64)
            parent=validate_package(root,KEY);parent['sourceEndpointFingerprint']=endpoint_fingerprint(a)
            class Source:
                version='8.0.36'
                config=b
            with self.assertRaises(ValueError):IncrementalSource(Source(),parent,'a'*64)

    def test_legacy_endpoint_binding_requires_confirmation_and_immutable_anchors(self):
        import hashlib
        from tools.legacy_sync.incremental import bind_baseline_endpoint, endpoint_fingerprint
        from tools.legacy_sync.tests.test_native_import import NOW
        cfg={'MYSQL_URL':'synthetic.invalid','MYSQL_PORT':'3606','MYSQL_DATABASE':'synthetic'}
        fingerprint=hashlib.sha256(b'synthetic.invalid/synthetic').hexdigest()
        queries=[]
        class Cursor:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def execute(self,q,p):queries.append(q)
            def fetchall(self):return [(1,NOW),(2,NOW)]
        class Connection:
            def cursor(self):return Cursor()
        class Source:
            config=cfg
            connection=Connection()
            def schema(self):return SyntheticSource().schema()
        with tempfile.TemporaryDirectory() as root:
            export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','parent',source_fingerprint=fingerprint);validate_package(root,KEY)
            with self.assertRaises(ValueError):bind_baseline_endpoint(Source(),root,KEY)
            self.assertEqual(queries,[])
            self.assertEqual(bind_baseline_endpoint(Source(),root,KEY,True),endpoint_fingerprint(cfg))
            self.assertTrue(all(q.startswith('SELECT ') for q in queries))
            wrong=Source();wrong.config={**cfg,'MYSQL_PORT':'3607'}
            with self.assertRaises(ValueError):bind_baseline_endpoint(wrong,root,KEY,True)

    def test_cli_rejects_changed_port_before_connecting(self):
        import hashlib
        from unittest.mock import patch
        from tools.legacy_sync.incremental import main, endpoint_fingerprint
        from tools.legacy_sync.package import write_manifest
        cfg={'MYSQL_URL':'synthetic.invalid','MYSQL_PORT':'3606','MYSQL_DATABASE':'synthetic'}
        with tempfile.TemporaryDirectory() as location:
            b=Path(location);parent=b/'parent';key=b/'outside.key';key.write_bytes(KEY)
            export_snapshot(SyntheticSource(),parent,KEY,'abeiai-v1','parent',source_fingerprint=hashlib.sha256(b'synthetic.invalid/synthetic').hexdigest())
            m=validate_package(parent,KEY);m['sourceEndpointFingerprint']=endpoint_fingerprint(cfg);write_manifest(parent,m,KEY)
            source_env=b/'source.env';source_env.write_text('MYSQL_URL=synthetic.invalid\nMYSQL_PORT=3607\nMYSQL_DATABASE=synthetic\nMYSQL_USER=fixture\nMYSQL_PASSWORD=fixture\n')
            argv=['incremental','--source-env',str(source_env),'--baseline-package',str(parent),'--baseline-key-file',str(key),'--output',str(b/'delta'),'--key-file',str(key),'--run-id','child','--confirmed-legacy-entry']
            with patch('sys.argv',argv),patch('tools.legacy_sync.incremental.ReadOnlySource',side_effect=AssertionError('Unexpected connection')) as connect:
                with self.assertRaises(ValueError):main()
                connect.assert_not_called()

    def test_user_membership_catches_late_commit_below_numeric_high_watermark(self):
        from tools.legacy_sync.incremental import IncrementalSource, endpoint_fingerprint, index_row_allowed
        from tools.legacy_sync.tests.test_native_import import NOW
        cfg={'MYSQL_URL':'synthetic.invalid','MYSQL_PORT':'3606','MYSQL_DATABASE':'synthetic'}
        class Cursor:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def execute(self,*args):pass
            def fetchall(self):return [(1,NOW),(2,NOW),(3,NOW)]
        class Connection:
            def cursor(self):return Cursor()
        class Source:
            config=cfg
            version='8.0.36'
            connection=Connection()
        with tempfile.TemporaryDirectory() as root:
            export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','parent',source_fingerprint='a'*64)
            parent=validate_package(root,KEY);parent['tables']['app_user_user']['maxPk']='3';parent['sourceEndpointFingerprint']=endpoint_fingerprint(cfg)
            source=IncrementalSource(Source(),parent,'a'*64,known_users={'1','3'})
            source.rows('app_user_user',['id','date_joined'],0,3,250)
            self.assertEqual(source.metadata['newUserSourceIds'],['2'])
            self.assertEqual(source.metadata['knownUserSourceIds'],['1','2','3'])
            m={'incremental':source.metadata}
            self.assertTrue(index_row_allowed(m,{'sourceTable':'app_user_user','sourcePk':'2','values':{'id':'2'}}))

if __name__=='__main__':unittest.main()
