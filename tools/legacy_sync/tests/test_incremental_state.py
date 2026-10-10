import json
import tempfile
import unittest
from pathlib import Path
from tools.legacy_sync.package import write_chunk, write_manifest

KEY=b'z'*32
class IncrementalCursorContract(unittest.TestCase):
    def fixtures(self,base):
        root=base/'package';key=base/'outside.key';key.write_bytes(KEY)
        m={'runId':'child','sourceFingerprint':'a'*64,'startedAt':'2026-10-09T12:00:00Z','sourceEndpointFingerprint':'e'*64,'incremental':{'parentRunId':'parent','since':'2026-10-08T03:00:00Z'}}
        r={'runId':'child','parentRunId':'parent','sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'snapshotAt':m['startedAt'],'dataVerified':True,'assetTransferFinished':True,'assetCounts':{'AVAILABLE':2,'MISSING':1}}
        path=base/'cursor.json';path.write_text(json.dumps({'runId':'parent','sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'snapshotAt':'2026-10-08T03:00:00Z','incompleteAssetPackages':[{'runId':'old','missingCount':52}]}))
        write_chunk(root,'reports/incremental-reconciliation.enc',[r],KEY)
        return path,root,key,m,r
    def test_authenticated_reconciliation_advances_once_and_keeps_old_missing_assets(self):
        from tools.legacy_sync.incremental_state import advance_cursor
        with tempfile.TemporaryDirectory() as location:
            path,root,key,m,r=self.fixtures(Path(location))
            first=advance_cursor(path,root,key,KEY,m);second=advance_cursor(path,root,key,KEY,m)
            self.assertEqual(first,second);self.assertEqual(first['runId'],'child')
            self.assertEqual([v['missingCount'] for v in first['incompleteAssetPackages']],[52,1])
            self.assertEqual(path.stat().st_mode&0o777,0o600)
    def test_pending_unverified_wrong_parent_or_foreign_source_never_advances(self):
        from tools.legacy_sync.incremental_state import advance_cursor
        for mutation in ('pending','unverified','parent','source','endpoint','cutoff'):
            with tempfile.TemporaryDirectory() as location:
                path,root,key,m,r=self.fixtures(Path(location));before=path.read_bytes()
                if mutation=='pending':r['assetCounts']['PENDING']=1
                elif mutation=='unverified':r['dataVerified']=False
                elif mutation=='parent':m['incremental']['parentRunId']='foreign'
                elif mutation=='source':m['sourceFingerprint']='b'*64
                elif mutation=='endpoint':m['sourceEndpointFingerprint']='f'*64
                else:m['incremental']['since']='2026-10-08T04:00:00Z'
                write_chunk(root,'reports/incremental-reconciliation.enc',[r],KEY)
                with self.assertRaises(ValueError):advance_cursor(path,root,key,KEY,m)
                self.assertEqual(path.read_bytes(),before)
    def test_symlink_cursor_is_rejected_without_mutating_destination(self):
        from tools.legacy_sync.incremental_state import advance_cursor
        with tempfile.TemporaryDirectory() as location:
            base=Path(location);path,root,key,m,r=self.fixtures(base);actual=base/'actual.json';path.rename(actual);path.symlink_to(actual)
            before=actual.read_bytes()
            with self.assertRaises(ValueError):advance_cursor(path,root,key,KEY,m)
            self.assertEqual(actual.read_bytes(),before)

    def test_initial_cursor_requires_completed_scoped_receipt_and_keeps_missing(self):
        from tools.legacy_sync.incremental_state import initialize_cursor
        with tempfile.TemporaryDirectory() as location:
            b=Path(location);root=b/'package';key=b/'outside.key';key.write_bytes(KEY);path=b/'cursor.json'
            m={'dataSnapshotComplete':True,'validationPassed':True,'runId':'parent','sourceFingerprint':'a'*64,'sourceEndpointFingerprint':'e'*64,'startedAt':'2026-10-08T03:00:00Z','assetTransferCounts':{'MISSING':52,'PENDING':8}}
            write_manifest(root,m,KEY)
            write_chunk(root,'reports/native-core.enc',[{'runId':'parent','nativeLogRows':1,'sourceLogRows':1,'nativeUserRows':1,'sourceUserRows':1}],KEY)
            with self.assertRaises(ValueError):initialize_cursor(path,root,key)
            self.assertFalse(path.exists())
            sid='a'*64;file='reports/selection-'+sid+'.enc'
            assets={'selection':{'selectionId':sid,'identity':{'runId':'parent'}},'transferFinished':False,'counts':{'MISSING':52,'PENDING':8}}
            write_chunk(root,file,[assets],KEY)
            with self.assertRaises(ValueError):initialize_cursor(path,root,key,file)
            assets.update(transferFinished=True,counts={'AVAILABLE':2,'MISSING':52});write_chunk(root,file,[assets],KEY)
            write_chunk(root,'reports/reconciliation-'+sid+'.enc',[{'runId':'parent','selectionId':sid,'counts':assets['counts']}],KEY)
            value=initialize_cursor(path,root,key,file)
            self.assertEqual(value['incompleteAssetPackages'][0]['missingCount'],52)

    def test_each_asset_must_keep_log_owner_storage_key_and_hash(self):
        from tools.legacy_sync.incremental_state import verify_asset_batch
        fields=('id','logId','position','role','fieldPath','mediaType','status','filename','mimeType','storageKey','sha256')
        want=('asset1','log1',0,'OUTPUT','/results/0','IMAGE','AVAILABLE','file.png','image/png','r2:correct','a'*64)
        class Connection:
            def __init__(self,row):self.row=row
            def execute(self,*args):return [self.row]
        expected={'asset1':want}
        verify_asset_batch(Connection(want),expected)
        for field,bad in [('logId','other-user-log'),('position',7),('storageKey','r2:wrong'),('sha256','b'*64),('fieldPath','/other')]:
            row=list(want);row[fields.index(field)]=bad
            with self.assertRaises(ValueError):verify_asset_batch(Connection(tuple(row)),expected)

if __name__=='__main__':unittest.main()
