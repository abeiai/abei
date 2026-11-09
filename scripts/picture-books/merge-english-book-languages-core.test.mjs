import assert from 'node:assert/strict';
import test from 'node:test';
import {originalContentDigest} from './merge-english-book-languages-core.mjs';

const original = () => {
  const page = {position: 0, caption: '', imageUrl: 'https://r.abeiai.com/cover.png', audioUrl: null,
    textLayout: {enabled: true, versions: [{language: 'original', boxes: [{id: 'title', text: 'Shoes'}], audioUrl: 'https://r.abeiai.com/en.mp3'}]}};
  return {id: 'book', userId: 'owner', title: 'Shoes', brief: 'Shoes', theme: '', audience: '', englishLevel: 1,
    plot: '', style: '水彩', aspectRatio: '1:1', isSpread: false, pageCount: 0, status: 'COMPLETED', messages: [], characters: [],
    titleTranslations: [], pages: [structuredClone(page)], submission: {snapshot: {title: 'Shoes', pages: [structuredClone(page)]},
      publishedSnapshot: {title: 'Shoes', pages: [structuredClone(page)]}, coverUrl: 'https://r.abeiai.com/cover.png',
      publishedCoverUrl: 'https://r.abeiai.com/cover.png', sourceInfo: {}, publishedSourceInfo: {},
      publishedAt: new Date('2026-11-09T00:00:00Z'), catalogSortAt: null, status: 'APPROVED'}};
};

test('中文标题、逐页译文和图片文字层加入后，原内容摘要保持不变', () => {
  const book = original(), before = originalContentDigest(book);
  book.titleTranslations.push({language: 'zh-CN', title: '鞋子'});
  for (const record of [book, book.submission.snapshot, book.submission.publishedSnapshot]) {
    record.titleTranslations = [{language: 'zh-CN', title: '鞋子'}];
    record.pages[0].textLayout.versions.push({language: 'zh-CN', boxes: [{id: 'title', text: '鞋子'}], audioUrl: null});
    record.pages[0].translations = [{language: 'zh-CN', caption: '鞋子', audioUrl: null}];
  }
  assert.equal(originalContentDigest(book), before);
});

test('任一副本的原英文、原语音或图片改变都会使摘要不匹配', () => {
  const book = original(), before = originalContentDigest(book);
  for (const record of [book, book.submission.snapshot, book.submission.publishedSnapshot]) {
    const changed = structuredClone(book);
    const copy = record === book ? changed : record === book.submission.snapshot ? changed.submission.snapshot : changed.submission.publishedSnapshot;
    copy.pages[0].textLayout.versions[0].boxes[0].text = 'Changed';
    assert.notEqual(originalContentDigest(changed), before);
  }
  const audio = original(); audio.submission.publishedSnapshot.pages[0].textLayout.versions[0].audioUrl = null;
  assert.notEqual(originalContentDigest(audio), before);
  const image = original(); image.pages[0].imageUrl = 'https://r.abeiai.com/changed.png';
  assert.notEqual(originalContentDigest(image), before);
});
