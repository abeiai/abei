"""Source ratio choices and authenticated cover-generation history."""
import re
from fractions import Fraction
from .book_styles import as_object

LEGACY_CHOICES=dict(enumerate(('21:9','16:9','3:2','5:4','1:1','4:5','2:3','9:16','9:21')))
SUPPORTED_RATIOS=frozenset(('21:10','16:9','3:2','4:3','5:4','1:1','4:5','3:4','2:3','9:16'))


def legacy_ratio(value,choice=False):
    if isinstance(value,bool) or not isinstance(value,(str,int)):return None
    raw=str(value).strip()
    if choice and raw.isdigit():raw=LEGACY_CHOICES.get(int(raw),'')
    if raw in SUPPORTED_RATIOS:return raw
    if not re.fullmatch(r'[1-9]\d{0,6}:[1-9]\d{0,6}',raw):return None
    width,height=map(int,raw.split(':'));ratio=Fraction(width,height)
    # Old CMS persisted actual pixel sizes. Permit only subpixel rounding error.
    matches=[name for name in SUPPORTED_RATIOS if abs(float(ratio/Fraction(name.replace(':','/')))-1)<=0.003]
    return matches[0] if len(matches)==1 else None


def book_ratio(case,inferred=None):
    if inferred is not None:return legacy_ratio(inferred) or '1:1'
    draw=as_object(as_object(case.get('extra')).get('draw'))
    return legacy_ratio(draw.get('aspect_ratio'),choice=True) or legacy_ratio(case.get('book_ratio')) or '1:1'


def resolve_book_ratios(connection,products,tasks):
    from .native_mapping import native_id,json_value
    links={}
    for row in products:
        value=row['values'];result=json_value(value.get('result'));task=as_object(value.get('extra')).get('one_take_id')
        if task and isinstance(result,list) and len(result)==1 and isinstance(result[0],dict) and result[0].get('img_cover'):
            links.setdefault(str(task),[]).append((row['sourcePk'],value.get('user_id'),result[0]['img_cover']))
    draws={}
    for row in tasks:
        if row['sourcePk'] not in links:continue
        value=row['values'];result=as_object(value.get('result'));draw=result.get('draw_id')
        if not draw:continue
        for pk,owner,cover in links[row['sourcePk']]:
            if owner and value.get('user_id')==owner and result.get('image')==cover:
                draws.setdefault(native_id('app_ai_drawmessage',draw),[]).append((pk,owner,str(draw)))
    ratios={};keys=list(draws)
    for start in range(0,len(keys),2000):
        rows=connection.execute("SELECT id,\"sourcePk\",\"sourceUserId\",parameters->'source'->>'aspect_ratio' FROM legacy_ai_logs WHERE id=ANY(%s) AND \"sourceSystem\"='abeiai-v1' AND \"sourceTable\"='app_ai_drawmessage'",(keys[start:start+2000],))
        for identity,source_pk,owner,raw in rows:
            ratio=legacy_ratio(raw,choice=True)
            if ratio is None and isinstance(raw,str) and raw.isdigit():ratio=LEGACY_CHOICES.get(int(raw))
            if ratio is None:continue
            for pk,product_owner,expected in draws[identity]:
                if owner==product_owner and source_pk==expected:ratios[pk]=ratio
    return ratios
