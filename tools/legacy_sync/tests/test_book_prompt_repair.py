import copy
import datetime as dt
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.book_prompt_repair import plan_prompt_repair,repair_prompts_sql,NON_PROMPT_STATE_SQL
from tools.legacy_sync.native_mapping import target_guard

NOW=dt.datetime(2024,1,1)
def fixture():
    pages=[{'position':1,'caption':'封面','narration':'封面','imagePrompt':'','imageUrl':'https://fixture.invalid/cover.png','audioUrl':'https://fixture.invalid/cover.mp3'},
        {'position':2,'caption':"原文'$$",'narration':"原文'$$",'imagePrompt':'用户已有提示词','imageUrl':'https://fixture.invalid/page.png','audioUrl':'https://fixture.invalid/page.mp3'}]
    current={'id':'cpromptrepairbook','userId':'cpromptrepairuser','createdAt':NOW,'updatedAt':NOW,'version':0,'pages':pages,'stateSha256':'a'*64}
    source=copy.deepcopy(current);source['pages'][0]['imagePrompt']="封面原场景'$$";source['pages'][1]['imagePrompt']='旧版其他提示词'
    return source,current

class PromptRepairContract(unittest.TestCase):
    def test_only_empty_prompts_are_planned_and_all_media_text_and_existing_prompts_are_preserved(self):
        source,current=fixture();before=copy.deepcopy(current);plan=plan_prompt_repair(source,current)
        self.assertIsNotNone(plan);self.assertEqual(plan['patches'],{'0':"封面原场景'$$"});self.assertEqual(current,before)
        for change in ({'version':1},{'updatedAt':NOW+dt.timedelta(seconds=1)}):
            self.assertIsNone(plan_prompt_repair(source,{**current,**change}))
        current['pages'][0]['imagePrompt']='用户选过的提示词';self.assertIsNone(plan_prompt_repair(source,current))
        current['pages'][0]['imagePrompt']={};self.assertIsNone(plan_prompt_repair(source,current))
    def test_identity_and_page_alignment_reject_wrong_source(self):
        source,current=fixture()
        for change in ({'id':'other'},{'userId':'other'},{'createdAt':NOW+dt.timedelta(days=1)}):
            with self.assertRaises(ValueError):plan_prompt_repair({**source,**change},current)
        for field in ('position','caption','narration'):
            changed=copy.deepcopy(source);changed['pages'][0][field]='other'
            self.assertIsNone(plan_prompt_repair(changed,current))
    def test_encrypted_plan_json_roundtrip_keeps_the_same_guarded_script(self):
        source,current=fixture();plan=plan_prompt_repair(source,current)
        restored=json.loads(json.dumps(plan,default=lambda value:value.isoformat()))
        self.assertEqual(repair_prompts_sql([plan]),repair_prompts_sql([restored]))

