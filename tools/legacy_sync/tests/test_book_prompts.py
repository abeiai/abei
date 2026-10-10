import copy
import datetime as dt
import json
import os
import unittest
from tools.legacy_sync.book_prompts import collect_book_prompts,resolve_book_prompts
from tools.legacy_sync.native_mapping import book_row,native_id,target_guard

STAMP={'type':'datetime','utc':'2024-01-01T00:00:00Z'}
def product():
    return {'sourcePk':'99998001','values':{'user_id':'99998002','extra':{'one_take_id':'99998003'},'result':[{
        'title_zh':'合成绘本','img_cover':'https://fixture.invalid/cover.png',
        'rn_case_pages':[{'body_zh':'原正文','img':'https://fixture.invalid/page.png'}]
    }],'create_time':STAMP,'update_time':STAMP}}
def log(pk='99998004',image='https://fixture.invalid/page.png',prompt='原始中文场景'):
    return {'id':native_id('app_ai_drawmessage',pk),'sourceSystem':'abeiai-v1','sourceTable':'app_ai_drawmessage',
        'sourcePk':pk,'sourceUserId':'99998002','kind':'IMAGE','status':'SUCCEEDED','inputText':prompt,'outputText':json.dumps([image]),'promptZh':None,'promptEn':None}
def task():
    return {'sourcePk':'99998003','values':{'user_id':'99998002','result':{'title':'合成绘本','cover':'封面原场景',
        'image':'https://fixture.invalid/cover.png','pages':[{'text_zh':'原正文','image':'https://fixture.invalid/page.png','prompt':'内页原场景'}]}}}

class BookPromptMapping(unittest.TestCase):
    def test_owned_generated_image_restores_cover_and_page_without_changing_source(self):
        row=product();before=copy.deepcopy(row)
        prompts=collect_book_prompts([row],[log(),log('99998005','https://fixture.invalid/cover.png','原封面提示词')])
        self.assertEqual(prompts,{'99998001':{1:'原封面提示词',2:'原始中文场景'}})
        mapped,_=book_row(row,{'99998002':native_id('user','99998002')},{},prompts=prompts)
        self.assertEqual([p['imagePrompt'] for p in mapped['pages']],['原封面提示词','原始中文场景'])
        self.assertEqual(row,before)
    def test_unowned_forged_namespace_and_conflicting_history_are_not_used(self):
        for changed in ({'sourceUserId':'other'},{'id':'forged'},{'sourceSystem':'other'},{'sourceTable':'app_ai_ttsmessage'},
            {'kind':'AUDIO'},{'status':'FAILED'},
            {'outputText':'["https://fixture.invalid/reference.png"]'},{'inputText':'[受限字段，原始内容保留在加密档案]'}):
            self.assertEqual(collect_book_prompts([product()],[{**log(),**changed}]),{})
        self.assertEqual(collect_book_prompts([product()],[log(),log('99998006',prompt='另一条提示词')]),{})
        self.assertEqual(collect_book_prompts([product()],[log(),log('99998006')]),{'99998001':{2:'原始中文场景'}})
    def test_inline_editor_prompt_takes_priority_and_requires_matching_picture_and_text(self):
        row=product();draw={'data':[{'prompt':'编辑器原提示词','text_zh':'原正文','images':['https://fixture.invalid/page.png']}]}
        row['values']['result'][0]['extra']={'draw':draw}
        self.assertEqual(collect_book_prompts([row],[log()]),{'99998001':{2:'编辑器原提示词'}})
        draw['data'][0]['text_zh']='另一页正文'
        self.assertEqual(collect_book_prompts([row],[]),{})
    def test_matching_caption_order_alone_does_not_bind_a_different_rendered_image(self):
        row=product();row['values']['result'][0]['extra']={'draw':{'data':[
            {'prompt':'原封面场景','text_zh':'合成绘本','images':['https://fixture.invalid/raw-cover.png'],'index':'0'},
            {'prompt':'','text_zh':'原正文','images':['https://fixture.invalid/other.png','https://fixture.invalid/raw-page.png'],'index':'1'}]}}
        self.assertEqual(collect_book_prompts([row],[log(image='https://fixture.invalid/raw-page.png')]),{})
        self.assertEqual(collect_book_prompts([row],[log(image='https://fixture.invalid/other.png')]),{})
        row['values']['result'][0]['extra']['draw']['data'][0]['text_zh']='另一本绘本'
        self.assertEqual(collect_book_prompts([row],[log(image='https://fixture.invalid/raw-page.png')]),{})
    def test_task_fallback_requires_owner_link_and_each_page_image_and_caption(self):
        row=product();history=task()
        self.assertEqual(collect_book_prompts([row],[],[history]),{'99998001':{1:'封面原场景',2:'内页原场景'}})
        for change in ({'user_id':'other'},):
            self.assertEqual(collect_book_prompts([row],[],[{**history,'values':{**history['values'],**change}}]),{})
        changed=copy.deepcopy(history);changed['values']['result']['pages'][0]['text_zh']='另一页'
        self.assertNotIn(2,collect_book_prompts([row],[],[changed]).get('99998001',{}))
        changed=copy.deepcopy(history);changed['values']['result']['image']='https://fixture.invalid/another.png'
        self.assertEqual(collect_book_prompts([row],[],[changed]),{})
    def test_without_cover_positions_remain_correct_and_existing_inline_page_prompt_is_preserved(self):
        row=product();row['values']['result'][0]['img_cover']=''
        prompts=collect_book_prompts([row],[log()])
        self.assertEqual(prompts,{'99998001':{1:'原始中文场景'}})
        row['values']['result'][0]['rn_case_pages'][0]['prompt']='旧页直接提示词'
        self.assertEqual(book_row(row,{'99998002':native_id('user','99998002')},{},prompts=prompts)[0]['pages'][0]['imagePrompt'],'旧页直接提示词')
    def test_latest_deleted_source_does_not_restore_an_older_product(self):
        row=product();deleted=copy.deepcopy(row);deleted['values']['is_delete']='1'
        self.assertEqual(collect_book_prompts([row,deleted],[log()]),{})
    def test_restricted_direct_prompt_does_not_replace_an_authenticated_prompt(self):
        row=product();row['values']['result'][0]['rn_case_pages'][0]['prompt']={'type':'restricted'}
        mapped,_=book_row(row,{'99998002':native_id('user','99998002')},{},prompts={'99998001':{2:'原始中文场景'}})
        self.assertEqual(mapped['pages'][1]['imagePrompt'],'原始中文场景')

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class BookPromptHistoryIntegration(unittest.TestCase):
    def test_native_drawing_history_is_read_by_owner_and_original_output(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True);entry=log()
        with psycopg.connect(url) as c:
            c.execute('INSERT INTO legacy_ai_logs (id,"sourceSystem","sourceTable","sourcePk","sourceUserId",kind,status,"inputText","outputText",parameters,"requestedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (entry['id'],'abeiai-v1','app_ai_drawmessage',entry['sourcePk'],entry['sourceUserId'],'IMAGE','SUCCEEDED',entry['inputText'],entry['outputText'],Jsonb({}),dt.datetime(2024,1,1)))
            self.assertEqual(resolve_book_prompts(c,[product()],[]),{'99998001':{2:'原始中文场景'}})
            c.execute('UPDATE legacy_ai_logs SET "sourceUserId"=%s WHERE id=%s',('other',entry['id']))
            self.assertEqual(resolve_book_prompts(c,[product()],[]),{})
            c.rollback()
