import datetime as dt
import os
import unittest
from tools.legacy_sync.book_ratio_repair import plan_ratio_repair,repair_ratios_sql,plan_publication_ratio_repair,course_snapshot_hash
from tools.legacy_sync.native_mapping import target_guard

NOW=dt.datetime(2024,1,1)
def fixture():
    source={'id':'cratiorepairbook','userId':'cratiorepairuser','createdAt':NOW,'updatedAt':NOW,'aspectRatio':'5:4'}
    current={**source,'aspectRatio':'1:1','version':0,'stateSha256':'a'*64}
    return source,current

class RatioRepairContract(unittest.TestCase):
    def test_publication_ratio_plan_preserves_content_and_rejects_stale_approval(self):
        source,current=fixture();book_plan=plan_ratio_repair(source,current)
        snapshot={'type':'PICTURE_BOOK','title':'原正文','style':'flat','aspectRatio':'1:1','pages':[]};digest=course_snapshot_hash(snapshot)
        publication={'id':'cpub','pictureBookId':source['id'],'materialType':'PICTURE_BOOK','status':'APPROVED','approvedSnapshot':snapshot,'currentSnapshot':snapshot,'approvedHash':digest,'currentHash':digest}
        plan=plan_publication_ratio_repair(publication,book_plan,snapshot)
        self.assertIsNotNone(plan);self.assertEqual(plan['newSnapshot'],{**snapshot,'aspectRatio':'5:4'});self.assertNotEqual(plan['newHash'],digest)
        for changed in ({'status':'PENDING'},{'approvedHash':'f'*64},{'pictureBookId':'other'},{'currentSnapshot':{**snapshot,'title':'待审正文'}}):
            with self.assertRaises(ValueError):plan_publication_ratio_repair({**publication,**changed},book_plan,snapshot)
    def test_only_original_import_default_is_repaired(self):
        source,current=fixture();plan=plan_ratio_repair(source,current)
        self.assertIsNotNone(plan)
        self.assertEqual(plan['newRatio'],'5:4')
        for changed in ({'aspectRatio':'4:3'},{'aspectRatio':'5:4'},{'version':1},{'updatedAt':NOW+dt.timedelta(seconds=1)}):
            self.assertIsNone(plan_ratio_repair(source,{**current,**changed}))
    def test_identity_and_ratio_guards_reject_wrong_source(self):
        source,current=fixture()
        for changed in ({'id':'other'},{'userId':'other'},{'createdAt':NOW+dt.timedelta(days=1)},{'aspectRatio':'9:16'}):
            with self.assertRaises(ValueError):plan_ratio_repair({**source,**changed},current)

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class RatioRepairIntegration(unittest.TestCase):
    def test_ratio_only_update_replays_without_changes_and_snapshot_conflict_rolls_back_batch(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True);source,current=fixture()
        columns=('id','userId','aspectRatio','version','createdAt','updatedAt','stateSha256')
        query='SELECT id,"userId","aspectRatio",version,"createdAt","updatedAt",encode(sha256(convert_to((to_jsonb(b)-\'aspectRatio\')::text,\'UTF8\')),\'hex\') FROM picture_books b WHERE id=%s'
        with psycopg.connect(url,autocommit=True) as c:
            try:
                c.execute('INSERT INTO users (id,email,"passwordHash",nickname,"updatedAt") VALUES (%s,%s,%s,%s,%s)',(current['userId'],'ratio-repair@example.invalid','fixture','合成用户',NOW))
                for identity in (current['id'],current['id']+'2'):
                    c.execute('INSERT INTO picture_books (id,"userId",title,brief,style,"aspectRatio","pageCount",status,messages,characters,pages,version,"createdAt","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(identity,current['userId'],"保留'$$正文",'正文','flat','1:1',1,'COMPLETED',Jsonb([]),Jsonb([]),Jsonb([{'position':0,'caption':'封面','imageUrl':'https://fixture.invalid/kept.png','audioUrl':'https://fixture.invalid/kept.mp3'}]),0,NOW,NOW))
                rows=[dict(zip(columns,c.execute(query,(identity,)).fetchone())) for identity in (current['id'],current['id']+'2')]
                plans=[plan_ratio_repair({**source,'id':row['id'],'aspectRatio':'5:4' if n==0 else '4:5'},row) for n,row in enumerate(rows)]
                snapshot={'type':'PICTURE_BOOK','title':"保留'$$正文",'style':'flat','aspectRatio':'1:1','pages':[{'position':0,'caption':'封面','imageUrl':'https://fixture.invalid/kept.png','audioUrl':'https://fixture.invalid/kept.mp3'}]};digest=course_snapshot_hash(snapshot)
                c.execute('INSERT INTO course_material_publications (id,"pictureBookId","materialType",status,"currentHash","approvedHash","currentSnapshot","approvedSnapshot","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',('cratiorepairpub',current['id'],'PICTURE_BOOK','APPROVED',digest,digest,Jsonb(snapshot),Jsonb(snapshot),NOW))
                publication=c.execute('SELECT to_jsonb(p) FROM course_material_publications p WHERE id=%s',('cratiorepairpub',)).fetchone()[0]
                pub_plan=plan_publication_ratio_repair(publication,plans[0],snapshot);self.assertIsNotNone(pub_plan)
                script=repair_ratios_sql(plans,'abei_wechat_test',publications=[pub_plan])
                def apply():
                    cursor=c.execute(script);report=None
                    while True:
                        if cursor.description:report=cursor.fetchone()[0]
                        if not cursor.nextset():return report
                result=apply();self.assertIsNotNone(result);self.assertEqual(result['updatedBooks'],2)
                for n,before in enumerate(rows):
                    self.assertEqual(dict(zip(columns,c.execute(query,(before['id'],)).fetchone())),{**before,'aspectRatio':'5:4' if n==0 else '4:5'})
                self.assertEqual(apply()['updatedBooks'],0)
                pub_after=c.execute('SELECT to_jsonb(p) FROM course_material_publications p WHERE id=%s',('cratiorepairpub',)).fetchone()[0]
                self.assertEqual(pub_after,{**publication,'currentHash':pub_plan['newHash'],'approvedHash':pub_plan['newHash'],'currentSnapshot':pub_plan['newSnapshot'],'approvedSnapshot':pub_plan['newSnapshot']})
                c.execute('UPDATE picture_books SET "aspectRatio"=%s WHERE id=%s',('1:1',current['id']))
                c.execute('UPDATE course_material_publications SET status=%s WHERE id=%s',('PENDING','cratiorepairpub'))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT "aspectRatio" FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'1:1')
                c.execute('UPDATE course_material_publications SET status=%s WHERE id=%s',('APPROVED','cratiorepairpub'))
                c.execute('UPDATE picture_books SET title=%s WHERE id=%s',('后续编辑',current['id']+'2'))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT "aspectRatio" FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'1:1')
                c.execute('UPDATE picture_books SET title=%s WHERE id=%s',("保留'$$正文",current['id']+'2'))
                c.execute('INSERT INTO course_review_requests (id,scope,status,"materialPublicationId","submittedByUserId","afterSnapshot",diff,"updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',('cratiorepairreview','MATERIAL_CHANGE','PENDING','cratiorepairpub',current['userId'],Jsonb(snapshot),Jsonb([]),NOW))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT "aspectRatio" FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'1:1')
                c.execute('DELETE FROM course_review_requests WHERE id=%s',('cratiorepairreview',))
                c.execute('INSERT INTO course_material_publications (id,"pictureBookId","materialType",status,"currentHash","approvedHash","currentSnapshot","approvedSnapshot","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',('cratiorepairpub2',current['id']+'2','PICTURE_BOOK','APPROVED',digest,digest,Jsonb(snapshot),Jsonb(snapshot),NOW))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT "aspectRatio" FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'1:1')
            finally:
                c.execute('ROLLBACK');c.execute('DELETE FROM course_material_publications WHERE id=ANY(%s)',(['cratiorepairpub','cratiorepairpub2'],));c.execute('DELETE FROM picture_books WHERE "userId"=%s',(current['userId'],));c.execute('DELETE FROM users WHERE id=%s',(current['userId'],))
