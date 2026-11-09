import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {buildChineseEdition, chunksForPages, eligibleEnglishBooks, legacySourceDigest, sourceDigest, sourcePages, validateTranslation} from './translate-english-editions.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('='); return [arg.slice(0, index), index < 0 ? true : arg.slice(index + 1)];
}));
const mode = args['--mode'];
if (!['inspect', 'prepare', 'validate', 'publish', 'verify'].includes(mode)) throw Error('需要 --mode=inspect|prepare|validate|publish|verify');
const workDir = '/app/private-creator-assets/picture-book-translation-en-zh-2026';
const {getPrismaClient, decryptSecret} = await import('/app/packages/database/dist/index.js');
const prisma = getPrismaClient();
const log = value => console.log(JSON.stringify({time: new Date().toISOString(), ...value}));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function writePrivate(path, value) {
  await fs.mkdir(workDir, {recursive: true, mode: 0o700});
  const temp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value), {mode: 0o600});
  await fs.rename(temp, path);
}
async function loadStage(book) {
  try {
    const stage = JSON.parse(await fs.readFile(join(workDir, `${book.id}.json`), 'utf8'));
    if (stage.id !== book.id) throw Error(`${book.id}: 断点记录身份不匹配`);
    if (stage.sourceDigest === legacySourceDigest(book)) {
      if (!/CC BY 4\.0/i.test(book.submission?.publishedSourceInfo?.statement ?? '') || !book.submission?.publishedCoverUrl) throw Error(`${book.id}: 授权或封面已失效`);
      stage.sourceDigest = sourceDigest(book);
      await writePrivate(join(workDir, `${book.id}.json`), stage);
    }
    if (stage.sourceDigest !== sourceDigest(book)) throw Error(`${book.id}: 来源在准备后发生变化`);
    validateTranslation(book, stage.translation);
    return stage;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function inventory() {
  let baseline = null;
  if (['validate', 'publish', 'verify'].includes(mode)) {
    try { baseline = JSON.parse(await fs.readFile(join(workDir, 'publish-baseline.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (baseline) {
    const expected = baseline.eligible;
    const books = await prisma.pictureBook.findMany({where: {id: {in: expected.map(item => item.id)}}, include: {submission: true, edition: true}});
    if (books.length !== expected.length) throw Error('发布基线中的原版绘本缺失');
    const byId = new Map(books.map(book => [book.id, book]));
    return expected.map(item => {
      const book = byId.get(item.id);
      if (sourceDigest(book) !== item.sourceDigest) throw Error(`${item.id}: 原书与发布基线不符`);
      return book;
    });
  } else if (mode === 'verify') throw Error('验收必须读取固定发布基线');
  const [books, editions] = await Promise.all([
    prisma.pictureBook.findMany({where: {submission: {is: {publishedAt: {not: null}, publishedCoverUrl: {not: null}}}}, include: {submission: true, edition: true}}),
    prisma.pictureBookEdition.findMany({select: {pictureBookId: true, groupKey: true, language: true}}),
  ]);
  return eligibleEnglishBooks(books, editions).sort((a, b) => a.id.localeCompare(b.id));
}
function acceptedSample(book) {
  if (book.id !== 'storyweaver-669133') return null;
  return {title: '要下雨啦！', pages: [
    '要下雨啦！',
    '10朵灰云\n聚在天上。\n9只聪明的猫\n穿上雨衣，不怕淋湿。',
    '8条鲜艳的纱丽\n在晾衣绳上跳舞。\n7只调皮的猴子\n把看见的伞全偷走。',
    '6个快乐的孩子\n折纸船来比赛。\n5只爱玩的小狗\n追着青蛙到处跑。',
    '4头大水牛\n在村里的池塘里扑通扑通。',
    '3道闪电\n让老鼠钻到地下。\n2声响雷\n把屋顶上的鸟儿惊得四散飞开。',
    '1位农夫\n看着100滴雨点，笑了。',
  ].map((caption, position) => ({position, caption}))};
}
function sourceDocument(book) {
  return {title: book.submission.publishedSnapshot?.title ?? book.title, englishLevel: book.englishLevel, audience: book.audience,
    pages: sourcePages(book).map(page => ({position: page.position, caption: page.caption ?? ''}))};
}
function modelMessages(book, chunk, previous, note = '') {
  const source = sourceDocument(book);
  const target = chunk.map(page => ({position: page.position, caption: page.caption ?? ''}));
  const system = `你是儿童绘本英译中译者和逐页校对者。先通读全书，再只翻译指定页。\n要求：\n1. 保留原作事实、角色名称对应关系、对话、幽默、重复、韵律和结尾，不增加角色、动作、修饰词、说教或原文没有的细节。\n2. 中文要自然适合朗读，难度与原英语相当；英语分级仅供参考，不擅自简化或拔高。\n3. 原文阿拉伯数字原样保留，包括 0，不改成汉字数字。原页空白则译页空白。\n4. 封面如显示标题，必须与译名一致。翻译全部指定页，页码严格对应。\n5. 在输出前自行从头对照英文核对姓名、重复语、事实、数字、漏译和增写。\n只输出 JSON 对象：{"title":"中文书名","pages":[{"position":0,"caption":"中文展示文字"}]}。不要 Markdown。`;
  const user = `完整原书（仅作全书上下文，必须先读完）：\n${JSON.stringify(source)}\n已译页面（固定用词和语气，保持一致）：\n${JSON.stringify(previous)}\n本次仅翻译这些页：\n${JSON.stringify(target)}\n${note}`;
  return [{role: 'system', content: system}, {role: 'user', content: user}];
}
async function modelConfig() {
  const instance = await prisma.aiProviderInstance.findFirst({where: {name: 'DashScope', status: 'ENABLED'}, include: {credential: true, modelInstances: true}});
  const modelName = args['--model'] || 'qwen-plus';
  if (!['qwen-plus', 'qwen3.8-flash'].includes(modelName)) throw Error('仅允许已核对的文本翻译模型');
  const model = instance?.modelInstances.find(item => item.providerModelName === modelName && item.isEnabled);
  const encrypted = model?.apiKeyEncrypted || instance?.credential?.apiKeyEncrypted;
  if (!instance || !model || !encrypted) throw Error(`DashScope ${modelName} 未启用或凭据不存在`);
  return {url: (model.baseUrl || instance.baseUrl).replace(/\/$/, '') + '/chat/completions', name: model.providerModelName, key: decryptSecret(encrypted)};
}
async function translateChunk(config, book, chunk, previous, note = '') {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(config.url, {method: 'POST', headers: {'Authorization': `Bearer ${config.key}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({model: config.name, messages: modelMessages(book, chunk, previous, note), temperature: 0.2, max_tokens: 8192, response_format: {type: 'json_object'}}), signal: AbortSignal.timeout(180000)});
      const body = await response.text();
      if (!response.ok) throw Error(`模型 HTTP ${response.status}: ${body.slice(0, 200)}`);
      const result = JSON.parse(body), content = result.choices?.[0]?.message?.content;
      if (result.choices?.[0]?.finish_reason === 'length') throw Error('模型输出被截断');
      const parsed = JSON.parse(content);
      if (!parsed.title?.trim() || !Array.isArray(parsed.pages) || parsed.pages.length !== chunk.length) throw Error('JSON 页数或译名错误');
      for (const [index, page] of chunk.entries()) if (parsed.pages[index]?.position !== page.position || typeof parsed.pages[index]?.caption !== 'string') throw Error('JSON 页码错误');
      return {translation: parsed, usage: result.usage ?? {}};
    } catch (error) {
      lastError = error;
      if (/data_inspection_failed/.test(error.message)) break;
      if (attempt < 4) await sleep(Math.min(25000, 1500 * 2 ** attempt + Math.random() * 500));
    }
  }
  if (chunk.length > 1) {
    const middle = Math.ceil(chunk.length / 2);
    const left = await translateChunk(config, book, chunk.slice(0, middle), previous, note);
    const right = await translateChunk(config, book, chunk.slice(middle), [...previous, ...left.translation.pages], note);
    return {translation: {title: left.translation.title, pages: [...left.translation.pages, ...right.translation.pages]}, usage: {
      prompt_tokens: (left.usage.prompt_tokens ?? 0) + (right.usage.prompt_tokens ?? 0),
      completion_tokens: (left.usage.completion_tokens ?? 0) + (right.usage.completion_tokens ?? 0),
    }};
  }
  throw Error(`${book.id}: ${lastError.message}`);
}
async function prepareOne(book, config) {
  try { if (await loadStage(book)) return 'cached'; }
  catch (error) {
    if (!/^(第 \d+ 页|译名缺失|翻译页码)/.test(error.message)) throw error;
    log({mode: 'repair-stage', id: book.id, error: error.message});
  }
  const sample = acceptedSample(book);
  if (sample) {
    validateTranslation(book, sample);
    await writePrivate(join(workDir, `${book.id}.json`), {id: book.id, sourceDigest: sourceDigest(book), translation: sample, model: 'user-approved-sample', usage: {}, createdAt: new Date().toISOString()});
    return 'approved-sample';
  }
  const pages = sourcePages(book), chunks = chunksForPages(pages.filter(page => String(page.caption ?? '').trim()));
  let title = '', translatedPages = [], usage = {prompt_tokens: 0, completion_tokens: 0};
  for (const chunk of chunks) {
    const result = await translateChunk(config, book, chunk, translatedPages);
    if (title && title !== result.translation.title) {
      // The first chunk fixes the title; later requests may choose a synonym.
      result.translation.title = title;
    }
    title ||= result.translation.title;
    translatedPages.push(...result.translation.pages);
    usage.prompt_tokens += result.usage.prompt_tokens ?? 0;
    usage.completion_tokens += result.usage.completion_tokens ?? 0;
  }
  const byPosition = new Map(translatedPages.map(page => [page.position, page]));
  const completePages = pages.map(page => byPosition.get(page.position) ?? {position: page.position, caption: ''});
  let translation = {title, pages: completePages};
  for (let repair = 0; repair < 6; repair++) {
    try { translation = validateTranslation(book, translation); break; }
    catch (error) {
      const index = Number(error.message.match(/^第 (\d+) 页/)?.[1]);
      if (!Number.isInteger(index) || !String(pages[index]?.caption ?? '').trim()) throw error;
      const fixed = await translateChunk(config, book, [pages[index]], translation.pages.filter(page => page.position !== pages[index].position), `上一版第 ${index} 页有错误：${error.message}。请逐字核对并纠正。`);
      translation.pages[index] = fixed.translation.pages[0];
      usage.prompt_tokens += fixed.usage.prompt_tokens ?? 0;
      usage.completion_tokens += fixed.usage.completion_tokens ?? 0;
      if (repair === 5) validateTranslation(book, translation);
    }
  }
  await writePrivate(join(workDir, `${book.id}.json`), {id: book.id, sourceDigest: sourceDigest(book), translation, model: config.name, usage, createdAt: new Date().toISOString()});
  return 'translated';
}
async function prepare(books) {
  const config = await modelConfig();
  const selected = args['--limit'] ? books.slice(0, Number(args['--limit'])) : books;
  const queue = [...selected]; let complete = 0, failed = 0, tokens = 0;
  const workers = Array.from({length: Math.min(16, selected.length)}, async () => {
    while (queue.length) {
      const book = queue.shift();
      try {
        const result = await prepareOne(book, config); complete++;
        if (result !== 'cached') {
          const stage = await loadStage(book); tokens += (stage.usage.prompt_tokens ?? 0) + (stage.usage.completion_tokens ?? 0);
        }
        await fs.rm(join(workDir, `${book.id}.error.json`), {force: true});
        if (complete % 20 === 0 || result === 'approved-sample') log({mode, complete, failed, total: selected.length, tokens});
      } catch (error) {
        failed++; log({mode, id: book.id, error: error.message, complete, failed, total: selected.length});
        await writePrivate(join(workDir, `${book.id}.error.json`), {id: book.id, message: error.message, time: new Date().toISOString()});
      }
    }
  });
  await Promise.all(workers);
  log({mode, complete, failed, total: selected.length, tokens});
  if (failed) process.exitCode = 1;
}
async function validateAll(books) {
  let ready = 0; const missing = [];
  for (const book of books) {
    if (await loadStage(book)) ready++;
    else missing.push(book.id);
  }
  log({mode: 'validate', ready, total: books.length, missing: missing.slice(0, 30)});
  if (missing.length) throw Error(`${missing.length} 本尚未翻译`);
}
async function publish(books) {
  if (books.length !== 1558) throw Error(`待发布书目与已核对的 1558 本不一致：${books.length}`);
  await validateAll(books);
  if (process.env.APP_BASE_URL !== 'https://abeiai.com' || !/\@postgres:3604\/abei(?:\?|$)/.test(process.env.DATABASE_URL ?? '')) throw Error('目标不是 abei 正式环境');
  const backupFile = join(workDir, 'prepublish-picture-books.dump');
  const expectedBackupHash = args['--backup-sha'];
  if (!/^[a-f0-9]{64}$/.test(expectedBackupHash ?? '')) throw Error('发布需要数据库备份 SHA-256');
  const backupStat = await fs.stat(backupFile);
  if (backupStat.size < 100000) throw Error('数据库备份过小');
  const backupHash = createHash('sha256');
  for await (const chunk of createReadStream(backupFile)) backupHash.update(chunk);
  if (backupHash.digest('hex') !== expectedBackupHash) throw Error('数据库备份校验失败');
  log({mode, backupBytes: backupStat.size, backupSha256: expectedBackupHash});
  const {snapshotCourseMaterial, hashCourseSnapshot} = await import('/app/apps/api-core/dist/courses/course-domain.js');
  const baseline = {books: await prisma.pictureBook.count(), submissions: await prisma.pictureBookSubmission.count(), editions: await prisma.pictureBookEdition.count()};
  try { await fs.access(join(workDir, 'publish-baseline.json')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writePrivate(join(workDir, 'publish-baseline.json'), {at: new Date().toISOString(), baseline, eligible: books.map(book => ({id: book.id, sourceDigest: sourceDigest(book)}))});
  }
  let created = 0;
  for (const book of books) {
    const stage = await loadStage(book), edition = buildChineseEdition(book, stage.translation);
    const snapshot = snapshotCourseMaterial('PICTURE_BOOK', edition.book), hash = hashCourseSnapshot(snapshot);
    await prisma.$transaction(async tx => {
      const source = await tx.pictureBook.findUnique({where: {id: book.id}, include: {submission: true, edition: true}});
      if (!source || sourceDigest(source) !== stage.sourceDigest || !/CC BY 4\.0/i.test(source.submission?.publishedSourceInfo?.statement ?? '')) throw Error(`${book.id}: 发布前原书或授权已变化`);
      const existing = await tx.pictureBook.findUnique({where: {id: edition.book.id}, include: {submission: true, edition: true}});
      if (existing) {
        if (existing.submission?.publishedHash !== hash || existing.edition?.groupKey !== edition.groupKey || existing.edition?.language !== 'zh-CN') throw Error(`${book.id}: 中文版本冲突`);
        return;
      }
      const sourceEdition = source.edition;
      if (sourceEdition && (sourceEdition.groupKey !== edition.groupKey || sourceEdition.language !== 'en')) throw Error(`${book.id}: 原版语种冲突`);
      if (!sourceEdition) await tx.pictureBookEdition.create({data: {pictureBookId: source.id, groupKey: edition.groupKey, language: 'en'}});
      await tx.pictureBook.create({data: edition.book});
      await tx.pictureBookSubmission.create({data: {
        pictureBookId: edition.book.id, status: 'APPROVED', submittedVersion: 0,
        snapshot, snapshotHash: hash, coverUrl: source.submission.publishedCoverUrl,
        publishedSnapshot: snapshot, publishedHash: hash, publishedCoverUrl: source.submission.publishedCoverUrl,
        sourceInfo: edition.sourceInfo, publishedSourceInfo: edition.sourceInfo,
        publishedAt: new Date(), catalogSortAt: source.submission.catalogSortAt ?? source.submission.publishedAt,
        publishedVersion: 1, reviewNote: '按已确认译例翻译并新增中文版，原版保留，未合成语音。',
      }});
      await tx.pictureBookEdition.create({data: {pictureBookId: edition.book.id, groupKey: edition.groupKey, language: 'zh-CN'}});
    }, {timeout: 30000});
    created++;
    if (created % 50 === 0) log({mode, created, total: books.length});
  }
  log({mode, created, total: books.length, baseline, after: {books: await prisma.pictureBook.count(), submissions: await prisma.pictureBookSubmission.count(), editions: await prisma.pictureBookEdition.count()}});
}
async function verify(books) {
  if (books.length !== 1558) throw Error(`发布基线不是 1558 本：${books.length}`);
  const {snapshotCourseMaterial, hashCourseSnapshot} = await import('/app/apps/api-core/dist/courses/course-domain.js');
  let verified = 0, pages = 0;
  for (const book of books) {
    const stage = await loadStage(book), expected = buildChineseEdition(book, stage.translation);
    const sibling = await prisma.pictureBook.findUnique({where: {id: expected.book.id}, include: {submission: true, edition: true}});
    if (!sibling || sibling.title !== expected.book.title || sibling.edition?.language !== 'zh-CN' || sibling.edition.groupKey !== expected.groupKey || sibling.submission?.status !== 'APPROVED' || !sibling.submission.publishedAt) throw Error(`${book.id}: 中文版缺失或未出版`);
    const hash = hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK', expected.book));
    if (sibling.submission.publishedHash !== hash || sibling.submission.snapshotHash !== hash || hashCourseSnapshot(sibling.submission.publishedSnapshot) !== hash) throw Error(`${book.id}: 发布快照哈希不匹配`);
    if (sibling.pages.length !== expected.book.pages.length || sibling.pages.some((page, index) => page.caption !== expected.book.pages[index].caption || page.imageUrl !== expected.book.pages[index].imageUrl || page.audioUrl)) throw Error(`${book.id}: 译文、图片或音频不符`);
    verified++; pages += sibling.pages.length;
    if (verified % 100 === 0) log({mode, verified, total: books.length});
  }
  log({mode, verified, pages, total: books.length});
}

try {
  const books = await inventory();
  log({mode, eligible: books.length, pages: books.reduce((sum, book) => sum + sourcePages(book).length, 0)});
  if (mode === 'inspect') {}
  else if (mode === 'prepare') await prepare(books);
  else if (mode === 'validate') await validateAll(books);
  else if (mode === 'publish') await publish(books);
  else await verify(books);
} finally {
  await prisma.$disconnect();
}
