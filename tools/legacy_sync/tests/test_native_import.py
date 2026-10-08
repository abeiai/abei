import copy
import datetime as dt
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.tests.test_snapshot_review import BASELINE
from tools.legacy_sync.export import export_snapshot, validate_package
from tools.legacy_sync.package import load_manifest, write_manifest
from tools.legacy_sync.asset_index import build_index, transfer_index
from tools.legacy_sync.native_import import import_package
from tools.legacy_sync.native_mapping import native_id

NOW=dt.datetime(2024,1,1,8)
KEY=b'x'*32
CONFIG={'OSS_BUCKET_NAME':'abei-cdn','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','OSS_DOMAIN':'https://cdn.abeiai.com/','MEDIA_URL':'/abei/'}

class SyntheticSource:
    version='8.0.36'
    def __init__(self):
        self.data={
          'app_user_user':[{'id':1,'username':'13800138000','email':'fixture-one@example.invalid','nickname':'合成用户一','is_active':1,'date_joined':NOW,'extra':'{}','openid':'fixture-one-mp'}, {'id':2,'username':'fixture-two','email':'fixture-two@example.invalid','is_active':0,'date_joined':NOW,'extra':'{}'}],
          'app_ai_chatsubject':[{'id':1,'user_id':1,'create_time':NOW,'chat_system':'系统正文','msg_id':'session-fixture'}],
          'app_ai_chatmessage':[{'id':1,'subject_id':1,'user_content':'用户正文','assistant_content':'助手正文','req_time':NOW,'status':2}],
          'app_ai_drawmessage':[{'id':1,'user_id':1,'prompt':'合成图片','results':'["https://cdn.abeiai.com/abei/fixture.png"]','req_time':NOW,'status':2}],
          'app_ai_ttsmessage':[{'id':1,'user_id':1,'user_content':'合成语音','assistant_content':'https://cdn.abeiai.com/abei/fixture.mp3','req_time':NOW,'status':2,'version_id':3,'msg_id':'audio-fixture'}],
          'app_ai_ttssubject':[{'id':pk,'user_id':pk,'body':'[{"user_content":"合成语音","version_id":3,"msg_id":"audio-fixture","hash_str":"'+hashlib.md5('合成语音_3'.encode()).hexdigest()+'"}]','req_time':NOW,'status':2,'msg_id':'audio-session-fixture-'+str(pk)} for pk in [1,2]],
          'app_ai_videomessage':[{'id':1,'user_id':1,'user_content':'合成视频','assistant_content':'https://cdn.abeiai.com/abei/fixture.mp4','req_time':NOW,'status':3}],
        }
    def schema(self): return copy.deepcopy(BASELINE)
    def bounds(self,table):
        rows=self.data.get(table,[])
        return (rows[0]['id'],rows[-1]['id'],len(rows)) if rows else (None,None,0)
    def rows(self,table,columns,after,upper,limit): return [tuple(row.get(column) for column in columns) for row in self.data.get(table,[]) if row['id']>after][:limit]
    def credentials(self,table,columns,after,upper,limit): return [(row['id'],'pbkdf2_sha256$1$fixture$'+('A'*43)+'=') for row in self.data.get(table,[]) if row['id']>after][:limit]
    def close(self): pass

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated test database required')
class NativeImportIntegration(unittest.TestCase):
    def test_native_tables_are_idempotent_owned_and_do_not_create_finance_tasks_or_admins(self):
        import psycopg
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL']
        with tempfile.TemporaryDirectory() as root:
            export_snapshot(SyntheticSource(),Path(root),KEY,'abeiai-v1','synthetic-native-run')
            manifest=load_manifest(root,KEY)
            validate_package(root,KEY)
            manifest['validationPassed']=True
            write_manifest(root,manifest,KEY)
            build_index(root,manifest,KEY,CONFIG)
            success={'status':'AVAILABLE','sha256':'a'*64,'sizeBytes':8,'mimeType':'image/png','objectKey':'picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.png','publicUrl':'https://fixture.invalid/picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.png'}
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=success): transfer_index(root,manifest,KEY,None,None,'https://fixture.invalid',workers=1)
            first=import_package(root,KEY,url,testing=True)
            second=import_package(root,KEY,url,testing=True)
            with psycopg.connect(url) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_logs WHERE "sourceSystem"=%s',('abeiai-v1',)).fetchone()[0],6)
                self.assertEqual(conn.execute('SELECT "sourceUserId","userId" FROM legacy_ai_logs WHERE id=%s',(native_id('app_ai_chatmessage','1'),)).fetchone(),('1',native_id('user','1')))
                self.assertEqual(conn.execute('SELECT "status" FROM users WHERE id=%s',(native_id('user','2'),)).fetchone()[0],'DISABLED')
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_session_items WHERE "logId"=%s',(native_id('app_ai_ttsmessage','1'),)).fetchone()[0],1)
                self.assertIsNone(conn.execute('SELECT "logId" FROM legacy_ai_session_items WHERE "sessionId"=%s',(native_id('session:app_ai_ttssubject','2'),)).fetchone()[0])
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM legacy_ai_log_assets WHERE status=\'AVAILABLE\'').fetchone()[0],3)
                for table in ['ai_tasks','payment_orders','wallets','admin_users']:
                    self.assertEqual(conn.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)
            self.assertEqual(first['sourceLogRows'],second['sourceLogRows'])

if __name__=='__main__': unittest.main()
