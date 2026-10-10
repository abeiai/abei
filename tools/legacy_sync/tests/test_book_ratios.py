import copy
import datetime as dt
import os
import unittest
from tools.legacy_sync.native_mapping import book_row,native_id,target_guard
from tools.legacy_sync.book_ratios import legacy_ratio,resolve_book_ratios
from tools.legacy_sync.tests.test_book_styles import product

class BookRatioMapping(unittest.TestCase):
    def test_case_ratio_and_pixel_dimensions_map_to_new_supported_ratio(self):
        for raw,want in [('5:4','5:4'),('4:5','4:5'),('1280:1024','5:4'),('1024:1280','4:5'),('1024:819','5:4'),('819:1024','4:5')]:
            row=product();row['values']['result'][0]['book_ratio']=raw
            before=copy.deepcopy(row)
            book,_=book_row(row,{'99997003':native_id('user','99997003')},{})
            self.assertEqual(book['aspectRatio'],want);self.assertEqual(row,before)
    def test_draw_choice_codes_and_unknown_or_unsupported_values(self):
        self.assertEqual(legacy_ratio('3',choice=True),'5:4');self.assertEqual(legacy_ratio(5,choice=True),'4:5')
        for raw in (True,False,'21:9','9:21','0:5','bad',{},'1000:700'):
            self.assertIsNone(legacy_ratio(raw))
        row=product();case=row['values']['result'][0];case['book_ratio']='9:16';case['extra']={'draw':{'aspect_ratio':'3'}}
        self.assertEqual(book_row(row,{'99997003':native_id('user','99997003')},{})[0]['aspectRatio'],'5:4')
    def test_case_ratio_does_not_interpret_a_numeric_scalar_as_drawing_choice(self):
        row=product();row['values']['result'][0]['book_ratio']='1'
        self.assertEqual(book_row(row,{'99997003':native_id('user','99997003')},{})[0]['aspectRatio'],'1:1')

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class BookRatioHistoryIntegration(unittest.TestCase):
    def test_matching_cover_draw_ratio_wins_over_hardcoded_case_ratio(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        row=product();row['values']['result'][0]['book_ratio']='9:16'
        identity=native_id('app_ai_drawmessage','99997101')
        task={'sourcePk':'99997004','values':{'user_id':'99997003','result':{'draw_id':'99997101','image':'https://fixture.invalid/cover.png'},'aspect_ratio':'5'}}
        with psycopg.connect(url) as c:
            c.execute('INSERT INTO legacy_ai_logs (id,"sourceSystem","sourceTable","sourcePk","sourceUserId",kind,parameters,"requestedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(identity,'abeiai-v1','app_ai_drawmessage','99997101','99997003','IMAGE',Jsonb({'source':{'aspect_ratio':'3'}}),dt.datetime(2024,1,1)))
            def mapped(source=row,history=task):
                return resolve_book_ratios(c,[source],[history]).get(source['sourcePk'])
            self.assertEqual(mapped(),'5:4')
            ratios=resolve_book_ratios(c,[row],[task])
            self.assertEqual(book_row(row,{'99997003':native_id('user','99997003')},{},ratios=ratios)[0]['aspectRatio'],'5:4')
            changed=copy.deepcopy(task);changed['values']['user_id']='another';self.assertIsNone(mapped(history=changed))
            changed=copy.deepcopy(task);changed['values']['result']['image']='https://fixture.invalid/other.png';self.assertIsNone(mapped(history=changed))
            c.execute('UPDATE legacy_ai_logs SET "sourceUserId"=%s WHERE id=%s',('another',identity));self.assertIsNone(mapped())
            c.rollback()
