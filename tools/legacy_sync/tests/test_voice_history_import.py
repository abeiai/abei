import datetime as dt
import os
import unittest
from tools.legacy_sync.native_mapping import native_id,target_guard
from tools.legacy_sync.voice_history import voice_history_row
from tools.legacy_sync.voice_history_import import voice_import_sql,validate_book_baseline
from tools.legacy_sync.tests.test_voice_history import source,media,PUBLIC

class VoiceBookBaselineContract(unittest.TestCase):
    def test_book_reference_requires_validated_full_snapshot_in_same_namespace(self):
        current={'sourceSystem':'abeiai-v1','sourceFingerprint':'source','schemaSha256':'schema','startedAt':'2026-10-09T00:00:00Z'}
        baseline={**current,'validationPassed':True,'startedAt':'2026-10-08T00:00:00Z'}
        validate_book_baseline(current,baseline)
        for changed in ({'validationPassed':False},{'incremental':{'since':'old'}},{'sourceFingerprint':'other'},{'startedAt':'2026-10-10T00:00:00Z'}):
            with self.assertRaises(ValueError):validate_book_baseline(current,{**baseline,**changed})

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class VoiceImportIntegration(unittest.TestCase):
    def test_history_insert_replay_media_backfill_and_foreign_conflict_are_atomic_without_billing(self):
        import psycopg
        row=source();row['values']['user_content']="合成\n\\.\nSELECT 'unsafe';\t保留正文";owner=native_id('user','9');log=native_id('app_ai_ttsmessage','901');task_id=native_id('voice-history:app_ai_ttsmessage','901');asset_id=native_id('voice-audio',media()['objectKey']+':'+owner)
        def make(output=None):
            task,asset,_=voice_history_row(row,{'9':owner},set(),PUBLIC,output,snapshot_at='2026-10-08T03:00:00Z');task['providerPayload']['legacyImport']['logId']=log
            if asset:task['providerPayload']['legacyImport']['audioSha256']='a'*64
            return task,asset
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        with psycopg.connect(url,autocommit=True) as c:
            try:
                c.execute('INSERT INTO users (id,email,"passwordHash",nickname,"updatedAt") VALUES (%s,%s,%s,%s,%s)',(owner,'voice-history@example.invalid','fixture','合成用户',dt.datetime(2024,1,1)))
                c.execute('INSERT INTO legacy_ai_logs (id,"sourceSystem","sourceTable","sourcePk","sourceUserId","userId",kind,"inputText","requestedAt","sourceStatus") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(log,'abeiai-v1','app_ai_ttsmessage','901','9',owner,'AUDIO',row['values']['user_content'],dt.datetime(2024,1,1),'2'))
                protected=('wallets','ledger_entries','credit_reservations','audio_usage_logs','payment_orders','ai_tasks')
                before={t:c.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in protected}
                def apply(task,asset):
                    cursor=c.execute(voice_import_sql([task],[asset] if asset else [],PUBLIC,'abei_wechat_test'));result=None
                    while True:
                        if cursor.description:result=cursor.fetchone()[0]
                        if not cursor.nextset():return result
                task,_=make();self.assertEqual(apply(task,None)['insertedTasks'],1);self.assertEqual(apply(task,None)['insertedTasks'],0)
                task,asset=make(media());self.assertEqual(apply(task,asset)['updatedTasks'],1)
                got=c.execute('SELECT "userId",status,"inputText","outputAudioAssetId","estimatedCredits","actualCredits","learnerId" FROM audio_tasks WHERE id=%s',(task_id,)).fetchone()
                self.assertEqual(got,(owner,'SUCCEEDED',row['values']['user_content'],asset_id,0,None,None));self.assertEqual(apply(task,asset)['updatedTasks'],0)
                self.assertEqual(before,{t:c.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in protected})
                c.execute('UPDATE audio_tasks SET "providerPayload"=NULL WHERE id=%s',(task_id,))
                with self.assertRaises(psycopg.Error):apply(task,asset)
                c.execute('ROLLBACK');self.assertIsNone(c.execute('SELECT "providerPayload" FROM audio_tasks WHERE id=%s',(task_id,)).fetchone()[0])
            finally:
                c.execute('ROLLBACK');c.execute('DELETE FROM audio_tasks WHERE id=%s',(task_id,));c.execute('DELETE FROM audio_assets WHERE id=%s',(asset_id,));c.execute('DELETE FROM legacy_ai_logs WHERE id=%s',(log,));c.execute('DELETE FROM users WHERE id=%s',(owner,))
