import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import psycopg
from tools.legacy_sync.tests.test_native_import import SyntheticSource, KEY, NOW, CONFIG
from tools.legacy_sync.export import export_snapshot, validate_package
from tools.legacy_sync.incremental import CONTEXT_TABLES, baseline_watermarks
from tools.legacy_sync.package import load_manifest
from tools.legacy_sync.asset_index import build_index, transfer_index
from tools.legacy_sync.native_import import import_package
from tools.legacy_sync.native_mapping import native_id, LOG_KINDS, target_guard
from tools.legacy_sync.incremental_state import reconcile_increment, advance_cursor, atomic_cursor

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated test database required')
class IncrementalReconciliationIntegration(unittest.TestCase):
    def test_real_target_and_checkpoint_reject_corruption_and_bad_public_readback(self):
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        owners=[native_id('user',str(pk)) for pk in (1,2,3)]
        def cleanup():
            with psycopg.connect(url) as c:
                c.execute('DELETE FROM legacy_ai_logs WHERE id=ANY(%s)',([native_id(t,str(pk)) for t in LOG_KINDS for pk in (1,2)],))
                c.execute('DELETE FROM legacy_ai_sessions WHERE id=ANY(%s)',([native_id('session:'+t,str(pk)) for t in ('app_ai_chatsubject','app_ai_ttssubject') for pk in (1,2)],))
                c.execute('DELETE FROM picture_books WHERE id=%s',(native_id('picture-book','2'),))
                c.execute('DELETE FROM media_assets WHERE "createdByUserId"=ANY(%s) AND filename=%s',(owners,'legacy-sync/abeiai-v1/'+hashlib.sha256(b'fixture-image').hexdigest()+'.png'))
                c.execute('DELETE FROM users WHERE id=ANY(%s)',(owners,))
        cleanup();self.addCleanup(cleanup)
        with tempfile.TemporaryDirectory() as location:
            base=Path(location);parent=base/'parent';root=base/'delta';key_file=base/'outside.key';key_file.write_bytes(KEY)
            export_snapshot(SyntheticSource(),parent,KEY,'abeiai-v1','reconcile-parent',source_fingerprint='a'*64)
            prior=validate_package(parent,KEY);import_package(parent,KEY,url,True,phase='core',allow_pending=True)
            previous=baseline_watermarks(prior);source=SyntheticSource()
            source.data['app_user_user'].append({'id':3,'username':'reconcile-fixture','email':'reconcile@example.invalid','is_active':1,'date_joined':NOW})
            for table in list(source.data):
                if table not in CONTEXT_TABLES:source.data[table]=[]
            source.data['app_ai_drawmessage']=[{'id':2,'user_id':3,'prompt':'合成增量图片','results':'["https://cdn.abeiai.com/abei/increment-fixture.png"]','req_time':NOW.replace(microsecond=999600),'status':2}]
            source.data['app_ai_product']=[{'id':2,'user_id':3,'title':'合成绘本','is_delete':0,'building':0,'create_time':NOW.replace(microsecond=999600),'update_time':NOW.replace(microsecond=999600),'result':json.dumps([{'title_zh':'合成绘本','rn_case_pages':[{'body_zh':'合成正文','img':'https://cdn.abeiai.com/abei/increment-fixture.png'}]}])}]
            meta={'protocol':1,'parentRunId':prior['runId'],'parentSchemaSha256':prior['schemaSha256'],'sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'since':prior['startedAt'],'overlapMinutes':10,'watermarks':{t:str(max(n,max((r['id'] for r in source.data.get(t,[])),default=0))) for t,n in previous.items()},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(n)} for t,n in previous.items()}}
            export_snapshot(source,root,KEY,'abeiai-v1','reconcile-child',incremental=meta,source_fingerprint='a'*64);m=validate_package(root,KEY)
            import_package(root,KEY,url,True,phase='core',allow_pending=True)
            m=build_index(root,m,KEY,CONFIG);body=b'fixture-image';digest=hashlib.sha256(body).hexdigest();object_key='picture-books/legacy-sync/abeiai-v1/'+digest+'.png'
            success={'status':'AVAILABLE','sha256':digest,'sizeBytes':len(body),'mimeType':'image/png','objectKey':object_key,'publicUrl':'https://fixture.invalid/'+object_key}
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=success):transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1)
            import_package(root,KEY,url,True,phase='assets')
            cursor=base/'cursor.json';atomic_cursor(cursor,{'runId':prior['runId'],'snapshotAt':prior['startedAt'],'sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'incompleteAssetPackages':[]});before=cursor.read_bytes()
            class Response:
                status_code=200
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def iter_content(self,*args):return [body]
            with patch('tools.legacy_sync.incremental_state.validate_download_url',side_effect=lambda url,hosts:url),patch('requests.Session.get',return_value=Response()):
                with psycopg.connect(url) as c:
                    asset=c.execute('SELECT id,"storageKey" FROM legacy_ai_log_assets WHERE "logId"=%s',(native_id('app_ai_drawmessage','2'),)).fetchone()
                    c.execute('UPDATE legacy_ai_log_assets SET "storageKey"=%s WHERE id=%s',('r2:wrong',asset[0]))
                with self.assertRaises(ValueError):reconcile_increment(root,KEY,url,'https://fixture.invalid',testing=True)
                self.assertFalse((root/'reports/incremental-reconciliation.enc').exists());self.assertEqual(cursor.read_bytes(),before)
                with psycopg.connect(url) as c:c.execute('UPDATE legacy_ai_log_assets SET "storageKey"=%s WHERE id=%s',(asset[1],asset[0]))
                for bad in ('status','hash'):
                    response=Response()
                    if bad=='status':response.status_code=404
                    else:response.iter_content=lambda *args:[b'truncated']
                    with patch('requests.Session.get',return_value=response):
                        with self.assertRaises(ValueError):reconcile_increment(root,KEY,url,'https://fixture.invalid',testing=True)
                    self.assertFalse((root/'reports/incremental-reconciliation.enc').exists());self.assertEqual(cursor.read_bytes(),before)
                report=reconcile_increment(root,KEY,url,'https://fixture.invalid',testing=True)
            self.assertEqual(report['assetCounts'],{'AVAILABLE':1});self.assertEqual(report['bookCounts']['newCompatible'],1)
            m=load_manifest(root,KEY);first=advance_cursor(cursor,root,key_file,KEY,m);self.assertEqual(first,advance_cursor(cursor,root,key_file,KEY,m))
            self.assertEqual(first['runId'],'reconcile-child')
