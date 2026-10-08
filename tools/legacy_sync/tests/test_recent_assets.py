import datetime as dt
import hashlib
import importlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.asset_index import build_index, open_index, seal, unseal, transfer_index
from tools.legacy_sync.package import encode_value, write_chunk, write_manifest, load_manifest, read_chunk

KEY=b'x'*32
BASE='https://cdn.abeiai.com/abei/'
CONFIG={'OSS_BUCKET_NAME':'abei-cdn','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','OSS_DOMAIN':'https://cdn.abeiai.com/','MEDIA_URL':'/abei/'}


def fixture(root, empty=False):
    dates={1:'2026-10-07T03:00:00+00:00',2:'2026-09-08T03:00:00+00:00',3:'2026-09-08T02:59:59+00:00',4:None,5:'2026-10-08T03:00:01+00:00',6:'2026-10-08T03:00:00+00:00'}
    rows={
        'app_user_user':[{'id':str(i),'last_login':encode_value(dt.datetime.fromisoformat(date)) if date and not empty else None,'is_active':'0' if i==6 else '1','avatar':BASE+('shared.png' if i==1 else str(i)+'.png')} for i,date in dates.items()],
        'app_ai_chatsubject':[{'id':'11','user_id':'1'},{'id':'12','user_id':'3'}],
        'app_ai_chatmessage':[{'id':'21','subject_id':'11','assistant_content':BASE+'chat.png'},{'id':'22','subject_id':'12','assistant_content':BASE+'oldchat.png'}],
        'app_ai_drawmessage':[{'id':'31','user_id':'1','results':json.dumps([BASE+'shared.png',BASE+'recent.png'])},{'id':'32','user_id':'3','results':json.dumps([BASE+'shared.png',BASE+'old.png'])},{'id':'33','user_id':None,'results':BASE+'orphan.png'}],
    }
    m={'protocol':1,'validationPassed':True,'dataSnapshotComplete':True,'assetsComplete':False,'sourceSystem':'abeiai-v1','runId':'synthetic-recent','schemaSha256':'a'*64,'startedAt':'2026-10-08T03:00:00+00:00','tables':{}}
    for table, values in rows.items():
        chunk=write_chunk(root,'tables/'+table+'.000001.enc',[{'sourceSystem':'abeiai-v1','sourceTable':table,'sourcePk':v['id'],'values':v} for v in values],KEY)
        m['tables'][table]={'columns':list({c for v in values for c in v}),'chunks':[chunk],'restrictedChunks':[],'count':len(values)}
    write_manifest(root,m,KEY)
    build_index(root,m,KEY,CONFIG)
    return m


def success(url):
    digest=hashlib.sha256(url.encode()).hexdigest()
    object_key='picture-books/legacy-sync/abeiai-v1/'+digest+'.png'
    return {'status':'AVAILABLE','sha256':digest,'sizeBytes':8,'mimeType':'image/png','objectKey':object_key,'publicUrl':'https://fixture.invalid/'+object_key}


