import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreatorMediaService, type CreatorMediaViewer } from '../src/creator/creator-media.service.js';

const base = 'https://r.abeiai.com';
const pages = [
  { position: 0, caption: '封面', imageUrl: `${base}/books/cover.webp?v=1`, audioUrl: `${base}/books/audio.mp3?v=1`, translations: [{ language: 'en', caption: 'Cover', audioUrl: `${base}/books/en.mp3?lang=en` }] },
  { position: 1, caption: '私有', imageUrl: `${base}/books/private.png?X-Amz-Signature=secret`, audioUrl: '/api/creator-assets/private' },
  { position: 2, caption: '其他', imageUrl: 'https://r.abeiai.com.evil.test/a.png', audioUrl: `${base}/books/video.webm` },
  { position: 3, caption: '类型错误', imageUrl: `${base}/books/audio.mp3`, audioUrl: `${base}/books/image.png` },
  { position: 4, caption: '签名', imageUrl: `${base}/books/image.png?token=secret`, audioUrl: `${base}/books/audio.mp3?X-Amz-Signature=secret` },
  { position: 5, caption: '暂不支持回退', imageUrl: `${base}/books/image.png`, audioUrl: `${base}/books/audio.flac` },
  { position: 6, caption: '特殊路径', imageUrl: `${base}/book.v1/image.PNG`, audioUrl: `${base}/books/a%20b.mp3` },
  { position: 7, caption: '超长路径', imageUrl: `${base}/${'a'.repeat(2045)}.png`, audioUrl: null },
];
function fixture(options: { approved?: boolean; current?: boolean; published?: boolean; allowed?: boolean } = {}, media?: unknown) {
  const revision = { id: 'rev', courseId: 'course', status: options.approved === false ? 'DRAFT' : 'APPROVED', course: { userId: 'owner', publishedAt: options.published === false ? null : new Date(), approvedRevisionId: options.current === false ? 'other' : 'rev' } };
  const service = new CreatorMediaService(media as never);
  Object.assign(service, { db: {
    courseRevisionItem: { findUnique: async () => ({ revisionId: 'rev', materialType: 'PICTURE_BOOK', pictureBookId: 'book', pinnedSnapshot: { title: '测试', pages }, publication: {} }) },
    courseRevision: { findUnique: async () => revision },
    course: { count: async () => options.allowed === false ? 0 : 1 },
  } });
  return service;
}
const proxy = '/api/creator-media/items/item/pages/0';

test('已发布专辑只附加公开 R2 媒体地址，原代理仍保留', async () => {
  const result = await fixture().play('item', {});
  const p = result.pages[0];
  assert.equal(p.imageUrl, `${proxy}/image`);
  assert.equal(p.audioUrl, `${proxy}/audio`);
  assert.equal(p.publicImageUrl, `${base}/books/cover.webp?v=1`);
  assert.equal(p.publicAudioUrl, `${base}/books/audio.mp3?v=1`);
  assert.equal(p.translations![0].publicAudioUrl, `${base}/books/en.mp3?lang=en`);
  assert.equal(result.pages[1].publicImageUrl, undefined);
  assert.equal(result.pages[1].publicAudioUrl, undefined);
  assert.equal(result.pages[2].publicImageUrl, undefined);
  assert.equal(result.pages[2].publicAudioUrl, undefined);
  for (const page of result.pages.slice(3, 5)) { assert.equal(page.publicImageUrl, undefined); assert.equal(page.publicAudioUrl, undefined); }
  assert.equal(result.pages[5].publicAudioUrl, undefined);
  assert.equal(result.pages[6].publicImageUrl, undefined);
  assert.equal(result.pages[6].publicAudioUrl, undefined);
  assert.equal(result.pages[7].publicImageUrl, undefined);
});

test('草稿、旧版本和学习者请求不返回公开素材地址', async () => {
  for (const [opts, viewer] of [
    [{ approved: false }, { userId: 'owner' }],
    [{ current: false }, { userId: 'owner' }],
    [{ published: false }, { admin: true }],
    [{}, { userId: 'enroller', learnerId: 'learner' }],
  ] as Array<[Parameters<typeof fixture>[0], CreatorMediaViewer]>) {
    const p = (await fixture(opts).play('item', viewer)).pages[0];
    assert.equal(p.publicImageUrl, undefined);
    assert.equal(p.publicAudioUrl, undefined);
    assert.equal(p.translations![0].publicAudioUrl, undefined);
    assert.equal(p.imageUrl, `${proxy}/image`);
  }
  await assert.rejects(fixture({ allowed: false }).play('item', { userId: 'enroller', learnerId: 'learner' }));
  await assert.rejects(fixture({ current: false }).play('item', {}));
});


test('公开资源代理回退剥离普通查询参数，签名资源保持原地址', async () => {
  const read: string[] = [];
  const media = { readPictureBookStoredImage: async (url: string) => { read.push(url); return {buffer:Buffer.from('image'),mimetype:'image/webp'}; }, readPictureBookStoredAudio: async (url: string) => { read.push(url); return {buffer:Buffer.from('audio'),mimetype:'audio/mpeg'}; } };
  const service = fixture({}, media);
  await service.page('item', 0, 'image', {});
  await service.page('item', 0, 'audio', {});
  await service.page('item', 0, 'audio', {}, 'en');
  await service.page('item', 4, 'image', {});
  assert.deepEqual(read, [`${base}/books/cover.webp`, `${base}/books/audio.mp3`, `${base}/books/en.mp3`, `${base}/books/image.png?token=secret`]);
});