@unittest.skipUnless(os.environ.get('ABEI_LEGACY_TEST_DATABASE_URL'),'Dedicated PostgreSQL required')
class PromptRepairIntegration(unittest.TestCase):
    def test_asset_replay_preserves_restored_prompt_and_existing_media_when_history_becomes_ambiguous(self):
        import psycopg
        from psycopg.types.json import Jsonb
        from tools.legacy_sync.tests.test_native_import import SyntheticSource,KEY,NOW,CONFIG
        from tools.legacy_sync.export import export_snapshot,validate_package
        from tools.legacy_sync.package import load_manifest
        from tools.legacy_sync.asset_index import build_index,transfer_index
        from tools.legacy_sync.native_import import import_package
        from tools.legacy_sync.native_mapping import native_id,LOG_KINDS
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True)
        pk='99998011';identity=native_id('picture-book',pk);owners=[native_id('user',str(p)) for p in [1,2]]
        def cleanup():
            with psycopg.connect(url) as c:
                c.execute('DELETE FROM picture_books WHERE id=%s',(identity,))
                c.execute('DELETE FROM legacy_ai_logs WHERE id=ANY(%s)',([native_id(t,str(p)) for t in LOG_KINDS for p in [1,2]],))
                c.execute('DELETE FROM legacy_ai_sessions WHERE id=ANY(%s)',([native_id('session:'+t,str(p)) for t in ['app_ai_chatsubject','app_ai_ttssubject'] for p in [1,2]],))
                c.execute('DELETE FROM media_assets WHERE "createdByUserId"=ANY(%s)',(owners,))
                c.execute('DELETE FROM users WHERE id=ANY(%s)',(owners,))
        cleanup();self.addCleanup(cleanup)
        source=SyntheticSource();source.data['app_ai_product']=[{'id':int(pk),'user_id':1,'title':'合成绘本','is_delete':0,'building':0,
            'create_time':NOW,'update_time':NOW,'extra':'{}','result':'[{"title_zh":"合成绘本","rn_case_pages":[{"body_zh":"原正文","img":"https://cdn.abeiai.com/abei/fixture.png"}]}]'}]
        success={'status':'AVAILABLE','sha256':'a'*64,'sizeBytes':8,'mimeType':'image/png','objectKey':'picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.png','publicUrl':'https://fixture.invalid/picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.png'}
        with tempfile.TemporaryDirectory() as directory:
            export_snapshot(source,Path(directory),KEY,'abeiai-v1','synthetic-prompt-replay')
            validate_package(directory,KEY);manifest=load_manifest(directory,KEY);build_index(directory,manifest,KEY,CONFIG)
            with patch('tools.legacy_sync.asset_index.transfer_one',return_value=success):transfer_index(directory,manifest,KEY,None,None,'https://fixture.invalid',workers=1)
            import_package(directory,KEY,url,testing=True)
            with psycopg.connect(url) as c:
                old=c.execute('SELECT pages,status FROM picture_books WHERE id=%s',(identity,)).fetchone()
                self.assertEqual(old[0][0]['imagePrompt'],'合成图片')
                retained=copy.deepcopy(old[0]);retained[0]['audioUrl']='https://fixture.invalid/restored-audio.mp3'
                c.execute('UPDATE picture_books SET pages=%s WHERE id=%s',(Jsonb(retained),identity))
                c.execute('INSERT INTO legacy_ai_logs (id,"sourceSystem","sourceTable","sourcePk","sourceUserId",kind,status,"inputText","outputText",parameters,"requestedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (native_id('app_ai_drawmessage','2'),'abeiai-v1','app_ai_drawmessage','2','1','IMAGE','SUCCEEDED','其他提示词','["https://cdn.abeiai.com/abei/fixture.png"]',Jsonb({}),NOW))
            import_package(directory,KEY,url,testing=True,phase='assets')
            with psycopg.connect(url) as c:
                self.assertEqual(c.execute('SELECT pages,status FROM picture_books WHERE id=%s',(identity,)).fetchone(),(retained,old[1]))

    def test_pg_prompt_only_update_replays_and_stale_batch_is_atomic(self):
        import psycopg
        from psycopg.types.json import Jsonb
        url=os.environ['ABEI_LEGACY_TEST_DATABASE_URL'];target_guard(url,True);source,current=fixture()
        projection='SELECT id,"userId",version,"createdAt","updatedAt",pages,'+NON_PROMPT_STATE_SQL+' AS "stateSha256" FROM picture_books b WHERE id=%s'
        fields=('id','userId','version','createdAt','updatedAt','pages','stateSha256')
        with psycopg.connect(url,autocommit=True) as c:
            try:
                c.execute('INSERT INTO users (id,email,"passwordHash",nickname,"updatedAt") VALUES (%s,%s,%s,%s,%s)',(current['userId'],'prompt-repair@example.invalid','fixture','合成用户',NOW))
                for identity in (current['id'],current['id']+'2'):
                    c.execute('INSERT INTO picture_books (id,"userId",title,brief,style,"aspectRatio","pageCount",status,messages,characters,pages,version,"createdAt","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                        (identity,current['userId'],'保留标题','原文','watercolor','5:4',2,'COMPLETED',Jsonb([]),Jsonb([]),Jsonb(current['pages']),0,NOW,NOW))
                rows=[dict(zip(fields,c.execute(projection,(identity,)).fetchone())) for identity in (current['id'],current['id']+'2')]
                plans=[plan_prompt_repair({**source,'id':row['id']},row) for row in rows]
                self.assertTrue(all(plans));script=repair_prompts_sql(plans,'abei_wechat_test')
                def apply():
                    cur=c.execute(script);report=None
                    while True:
                        if cur.description:report=cur.fetchone()[0]
                        if not cur.nextset():return report
                self.assertEqual(apply()['updatedPages'],2)
                after=[dict(zip(fields,c.execute(projection,(row['id'],)).fetchone())) for row in rows]
                for old,new in zip(rows,after):
                    pages=copy.deepcopy(old['pages']);pages[0]['imagePrompt']="封面原场景'$$"
                    self.assertEqual(new,{**old,'pages':pages})
                self.assertEqual(apply()['updatedBooks'],0)
                c.execute('UPDATE picture_books SET pages=jsonb_set(pages,\'{0,imagePrompt}\',\'""\') WHERE id=%s',(current['id'],))
                c.execute('UPDATE picture_books SET title=%s WHERE id=%s',('用户修改',current['id']+'2'))
                with self.assertRaises(psycopg.Error):apply()
                c.execute('ROLLBACK');self.assertEqual(c.execute('SELECT pages->0->>\'imagePrompt\' FROM picture_books WHERE id=%s',(current['id'],)).fetchone()[0],'')
            finally:
                c.execute('ROLLBACK');c.execute('DELETE FROM picture_books WHERE "userId"=%s',(current['userId'],));c.execute('DELETE FROM users WHERE id=%s',(current['userId'],))
