"""Offline standalone TTS history mapping; book speech remains archived."""
import hashlib
import json
import re
from urllib.parse import urlparse
from .native_mapping import native_id,json_value,timestamp

AUDIO_FIELDS=('audio_zh','audio_en','audio_usa','read_audio_url')
TASK_COLUMNS=('id','userId','learnerId','type','status','provider','model','inputText','inputTextLength','outputAudioAssetId','estimatedCredits','actualCredits','errorCode','errorMessage','providerPayload','createdAt','updatedAt','finishedAt')
ASSET_COLUMNS=('id','userId','type','storageProvider','url','objectKey','mimeType','durationMs','sizeBytes','createdAt')
BOOK_MARKERS={'one_take_id','book_id','case_id','page_id','case_page_id'}
# AiConfig catalogue fields are recognized only for classification, never copied to the task.
CONFIG_FIELDS=set('id desc sort quote title prompt select is_show results ai_model category category_id llm_chat template show_role draw_style bots_prompt chat_system llm_version llm_welcome bots_version draw_version clone_version llm_first_show tts_version_en tts_version_zh draw_style_open draw_style_type draw_trans_open save_to_product tts_version_usa draw_composition draw_trans_prompt draw_trans_version draw_prompt_replace draw_negative_prompt draw_reference_style draw_composition_open draw_reference_content draw_reference_character img tts_many rn_form_extra a2t_version auto_run llm_version_base llm_version_member draw_version_base draw_version_member llm_dataset tts_versions video_version_base video_version_member video_trans_prompt human_version_base human_version_member'.split())
CONFIG_FIELDS.update({'llm_upload_file','llm_upload_image'})


def has_book_marker(value):
    if isinstance(value,dict):
        return any(k in BOOK_MARKERS and bool(v) or has_book_marker(v) for k,v in value.items())
    if isinstance(value,list):return any(has_book_marker(v) for v in value)
    return False


def audio_key(value):
    if not isinstance(value,str) or not value:return None
    parsed=urlparse(value)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:return None
    return hashlib.sha256((parsed.hostname.lower()+parsed.path).encode()).hexdigest()


def book_audio_keys(products,cases=(),pages=()):
    keys=set()
    def add(value):
        if not isinstance(value,dict):return
        for field in AUDIO_FIELDS:
            identity=audio_key(value.get(field))
            if identity:keys.add(identity)
    for row in products:
        value=row['values'];result=json_value(value.get('result'))
        category=value.get('category_id',value.get('category'))
        if isinstance(category,dict):category=category.get('id') or category.get('slug')
        if isinstance(result,list):
            for case in result:
                if not isinstance(case,dict):continue
                case_pages=case.get('rn_case_pages')
                if str(category) not in ('4','audio') or isinstance(case_pages,list):add(case)
                if isinstance(case_pages,list):
                    for page in case_pages:add(page)
    for row in cases:add(row['values'])
    for row in pages:add(row['values'])
    return keys


def voice_history_row(row,users,book_audio,public,media=None,snapshot_at=None):
    if row['sourceTable']!='app_ai_ttsmessage':return None,None,'NOT_STANDALONE_TTS'
    value=row['values'];owner=users.get(value.get('user_id'))
    if not owner:return None,None,'OWNER_UNRESOLVED'
    if 'user_content' in row.get('restrictedFields',()):return None,None,'RESTRICTED_TEXT'
    raw=value.get('extra');extra={} if raw is None or raw=='' else json_value(raw)
    if not isinstance(extra,dict):return None,None,'UNCLASSIFIED_EXTRA'
    if has_book_marker(extra):return None,None,'BOOK_GENERATION'
    config=extra.get('config',{})
    if not isinstance(config,dict) or set(config)-CONFIG_FIELDS:return None,None,'UNCLASSIFIED_EXTRA'
    category=config.get('category',config.get('category_id'))
    if isinstance(category,dict):category=category.get('id') or category.get('slug')
    if str(category) in ('3','book'):return None,None,'BOOK_GENERATION'
    if config and str(category) not in ('4','audio'):return None,None,'OTHER_APPLICATION'
    if set(extra)-{'config','V','tp','index','speed','interval'}:return None,None,'UNCLASSIFIED_EXTRA'
    if audio_key(value.get('assistant_content')) in book_audio:return None,None,'BOOK_AUDIO_REFERENCE'
    text=value.get('user_content')
    if not isinstance(text,str) or not text.strip():return None,None,'EMPTY_TEXT'
    if not isinstance(snapshot_at,str):raise ValueError('Authenticated source cutoff required')
    parsed=urlparse(public)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:raise ValueError('Approved R2 HTTPS public base required')
    created=timestamp(value['req_time']);finished=timestamp(value['res_time']) if value.get('res_time') else None
    status=str(value.get('status'));native_status={'2':'SUCCEEDED','3':'FAILED'}.get(status,'CANCELLED');asset=None
    if media:
        key=media['objectKey'];filename=key.rsplit('/',1)[-1]
        if (media['userId']!=owner or media.get('role')!='OUTPUT' or media.get('fieldPath')!='/assistant_content'
            or not re.fullmatch(r'picture-books/legacy-sync/abeiai-v1/[a-f0-9]{64}\.(mp3|wav|ogg|aac|m4a|webm|mp4)',key)
            or media['sha256']!=filename.split('.')[0] or media['url']!=public.rstrip('/')+'/'+key
            or media['mimeType'] not in {'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/aac','audio/mp4','audio/webm'}
            or not isinstance(media['sizeBytes'],int) or not 0<media['sizeBytes']<=2147483647):raise ValueError('Unverified or cross-owner legacy audio')
        if status=='2':asset={'id':native_id('voice-audio',key+':'+owner),'userId':owner,'type':'TTS_OUTPUT','storageProvider':'S3','url':media['url'],'objectKey':key,'mimeType':media['mimeType'],'durationMs':None,'sizeBytes':media['sizeBytes'],'createdAt':created}
    missing='旧版音频尚未同步到 R2。' if status=='2' and not asset else None
    error='旧版语音合成失败。' if status=='3' else '旧版任务未完成。' if native_status=='CANCELLED' else missing
    task={'id':native_id('voice-history:'+row['sourceTable'],row['sourcePk']),'userId':owner,'learnerId':None,'type':'TTS','status':native_status,'provider':'abeiai-v1','model':'旧版语音合成','inputText':text,'inputTextLength':len(text.encode('utf-16-le'))//2,'outputAudioAssetId':asset['id'] if asset else None,'estimatedCredits':0,'actualCredits':None,'errorCode':'LEGACY_AUDIO_UNAVAILABLE' if missing else 'LEGACY_TTS_FAILED' if status=='3' else 'LEGACY_TTS_UNFINISHED' if native_status=='CANCELLED' else None,'errorMessage':error,'providerPayload':{'source':'EXPERIENCE','legacyImport':{'sourceSystem':'abeiai-v1','sourceTable':row['sourceTable'],'sourcePk':row['sourcePk'],'sourceStatus':status,'snapshotAt':snapshot_at,'audioAvailable':bool(asset)}},'createdAt':created,'updatedAt':finished or created,'finishedAt':finished}
    return task,asset,None
