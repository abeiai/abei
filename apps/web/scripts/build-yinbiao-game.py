"""生成同音有词的按首字母加载词库。运行：python3 apps/web/scripts/build-yinbiao-game.py"""
import csv,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'apps/web/public/yinbiao/dictionary'
DEST.mkdir(exist_ok=True)
def normalize(value):
    value=value.split(';')[0].strip().strip('/')
    for old,new in [('ɒ:', 'ɔː'), ('ɒi','ɔɪ'),('ә:','ɜː'),('ə:','ɜː'),('є','e'),('ә','ə'),('ɚ','ə'),(':','ː'),('g','ɡ'),("'",'ˈ'),(',', 'ˌ')]:value=value.replace(old,new)
    value=re.sub(r'(?<![aeɔə])i$', 'I',value)
    return re.sub('u(?!ː)','ʊ',re.sub('i(?!ː)','ɪ',value).replace('I','i'))
shards={c:{} for c in 'abcdefghijklmnopqrstuvwxyz'}
with (ROOT/'data/ecdict/ecdict.csv').open(newline='') as f:
    for r in csv.DictReader(f):
        word=r['word'].strip()
        if not re.fullmatch('[a-z]{1,30}',word) or not r['phonetic'] or not re.search('[\u4e00-\u9fff]',r['translation']):continue
        shards[word[0]][word]={'word':word,'phonetic':normalize(r['phonetic']),'meaning':r['translation'].replace('\\n','；')[:240]}
# 保留页面已校对的例词与常见规则词形。
for lengths in json.loads((ROOT/'apps/web/src/lib/yinbiao/words.json').read_text()).values():
    for entries in lengths.values():
        for e in entries:shards[e['word'][0]][e['word']]={k:e[k] for k in ['word','phonetic','meaning']}
for c,data in shards.items():(DEST/f'{c}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
print(sum(map(len,shards.values())),'entries')
