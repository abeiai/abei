import copy
import datetime as dt
import os
import tempfile
import unittest
from pathlib import Path
from tools.legacy_sync.tests.test_native_import import SyntheticSource, KEY, NOW
from tools.legacy_sync.incremental import CONTEXT_TABLES, baseline_watermarks
from tools.legacy_sync.export import export_snapshot, validate_package
from tools.legacy_sync.package import load_manifest, write_manifest
from tools.legacy_sync.native_import import import_package
from tools.legacy_sync.native_mapping import LOG_KINDS, native_id, target_guard

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated test database required')
class IncrementalNativeContract(unittest.TestCase):
    def test_delta_appends_chat_preserves_password_and_refreshes_logs_without_regression(self):
        import psycopg
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        users=[native_id('user',str(pk)) for pk in (1,2,3)]
        def cleanup():
            with psycopg.connect(url) as conn:
                conn.execute('DELETE FROM legacy_ai_logs WHERE id=ANY(%s)',([native_id(t,str(pk)) for t in LOG_KINDS for pk in (1,2,3)],))
                conn.execute('DELETE FROM legacy_ai_sessions WHERE id=ANY(%s)',([native_id('session:'+t,str(pk)) for t in ('app_ai_chatsubject','app_ai_ttssubject') for pk in (1,2,3)],))
                conn.execute('DELETE FROM users WHERE id=ANY(%s)',(users,))
        cleanup();self.addCleanup(cleanup)
        protected=['wallets','ledger_entries','payment_orders','admin_users','ai_tasks']
        with psycopg.connect(url) as conn:before={t:conn.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in protected}
        with tempfile.TemporaryDirectory() as location:
            parent=Path(location)/'parent';root=Path(location)/'delta'
            export_snapshot(SyntheticSource(),parent,KEY,'abeiai-v1','synthetic-increment-parent',source_fingerprint='a'*64)
            baseline=validate_package(parent,KEY)
            import_package(parent,KEY,url,True,phase='core',allow_pending=True)
            with psycopg.connect(url) as conn:conn.execute('UPDATE users SET "passwordHash"=%s WHERE id=%s',('upgraded-fixture-hash',users[0]))
            source=SyntheticSource()
            source.data['app_user_user'].append({'id':3,'username':'synthetic-new-user','email':'fixture-new@example.invalid','is_active':1,'date_joined':NOW})
            source.data['app_ai_chatmessage'][0].update(assistant_content='完成后的正文',res_time=dt.datetime.now(),status=2)
            source.data['app_ai_chatmessage'].append({'id':2,'subject_id':1,'user_content':'旧会话新增消息','assistant_content':'新回复','req_time':NOW,'status':2})
            source.data['app_ai_drawmessage'].append({'id':2,'user_id':3,'prompt':'新增图片','results':'[]','req_time':NOW,'status':2})
            previous=baseline_watermarks(baseline)
            for table in list(source.data):
                if table not in CONTEXT_TABLES:source.data[table]=[r for r in source.data[table] if r['id']>previous[table] or table=='app_ai_chatmessage']
            meta={'protocol':1,'parentRunId':baseline['runId'],'parentSchemaSha256':baseline['schemaSha256'],'sourceFingerprint':'a'*64,'since':baseline['startedAt'],'overlapMinutes':10,'watermarks':{t:str(max(previous[t],source.data.get(t,[{'id':0}])[-1]['id'] if source.data.get(t) else 0)) for t in baseline['tables']},'tables':{t:{'mode':'CONTEXT' if t in CONTEXT_TABLES else 'DELTA','fromPk':str(previous[t])} for t in baseline['tables']}}
            export_snapshot(source,root,KEY,'abeiai-v1','synthetic-increment-child',incremental=meta,source_fingerprint='a'*64);validate_package(root,KEY)
            first=import_package(root,KEY,url,True,phase='core',allow_pending=True)
            second=import_package(root,KEY,url,True,phase='core',allow_pending=True)
            with psycopg.connect(url) as conn:
                self.assertEqual(conn.execute('SELECT "outputText" FROM legacy_ai_logs WHERE id=%s',(native_id('app_ai_chatmessage','1'),)).fetchone()[0],'完成后的正文')
                self.assertEqual(conn.execute('SELECT position FROM legacy_ai_session_items WHERE "logId"=%s',(native_id('app_ai_chatmessage','2'),)).fetchone()[0],1)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_session_items WHERE "sessionId"=%s',(native_id('session:app_ai_chatsubject','1'),)).fetchone()[0],2)
                self.assertEqual(conn.execute('SELECT "passwordHash" FROM users WHERE id=%s',(users[0],)).fetchone()[0],'upgraded-fixture-hash')
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM users WHERE id=ANY(%s)',(users,)).fetchone()[0],3)
                self.assertEqual(first['nativeLogRows'],first['sourceLogRows'])
                for t in protected:self.assertEqual(conn.execute('SELECT COUNT(*) FROM '+t).fetchone()[0],before[t])
            appended=Path(location)/'append-only'
            parent_delta=load_manifest(root,KEY)
            source2=SyntheticSource()
            for table in list(source2.data):
                if table not in CONTEXT_TABLES:source2.data[table]=[]
            source2.data['app_ai_chatmessage']=[{'id':3,'subject_id':1,'user_content':'纯追加消息','assistant_content':'第三条','req_time':NOW,'status':2}]
            next_meta=copy.deepcopy(meta);next_meta['parentRunId']=parent_delta['runId'];next_meta['since']=parent_delta['startedAt']
            for table,rule in next_meta['tables'].items():rule['fromPk']=next_meta['watermarks'][table]
            next_meta['watermarks']['app_ai_chatmessage']='3'
            export_snapshot(source2,appended,KEY,'abeiai-v1','synthetic-append-only',incremental=next_meta,source_fingerprint='a'*64);validate_package(appended,KEY)
            import_package(appended,KEY,url,True,phase='core',allow_pending=True)
            import_package(appended,KEY,url,True,phase='core',allow_pending=True)
            with psycopg.connect(url) as conn:
                self.assertEqual(conn.execute('SELECT position FROM legacy_ai_session_items WHERE "logId"=%s',(native_id('app_ai_chatmessage','3'),)).fetchone()[0],2)
            # A later snapshot of the same source row must win over a replayed older batch.
            newer=load_manifest(root,KEY);newer['startedAt']=(dt.datetime.fromisoformat(newer['startedAt'])+dt.timedelta(seconds=2)).isoformat();write_manifest(root,newer,KEY)
            import_package(root,KEY,url,True,phase='core',allow_pending=True)
            with psycopg.connect(url) as conn:conn.execute('UPDATE legacy_ai_logs SET "outputText"=%s WHERE id=%s',('较新批次正文',native_id('app_ai_chatmessage','1')))
            newer['startedAt']=(dt.datetime.fromisoformat(newer['startedAt'])-dt.timedelta(seconds=2)).isoformat();write_manifest(root,newer,KEY)
            import_package(root,KEY,url,True,phase='core',allow_pending=True)
            with psycopg.connect(url) as conn:self.assertEqual(conn.execute('SELECT "outputText" FROM legacy_ai_logs WHERE id=%s',(native_id('app_ai_chatmessage','1'),)).fetchone()[0],'较新批次正文')

if __name__=='__main__':unittest.main()
