import unittest
from collections import Counter
from tools.legacy_sync.native_mapping import target_guard, native_id, user_identity, log_row, book_row
import hashlib

STAMP={'type':'datetime','utc':'2024-01-01T00:00:00Z','raw':'2024-01-01T08:00:00','timezone':'Asia/Shanghai'}

class NativeMapping(unittest.TestCase):
    def test_mp_namespace_uses_actual_runtime_config_and_gates_both_identifiers(self):
        from tools.legacy_sync.native_import import verify_mp_namespace
        context={'sourceAppIdSha256':hashlib.sha256(b'fixture-app').hexdigest()}
        self.assertTrue(verify_mp_namespace({'WECHAT_APP_ID':'fixture-app'},context))
        self.assertFalse(verify_mp_namespace({'WECHAT_MP_APP_ID':'fixture-app','WECHAT_APP_ID':'another-app'},context))
        row={'id':'1','openid':'fixture-openid','unionid':'fixture-union','is_active':'1'}
        counts={'email':Counter(),'phone':Counter(),'wechatMpOpenId':Counter({'fixture-openid':1}),'wechatUnionId':Counter({'fixture-union':1})}
        identity,_=user_identity(row,counts,{field:set() for field in counts},namespace_verified=False)
        self.assertIsNone(identity['wechatMpOpenId'])
        self.assertIsNone(identity['wechatUnionId'])
    def test_target_guard_rejects_source_remote_other_project_and_wrong_port(self):
        target_guard('postgresql://abei:fixture@127.0.0.1:3604/abei')
        target_guard('postgresql://fixture:fixture@127.0.0.1:3606/abei_wechat_test',testing=True)
        for url in ['mysql://fixture@127.0.0.1:3604/abei','postgresql://fixture@db.example:3604/abei','postgresql://fixture@127.0.0.1:3324/xueleai','postgresql://fixture@127.0.0.1:3604/abei_wechat_test']:
            with self.assertRaises(ValueError): target_guard(url)

    def test_duplicate_or_existing_identity_is_unbound_without_merging_accounts(self):
        row={'id':'1','username':'13800138000','email':'duplicate@example.com','openid':'same','unionid':'existing','is_active':'0'}
        counts={key:Counter({value:2 if key in {'email','wechatMpOpenId'} else 1}) for key,value in [('email',row['email']),('phone',row['username']),('wechatMpOpenId',row['openid']),('wechatUnionId',row['unionid'])]}
        existing={'email':set(),'phone':set(),'wechatMpOpenId':set(),'wechatUnionId':{'existing'}}
        value,conflicts=user_identity(row,counts,existing)
        self.assertTrue(value['email'].endswith('@legacy.abei.invalid'))
        self.assertEqual(value['phone'],'13800138000')
        self.assertIsNone(value['phoneVerifiedAt'])
        self.assertIsNone(value['wechatMpOpenId'])
        self.assertIsNone(value['wechatUnionId'])
        self.assertEqual(value['status'],'DISABLED')
        self.assertEqual(set(conflicts),{'email','wechatMpOpenId','wechatUnionId'})
        self.assertEqual(native_id('user','1'),native_id('user','1'))
        self.assertNotEqual(native_id('user','1'),native_id('log','1'))

    def test_log_uses_subject_owner_preserves_unknown_status_duration_and_raw_precision(self):
        source={'sourcePk':'2','sourceTable':'app_ai_chatmessage','values':{'id':'2','subject_id':'7','user_content':'long text','assistant_content':'answer','req_time':STAMP,'status':'99','tokens':'2147483648','extra':'{"large":9007199254740993}'}}
        value=log_row(source,{'4':native_id('user','4')},{'7':{'user_id':'4','chat_system':'system','version_id':None}}, {})
        self.assertEqual(value['sourceUserId'],'4')
        self.assertEqual(value['userId'],native_id('user','4'))
        self.assertEqual(value['status'],'UNKNOWN')
        self.assertIsNone(value['totalTokens'])
        self.assertEqual(value['parameters']['source']['extra'],source['values']['extra'])
        self.assertEqual(value['inputText'],'long text')
        self.assertEqual(value['systemPrompt'],'system')
        self.assertFalse(value['usageVerified'])

    def test_import_selects_semantically_matching_legacy_book_style(self):
        source={'sourcePk':'9','sourceTable':'app_ai_product','values':{'user_id':'4','result':[{'extra':{'draw':{'style':'6','role':[{'style':'水彩画'}]},'config':{'draw_style':[{'id':'4'}]}},'rn_case_pages':[{'body_zh':'正文'}]}],'create_time':STAMP,'update_time':STAMP}}
        book,reason=book_row(source,{'4':native_id('user','4')},{})
        self.assertIsNone(reason);self.assertEqual(book['style'],'3d-animation')
        source['values']['result'][0]['extra']['draw']['style']='17'
        self.assertEqual(book_row(source,{'4':native_id('user','4')},{})[0]['style'],'classic-oil')

    def test_import_falls_back_to_flat_for_missing_or_unmatched_style(self):
        source={'sourcePk':'9','sourceTable':'app_ai_product','values':{'user_id':'4','result':[{'extra':{'draw':{'style':'未知风格'},'config':{'draw_style':[{'id':'4'}]}},'rn_case_pages':[{'body_zh':'正文'}]}],'create_time':STAMP,'update_time':STAMP}}
        self.assertEqual(book_row(source,{'4':native_id('user','4')},{})[0]['style'],'flat')
        source['values']['result'][0]['extra']={}
        self.assertEqual(book_row(source,{'4':native_id('user','4')},{})[0]['style'],'flat')

    def test_picture_book_mapping_requires_real_chinese_pages_owner_and_not_deleted(self):
        source={'sourcePk':'9','sourceTable':'app_ai_product','values':{'id':'9','user_id':'4','title':'故事','result':'[{"title_zh":"故事","img_cover":"old","rn_case_pages":[{"body_zh":"正文","img":"old-image","audio_zh":"old-audio"}]}]','create_time':STAMP,'update_time':STAMP,'building':'0','is_delete':'0'}}
        replacements={'old':'https://new/cover','old-image':'https://new/image','old-audio':'https://new/audio'}
        value,reason=book_row(source,{'4':native_id('user','4')},replacements)
        self.assertIsNone(reason)
        self.assertEqual(value['pages'][0]['imageUrl'],'https://new/cover')
        self.assertEqual(value['pages'][1]['caption'],'正文')
        self.assertEqual(value['pages'][1]['audioUrl'],'https://new/audio')
        self.assertNotIn('imageTaskId',value['pages'][1])
        source['values']['is_delete']='1'
        self.assertEqual(book_row(source,{'4':native_id('user','4')},replacements)[1],'DELETED')

if __name__=='__main__': unittest.main()