test('带普通参数的公开素材可通过真实 R2 读取器回退', async () => {
  const { MediaService } = await import('../src/media/media.service.js');
  const keys = ['S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL','S3_FORCE_PATH_STYLE'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, { S3_BUCKET:'fixture', S3_ENDPOINT:'https://r2.example.test', S3_ACCESS_KEY_ID:'test', S3_SECRET_ACCESS_KEY:'test', S3_PUBLIC_BASE_URL:base, S3_FORCE_PATH_STYLE:'1' });
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64');
  const audio = Buffer.from('audio fixture');
  const fetched: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); fetched.push(url);
    assert.ok(new Headers(init?.headers).get('authorization')?.startsWith('AWS4-HMAC-SHA256 '));
    return url.endsWith('.webp') ? new Response(image, {headers:{'content-type':'image/png'}}) : new Response(audio, {headers:{'content-type':'audio/mpeg'}});
  };
  try {
    const service = fixture({}, new MediaService());
    assert.ok((await service.page('item', 0, 'image', {})).buffer.equals(image));
    assert.ok((await service.page('item', 0, 'audio', {})).buffer.equals(audio));
    assert.deepEqual(fetched, ['https://r2.example.test/fixture/books/cover.webp','https://r2.example.test/fixture/books/audio.mp3']);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});


test('Creator 图片回退保持授权并传递限制尺寸', async () => {
  let width: number | undefined;
  const { default: sharp } = await import('sharp');
  const image = await sharp({create:{width:10,height:10,channels:3,background:'red'}}).webp().toBuffer();
  const media = { readPictureBookStoredImage: async (_url: string, requested?: number) => { width = requested; return {buffer:image,mimetype:'image/webp'}; } };
  await fixture({}, media).page('item', 0, 'image', {}, undefined, 1920);
  assert.equal(width, 1920);
});

test('Creator 图片代理回退真实生成限定宽度的图片', async () => {
  const { MediaService } = await import('../src/media/media.service.js');
  const { default: sharp } = await import('sharp');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const keys = ['S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL','S3_FORCE_PATH_STYLE','IMAGE_VARIANT_CACHE_DIR'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const dir = await mkdtemp(`${tmpdir()}/abei-creator-cdn-image-`);
  Object.assign(process.env, { S3_BUCKET:'fixture', S3_ENDPOINT:'https://r2.example.test', S3_ACCESS_KEY_ID:'test', S3_SECRET_ACCESS_KEY:'test', S3_PUBLIC_BASE_URL:base, S3_FORCE_PATH_STYLE:'1', IMAGE_VARIANT_CACHE_DIR:dir });
  const image = await sharp({create:{width:2200,height:1100,channels:3,background:'red'}}).webp().toBuffer();
  globalThis.fetch = async () => new Response(image, {headers:{'content-type':'image/webp'}});
  try {
    const result = await fixture({}, new MediaService()).page('item', 0, 'image', {}, undefined, 320);
    assert.equal((await sharp(result.buffer).metadata()).width, 320);
    assert.equal(result.mimetype, 'image/webp');
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    await rm(dir,{recursive:true,force:true});
  }
});

test('带不同版本参数的公开图片回退不复用旧变体', async () => {
  const { MediaService } = await import('../src/media/media.service.js');
  const { default: sharp } = await import('sharp');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const keys = ['S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL','S3_FORCE_PATH_STYLE','IMAGE_VARIANT_CACHE_DIR'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const dir = await mkdtemp(`${tmpdir()}/abei-creator-cdn-version-`);
  const before = pages[0].imageUrl;
  Object.assign(process.env, { S3_BUCKET:'fixture', S3_ENDPOINT:'https://r2.example.test', S3_ACCESS_KEY_ID:'test', S3_SECRET_ACCESS_KEY:'test', S3_PUBLIC_BASE_URL:base, S3_FORCE_PATH_STYLE:'1', IMAGE_VARIANT_CACHE_DIR:dir });
  const red = await sharp({create:{width:400,height:200,channels:3,background:'red'}}).webp().toBuffer();
  const blue = await sharp({create:{width:400,height:200,channels:3,background:'blue'}}).webp().toBuffer();
  let image = red, fetches = 0;
  globalThis.fetch = async () => { fetches++; return new Response(image, {headers:{'content-type':'image/webp'}}); };
  try {
    const service = fixture({}, new MediaService());
    pages[0].imageUrl = `${base}/books/cover.webp?v=1`;
    const first = await service.page('item', 0, 'image', {}, undefined, 320);
    image = blue;
    pages[0].imageUrl = `${base}/books/cover.webp?v=2`;
    const second = await service.page('item', 0, 'image', {}, undefined, 320);
    assert.equal(fetches, 2);
    assert.notDeepEqual(first.buffer, second.buffer);
  } finally {
    pages[0].imageUrl = before; globalThis.fetch = oldFetch;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    await rm(dir,{recursive:true,force:true});
  }
});

test('优化失败返回超宽图片时，Creator 回退不发送超大原图', async () => {
  const { default: sharp } = await import('sharp');
  const image = await sharp({create:{width:2200,height:1100,channels:3,background:'red'}}).webp().toBuffer();
  const media = { readPictureBookStoredImage: async () => ({buffer:image,mimetype:'image/webp'}) };
  await assert.rejects(fixture({}, media).page('item', 0, 'image', {}, undefined, 320));
});
