import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourcePages = book => {
  const published = book.submission?.publishedSnapshot?.pages;
  return Array.isArray(published) && published.length ? published : book.pages;
};
export const legacySourceDigest = book => digest({id: book.id, publishedHash: book.submission?.publishedHash, title: book.submission?.publishedSnapshot?.title ?? book.title, pages: sourcePages(book).map(p => [p.position, p.caption, p.imageUrl])});
export const sourceDigest = book => digest({
  original: legacySourceDigest(book),
  sourceInfo: book.submission?.publishedSourceInfo,
  publishedCoverUrl: book.submission?.publishedCoverUrl,
  publishedAt: book.submission?.publishedAt,
});

export function eligibleEnglishBooks(books, editions) {
  const chineseGroups = new Set(editions.filter(e => e.language === 'zh-CN').map(e => e.groupKey));
  return books.filter(book => {
    const sub = book.submission;
    const name = sub?.publishedSourceInfo?.name;
    if (!sub?.publishedAt || !sub.publishedCoverUrl || !sub.publishedHash || !['StoryWeaver', 'Book Dash'].includes(name)) return false;
    if (!/CC BY 4\.0/i.test(sub.publishedSourceInfo.statement ?? '')) return false;
    if (book.edition?.language && book.edition.language !== 'en') return false;
    return !chineseGroups.has(book.edition?.groupKey ?? book.id);
  });
}

export function chunksForPages(pages, maxCharacters = 4800, maxPages = 15) {
  const chunks = []; let current = [], length = 0;
  for (const page of pages) {
    const size = String(page.caption ?? '').length;
    if (current.length && (current.length >= maxPages || length + size > maxCharacters)) {
      chunks.push(current); current = []; length = 0;
    }
    current.push(page); length += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function chineseInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 99999999) return [];
  const digits = '零一二三四五六七八九';
  const small = number => {
    if (number === 0) return '零';
    let text = '', pendingZero = false;
    for (const [unit, label] of [[1000, '千'], [100, '百'], [10, '十'], [1, '']]) {
      const digit = Math.floor(number / unit) % 10;
      if (digit) {
        if (pendingZero) text += '零';
        text += (unit === 10 && digit === 1 && !text ? '' : digits[digit]) + label;
        pendingZero = false;
      } else if (text && number % unit) pendingZero = true;
    }
    return text;
  };
  const high = Math.floor(value / 10000), low = value % 10000;
  const text = high ? `${small(high)}万${low ? `${low < 1000 ? '零' : ''}${small(low)}` : ''}` : small(low);
  return [...new Set([text, text.replace(/二(?=[百千万])/g, '两'), ...(value === 2 ? ['两'] : [])])];
}

