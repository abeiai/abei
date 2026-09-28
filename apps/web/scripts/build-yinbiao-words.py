"""Build a small, reproducible phonetics vocabulary from the existing MIT ECDICT.
Run from repository root: python3 apps/web/scripts/build-yinbiao-words.py
No database access. Only the generated yinbiao JSON is written.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'apps/web/src/lib/yinbiao/words.json'
SYMBOLS = 'ɑː ɔː ɜː iː uː ʌ ɒ ə ɪ ʊ e æ aɪ ɔɪ eɪ aʊ əʊ ɪə eə ʊə b d ɡ v ð z ʒ r p t k f θ s ʃ h dʒ dz dr tʃ ts tr j w m n ŋ l'.split()
LONG = 'ɑː ɔː ɜː iː uː aɪ ɔɪ eɪ aʊ əʊ ɪə eə ʊə tʃ dʒ'.split()

def normalize(value):
    value = value.split(';')[0].strip().strip('/')
    for old, new in [('ɒ:', 'ɔː'), ('ɒi', 'ɔɪ'), ('ә:', 'ɜː'), ('ə:', 'ɜː'), ('є', 'e'), ('ә', 'ə'), ('ɚ', 'ə'), (':', 'ː'), ('g', 'ɡ'), ("'", 'ˈ'), (',', 'ˌ')]:
        value = value.replace(old, new)
    # ECDICT's legacy DJ symbols use i/u for the lax vowels and diphthong endpoints.
    value = re.sub(r'(?<![aeɔə])i$', 'I', value)
    value = re.sub('i(?!ː)', 'ɪ', value).replace('I', 'i')
    value = re.sub('u(?!ː)', 'ʊ', value)
    return value

def tokenize(value):
    result = []
    while value:
        token = next((s for s in LONG if value.startswith(s)), value[0])
        if token not in 'ˈˌ .-':
            result.append(token)
        value = value[len(token):]
    return result

def contains(tokens, symbol):
    if symbol in ('ts', 'dz', 'tr', 'dr'):
        return any(a + b == symbol for a, b in zip(tokens, tokens[1:]))
    return symbol in tokens

rows = []
with (ROOT / 'data/ecdict/ecdict.csv').open() as source:
    for row in csv.DictReader(source):
        word = row['word']
        if not re.fullmatch('[a-z]{3,8}', word) or not row['phonetic']:
            continue
        rank = int(row['bnc'] or 0)
        if not (row['oxford'] == '1' or int(row['collins'] or 0) >= 1) or not 0 < rank <= 15000:
            continue
        phonetic = normalize(row['phonetic'])
        tokens = tokenize(phonetic)
        if any(t not in SYMBOLS + ['i'] for t in tokens):
            continue
        meaning = row['translation'].split('\\n')[0].strip()
        if not re.search('[\u4e00-\u9fff]', meaning) or any(t in meaning for t in ('[人名]', '[地名]', '[网络]')):
            continue
        rows.append((rank, {'word': word, 'phonetic': phonetic, 'meaning': meaning, 'tokens': tokens}))
# Common regular -s forms are absent from many dictionary headword lists.
# Whitelist only forms whose base ends in /t/ or /d/, preserving their actual suffix.
inflections = "cats hats pets rats bats boots coats boats seats spots lights nights fruits plants plates jackets pockets markets tickets rabbits products students presents blankets benefits beds buds rods gods lids cards birds hands heads words fields sounds clouds crowds stands friends grounds islands records husbands diamonds hundreds methods".split()
by_word = {entry['word']: entry for _, entry in rows}
for word in inflections:
    base = by_word.get(word[:-1])
    if base and base['tokens'][-1] in ('t', 'd'):
        suffix = 's' if base['tokens'][-1] == 't' else 'z'
        rows.append((10000, {'word': word, 'phonetic': base['phonetic'] + suffix, 'meaning': base['meaning'] + '（规则 -s 词形）', 'tokens': base['tokens'] + [suffix]}))
rows.sort(key=lambda row: row[0])
data = {symbol: {str(n): [r for _, r in rows if len(r['word']) == n and contains(r['tokens'], symbol)][:5] for n in range(3, 9)} for symbol in SYMBOLS}
DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
missing = [(s, n, len(words)) for s, lengths in data.items() for n, words in lengths.items() if len(words) < 5]
print(f'{sum(len(words) for lengths in data.values() for words in lengths.values())} examples; {len(missing)} length buckets below 5:')
print(missing)
