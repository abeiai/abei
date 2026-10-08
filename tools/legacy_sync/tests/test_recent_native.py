import inspect
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.tests.test_native_import import SyntheticSource,KEY,NOW,CONFIG
from tools.legacy_sync.asset_index import build_index,open_index,seal,transfer_index
from tools.legacy_sync.recent_assets import build_recent_selection
from tools.legacy_sync.export import export_snapshot,validate_package
from tools.legacy_sync.package import load_manifest,write_manifest
from tools.legacy_sync.native_import import import_package
from tools.legacy_sync.native_mapping import native_id,target_guard,LOG_KINDS


@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated test database required')
class RecentNative(unittest.TestCase):
    def test_scoped_backfill_is_owned_idempotent_and_leaves_other_users_and_finance_untouched(self):
        self.assertIn('selection_id',inspect.signature(import_package).parameters,'Scoped native asset backfill is not implemented')
        import psycopg
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,testing=True)
        users=[native_id('user',str(pk)) for pk in [1,2]]
        logs=[native_id(table,str(pk)) for table in LOG_KINDS for pk in [1,2]]
        filenames=['legacy-sync/abeiai-v1/'+letter*64+'.png' for letter in ['a','b']]
        def cleanup():
            with psycopg.connect(url) as conn:
                conn.execute('DELETE FROM legacy_ai_logs WHERE id=ANY(%s)',(logs,))
                conn.execute('DELETE FROM legacy_ai_sessions WHERE id=ANY(%s)',([native_id('session:'+table,str(pk)) for table in ['app_ai_chatsubject','app_ai_ttssubject'] for pk in [1,2]],))
                conn.execute('DELETE FROM media_assets WHERE "createdByUserId"=ANY(%s) AND filename=ANY(%s)',(users,filenames))
                conn.execute('DELETE FROM users WHERE id=ANY(%s)',(users,))
        cleanup();self.addCleanup(cleanup)
        protected=['ai_tasks','payment_orders','wallets','admin_users','ledger_entries']
        with psycopg.connect(url) as conn: before={t:conn.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in protected}
        source=SyntheticSource();source.data['app_user_user'][0]['last_login']=NOW
        source.data['app_user_user'][1]['avatar']='https://cdn.abeiai.com/abei/outside.png'
        source.data['app_ai_drawmessage'].append({'id':2,'user_id':2,'prompt':'旧用户素材','results':'["https://cdn.abeiai.com/abei/outside.png"]','req_time':NOW,'status':2})
        with tempfile.TemporaryDirectory() as root:
            export_snapshot(source,Path(root),KEY,'abeiai-v1','synthetic-scoped-native');validate_package(root,KEY)
            m=load_manifest(root,KEY);m['startedAt']='2024-01-02T00:00:00+00:00';write_manifest(root,m,KEY)
            build_index(root,m,KEY,CONFIG);scope=build_recent_selection(root,m,KEY);sid=scope['selectionId']
            self.assertEqual(scope['sourceUserIds'],['1']);self.assertEqual(scope['objectCount'],3)
            def result(letter):
                key='picture-books/legacy-sync/abeiai-v1/'+letter*64+'.png'
                return {'status':'AVAILABLE','sha256':letter*64,'sizeBytes':8,'mimeType':'image/png','objectKey':key,'publicUrl':'https://fixture.invalid/'+key}
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=result('a')):
                transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,limit=1,selection_id=sid)
            db=open_index(root)
            outside=db.execute('SELECT id FROM objects WHERE id NOT IN (SELECT object_id FROM selection_objects WHERE selection_id=?)',(sid,)).fetchone()[0]
            db.execute('UPDATE objects SET status="AVAILABLE",result=?,sha256=?,size_bytes=8 WHERE id=?',(seal(result('b'),KEY,outside),'b'*64,outside));db.commit();db.close()
            import_package(root,KEY,url,testing=True,phase='core',allow_pending=True)
            from tools.legacy_sync import native_import
            original_bulk=native_import.bulk_rows
            outside_ref=None
            def mutate_scope(conn,table,rows,progress=None):
                nonlocal outside_ref
                if table=='legacy_ai_log_assets' and outside_ref is None:
                    other=open_index(root)
                    outside_ref=other.execute('SELECT id FROM refs WHERE object_id=? LIMIT 1',(outside,)).fetchone()[0]
                    other.execute('INSERT INTO selection_refs VALUES (?,?)',(sid,outside_ref))
                    other.execute('INSERT INTO selection_objects VALUES (?,?)',(sid,outside));other.commit();other.close()
                return original_bulk(conn,table,rows,progress)
            try:
                with patch('tools.legacy_sync.native_import.bulk_rows',side_effect=mutate_scope):
                    with self.assertRaises(ValueError):import_package(root,KEY,url,testing=True,phase='assets',allow_pending=True,selection_id=sid)
            finally:
                other=open_index(root)
                other.execute('DELETE FROM selection_refs WHERE selection_id=? AND reference_id=?',(sid,outside_ref))
                other.execute('DELETE FROM selection_objects WHERE selection_id=? AND object_id=?',(sid,outside));other.commit();other.close()
            with psycopg.connect(url) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_log_assets WHERE "logId"=ANY(%s)',(logs,)).fetchone()[0],3)
                self.assertEqual(dict(conn.execute('SELECT status,COUNT(*) FROM legacy_ai_log_assets WHERE "logId"=ANY(%s) GROUP BY status',(logs,)).fetchall()),{'AVAILABLE':1,'PENDING':2})
                self.assertIsNone(conn.execute('SELECT "avatarUrl" FROM users WHERE id=%s',(users[1],)).fetchone()[0])
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM media_assets WHERE "createdByUserId"=%s AND filename=ANY(%s)',(users[1],filenames)).fetchone()[0],0)
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=result('a')):
                transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,selection_id=sid)
            import_package(root,KEY,url,testing=True,phase='assets',selection_id=sid)
            import_package(root,KEY,url,testing=True,phase='assets',selection_id=sid)
            with psycopg.connect(url) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_log_assets WHERE "logId"=ANY(%s) AND status=\'AVAILABLE\'',(logs,)).fetchone()[0],3)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM media_assets WHERE "createdByUserId"=ANY(%s) AND filename=ANY(%s)',(users,filenames)).fetchone()[0],1)
                for table in protected:self.assertEqual(conn.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],before[table])
            self.assertFalse(load_manifest(root,KEY).get('assetTransferFinished',False))


if __name__=='__main__':unittest.main()
