import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChineseEdition, chunksForPages, eligibleEnglishBooks, sourceDigest, validateTranslation} from './translate-english-editions.mjs';

const original = {
  id: 'storyweaver-123', userId: 'owner', title: 'Rain and Sam', brief: 'Rain and Sam',
  theme: '英语绘本', audience: '儿童', englishLevel: 1, plot: '', style: 'illustration',
  aspectRatio: '4:3', isSpread: false, pageCount: 2, status: 'COMPLETED', messages: [], characters: [],
  pages: [
    {position: 0, caption: 'Rain and Sam', narration: 'Rain and Sam', imageUrl: 'https://r.abeiai.com/cover.jpg', audioUrl: null},
    {position: 1, caption: 'Sam finds 2 cats.', narration: 'Sam finds 2 cats.', imageUrl: 'https://r.abeiai.com/1.jpg', audioUrl: null},
    {position: 2, caption: '', narration: '', imageUrl: 'https://r.abeiai.com/2.jpg', audioUrl: null},
  ],
  submission: {publishedAt: new Date(), publishedCoverUrl: 'https://r.abeiai.com/cover.jpg', publishedHash: 'abc', publishedSourceInfo: {name: 'StoryWeaver', statement: 'CC BY 4.0'}, publishedSnapshot: {title: 'Rain and Sam', pages: []}},
  edition: null,
};
const translated = {title: '山姆和雨', pages: [{position: 0, caption: '山姆和雨'}, {position: 1, caption: '山姆找到了2只猫。'}, {position: 2, caption: ''}]};

test('only published unpaired licensed English originals are eligible', () => {
  const rows = [original, {...original, id: 'storyweaver-124', edition: {groupKey: 'paired', language: 'en'}}, {...original, id: 'other', submission: {...original.submission, publishedSourceInfo: {name: 'Other', statement: 'CC BY 4.0'}}}];
  const editions = [{pictureBookId: 'storyweaver-124', groupKey: 'paired', language: 'en'}, {pictureBookId: 'existing-zh', groupKey: 'paired', language: 'zh-CN'}];
  assert.deepEqual(eligibleEnglishBooks(rows, editions).map(x => x.id), [original.id]);
});

test('translation keeps exact page mapping, Arabic numerals, and blank pages', () => {
  assert.deepEqual(validateTranslation(original, translated), translated);
  assert.throws(() => validateTranslation(original, {...translated, pages: translated.pages.slice(1)}), /页码/);
  assert.throws(() => validateTranslation(original, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '山姆找到了三只猫。'} : p)}), /数字/);
  assert.throws(() => validateTranslation(original, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '山姆找到了12只猫。'} : p)}), /数字/);
  assert.equal(validateTranslation(original, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '山姆找到了两只猫。'} : p)}).pages[1].caption, '山姆找到了两只猫。');
  const repeated = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '2 cats and 2 dogs.'} : p)};
  assert.throws(() => validateTranslation(repeated, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '2只猫和狗。'} : p)}), /数字/);
  const list = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '2,4,6 cats.'} : p)};
  assert.doesNotThrow(() => validateTranslation(list, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '2、4、6只猫。'} : p)}));
  const time = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'At 10.45 am.'} : p)};
  assert.doesNotThrow(() => validateTranslation(time, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '上午10点45分。'} : p)}));
  const distance = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '22,000km and 2,00,000 years.'} : p)};
  assert.doesNotThrow(() => validateTranslation(distance, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '22,000公里与二十万年。'} : p)}));
  const date = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'On 1/09/1983.'} : p)};
  assert.doesNotThrow(() => validateTranslation(date, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '1983年9月1日。'} : p)}));
  const css = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '@page { margin: 0.79in } The pond is here.'} : p)};
  assert.doesNotThrow(() => validateTranslation(css, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '池塘就在这里。'} : p)}));
  const power = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'Powers of 10: 103, 1016.'} : p)};
  assert.doesNotThrow(() => validateTranslation(power, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '10的幂：10³、10¹⁶。'} : p)}));
  const squared = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '1 Squared or 12=1; 13 Squared or 132=169.'} : p)};
  assert.doesNotThrow(() => validateTranslation(squared, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '1的平方，即1²=1；13的平方，即13²=169。'} : p)}));
  const footnote = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'The (BPD)2 team.'} : p)};
  assert.doesNotThrow(() => validateTranslation(footnote, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '（BPD）²团队。'} : p)}));
  const lakh = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'Five lakhs and two lakh rupees.'} : p)};
  assert.throws(() => validateTranslation(lakh, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '五百万和两百万卢比。'} : p)}), /数量级/);
  assert.doesNotThrow(() => validateTranslation(lakh, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '五十万和二十万卢比。'} : p)}));
  const crore = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: '5 crore women and 2.7 crore homes.'} : p)};
  assert.throws(() => validateTranslation(crore, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '5亿女性和2.7亿户。'} : p)}), /数量级/);
  assert.doesNotThrow(() => validateTranslation(crore, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '5000万女性和2700万户。'} : p)}));
  const hundredCrore = {...original, pages: original.pages.map(p => p.position === 1 ? {...p, caption: 'One metre is a hundred crore nanometres.'} : p)};
  assert.throws(() => validateTranslation(hundredCrore, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '一米是一百亿纳米。'} : p)}), /数量级/);
  assert.doesNotThrow(() => validateTranslation(hundredCrore, {...translated, pages: translated.pages.map(p => p.position === 1 ? {...p, caption: '一米是十亿纳米。'} : p)}));
  assert.throws(() => validateTranslation(original, {...translated, pages: translated.pages.map(p => p.position === 2 ? {...p, caption: '再见'} : p)}), /空白/);
});

test('Chinese sibling retains images and attribution but has no audio', () => {
  const result = buildChineseEdition(original, translated);
  assert.equal(result.book.id, 'storyweaver-cn-123');
  assert.equal(result.book.title, '山姆和雨');
  assert.equal(result.book.englishLevel, null);
  assert.equal(result.book.pages[1].imageUrl, original.pages[1].imageUrl);
  assert.equal(result.book.pages[1].audioUrl, null);
  assert.equal(result.book.pages[1].narration, '山姆找到了2只猫。');
  assert.match(result.sourceInfo.statement, /CC BY 4.0/);
  assert.match(result.sourceInfo.statement, /中文翻译/);
  assert.equal(result.groupKey, original.id);
});

test('large books split on page boundaries with a cover-only first chunk', () => {
  const pages = Array.from({length: 8}, (_, i) => ({position: i, caption: 'a'.repeat(i ? 160 : 20)}));
  const chunks = chunksForPages(pages, 400, 4);
  assert.deepEqual(chunks.flat().map(p => p.position), pages.map(p => p.position));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 4));
});

test('publication source digest detects license and cover changes', () => {
  assert.notEqual(sourceDigest(original), sourceDigest({...original, submission: {...original.submission, publishedCoverUrl: 'https://r.abeiai.com/different.jpg'}}));
  assert.notEqual(sourceDigest(original), sourceDigest({...original, submission: {...original.submission, publishedSourceInfo: {name: 'StoryWeaver', statement: 'revoked'}}}));
});
