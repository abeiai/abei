import copy
import datetime as dt
import json
import os
import unittest
from tools.legacy_sync.book_asset_repair import plan_book_repair, repair_sql

NOW=dt.datetime(2024,1,1,8,0,0,999600,tzinfo=dt.timezone.utc)
URL='https://fixture.invalid/picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.png'
def fixture():
    pages=[{'position':1,'caption':"合成'$$正文",'imagePrompt':'','narration':'合成正文','imageUrl':'','audioUrl':''}]
    current={'id':'cbookrepairfixture','userId':'cbookrepairuser','version':0,'updatedAt':dt.datetime(2024,1,1,8,0,1),'status':'EDITING','pages':copy.deepcopy(pages)}
    source={'id':current['id'],'userId':current['userId'],'updatedAt':NOW,'status':'COMPLETED','pages':[{**pages[0],'imageUrl':URL,'audioUrl':URL.removesuffix('.png')+'.mp3'}]}
    return source,current

class BookAssetRepairContract(unittest.TestCase):
    def test_rounds_source_time_and_fills_only_missing_media(self):
        source,current=fixture();before=copy.deepcopy(current);plan=plan_book_repair(source,current,'https://fixture.invalid')
        self.assertEqual(current,before);self.assertEqual(plan['addedImages'],1);self.assertEqual(plan['addedAudio'],1)
        self.assertEqual(plan['newPages'][0]['caption'],current['pages'][0]['caption']);self.assertEqual(plan['newStatus'],'COMPLETED')
        current['pages'][0]['imageUrl']='https://fixture.invalid/user-edit.png'
        plan=plan_book_repair(source,current,'https://fixture.invalid');self.assertEqual(plan['newPages'][0]['imageUrl'],current['pages'][0]['imageUrl'])
    def test_rejects_wrong_owner_edited_text_versions_and_unapproved_url(self):
        for change in ('owner','version','time','caption','position','url'):
            source,current=fixture()
            if change=='owner':current['userId']='another-user'
            elif change=='version':current['version']=1
            elif change=='time':current['updatedAt']+=dt.timedelta(seconds=1)
            elif change=='caption':current['pages'][0]['caption']='交互修改'
            elif change=='position':current['pages'][0]['position']=2
            else:source['pages'][0]['imageUrl']='https://unapproved.invalid/a.png'
            with self.assertRaises(ValueError):plan_book_repair(source,current,'https://fixture.invalid')

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated test database required')
class BookAssetRepairIntegration(unittest.TestCase):
    def test_actual_pg_atomic_repair_replay_and_stale_snapshot_rejection(self):
        import psycopg
        from psycopg.types.json import Jsonb
        from tools.legacy_sync.native_mapping import target_guard
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True);source,current=fixture()
        def cleanup():
            with psycopg.connect(url) as c:
                c.execute('DELETE FROM picture_books WHERE id=%s',(current['id'],));c.execute('DELETE FROM users WHERE id=%s',(current['userId'],))
        cleanup();self.addCleanup(cleanup)
        with psycopg.connect(url) as c:
            c.execute('INSERT INTO users (id,email,"passwordHash",nickname,"updatedAt") VALUES (%s,%s,%s,%s,%s)',(current['userId'],'book-repair@example.invalid','fixture','合成用户',current['updatedAt']))
            c.execute('INSERT INTO picture_books (id,"userId",title,brief,style,"aspectRatio","pageCount",status,messages,characters,pages,"createdAt","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(current['id'],current['userId'],'合成绘本','','','1:1',1,'EDITING',Jsonb([]),Jsonb([]),Jsonb(current['pages']),current['updatedAt'],current['updatedAt']))
        plan=plan_book_repair(source,current,'https://fixture.invalid')
        with psycopg.connect(url,autocommit=True) as c:
            script=repair_sql([plan],database='abei_wechat_test')
            def execute_report():
                cursor=c.execute(script);report=None
                while True:
                    if cursor.description:
                        for row in cursor.fetchall():
                            if isinstance(row[0],dict) and 'plannedBooks' in row[0]:report=row[0]
                    if not cursor.nextset():return report
            first=execute_report();self.assertEqual(first['addedImageLinks'],1)
            got=c.execute('SELECT pages,status,version,"updatedAt" FROM picture_books WHERE id=%s',(current['id'],)).fetchone()
            self.assertEqual(got,(plan['newPages'],'COMPLETED',0,current['updatedAt']))
            second=execute_report();self.assertEqual(second['updatedBooks'],0);self.assertEqual(second['addedImageLinks'],0);self.assertEqual(second['addedAudioLinks'],0)
            self.assertEqual(c.execute('SELECT pages FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],plan['newPages'])
            changed=copy.deepcopy(plan['newPages']);changed[0]['caption']='后来编辑的正文'
            c.execute('UPDATE picture_books SET pages=%s WHERE id=%s',(Jsonb(changed),current['id']))
            with self.assertRaises(psycopg.Error):c.execute(script)
            c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT pages FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],changed)

if __name__=='__main__':unittest.main()