class RecentAssets(unittest.TestCase):
    def setUp(self):
        try:self.api=importlib.import_module('tools.legacy_sync.recent_assets')
        except ModuleNotFoundError:self.api=None
        self.assertIsNotNone(self.api,'Authenticated recent-user selection is not implemented')

    def test_cohort_uses_snapshot_window_and_authenticated_source_ownership(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root);scope=self.api.build_recent_selection(root,m,KEY)
            self.assertEqual(scope['sourceUserIds'],['1','2','6'])
            self.assertEqual(scope['referenceCount'],6)
            self.assertEqual(scope['objectCount'],5)
            self.assertEqual(scope['windowStart'],'2026-09-08T03:00:00+00:00')
            db=open_index(root)
            owned=list(db.execute('SELECT r.table_name,r.source_pk FROM selection_refs s JOIN refs r ON r.id=s.reference_id WHERE s.selection_id=? ORDER BY r.table_name,r.source_pk,r.ordinal',(scope['selectionId'],)))
            self.assertEqual(owned,[('app_ai_chatmessage','21'),('app_ai_drawmessage','31'),('app_ai_drawmessage','31'),('app_user_user','1'),('app_user_user','2'),('app_user_user','6')])
            self.assertEqual(self.api.build_recent_selection(root,m,KEY)['selectionId'],scope['selectionId'])
            db.close()

    def test_partial_transfer_never_uploads_outside_scope_or_marks_full_package_complete(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root);scope=self.api.build_recent_selection(root,m,KEY);sid=scope['selectionId'];sent=[]
            def copy(origin,client,base,url,hint,system):sent.append(url);return success(url)
            with patch('tools.legacy_sync.asset_index.transfer_one',side_effect=copy):
                first=transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,limit=1,selection_id=sid)
                self.assertFalse(first['transferFinished'])
                final=transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,selection_id=sid)
                self.assertTrue(final['transferFinished']);self.assertEqual(final['counts'],{'AVAILABLE':5})
                self.assertFalse(final['cohortAllAssetsRestored'])
                transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,selection_id=sid)
            self.assertCountEqual(sent,[BASE+'shared.png',BASE+'2.png',BASE+'6.png',BASE+'recent.png',BASE+'chat.png'])
            persisted=load_manifest(root,KEY)
            self.assertFalse(persisted.get('assetTransferFinished',False));self.assertFalse(persisted['assetsComplete'])
            db=open_index(root)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM objects WHERE status="PENDING"').fetchone()[0],6)
            db.close()

    def test_selection_membership_tampering_and_foreign_run_are_rejected_before_copy(self):
        for corrupt in ['extra_object','deleted_ref','foreign_run']:
            with tempfile.TemporaryDirectory() as root:
                m=fixture(root);scope=self.api.build_recent_selection(root,m,KEY);sid=scope['selectionId'];db=open_index(root)
                if corrupt=='extra_object':
                    outside=db.execute('SELECT id FROM objects WHERE id NOT IN (SELECT object_id FROM selection_objects WHERE selection_id=?) LIMIT 1',(sid,)).fetchone()[0]
                    db.execute('INSERT INTO selection_objects VALUES (?,?)',(sid,outside))
                elif corrupt=='deleted_ref':db.execute('DELETE FROM selection_refs WHERE rowid IN (SELECT rowid FROM selection_refs WHERE selection_id=? LIMIT 1)',(sid,))
                else:m={**m,'runId':'foreign-run'}
                db.commit();db.close()
                with patch('tools.legacy_sync.asset_index.transfer_one') as copy:
                    with self.assertRaises(ValueError):transfer_index(root,m,KEY,None,None,'https://fixture.invalid',selection_id=sid)
                    copy.assert_not_called()

    def test_retry_only_changes_failed_selected_objects(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root);scope=self.api.build_recent_selection(root,m,KEY);sid=scope['selectionId']
            with patch('tools.legacy_sync.asset_index.transfer_one',side_effect=ConnectionError('synthetic unavailable')):
                transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,selection_id=sid)
            db=open_index(root)
            outside=db.execute('SELECT id FROM objects WHERE status="PENDING" LIMIT 1').fetchone()[0]
            db.execute('UPDATE objects SET status="MISSING",result=? WHERE id=?',(seal({'status':'MISSING','errorCategory':'SyntheticMissing'},KEY,outside),outside));db.commit();db.close()
            with patch('tools.legacy_sync.asset_index.transfer_one',side_effect=lambda origin,client,base,url,hint,system:success(url)):
                report=transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,retry_failed=True,selection_id=sid)
            self.assertEqual(report['counts'],{'AVAILABLE':5})
            db=open_index(root);self.assertEqual(db.execute('SELECT status FROM objects WHERE id=?',(outside,)).fetchone()[0],'MISSING');db.close()

    def test_members_added_during_transfer_are_never_copied(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root);scope=self.api.build_recent_selection(root,m,KEY);sid=scope['selectionId'];sent=[]
            db=open_index(root)
            outside=db.execute('SELECT id,payload FROM objects WHERE id NOT IN (SELECT object_id FROM selection_objects WHERE selection_id=?) ORDER BY id DESC LIMIT 1',(sid,)).fetchone()
            boundary=db.execute('SELECT object_id FROM selection_objects WHERE selection_id=? ORDER BY object_id LIMIT 1 OFFSET 3',(sid,)).fetchone()[0]
            self.assertGreater(outside[0],boundary,'Fixture must add a candidate after the first transfer batch')
            outside_url=unseal(outside[1],KEY,outside[0])['url'];db.close()
            def copy(origin,client,base,url,hint,system):
                sent.append(url)
                if len(sent)==1:
                    other=open_index(root);other.execute('INSERT INTO selection_objects VALUES (?,?)',(sid,outside[0]));other.commit();other.close()
                return success(url)
            with patch('tools.legacy_sync.asset_index.transfer_one',side_effect=copy):
                with self.assertRaises(ValueError):transfer_index(root,m,KEY,None,None,'https://fixture.invalid',workers=1,selection_id=sid)
            self.assertNotIn(outside_url,sent)
            self.assertEqual(len(sent),scope['objectCount'])
            db=open_index(root);self.assertEqual(db.execute('SELECT status FROM objects WHERE id=?',(outside[0],)).fetchone()[0],'PENDING');db.close()

    def test_empty_cohort_does_not_fall_back_to_all_objects(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root,empty=True);scope=self.api.build_recent_selection(root,m,KEY)
            self.assertEqual(scope['objectCount'],0)
            with patch('tools.legacy_sync.asset_index.transfer_one') as copy:
                report=transfer_index(root,m,KEY,None,None,'https://fixture.invalid',selection_id=scope['selectionId'])
                copy.assert_not_called()
            self.assertTrue(report['transferFinished']);self.assertEqual(report['counts'],{})
            self.assertFalse(load_manifest(root,KEY)['assetsComplete'])

    def test_selected_source_owner_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            m=fixture(root);db=open_index(root)
            identity,payload=db.execute('SELECT id,payload FROM refs WHERE table_name="app_ai_drawmessage" AND source_pk="31" LIMIT 1').fetchone()
            value=unseal(payload,KEY,identity);value['sourceUserId']='3'
            db.execute('UPDATE refs SET payload=? WHERE id=?',(seal(value,KEY,identity),identity));db.commit();db.close()
            with self.assertRaises(ValueError):self.api.build_recent_selection(root,m,KEY)


if __name__=='__main__':unittest.main()
