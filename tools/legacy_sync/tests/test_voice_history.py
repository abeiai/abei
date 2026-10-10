import copy
import unittest
from tools.legacy_sync.voice_history import book_audio_keys,voice_history_row
from tools.legacy_sync.native_mapping import native_id
STAMP={'type':'datetime','raw':'2024-01-01T08:00:00','timezone':'Asia/Shanghai','utc':'2024-01-01T00:00:00Z'}
PUBLIC='https://fixture.invalid'
KEY='picture-books/legacy-sync/abeiai-v1/'+'a'*64+'.mp3'
def source(extra=None):
    return {'sourceTable':'app_ai_ttsmessage','sourcePk':'901','values':{'user_id':'9','user_content':'独立语音正文','assistant_content':'https://cdn.abeiai.com/abei/audio/voice.mp3','status':'2','req_time':STAMP,'res_time':STAMP,'extra':extra}}
def media():
    return {'userId':native_id('user','9'),'objectKey':KEY,'url':PUBLIC+'/'+KEY,'sha256':'a'*64,'mimeType':'audio/mpeg','sizeBytes':321,'role':'OUTPUT','fieldPath':'/assistant_content'}
class VoiceHistoryContract(unittest.TestCase):
    def test_standalone_history_keeps_owner_text_time_and_verified_r2_without_billing(self):
        row=source({'config':{'category':'4','title':'语音合成'}});before=copy.deepcopy(row)
        task,asset,reason=voice_history_row(row,{'9':native_id('user','9')},set(),PUBLIC,media(),snapshot_at='2026-10-08T03:00:00Z')
        self.assertIsNone(reason);self.assertEqual(row,before);self.assertEqual(task['userId'],native_id('user','9'));self.assertEqual(task['inputText'],'独立语音正文')
        self.assertEqual(task['status'],'SUCCEEDED');self.assertEqual(task['estimatedCredits'],0);self.assertIsNone(task['actualCredits']);self.assertIsNone(task['learnerId']);self.assertEqual(task['providerPayload']['source'],'EXPERIENCE')
        self.assertEqual(asset['url'],PUBLIC+'/'+KEY);self.assertEqual(task['outputAudioAssetId'],asset['id']);self.assertEqual(task['providerPayload']['legacyImport']['sourcePk'],'901')
        self.assertEqual(task['createdAt'].isoformat(),'2024-01-01T00:00:00+00:00')
    def test_book_generation_markers_win_even_when_reused_as_audio(self):
        for extra in ('{"one_take_id":1}',{'config':{'category':'3'}},{'config':{'category':{'slug':'book'}}},{'book_id':17},{'case_id':17},{'config':{'category':'4'},'one_take_id':1}):
            task,asset,reason=voice_history_row(source(extra),{'9':native_id('user','9')},set(),PUBLIC,media(),snapshot_at='2026-10-08T03:00:00Z')
            self.assertIsNone(task);self.assertIn(reason,('BOOK_GENERATION','OTHER_APPLICATION'))
    def test_saved_book_audio_excludes_unmarked_reused_segments(self):
        refs=book_audio_keys([{'values':{'result':[{'img_cover':'x','audio_zh':'https://cdn.abeiai.com/abei/audio/voice.mp3','rn_case_pages':[{'audio_en':'https://cdn.abeiai.com/abei/audio/en.mp3'}]}]}}])
        task,_,reason=voice_history_row(source(),{'9':native_id('user','9')},refs,PUBLIC,media(),snapshot_at='2026-10-08T03:00:00Z')
        self.assertIsNone(task);self.assertEqual(reason,'BOOK_AUDIO_REFERENCE');self.assertEqual(len(refs),2)
    def test_book_cover_audio_is_indexed_without_pages_but_audio_products_are_not_books(self):
        url=source()['values']['assistant_content']
        for case in ({'audio_zh':url},{'audio_zh':url,'rn_case_pages':None}):
            refs=book_audio_keys([{'values':{'category_id':'3','result':[case]}}])
            self.assertEqual(voice_history_row(source(),{'9':native_id('user','9')},refs,PUBLIC,snapshot_at='2026-10-08T03:00:00Z')[2],'BOOK_AUDIO_REFERENCE')
        self.assertFalse(book_audio_keys([{'values':{'category_id':'4','result':[{'audio_zh':url}]}}]))
    def test_unknown_metadata_fails_closed_and_nested_book_markers_are_excluded(self):
        for extra in (42,True,[], '42', 'null','not-json',{'config':'book'},{'config':[]},{'config':{'category':'4','unexpected':True}}):
            self.assertEqual(voice_history_row(source(extra),{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')[2],'UNCLASSIFIED_EXTRA')
        for config in ({'category':'4','book_id':1},{'category':'4','results':{'case_id':17}}):
            self.assertEqual(voice_history_row(source({'config':config}),{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')[2],'BOOK_GENERATION')
        extra={'config':{'category':'4','draw_style':[{'book':'sample-book.png'}],'llm_upload_file':False,'llm_upload_image':False}}
        self.assertIsNone(voice_history_row(source(extra),{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')[2])
    def test_restricted_source_text_stays_in_encrypted_archive(self):
        row=source();row['restrictedFields']=['user_content','extra']
        self.assertEqual(voice_history_row(row,{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')[2],'RESTRICTED_TEXT')
    def test_non_audio_app_unresolved_owner_or_unclassified_extra_never_enters_history(self):
        for row,users in [(source({'config':{'category':'6'}}),{'9':native_id('user','9')}),(source({'unexpected_private_config':{}}),{'9':native_id('user','9')}),(source(),{})]:
            self.assertIsNone(voice_history_row(row,users,set(),PUBLIC,media(),snapshot_at='2026-10-08T03:00:00Z')[0])
    def test_missing_audio_and_unfinished_tasks_are_terminal_without_reexecution(self):
        row=source();row['values']['status']='1'
        task,asset,reason=voice_history_row(row,{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')
        self.assertIsNone(reason);self.assertIsNone(asset);self.assertEqual(task['status'],'CANCELLED');self.assertEqual(task['providerPayload']['legacyImport']['sourceStatus'],'1')
        row['values']['status']='2';task,_,_=voice_history_row(row,{'9':native_id('user','9')},set(),PUBLIC,snapshot_at='2026-10-08T03:00:00Z')
        self.assertEqual(task['status'],'SUCCEEDED');self.assertIn('尚未同步',task['errorMessage'])
    def test_rejects_wrong_owner_non_output_mime_hash_or_domain(self):
        for field,value in [('userId','other'),('role','INPUT'),('fieldPath','/extra/input'),('mimeType','image/png'),('sha256','b'*64),('url','https://unapproved.invalid/a.mp3')]:
            bad=media();bad[field]=value
            with self.assertRaises(ValueError):voice_history_row(source(),{'9':native_id('user','9')},set(),PUBLIC,bad,snapshot_at='2026-10-08T03:00:00Z')
        bad=media();bad['objectKey']='picture-books/legacy-sync/abeiai-v1/../'+('a'*64)+'.mp3';bad['url']=PUBLIC+'/'+bad['objectKey']
        with self.assertRaises(ValueError):voice_history_row(source(),{'9':native_id('user','9')},set(),PUBLIC,bad,snapshot_at='2026-10-08T03:00:00Z')
