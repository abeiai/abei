import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.asset_index import build_index, open_index, seal, unseal, transfer_index
from tools.legacy_sync.object_transfer import transfer_one


class AssetCheckpoint(unittest.TestCase):
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
            for identity in ['first','second']:
                db.execute('INSERT INTO objects(id,payload) VALUES (?,?)',(identity,seal({'url':url,'hint':'image'},key,identity)))
            db.commit()
            db.close()
            manifest={'validationPassed':True,'dataSnapshotComplete':True,'assetsScanComplete':True,'sourceSystem':'abeiai-v1'}
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
            encrypted=db.execute('SELECT result FROM objects WHERE id="first"').fetchone()[0]
            self.assertEqual(unseal(encrypted,key,'first'),success)
            with self.assertRaises(Exception): unseal(encrypted,key,'second')
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
