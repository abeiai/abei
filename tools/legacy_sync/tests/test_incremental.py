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

    def test_incremental_watermarks_keep_empty_table_cursor_and_parent_binding(self):
        from tools.legacy_sync.incremental import baseline_watermarks, validate_incremental_manifest
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','baseline')
            parent=validate_package(root,KEY);parent['sourceFingerprint']='a'*64
            parent['incremental']={'watermarks':{t:'91' for t in parent['tables']}}
            self.assertEqual(baseline_watermarks(parent)['app_ai_works'],91)
            child=copy.deepcopy(parent);child['runId']='child'
            child['incremental']={'protocol':1,'parentRunId':'baseline','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:'91' for t in parent['tables']},'tables':{t:{'mode':'DELTA','fromPk':'91'} for t in parent['tables']}}
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
            meta={'protocol':1,'parentRunId':'parent','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:str(n) for t,n in previous.items()},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in previous.items()}}
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
            meta={'protocol':1,'parentRunId':'parent','parentSchemaSha256':parent['schemaSha256'],'sourceFingerprint':'a'*64,'since':parent['startedAt'],'overlapMinutes':10,'watermarks':{t:str(n) for t,n in previous.items()},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in previous.items()}}
            export_snapshot(SyntheticSource(),root,KEY,'abeiai-v1','invalid-delta',incremental=meta,source_fingerprint='a'*64)
            with self.assertRaises(ValueError):validate_package(root,KEY)

if __name__=='__main__':unittest.main()
