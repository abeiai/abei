import copy
import datetime as dt
import os
import unittest
from tools.legacy_sync.book_styles import resolve_book_styles
from tools.legacy_sync.native_mapping import book_row,native_id,target_guard

STAMP={'type':'datetime','raw':'2024-01-01T08:00:00','timezone':'Asia/Shanghai','utc':'2024-01-01T00:00:00Z'}
def product():
    return {'sourcePk':'99997002','sourceTable':'app_ai_product','values':{'user_id':'99997003','extra':{'one_take_id':'99997004'},'result':[{'img_cover':'https://fixture.invalid/cover.png','extra':{},'rn_case_pages':[{'body_zh':'合成正文'}]}],'create_time':STAMP,'update_time':STAMP}}

class BookStyleMapping(unittest.TestCase):
    def test_old_catalogue_selects_new_styles_by_medium_and_dimension(self):
        for old,want in [('蜡笔画','crayon'),('彩铅画','colored-pencil'),('水彩画','watercolor'),('像素风','pixel-art'),('3D卡通','3d-animation'),('Q版人物','3d-animation'),('彩色水墨','color-ink'),('黑白线稿','line-sketch'),('梵高艺术','classic-oil'),('日式动漫','flat'),('高清照片','flat')]:
            row=product();row['values']['result'][0]['extra']={'draw':{'style':old}}
            book,_=book_row(row,{'99997003':native_id('user','99997003')},{})
            self.assertEqual(book['style'],want)

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class BookStyleHistoryIntegration(unittest.TestCase):
    def test_task_and_drawing_history_recover_style_only_for_matching_owner_and_cover(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        row=product();identity=native_id('app_ai_drawmessage','99997001')
        task={'sourcePk':'99997004','values':{'user_id':'99997003','result':{'draw_id':'99997001','image':'https://fixture.invalid/cover.png'}}}
        with psycopg.connect(url) as c:
            c.execute('DELETE FROM legacy_ai_logs WHERE id=%s',(identity,))
            c.execute('INSERT INTO legacy_ai_logs (id,"sourceSystem","sourceTable","sourcePk","sourceUserId",kind,parameters,"requestedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(identity,'abeiai-v1','app_ai_drawmessage','99997001','99997003','IMAGE',Jsonb({'source':{'style_id':'4'}}),dt.datetime(2024,1,1)))
            def mapped(source=row,history=task):
                styles=resolve_book_styles(c,[source],[history]);return book_row(source,{'99997003':native_id('user','99997003')},{},styles)[0]['style']
            self.assertEqual(mapped(),'watercolor')
            changed=copy.deepcopy(task);changed['values']['user_id']='other-user';self.assertEqual(mapped(history=changed),'flat')
            changed=copy.deepcopy(task);changed['values']['result']['image']='different-cover';self.assertEqual(mapped(history=changed),'flat')
            c.execute('UPDATE legacy_ai_logs SET "sourceUserId"=%s WHERE id=%s',('other-user',identity));self.assertEqual(mapped(),'flat')
            row['values']['result'][0]['extra']={'draw':{'style':'6'}};self.assertEqual(mapped(),'3d-animation')
            c.rollback()
