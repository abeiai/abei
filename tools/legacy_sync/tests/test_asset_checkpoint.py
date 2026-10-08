import io
import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.asset_index import build_index, open_index, seal, unseal, transfer_index
from tools.legacy_sync.object_transfer import transfer_one, pinned_adapter


class AssetCheckpoint(unittest.TestCase):
    def test_transport_pins_public_ip_and_rejects_private_second_resolution(self):
        with patch('tools.legacy_sync.assets.public_dns',return_value=['1.1.1.1']), patch('urllib3.util.connection.create_connection',return_value='synthetic-socket') as connect:
            _,Connection=pinned_adapter()
            connection=Connection('cdn.abeiai.com',443)
            self.assertEqual(connection._new_conn(),'synthetic-socket')
            self.assertEqual(connect.call_args.args[0],('1.1.1.1',443))
            self.assertEqual(connection.host,'cdn.abeiai.com')
        with patch('tools.legacy_sync.assets.public_dns',return_value=['127.0.0.1']),patch('urllib3.util.connection.create_connection') as connect:
            _,Connection=pinned_adapter()
            with self.assertRaises(ValueError): Connection('cdn.abeiai.com',443)._new_conn()
            connect.assert_not_called()

    def test_inline_media_limit_is_checked_before_source_decodes(self):
        class Source:
            def read(self,url): raise AssertionError('Oversized input must not reach decoding')
        with self.assertRaises(ValueError): transfer_one(Source(),None,'fixture','data:image/png;base64,'+'A'*144,'image','abeiai-v1',max_bytes=8)
    def test_deleted_checkpoint_object_or_forged_table_state_cannot_claim_completion(self):
        key=b'x'*32
        config={'OSS_BUCKET_NAME':'abei-cdn','OSS_DOMAIN':'https://cdn.abeiai.com/','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','MEDIA_URL':'/abei/'}
        row={'sourceTable':'app_ai_drawmessage','sourcePk':'1','values':{'results':'["https://cdn.abeiai.com/abei/fixture.png"]','user_id':'1'}}
        manifest={'validationPassed':True,'dataSnapshotComplete':True,'sourceSystem':'abeiai-v1','tables':{'app_ai_chatsubject':{},'app_ai_drawmessage':{}}}
        for corruption in ['objects','state','status']:
            with tempfile.TemporaryDirectory() as root:
                with patch('tools.legacy_sync.asset_index.table_rows',side_effect=lambda root,manifest,key,table: iter([row] if table=='app_ai_drawmessage' else [])):
                    build_index(root,manifest,key,config)
                db=open_index(root)
                if corruption=='objects': db.execute('DELETE FROM objects')
                elif corruption=='state': db.execute('UPDATE state SET value="0"')
                else: db.execute('UPDATE objects SET status="AVAILABLE"')
                db.commit();db.close()
                with self.assertRaises(ValueError): transfer_index(root,manifest,key,None,None,'https://fixture.invalid',workers=1)

    def test_incomplete_snapshot_cannot_scan_or_upload_even_if_flag_is_set(self):
        with tempfile.TemporaryDirectory() as root:
            manifest={'validationPassed':True,'dataSnapshotComplete':False,'assetsScanComplete':True}
            with self.assertRaises(ValueError): build_index(root,manifest,b'x'*32,{})
            with self.assertRaises(ValueError): transfer_index(root,manifest,b'x'*32,None,None,'https://fixture.invalid')

    def test_index_symlink_cannot_escape_package(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            Path(root,'assets').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(ValueError): open_index(root)
            self.assertFalse(Path(outside,'index.sqlite').exists())

    def test_resume_preserves_encrypted_reference_order_and_never_reuploads_success(self):
        key=b'x'*32
        url='https://cdn.abeiai.com/secret-user-media.png'
        with tempfile.TemporaryDirectory() as root:
            db=open_index(root)
            ids=[]
            for label in ['first','second']:
                identity=hashlib.sha256(json.dumps({'url':url+label},sort_keys=True,separators=(',',':')).encode()).hexdigest();ids.append(identity)
                db.execute('INSERT INTO objects(id,payload) VALUES (?,?)',(identity,seal({'url':url+label,'hint':'image','identity':{'url':url+label}},key,identity)))
            namespace={'sourceSystem':'abeiai-v1','runId':None,'schemaSha256':None}
            db.execute('INSERT INTO state(name,value) VALUES (?,?)',('namespace',seal(namespace,key,'index:namespace').hex()))
            db.commit()
            db.close()
            manifest={'validationPassed':True,'dataSnapshotComplete':True,'assetsScanComplete':True,'sourceSystem':'abeiai-v1','assetReferenceCount':0,'assetObjectCount':2}
            success={'status':'AVAILABLE','sha256':'a'*64,'sizeBytes':8,'objectKey':'fixture'}
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=success) as transfer:
                transfer_index(root,manifest,key,None,None,'https://fixture.invalid',workers=1,limit=1)
                self.assertEqual(transfer.call_count,1)
                self.assertFalse(manifest['assetTransferFinished'])
                transfer_index(root,manifest,key,None,None,'https://fixture.invalid',workers=1)
                self.assertEqual(transfer.call_count,2)
                self.assertTrue(manifest['assetsComplete'])
                transfer_index(root,manifest,key,None,None,'https://fixture.invalid',workers=1)
                self.assertEqual(transfer.call_count,2)
            self.assertNotIn(url.encode(),Path(root,'assets/index.sqlite').read_bytes())
            db=open_index(root)
            encrypted=db.execute('SELECT result FROM objects WHERE id=?',(ids[0],)).fetchone()[0]
            self.assertEqual(unseal(encrypted,key,ids[0]),success)
            with self.assertRaises(Exception): unseal(encrypted,key,ids[1])
            db.close()

    def test_length_mismatch_closes_source_and_does_not_upload(self):
        body=io.BytesIO(b'\x89PNG\r\n\x1a\n')
        class Source:
            def read(self,url): return body,{'contentLength':9}
        with patch('tools.legacy_sync.object_transfer.upload_to_r2') as upload:
            with self.assertRaises(ValueError): transfer_one(Source(),None,'https://fixture.invalid','fixture','image','abeiai-v1')
            upload.assert_not_called()
        self.assertTrue(body.closed)


if __name__=='__main__': unittest.main()
