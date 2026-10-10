import copy
import datetime as dt
import os
import unittest
from tools.legacy_sync.book_style_repair import plan_style_repair,repair_styles_sql
from tools.legacy_sync.native_mapping import target_guard

NOW=dt.datetime(2024,1,1)
def fixture():
    source={'id':'cstylerepairbook','userId':'cstylerepairuser','createdAt':NOW,'style':'colored-pencil'}
    current={**source,'style':'','version':2,'updatedAt':NOW,'stateSha256':'a'*64}
    return source,current
class StyleRepairContract(unittest.TestCase):
    def test_fills_empty_style_after_text_edits_without_overwriting_a_selection(self):
        source,current=fixture();before=copy.deepcopy(current);plan=plan_style_repair(source,current)
        self.assertIsNotNone(plan);self.assertEqual(plan['newStyle'],'colored-pencil');self.assertEqual(plan['version'],2);self.assertEqual(current,before)
        for selected in ('watercolor','森林肌理插画','custom:c12345678901234567890'):
            current['style']=selected;self.assertIsNone(plan_style_repair(source,current))
    def test_rejects_wrong_book_owner_creation_time_or_non_catalogue_style(self):
        for field,value in [('id','other'),('userId','other'),('createdAt',NOW+dt.timedelta(days=1)),('style','unknown')]:
            source,current=fixture();source[field]=value
            with self.assertRaises(ValueError):plan_style_repair(source,current)

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class StyleRepairIntegration(unittest.TestCase):
    def test_pg_style_only_update_is_repeatable_and_whole_batch_rejects_new_selection(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True);source,current=fixture()
        query='SELECT id,"userId",style,version,"createdAt","updatedAt",encode(sha256(convert_to((to_jsonb(b)-\'style\')::text,\'UTF8\')),\'hex\') FROM picture_books b WHERE id=%s'
        columns=('id','userId','style','version','createdAt','updatedAt','stateSha256')
        with psycopg.connect(url,autocommit=True) as c:
            try:
                c.execute('INSERT INTO users (id,email,"passwordHash",nickname,"updatedAt") VALUES (%s,%s,%s,%s,%s)',(current['userId'],'style-repair@example.invalid','fixture','合成用户',NOW))
                for identity in (current['id'],current['id']+'2'):
                    c.execute('INSERT INTO picture_books (id,"userId",title,brief,style,"aspectRatio","pageCount",status,messages,characters,pages,version,"createdAt","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(identity,current['userId'],"保留'$$正文",'用户改过的正文','','1:1',1,'EDITING',Jsonb([]),Jsonb([]),Jsonb([{'position':1,'caption':'后来修改','imageUrl':'https://fixture.invalid/kept.png'}]),2,NOW,NOW))
                rows=[dict(zip(columns,c.execute(query,(identity,)).fetchone())) for identity in (current['id'],current['id']+'2')]
                plans=[plan_style_repair({**source,'id':row['id']},row) for row in rows];script=repair_styles_sql(plans,'abei_wechat_test')
                def apply():
                    cursor=c.execute(script);report=None
                    while True:
                        if cursor.description:report=cursor.fetchone()[0]
                        if not cursor.nextset():return report
                self.assertEqual(apply()['updatedBooks'],2)
                after=[dict(zip(columns,c.execute(query,(row['id'],)).fetchone())) for row in rows]
                for before,got in zip(rows,after):self.assertEqual(got,{**before,'style':'colored-pencil'})
                self.assertEqual(apply()['updatedBooks'],0)
                c.execute('UPDATE picture_books SET style=%s WHERE id=%s',('watercolor',current['id']+'2'))
                c.execute('UPDATE picture_books SET style=%s WHERE id=%s',('',current['id']))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT style FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'')
                self.assertEqual(c.execute('SELECT style FROM picture_books WHERE id=%s',(current['id']+'2',)).fetchone()[0],'watercolor')
            finally:
                c.execute('ROLLBACK');c.execute('DELETE FROM picture_books WHERE "userId"=%s',(current['userId'],));c.execute('DELETE FROM users WHERE id=%s',(current['userId'],))
