import {createHash} from 'node:crypto';

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function originalPage(page) {
  const translations = Array.isArray(page.translations) ? page.translations.filter(item => item.language !== 'zh-CN') : [];
  const textLayout = page.textLayout?.enabled ? {...page.textLayout,
    versions: page.textLayout.versions.filter(item => item.language !== 'zh-CN')} : page.textLayout;
  return {...page, translations, ...(textLayout ? {textLayout} : {})};
}

function originalSnapshot(snapshot) {
  return {...snapshot,
    titleTranslations: (Array.isArray(snapshot.titleTranslations) ? snapshot.titleTranslations : []).filter(item => item.language !== 'zh-CN'),
    pages: snapshot.pages.map(originalPage)};
}

/** All original book and publication content, including layout text and audio. */
export function originalContentDigest(book) {
  const submission = book.submission;
  if (!submission?.snapshot?.pages || !submission.publishedSnapshot?.pages || !Array.isArray(book.pages)) throw Error('原书快照缺失');
  const original = {
    book: {
      id: book.id, userId: book.userId, title: book.title, brief: book.brief, theme: book.theme,
      audience: book.audience, englishLevel: book.englishLevel, plot: book.plot, style: book.style,
      aspectRatio: book.aspectRatio, isSpread: book.isSpread, pageCount: book.pageCount,
      status: book.status, messages: book.messages, characters: book.characters,
      titleTranslations: (Array.isArray(book.titleTranslations) ? book.titleTranslations : []).filter(item => item.language !== 'zh-CN'),
      pages: book.pages.map(originalPage),
    },
    submission: {
      snapshot: originalSnapshot(submission.snapshot), publishedSnapshot: originalSnapshot(submission.publishedSnapshot),
      coverUrl: submission.coverUrl, publishedCoverUrl: submission.publishedCoverUrl,
      sourceInfo: submission.sourceInfo, publishedSourceInfo: submission.publishedSourceInfo,
      publishedAt: submission.publishedAt, catalogSortAt: submission.catalogSortAt,
      status: submission.status,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical(original))).digest('hex');
}
