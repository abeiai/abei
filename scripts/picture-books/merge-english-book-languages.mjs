import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {buildChineseEdition, sourceDigest, validateTranslation} from './translate-english-editions.mjs';
import {originalContentDigest} from './merge-english-book-languages-core.mjs';

const mode = process.argv.find(arg => arg.startsWith('--mode='))?.slice(7);
const backupSha = process.argv.find(arg => arg.startsWith('--backup-sha='))?.slice(13);
if (!['inspect', 'merge', 'verify'].includes(mode)) throw Error('需要 --mode=inspect|merge|verify');
const workDir = '/app/private-creator-assets/picture-book-translation-en-zh-2026';
const {getPrismaClient} = await import('/app/packages/database/dist/index.js');
const {hashCourseSnapshot, snapshotCourseMaterial} = await import('/app/apps/api-core/dist/courses/course-domain.js');
const {playbackFromSnapshot} = await import('/app/apps/api-core/dist/picture-books/picture-book-playback.js');
const prisma = getPrismaClient();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const log = value => console.log(JSON.stringify({time: new Date().toISOString(), ...value}));
const siblingId = id => id.replace(/^(storyweaver|bookdash)-/, '$1-cn-');
const titleVersions = (versions, title) => [...(Array.isArray(versions) ? versions : []).filter(item => item.language !== 'zh-CN'), {language: 'zh-CN', title}];
function translatedPages(pages, translation, layoutTranslations, privateFields = false) {
  if (!Array.isArray(pages) || pages.length !== translation.pages.length) throw Error('页面数量不一致');
  return pages.map((page, index) => {
    const target = translation.pages[index];
    if (page.position !== target.position || !Array.isArray(page.translations ?? [])) throw Error(`第 ${index} 页页码或译文结构不一致`);
    if (page.textLayout?.enabled) {
      const text = layoutTranslations?.[String(page.position)];
      const original = page.textLayout.versions?.find(item => item.language === 'original');
      if (typeof text !== 'string' || !original || original.boxes.length > 1 || page.textLayout.versions.some(item => item.language === 'zh-CN')) throw Error(`第 ${index} 页图文编排译文不完整`);
      const boxes = original.boxes.map(box => ({...box, text}));
      return {...page, textLayout: {...page.textLayout, versions: [...page.textLayout.versions, {language: 'zh-CN', boxes, audioUrl: null}]}};
    }
    return {...page, translations: [...(page.translations ?? []).filter(item => item.language !== 'zh-CN'),
      {language: 'zh-CN', caption: target.caption, audioUrl: null, ...(privateFields ? {audioTaskId: null} : {})}]};
  });
}
function mergedSnapshot(snapshot, translation, layoutTranslations) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.pages)) throw Error('发布快照缺失');
  return {...snapshot, titleTranslations: titleVersions(snapshot.titleTranslations, translation.title),
    pages: translatedPages(snapshot.pages, translation, layoutTranslations)};
}
function assertMerged(source, stage, originalDigest) {
  if (originalContentDigest(source) !== originalDigest) throw Error(`${source.id}: 原书内容、图片或语音被改动`);
  for (const record of [source, source.submission?.snapshot, source.submission?.publishedSnapshot])
    if (record?.titleTranslations?.find(item => item.language === 'zh-CN')?.title !== stage.translation.title) throw Error(`${source.id}: 中文译名缺失`);
  for (const pages of [source.pages, source.submission?.snapshot?.pages, source.submission?.publishedSnapshot?.pages]) {
    if (!Array.isArray(pages) || pages.length !== stage.translation.pages.length) throw Error(`${source.id}: 译文页数不一致`);
    for (const [index, page] of pages.entries()) {
      if (page.textLayout?.enabled) {
        const version = page.textLayout.versions?.find(item => item.language === 'zh-CN');
        if (page.position !== index || version?.boxes?.map(box => box.text).join('\n') !== stage.layoutTranslations?.[String(index)] || version.audioUrl !== null) throw Error(`${source.id}: 第 ${index} 页图文译文或语音状态不符`);
        continue;
      }
      const item = page.translations?.find(value => value.language === 'zh-CN');
      if (page.position !== index || item?.caption !== stage.translation.pages[index].caption || item.audioUrl !== null) throw Error(`${source.id}: 第 ${index} 页译文或无语音状态不符`);
    }
  }
  if (source.submission.snapshotHash !== hashCourseSnapshot(source.submission.snapshot)
    || source.submission.publishedHash !== hashCourseSnapshot(source.submission.publishedSnapshot)) throw Error(`${source.id}: 快照哈希不符`);
  playbackFromSnapshot(source.id, source.submission.publishedSnapshot);
}
async function fileSha(path) {
  const buffer = await fs.readFile(path);
  return {sha: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length};
}
async function writePrivate(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value), {mode: 0o600});
  await fs.rename(temp, path);
}
try {
  if (process.env.APP_BASE_URL !== 'https://abeiai.com' || !/\@postgres:3604\/abei(?:\?|$)/.test(process.env.DATABASE_URL ?? '')) throw Error('目标不是 abei 正式环境');
  const published = JSON.parse(await fs.readFile(join(workDir, 'publish-baseline.json'), 'utf8'));
  if (published.eligible?.length !== 1558 || new Set(published.eligible.map(item => item.id)).size !== 1558) throw Error('原版基线不是已审核的 1558 本');
  const previous = await fs.readFile(join(workDir, 'merge-baseline.json'), 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const items = [];
  for (const item of published.eligible) {
    const stage = JSON.parse(await fs.readFile(join(workDir, `${item.id}.json`), 'utf8'));
    if (stage.id !== item.id || stage.sourceDigest !== item.sourceDigest) throw Error(`${item.id}: 私有译稿身份或原文摘要不符`);
    items.push({id: item.id, stage, translationDigest: digest({translation: stage.translation, layoutTranslations: stage.layoutTranslations ?? null})});
  }
  const ids = items.map(item => item.id), siblingIds = ids.map(siblingId);
  const [sources, siblings, revisionReferences, publicationReferences, creatorReferences] = await Promise.all([
    prisma.pictureBook.findMany({where: {id: {in: ids}}, include: {submission: true, edition: true}}),
    prisma.pictureBook.findMany({where: {id: {in: siblingIds}}, include: {submission: true, edition: true}}),
    prisma.courseRevisionItem.count({where: {pictureBookId: {in: siblingIds}}}),
    prisma.courseMaterialPublication.count({where: {pictureBookId: {in: siblingIds}}}),
    prisma.creatorWork.count({where: {resourceId: {in: siblingIds}}}),
  ]);
  if (sources.length !== 1558 || revisionReferences || publicationReferences || creatorReferences) throw Error('原书缺失或中文版已被其他资源引用');
  const bySource = new Map(sources.map(book => [book.id, book]));
  const bySibling = new Map(siblings.map(book => [book.id, book]));
  const previousEntries = new Map(previous?.items?.map(item => [item.id, item]));
  let pending = 0, complete = 0, pages = 0;
  const manifest = [];
  for (const item of items) {
    const source = bySource.get(item.id), sibling = bySibling.get(siblingId(item.id));
    validateTranslation(source, item.stage.translation);
    if (!source.submission?.publishedSnapshot || !source.edition || source.edition.language !== 'en') throw Error(`${item.id}: 原书未发布或语种错误`);
    if (source.submission.snapshotHash !== hashCourseSnapshot(source.submission.snapshot)
      || source.submission.publishedHash !== hashCourseSnapshot(source.submission.publishedSnapshot)) throw Error(`${item.id}: 原书审核快照哈希不符`);
    const baseline = previousEntries?.get(item.id);
    if (previous && (!baseline || baseline.translationDigest !== item.translationDigest)) throw Error(`${item.id}: 合并基线与当前译稿不符`);
    const originalDigest = baseline?.originalDigest ?? originalContentDigest(source);
    if (sibling) {
      if (previous && baseline?.originalDigest !== originalContentDigest(source)) throw Error(`${item.id}: 原书发生并发修改`);
      if (sourceDigest(source) !== item.stage.sourceDigest) throw Error(`${item.id}: 原书与已审核译稿不符`);
      if (source.titleTranslations?.some(value => value.language === 'zh-CN')) throw Error(`${item.id}: 原书已存在中文译名`);
      const expected = buildChineseEdition(source, item.stage.translation);
      const expectedHash = hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK', expected.book));
      if (sibling.edition?.language !== 'zh-CN' || sibling.edition.groupKey !== source.edition.groupKey
        || sibling.userId !== source.userId || sibling.version !== 0 || sibling.status !== 'COMPLETED'
        || sibling.title !== expected.book.title || hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK', sibling)) !== expectedHash
        || sibling.submission?.status !== 'APPROVED' || sibling.submission.submittedVersion !== 0 || sibling.submission.publishedVersion !== 1
        || sibling.submission.snapshotHash !== expectedHash || sibling.submission.publishedHash !== expectedHash
        || hashCourseSnapshot(sibling.submission.snapshot) !== expectedHash || hashCourseSnapshot(sibling.submission.publishedSnapshot) !== expectedHash
        || hashCourseSnapshot(sibling.submission.sourceInfo) !== hashCourseSnapshot(expected.sourceInfo)
        || hashCourseSnapshot(sibling.submission.publishedSourceInfo) !== hashCourseSnapshot(expected.sourceInfo)) throw Error(`${item.id}: 独立中文版在发布后发生过编辑或审核变化，不能删除`);
      playbackFromSnapshot(source.id, snapshotCourseMaterial('PICTURE_BOOK', {...source,
        titleTranslations: titleVersions(source.titleTranslations, item.stage.translation.title),
        pages: translatedPages(source.pages, item.stage.translation, item.stage.layoutTranslations, true)}));
      playbackFromSnapshot(source.id, mergedSnapshot(source.submission.snapshot, item.stage.translation, item.stage.layoutTranslations));
      playbackFromSnapshot(source.id, mergedSnapshot(source.submission.publishedSnapshot, item.stage.translation, item.stage.layoutTranslations));
      pending++;
    } else {
      if (!previous) throw Error(`${item.id}: 独立中文版缺失且无合并基线`);
      assertMerged(source, item.stage, originalDigest);
      complete++;
    }
    pages += item.stage.translation.pages.length;
    manifest.push({id: item.id, originalDigest, translationDigest: item.translationDigest});
  }
  if (previous && (previous.items.length !== manifest.length || previous.items.some((item, index) => item.id !== manifest[index].id))) throw Error('合并基线书目不匹配');
  log({mode: 'inspect', pending, complete, books: items.length, pages, siblingReferences: revisionReferences + publicationReferences});
  if (mode === 'merge') {
    if (!/^[a-f0-9]{64}$/.test(backupSha ?? '')) throw Error('需要合并前数据库备份 SHA-256');
    const backup = await fileSha(join(workDir, 'premerge-picture-books.dump'));
    if (backup.bytes < 100000 || backup.sha !== backupSha) throw Error('合并前数据库备份校验失败');
    if (previous && previous.backupSha !== backupSha) throw Error('备份与原合并基线不一致');
    if (!previous) await writePrivate(join(workDir, 'merge-baseline.json'), {createdAt: new Date().toISOString(), backupSha, items: manifest});
    let merged = 0;
    for (const item of items) {
      if (!bySibling.has(siblingId(item.id))) continue;
      const source = bySource.get(item.id), translation = item.stage.translation;
      const pages = translatedPages(source.pages, translation, item.stage.layoutTranslations, true);
      const titles = titleVersions(source.titleTranslations, translation.title);
      const snapshot = mergedSnapshot(source.submission.snapshot, translation, item.stage.layoutTranslations);
      const publishedSnapshot = mergedSnapshot(source.submission.publishedSnapshot, translation, item.stage.layoutTranslations);
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`picture-book-submission:${item.id}`}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`picture-book-submission:${siblingId(item.id)}`}))`;
        await tx.$queryRaw`SELECT 1 FROM picture_books WHERE id = ${siblingId(item.id)} FOR UPDATE`;
        await tx.$queryRaw`SELECT 1 FROM picture_book_submissions WHERE "pictureBookId" = ${siblingId(item.id)} FOR UPDATE`;
        const current = await tx.pictureBook.findUnique({where: {id: item.id}, include: {submission: true}});
        const target = await tx.pictureBook.findUnique({where: {id: siblingId(item.id)}, include: {submission: true, edition: true}});
        if (!current || current.version !== source.version || current.updatedAt.getTime() !== source.updatedAt.getTime()
          || sourceDigest(current) !== item.stage.sourceDigest || !target
          || target.version !== bySibling.get(target.id).version || target.updatedAt.getTime() !== bySibling.get(target.id).updatedAt.getTime()
          || target.submission?.updatedAt.getTime() !== bySibling.get(target.id).submission.updatedAt.getTime()
          || target.userId !== source.userId || target.edition?.language !== 'zh-CN' || target.edition.groupKey !== source.edition.groupKey
          || hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK', target)) !== bySibling.get(target.id).submission.publishedHash)
          throw Error(`${item.id}: 合并前绘本发生变化`);
        const updated = await tx.pictureBook.updateMany({where: {id: item.id, version: source.version, updatedAt: source.updatedAt},
          data: {titleTranslations: titles, pages, version: {increment: 1}}});
        if (updated.count !== 1) throw Error(`${item.id}: 原书更新冲突`);
        const changed = await tx.pictureBookSubmission.updateMany({where: {id: source.submission.id, publishedHash: source.submission.publishedHash, updatedAt: source.submission.updatedAt},
          data: {snapshot, snapshotHash: hashCourseSnapshot(snapshot), publishedSnapshot, publishedHash: hashCourseSnapshot(publishedSnapshot),
            submittedVersion: source.version + 1, publishedVersion: {increment: 1}}});
        if (changed.count !== 1) throw Error(`${item.id}: 发布快照更新冲突`);
        await tx.pictureBook.delete({where: {id: target.id}});
      }, {timeout: 30000});
      merged++;
      if (merged % 50 === 0) log({mode, merged, remaining: pending - merged});
    }
    log({mode, merged, total: items.length});
  }
  if (mode === 'verify') {
    if (!previous || pending) throw Error('尚有独立中文版未合并');
    log({mode, verified: complete, pages});
  }
} finally {
  await prisma.$disconnect();
}
