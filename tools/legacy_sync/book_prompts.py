"""Restore original image prompts only from owned, matching historical images."""
from collections import defaultdict
from .book_styles import as_object

RESTRICTED='[受限字段，原始内容保留在加密档案]'

def prompt_text(value):
    return value if isinstance(value,str) and value.strip() and value!=RESTRICTED else ''

def profiles(products):
    from .native_mapping import json_value
    result={}
    for row in products:
        v=row['values'];case=json_value(v.get('result'));owner=v.get('user_id')
        result.pop(row['sourcePk'],None)
        if str(v.get('is_delete'))=='1' or not owner or not isinstance(case,list) or len(case)!=1 or not isinstance(case[0],dict):continue
        case=case[0];pages=case.get('rn_case_pages')
        if not isinstance(pages,list) or any(not isinstance(p,dict) for p in pages):continue
        cover=case.get('img_cover');offset=int(bool(cover));slots=[]
        if cover:slots.append((1,cover,case.get('title_zh') or v.get('title') or ''))
        slots.extend((n+1+offset,p.get('img'),p.get('body_zh') or '') for n,p in enumerate(pages))
        result[row['sourcePk']]={'owner':str(owner),'slots':slots,'cover':cover,'title':case.get('title_zh') or v.get('title') or '',
            'pages':[(p.get('img'),p.get('body_zh') or '') for p in pages],
            'task':as_object(v.get('extra')).get('one_take_id'),'inline':as_object(as_object(case.get('extra')).get('draw')).get('data',[])}
    return result

def collect_profiles(books,logs,tasks):
    from .native_mapping import json_value,native_id
    wanted=defaultdict(list);inline=defaultdict(set);historical=defaultdict(set);fallback=defaultdict(set)
    for pk,b in books.items():
        data=b['inline'] if isinstance(b['inline'],list) else []
        for position,image,caption in b['slots']:
            if not isinstance(image,str) or not image:continue
            wanted[(b['owner'],image)].append((pk,position))
            for item in data:
                if (isinstance(item,dict) and isinstance(item.get('images'),list) and image in item['images']
                    and item.get('text_zh')==caption and prompt_text(item.get('prompt'))):inline[(pk,position)].add(item['prompt'])
    for log in logs:
        if (log.get('sourceSystem')!='abeiai-v1' or log.get('sourceTable')!='app_ai_drawmessage'
            or log.get('kind')!='IMAGE' or log.get('status')!='SUCCEEDED'
            or log.get('id')!=native_id('app_ai_drawmessage',log.get('sourcePk'))):continue
        prompt=next((prompt_text(log.get(k)) for k in ('inputText','promptZh','promptEn') if prompt_text(log.get(k))),'')
        images=json_value(log.get('outputText'),[])
        if not prompt or not isinstance(images,list):continue
        for image in images:
            if isinstance(image,str):
                for slot in wanted.get((str(log.get('sourceUserId')),image),()):historical[slot].add(prompt)
    linked=defaultdict(list)
    for pk,b in books.items():
        if b['task']:linked[str(b['task'])].append((pk,b))
    for row in tasks:
        for pk,b in linked.get(row['sourcePk'],()):
            v=row['values'];result=as_object(v.get('result'));pages=result.get('pages')
            if (str(v.get('user_id'))!=b['owner'] or result.get('title')!=b['title']
                or not isinstance(pages,list) or len(pages)!=len(b['pages'])
                or (b['cover'] and result.get('image')!=b['cover'])):continue
            offset=int(bool(b['cover']))
            if offset and prompt_text(result.get('cover')):fallback[(pk,1)].add(result['cover'])
            for n,(image,caption) in enumerate(b['pages']):
                item=pages[n]
                if (isinstance(item,dict) and image and item.get('image')==image and item.get('text_zh')==caption
                    and prompt_text(item.get('prompt'))):fallback[(pk,n+1+offset)].add(item['prompt'])
    result={}
    for pk,b in books.items():
        for position,_,_ in b['slots']:
            slot=(pk,position)
            # An ambiguous stronger source cannot be replaced by a weaker guess.
            candidates=next((source[slot] for source in (inline,historical,fallback) if source.get(slot)),set())
            if len(candidates)==1:result.setdefault(pk,{})[position]=next(iter(candidates))
    return result

def collect_book_prompts(products,logs,tasks=()):
    return collect_profiles(profiles(products),logs,tasks)

def resolve_book_prompts(connection,products,tasks=()):
    books=profiles(products);owners=sorted({b['owner'] for b in books.values()})
    if not owners:return {}
    fields=('id','sourceSystem','sourceTable','sourcePk','sourceUserId','kind','status','inputText','outputText','promptZh','promptEn')
    with connection.cursor(name='legacy_book_prompt_lookup') as cursor:
        cursor.itersize=2000
        cursor.execute('SELECT id,"sourceSystem","sourceTable","sourcePk","sourceUserId",kind,status,"inputText","outputText",parameters->\'source\'->\'prompt_zh\',parameters->\'source\'->\'prompt_en\' FROM legacy_ai_logs WHERE "sourceSystem"=%s AND "sourceTable"=%s AND kind=%s AND status=%s AND "sourceUserId"=ANY(%s)',
            ('abeiai-v1','app_ai_drawmessage','IMAGE','SUCCEEDED',owners))
        return collect_profiles(books,(dict(zip(fields,row)) for row in cursor),tasks)