function validateIndianMagnitude(original, caption, index) {
  const words = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100};
  const pattern = /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|three and a half)\s+(lakh|crore)s?\b/gi;
  for (const match of original.matchAll(pattern)) {
    const amount = match[1].toLowerCase() === 'three and a half' ? 3.5 : (words[match[1].toLowerCase()] ?? Number(match[1]));
    const expected = amount * (match[2].toLowerCase() === 'lakh' ? 100000 : 10000000);
    if (!Number.isSafeInteger(expected)) continue;
    const candidates = [String(expected), expected.toLocaleString('en-US'),
      ...chineseInteger(expected),
      ...(expected % 10000 === 0 ? [`${expected / 10000}万`] : []),
      ...(expected % 100000000 === 0 ? [`${expected / 100000000}亿`, ...chineseInteger(expected / 100000000).map(number => `${number}亿`)] : [])];
    if (!candidates.some(candidate => /\d/.test(candidate)
      ? new RegExp(`(?<!\\d)${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(caption)
      : caption.includes(candidate))) throw Error(`第 ${index} 页 ${match[0]} 的数量级不正确`);
  }
}

export function validateTranslation(book, translation) {
  const pages = sourcePages(book);
  if (typeof translation?.title !== 'string' || !translation.title.trim() || !/[\u3400-\u9fff]/u.test(translation.title)) throw Error('译名缺失或不是中文');
  if (!Array.isArray(translation.pages) || translation.pages.length !== pages.length) throw Error('翻译页码数量错误');
  for (const [index, source] of pages.entries()) {
    const target = translation.pages[index];
    if (target?.position !== source.position || typeof target.caption !== 'string') throw Error(`第 ${index} 页页码不匹配`);
    const original = String(source.caption ?? '').trim(), caption = target.caption.trim();
    if (!original && caption) throw Error(`第 ${index} 页原文空白却新增译文`);
    if (original && (!caption || (/[A-Za-z]/.test(original) && !/[\u3400-\u9fff]/u.test(caption)))) throw Error(`第 ${index} 页译文缺失或不是中文`);
    if (original.startsWith('@page {')) continue;
    validateIndianMagnitude(original, caption, index);
    const sourceNumbers = new Map();
    const numberPattern = /(?<!\d)(?:\d{1,2}(?:,\d{2})+,\d{3}|\d+(?:,\d{3})*)(?:\.\d+)?(?!\d)/g;
    const normalNumber = number => String(Number(number.replace(/,/g, '')));
    for (const match of original.matchAll(numberPattern)) {
      const number = match[0];
      if (/^\s+(?:lakh|crore)s?\b/i.test(original.slice(match.index + number.length))) continue;
      sourceNumbers.set(number, (sourceNumbers.get(number) ?? 0) + 1);
    }
    const targetNumbers = (caption.match(numberPattern) ?? []).map(normalNumber);
    for (const [number, count] of sourceNumbers) {
      const arabic = targetNumbers.filter(item => item === normalNumber(number)).length;
      const value = Number(number.replace(/,/g, ''));
      const chinese = chineseInteger(value).reduce((max, variant) => Math.max(max, caption.split(variant).length - 1), 0);
      const clock = /^([01]?\d|2[0-3])\.([0-5]\d)$/.exec(number);
      const naturalTime = clock ? caption.split(`${Number(clock[1])}点${clock[2]}分`).length - 1 : 0;
      const covid = number === '19' && /COVID-19/i.test(original) ? (caption.match(/新冠(?:肺炎|病毒|疫情)/g) ?? []).length : 0;
      const exponent = /(?:Powers of 10|superscript of 10)/i.test(original) ? /^10([1-9]\d?)$/.exec(number)?.[1] : null;
      const superscript = exponent?.replace(/\d/g, digit => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)]);
      const scientific = exponent ? [`10${superscript}`, `10^${exponent}`, `10的${exponent}次方`].reduce((total, form) => total + caption.split(form).length - 1, 0) : 0;
      const squareBase = /Squared or/i.test(original) ? /^(\d+)2$/.exec(number)?.[1] : null;
      const squared = squareBase ? caption.split(`${squareBase}²`).length - 1 : 0;
      const footnoteMark = original.includes(`)${number}`) ? number.replace(/\d/g, digit => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)]) : null;
      const footnote = footnoteMark ? caption.split(footnoteMark).length - 1 : 0;
      if (arabic + chinese + naturalTime + covid + scientific + squared + footnote < count) throw Error(`第 ${index} 页数字 ${number} 未保留`);
    }
  }
  return translation;
}

export function buildChineseEdition(book, translation) {
  validateTranslation(book, translation);
  const source = sourcePages(book);
  const sourceTitle = String(book.submission.publishedSnapshot?.title ?? book.title);
  const normalizeTitle = value => String(value).toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
  const id = book.id.replace(/^(storyweaver|bookdash)-/, '$1-cn-');
  if (id === book.id) throw Error('不支持的绘本 ID');
  const pages = source.map((page, index) => ({
    position: page.position,
    caption: normalizeTitle(page.caption) === normalizeTitle(sourceTitle) ? translation.title : translation.pages[index].caption,
    narration: normalizeTitle(page.caption) === normalizeTitle(sourceTitle) ? translation.title : translation.pages[index].caption,
    imageUrl: page.imageUrl,
    audioUrl: null,
    imagePrompt: '',
    imageTaskId: null,
    audioTaskId: null,
  }));
  const originalInfo = book.submission.publishedSourceInfo;
  return {
    groupKey: book.edition?.groupKey ?? book.id,
    sourceInfo: {...originalInfo, statement: `${originalInfo.statement} 中文翻译版本由 abeiai 制作；插图沿用原作。`},
    book: {
      id, userId: book.userId, title: translation.title, brief: translation.title,
      theme: '中文绘本', audience: book.audience || '儿童', englishLevel: null,
      plot: pages.slice(1).map(page => page.caption).filter(Boolean).join('\n\n'),
      style: book.style, aspectRatio: book.aspectRatio, isSpread: book.isSpread,
      pageCount: pages.length - 1, status: 'COMPLETED', messages: [], characters: [], pages,
    },
  };
}
