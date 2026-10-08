"""Pure reviewed native mappings. Financial entities intentionally have no adapter."""
import datetime as dt
import hashlib
import json
import re
from urllib.parse import urlparse, unquote

SOURCE_SYSTEM='abeiai-v1'
LOG_KINDS={'app_ai_chatmessage':'CHAT','app_ai_drawmessage':'IMAGE','app_ai_ttsmessage':'AUDIO','app_ai_videomessage':'VIDEO','app_ai_ttssubject':'AUDIO'}


def target_guard(url,testing=False):
    parsed=urlparse(url)
    expected=(3606,'abei_wechat_test') if testing else (3604,'abei')
    if parsed.scheme not in {'postgresql','postgres'} or parsed.hostname not in {'127.0.0.1','localhost'} or (parsed.port,unquote(parsed.path.lstrip('/')))!=expected:
        raise ValueError('Only isolated local abei target is allowed')
    if parsed.query and parsed.query!='schema=public': raise ValueError('Unexpected target connection options')


def native_id(kind,pk):
    return 'c'+hashlib.sha256((SOURCE_SYSTEM+'\0'+kind+'\0'+str(pk)).encode()).hexdigest()[:31]


def json_value(value,default=None):
    if isinstance(value,(dict,list)): return value
    if isinstance(value,str):
        try: return json.loads(value,parse_int=str,parse_float=str)
        except (ValueError,RecursionError): pass
    return default


def text(value):
    if isinstance(value,str): return value
    if isinstance(value,dict) and value.get('type')=='restricted': return '[受限字段，原始内容保留在加密档案]'
    return None


def timestamp(value):
    if not isinstance(value,dict) or value.get('type')!='datetime' or not value.get('utc'): raise ValueError('Missing authoritative source timestamp')
    return dt.datetime.fromisoformat(value['utc'].replace('Z','+00:00'))


def integer(value):
    if isinstance(value,str) and re.fullmatch(r'-?\d+',value):
        number=int(value)
        if -2147483648<=number<=2147483647: return number
    return None


def identity_values(v):
    email=(v.get('email') or '').strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254 or email.endswith('@legacy.abei.invalid'): email=None
    phone=v.get('username') if re.fullmatch(r'1[3-9]\d{9}',v.get('username') or '') else None
    return {'email':email,'phone':phone,'wechatMpOpenId':v.get('openid') or None,'wechatUnionId':v.get('unionid') or None}


def user_identity(values,counts,existing,namespace_verified=True):
    identity=identity_values(values)
    conflicts=[]
    for field,value in identity.items():
        if value and (counts[field][value]!=1 or value in existing[field]):
            identity[field]=None
            conflicts.append(field)
    identity['email']=identity['email'] or native_id('user',values['id'])+'@legacy.abei.invalid'
    identity['status']='ACTIVE' if str(values.get('is_active'))=='1' else 'DISABLED'
    identity['phoneVerifiedAt']=None
    if not namespace_verified:
        identity['wechatMpOpenId']=None
        identity['wechatUnionId']=None
    return identity,conflicts


def log_row(row,users,subjects,versions):
    v=row['values']; table=row['sourceTable']; pk=row['sourcePk']
    subject=subjects.get(v.get('subject_id'),{}) if table=='app_ai_chatmessage' else {}
    owner=subject.get('user_id') if table=='app_ai_chatmessage' else v.get('user_id')
    version_id=subject.get('version_id') if table=='app_ai_chatmessage' else v.get('version_id')
    labels=versions.get((LOG_KINDS[table],version_id),{})
    input_text=text(v.get('prompt')) if table=='app_ai_drawmessage' else text(v.get('user_content'))
    if table=='app_ai_ttssubject': input_text=text(v.get('body')) or json.dumps(v.get('body'),ensure_ascii=False)
    output_text=text(v.get('results')) if table=='app_ai_drawmessage' else text(v.get('assistant_content'))
    extra=json_value(v.get('extra'),{})
    if not isinstance(extra,dict): extra={}
    return {
        'id':native_id(table,pk),'sourceSystem':SOURCE_SYSTEM,'sourceTable':table,'sourcePk':pk,'sourceMsgId':v.get('msg_id'),'sourceUserId':owner,'sourceTaskId':v.get('task_id'),
        'userId':users.get(owner),'kind':LOG_KINDS[table],'status':{'0':'WAITING','1':'RUNNING','2':'SUCCEEDED','3':'FAILED','4':'RUNNING'}.get(str(v.get('status')),'UNKNOWN'),
        'sourceStatus':str(v.get('status')),'application':text(extra.get('app')),'providerName':labels.get('providerName'),'modelName':labels.get('modelName'),'versionName':labels.get('versionName'),'voiceName':labels.get('voiceName'),
        'inputPreview':input_text[:160] if input_text else None,'outputPreview':output_text[:160] if output_text else None,'inputText':input_text,'outputText':output_text,'systemPrompt':text(subject.get('chat_system')),
        'parameters':{'source':{k:value for k,value in v.items() if k not in {'user_content','assistant_content','prompt','results','error','body'}},'sourceVersionId':version_id,'sourceSubjectPk':v.get('subject_id')},
        'errorMessage':text(v.get('error')),'inputTokens':integer(v.get('input_tokens')),'outputTokens':integer(v.get('output_tokens')),'totalTokens':integer(v.get('tokens')),'textLength':integer(v.get('total_length')),
        'durationRaw':v.get('duration'),'durationUnit':None,'usageVerified':False,'requestedAt':timestamp(v['req_time']),'respondedAt':timestamp(v['res_time']) if v.get('res_time') else None,
    }


def book_row(row,users,replacements):
    v=row['values']; owner=users.get(v.get('user_id'))
    if str(v.get('is_delete'))=='1': return None,'DELETED'
    if not owner: return None,'OWNER_UNRESOLVED'
    result=json_value(v.get('result'))
    if not isinstance(result,list) or len(result)!=1 or not isinstance(result[0],dict) or not isinstance(result[0].get('rn_case_pages'),list): return None,'UNSUPPORTED_FORMAT'
    case=result[0]; pages=[]
    if case.get('img_cover'):
        pages.append({'position':1,'caption':text(case.get('title_zh')) or text(v.get('title')) or '', 'imagePrompt':'','narration':text(case.get('title_zh')) or '', 'imageUrl':replacements.get(case.get('img_cover'),''),'audioUrl':replacements.get(case.get('audio_zh'),'')})
    for page in case['rn_case_pages']:
        if not isinstance(page,dict): return None,'UNSUPPORTED_PAGE'
        pages.append({'position':len(pages)+1,'caption':text(page.get('body_zh')) or '', 'imagePrompt':text(page.get('prompt')) or '', 'narration':text(page.get('body_zh')) or '', 'imageUrl':replacements.get(page.get('img'),''),'audioUrl':replacements.get(page.get('audio_zh'),'')})
    if not pages: return None,'EMPTY_BOOK'
    complete=str(v.get('building'))=='0' and all(page['imageUrl'] and page['caption'] for page in pages)
    return {'id':native_id('picture-book',row['sourcePk']),'userId':owner,'title':text(v.get('title')) or text(case.get('title_zh')) or '旧版作品 '+row['sourcePk'],'brief':'','style':'','aspectRatio':'1:1','pageCount':len(pages),'status':'COMPLETED' if complete else 'EDITING','messages':[],'characters':[],'pages':pages,'createdAt':timestamp(v['create_time']),'updatedAt':timestamp(v['update_time'])},None
