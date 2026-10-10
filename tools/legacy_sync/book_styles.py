"""Reviewed semantic style mapping for the authenticated abeiai-v1 catalogue."""
import json

# Catalogue IDs are source IDs, not labels from a configuration option list.
LEGACY_STYLES = {
    '1': ('卡通', 'flat'), '2': ('蜡笔画', 'crayon'),
    '3': ('彩铅画', 'colored-pencil'), '4': ('水彩画', 'watercolor'),
    '5': ('像素风', 'pixel-art'), '6': ('3D卡通', '3d-animation'),
    '7': ('波普艺术', 'flat'), '8': ('彩色水墨', 'color-ink'),
    '9': ('日式动漫', 'flat'), '10': ('黑白线稿', 'line-sketch'),
    '11': ('经典动画', 'flat'), '12': ('自由风格', 'flat'),
    '13': ('高清照片', 'flat'), '14': ('中国古风', 'flat'),
    '15': ('Q版动漫', 'flat'), '16': ('Q版人物', '3d-animation'),
    '17': ('梵高艺术', 'classic-oil'), '18': ('粗线条儿童画', 'flat'),
    '19': ('黑白照片', 'flat'), '20': ('美式漫画', 'flat'),
}
STYLE_IDS = frozenset(style for _, style in LEGACY_STYLES.values())
NAMES = {name: style for name, style in LEGACY_STYLES.values()}


def as_object(value):
    if isinstance(value, str):
        try: value = json.loads(value)
        except (ValueError, RecursionError): return {}
    return value if isinstance(value, dict) else {}


def legacy_style(value):
    if isinstance(value, dict): value = value.get('id') or value.get('title')
    if isinstance(value, bool) or not isinstance(value, (str, int)): return 'flat'
    value = str(value).strip()
    return LEGACY_STYLES[value][1] if value in LEGACY_STYLES else NAMES.get(value, 'flat')


def book_style(values, case, inferred=None):
    draw = as_object(as_object(case.get('extra')).get('draw'))
    if draw.get('style') is not None and draw.get('style') != '':
        return legacy_style(draw['style'])
    return inferred if inferred in STYLE_IDS else 'flat'


def resolve_book_styles(connection, products, tasks):
    """Read imported drawing history, bound to the original task owner and cover."""
    from .native_mapping import native_id, json_value
    links = {}
    for row in products:
        value = row['values']; result = json_value(value.get('result'))
        task = as_object(value.get('extra')).get('one_take_id')
        if task and isinstance(result, list) and len(result) == 1 and isinstance(result[0], dict) and result[0].get('img_cover'):
            links.setdefault(str(task), []).append((row['sourcePk'], value.get('user_id'), result[0]['img_cover']))
    draws = {}
    for row in tasks:
        if row['sourcePk'] not in links: continue
        value = row['values']; result = as_object(value.get('result'))
        draw = result.get('draw_id')
        if not draw: continue
        for pk, owner, cover in links[row['sourcePk']]:
            if owner and value.get('user_id') == owner and result.get('image') == cover:
                draws.setdefault(native_id('app_ai_drawmessage', draw), []).append((pk, owner, str(draw)))
    styles = {}; keys = list(draws)
    for start in range(0, len(keys), 2000):
        rows = connection.execute("SELECT id,\"sourcePk\",\"sourceUserId\",parameters->'source'->>'style_id' FROM legacy_ai_logs WHERE id=ANY(%s) AND \"sourceSystem\"='abeiai-v1' AND \"sourceTable\"='app_ai_drawmessage'", (keys[start:start+2000],))
        for identity, source_pk, owner, style in rows:
            for product_pk, product_owner, expected_draw in draws[identity]:
                if owner == product_owner and source_pk == expected_draw:
                    styles[product_pk] = legacy_style(style)
    return styles
