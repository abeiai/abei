import assert from "node:assert/strict";
import test from "node:test";
import { imageSources } from "../src/lib/image-delivery.js";
import { pictureBookPageAudioSource } from "../src/lib/picture-book-audio.js";
import { pictureBookPageImageSource } from "../src/lib/picture-book-images.js";
import nextConfig from "../next.config.js";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern.js";
import { typingAudioUrl } from "../src/lib/typing-practice-mode.js";
import { publicR2CdnUrl } from "../src/lib/public-r2-cdn.js";
import * as voicePicker from "../src/lib/voice-picker.js";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicModuleRenderer } from "../src/components/content-modules/public-module-renderer.js";
import type { ContentModule } from "../src/lib/content-module-api.js";
import { TextbookCards } from "../src/components/textbook/textbook-page-sections.js";
import type { PublicTextbookListItem } from "../src/lib/textbook-public-api.js";
import { buildVideoGuideVoiceOptions } from "../src/lib/video-guide-console-actions.js";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern.js";
import * as markdownDelivery from "../src/lib/public-markdown-images.js";
import { fromMarkdown } from "mdast-util-from-markdown";

test("公开 R2 图片通过腾讯 CDN 回源，同时保留 Next 图片尺寸优化", () => {
  const source = "https://r.abeiai.com/picture-books/cover.png?v=2&color=red";
  const image = imageSources(source, "card");
  assert.equal(image.src, "/_next/image?url=https%3A%2F%2Fcc.abeiai.com%2Fpicture-books%2Fcover.png%3Fv%3D2%26color%3Dred&w=640&q=82");
  assert.match(image.srcSet!, /w=320&q=82 320w/);
  assert.match(imageSources("https://cc.abeiai.com/picture-books/page.webp", "reading").src, /^\/_next\/image\?.*&w=1920&q=90$/);
  assert.equal(hasRemoteMatch([], nextConfig.images?.remotePatterns ?? [], new URL("https://cc.abeiai.com/picture-books/cover.png?v=2")), true);
});

test("公开绘本图片和语音使用 CDN，保留原始路径和查询参数", () => {
  const origin = "https://r.abeiai.com";
  assert.equal(pictureBookPageImageSource("book", 1, `${origin}/picture-books/page.webp?v=2`, "public", origin), "https://cc.abeiai.com/picture-books/page.webp?v=2");
  assert.equal(pictureBookPageAudioSource("book", 1, `${origin}/picture-books/page.mp3?v=2&mode=full`, "public", undefined, origin), "https://cc.abeiai.com/picture-books/page.mp3?v=2&mode=full");
});

test("旧 CDN 图片保持原域名并继续使用 Next 图片优化", () => {
  const oldUrl = "https://cdn.abeiai.com/abei/a.jpg";
  assert.equal(publicR2CdnUrl(oldUrl), oldUrl);
  assert.match(imageSources(oldUrl, "card").src, /url=https%3A%2F%2Fcdn\.abeiai\.com%2Fabei%2Fa\.jpg/);
  assert.equal(hasRemoteMatch([], nextConfig.images?.remotePatterns ?? [], new URL(oldUrl)), true);
});

test("私有绘本、带签名链接和非图片音频不改写", () => {
  const origin = "https://r.abeiai.com";
  assert.equal(pictureBookPageImageSource("book", 1, `${origin}/picture-books/page.webp`, "private", origin), "/api/picture-books/book/pages/1/image?v=page.webp");
  assert.equal(pictureBookPageAudioSource("book", 1, `${origin}/picture-books/page.mp3`, "private", undefined, origin), "/api/picture-books/book/pages/1/audio?v=page.mp3");
  const signed = `${origin}/picture-books/page.png?X-Amz-Signature=secret&X-Amz-Expires=60`;
  assert.equal(imageSources(signed, "card").src, signed);
  assert.equal(imageSources(signed, "card").srcSet, undefined);
  for (const path of ["video.mp4", "audio.webm", "document.pdf", "archive.zip"]) {
    const url = `${origin}/uploads/${path}?v=1`;
    assert.equal(imageSources(url, "card").src, url);
  }
});

test("听写音频使用 CDN，保留路径和非鉴权查询参数", () => {
  assert.equal(typingAudioUrl({ "uk-female": "https://r.abeiai.com/typing/audio/word.mp3?v=7&mode=uk" }, "uk-female"), "https://cc.abeiai.com/typing/audio/word.mp3?v=7&mode=uk");
  assert.equal(typingAudioUrl({ "uk-female": "https://r.abeiai.com/typing/audio/word.mp3?token=private" }, "uk-female"), "https://r.abeiai.com/typing/audio/word.mp3?token=private");
});

test("地址转换严格限制来源、媒体类型及常见签名参数", () => {
  for (const path of ["clip.mp4", "clip.webm", "document.pdf", "archive.zip", "archive.mp3.zip"]) {
    const source = `https://r.abeiai.com/media/${path}?v=1`;
    assert.equal(publicR2CdnUrl(source), source);
  }
  for (const query of ["X-Amz-Signature=123", "X-Goog-Credential=123", "token=123", "auth_key=123", "Signature=123", "jwt=123", "accessKey=123", "sign=123", "accessToken=123", "verify=123"]) {
    const source = `https://r.abeiai.com/media/image.png?${query}`;
    assert.equal(publicR2CdnUrl(source), source);
  }
  for (const source of ["https://r.abeiai.com.evil.example/image.png", "https://evil.example/r.abeiai.com/image.png", "/api/media/files/image.png", "https://cc.abeiai.com/image.png"]) {
    assert.equal(publicR2CdnUrl(source), source);
  }
  assert.equal(publicR2CdnUrl("https://r.abeiai.com/media/%E4%B8%AD.png?v=1&name=a%2Bb#part"), "https://cc.abeiai.com/media/%E4%B8%AD.png?v=1&name=a%2Bb#part");
  assert.equal(imageSources("https://r.abeiai.com/media/animation.gif?v=2", "card").src, "https://cc.abeiai.com/media/animation.gif?v=2");
});

test("公开音色试听走 CDN，私有和未知权限音色保持原地址", () => {
  const voice = { value: "voice:123", name: "示例", badge: "音色", previewAudioUrl: "https://r.abeiai.com/audio/preview.mp3" };
  assert.equal(voicePicker.voicePreviewSource?.({ ...voice, visibility: "PUBLIC" }), "https://cc.abeiai.com/audio/preview.mp3");
  assert.equal(voicePicker.voicePreviewSource?.({ ...voice, visibility: "PRIVATE" }), voice.previewAudioUrl);
  assert.equal(voicePicker.voicePreviewSource?.(voice), voice.previewAudioUrl);
  assert.equal(voicePicker.voicePreviewSource?.({ ...voice, value: "system:123" }), "https://cc.abeiai.com/audio/preview.mp3");
});

test("公开内容模块的图片使用 CDN 作为优化源", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React;
  runtime.React = React;
  try {
    const module = { id: "m", type: "IMAGE_CARD_LIST", settings: {}, items: [{ id: "i", title: "示例", imageUrl: "https://r.abeiai.com/uploads/cover.png" }] } as unknown as ContentModule;
    const html = renderToStaticMarkup(React.createElement(PublicModuleRenderer, { modules: [module] }));
    assert.match(html, /_next\/image\?url=https%3A%2F%2Fcc\.abeiai\.com%2Fuploads%2Fcover\.png/);
  } finally { runtime.React = previous; }
});

test("公开教材封面使用 CDN 图片优化，教材文件链接不受影响", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React;
  runtime.React = React;
  try {
    const textbook = { id: "t", slug: "book", title: "教材", grade: "一年级", subject: "语文", version: "人教版", coverUrl: "https://r.abeiai.com/books/cover.webp" } as PublicTextbookListItem;
    const html = renderToStaticMarkup(React.createElement(TextbookCards, { textbooks: [textbook] }));
    assert.match(html, /_next\/image\?url=https%3A%2F%2Fcc\.abeiai\.com%2Fbooks%2Fcover\.webp/);
  } finally { runtime.React = previous; }
});

test("视频导学系统音色的试听地址使用 CDN", () => {
  const options = buildVideoGuideVoiceOptions({ systemVoices: [{ name: "系统音色", providerVoiceId: "voice-id", status: "READY", previewAudioUrl: "https://r.abeiai.com/audio/preview.mp3" }] });
  assert.equal(voicePicker.voicePreviewSource(options[0]!), "https://cc.abeiai.com/audio/preview.mp3");
});

test("普通本地图片不携带不受允许的发布参数", () => {
  const previous = process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION;
  process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION = "release-1";
  try {
    const url = imageSources("/uploads/cover.png", "card").src;
    const original = new URL(url, "https://example.com").searchParams.get("url")!;
    assert.equal(hasLocalMatch(nextConfig.images?.localPatterns ?? [], original), true);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION; else process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION = previous; }
});

test("公开 Markdown 中仅替换图片，代码、普通链接、签名及文件保持原样", () => {
  const markdown = '![封面](https://r.abeiai.com/a.png?v=1)\n\n[下载](https://r.abeiai.com/a.pdf)\n\n`![代码](https://r.abeiai.com/c.png)`\n\n![私有](https://r.abeiai.com/a.png?X-Amz-Signature=abc)';
  const result = markdownDelivery.rewritePublicMarkdownImages?.(markdown) ?? markdown;
  assert.match(result, /!\[封面\]\(\/_next\/image\?url=https%3A%2F%2Fcc\.abeiai\.com%2Fa\.png%3Fv%3D1/);
  assert.match(result, /\[下载\]\(https:\/\/r\.abeiai\.com\/a\.pdf\)/);
  assert.match(result, /`!\[代码\]\(https:\/\/r\.abeiai\.com\/c\.png\)`/);
  assert.match(result, /!\[私有\]\(https:\/\/r\.abeiai\.com\/a\.png\?X-Amz-Signature=abc\)/);
});

test("Markdown 引用图片转换时不改共享的普通链接或代码块", () => {
  const markdown = '![插图][pic]\n\n[原图][pic]\n\n[pic]: https://r.abeiai.com/a.webp?v=2\n\n```md\n![代码](https://r.abeiai.com/c.png)\n```';
  const result = markdownDelivery.rewritePublicMarkdownImages(markdown);
  const first = fromMarkdown(result).children[0];
  assert.ok(first?.type === "paragraph" && first.children[0]?.type === "image");
  assert.match(first.children[0].url, /^\/_next\/image\?url=https%3A%2F%2Fcc\.abeiai\.com%2Fa\.webp%3Fv%3D2/);
  assert.match(result, /\[原图\]\[pic\]/);
  assert.match(result, /\[pic\]: https:\/\/r\.abeiai\.com\/a\.webp\?v=2/);
  assert.match(result, /```md\n!\[代码\]\(https:\/\/r\.abeiai\.com\/c\.png\)\n```/);
});

test("Markdown 引用图保留嵌套替代文字和标题，数学公式不被修改", () => {
  const markdown = '![中文 [嵌套] 描述][x]\n\n[x]: https://r.abeiai.com/a.png "图像标题"\n\n$$\n![公式](https://r.abeiai.com/c.png)\n$$';
  const result = markdownDelivery.rewritePublicMarkdownImages(markdown);
  const first = fromMarkdown(result).children[0];
  assert.ok(first?.type === "paragraph" && first.children[0]?.type === "image");
  assert.equal(first.children[0].alt, "中文 [嵌套] 描述");
  assert.equal(first.children[0].title, "图像标题");
  assert.match(first.children[0].url, /^\/_next\/image\?/);
  assert.match(result, /\$\$\n!\[公式\]\(https:\/\/r\.abeiai\.com\/c\.png\)\n\$\$/);
});

test("Markdown HTML 实体形式的参数可转换并在失败时回退原图", () => {
  const markdown = '![图](https://r.abeiai.com/a.png?v=1&amp;color=red)';
  const result = markdownDelivery.rewritePublicMarkdownImages(markdown);
  assert.match(result, /cc\.abeiai\.com%2Fa\.png%3Fv%3D1%26color%3Dred/);
  assert.equal(markdownDelivery.publicMarkdownImageFallback?.('/_next/image?url=https%3A%2F%2Fcc.abeiai.com%2Fa.png%3Fv%3D1&w=640&q=82'), 'https://r.abeiai.com/a.png?v=1');
  assert.equal(markdownDelivery.publicMarkdownImageFallback('https://cc.abeiai.com/a.png?token=secret'), null);
});

test("复杂替代文字、标题与转义括号仍形成正确的 Markdown 图片", () => {
  const original = '![a `]` b][x]\n\n[x]: https://r.abeiai.com/a.png "两行\n标题"\n\n![括号](https://r.abeiai.com/a\\).png)';
  const parsed = fromMarkdown(markdownDelivery.rewritePublicMarkdownImages(original));
  const images = parsed.children.flatMap(node => node.type === "paragraph" ? node.children.filter(child => child.type === "image") : []);
  assert.equal(images.length, 2);
  assert.equal(images[0]?.alt, 'a ] b');
  assert.equal(images[0]?.title, '两行\n标题');
  assert.match(images[1]?.url ?? '', /cc\.abeiai\.com%2Fa\)\.png/);
});

test("已发布专辑的公开 R2 资源使用 CDN，保留查询并继续使用图片优化", async () => {
  const delivery = await import("../src/lib/picture-book-public-media.js");
  const url = delivery.creatorPublicPictureBookMediaUrl("https://r.abeiai.com/books/page.webp?v=2&lang=zh");
  assert.equal(url, "https://cc.abeiai.com/books/page.webp?v=2&lang=zh");
  assert.match(imageSources(url!, "reading").src, /_next\/image\?url=https%3A%2F%2Fcc\.abeiai\.com/);
  assert.equal(delivery.creatorPublicPictureBookMediaUrl("https://r.abeiai.com/books/page.mp3?mode=1"), "https://cc.abeiai.com/books/page.mp3?mode=1");
  for (const source of ["https://r.abeiai.com/books/page.mp3?token=secret", "https://r.abeiai.com/books/video.mp4", "/api/creator-media/items/id/pages/0/image", "https://evil.example/a.png"]) {
    assert.equal(delivery.creatorPublicPictureBookMediaUrl(source), null);
  }
});

test("公开译文语音只跟随选中的语言", async () => {
  const { pictureBookPageContent } = await import("../src/lib/picture-book-languages.js");
  const page = {caption:"中文",audioUrl:"/original",publicAudioUrl:"https://r.abeiai.com/a.mp3",translations:[{language:"en",caption:"English",audioUrl:"/english",publicAudioUrl:"https://r.abeiai.com/en.mp3"},{language:"ja",caption:"日本語",audioUrl:"/japanese"}]};
  assert.equal(pictureBookPageContent(page,"original").publicAudioUrl, "https://r.abeiai.com/a.mp3");
  assert.equal(pictureBookPageContent(page,"en").publicAudioUrl, "https://r.abeiai.com/en.mp3");
  assert.equal(pictureBookPageContent(page,"ja").publicAudioUrl, undefined);
});


test("专辑 CDN 失败时回退到同一冻结条目和语种的代理", async () => {
  const { creatorPictureBookMediaSources } = await import("../src/lib/picture-book-public-media.js");
  const imageProxy = "/api/creator-media/items/frozen/pages/1/image";
  const audioProxy = "/api/creator-media/items/frozen/pages/1/audio?language=en";
  assert.deepEqual(creatorPictureBookMediaSources("https://r.abeiai.com/a.webp", imageProxy), {src:"https://cc.abeiai.com/a.webp",fallback:imageProxy});
  assert.deepEqual(creatorPictureBookMediaSources("https://r.abeiai.com/en.mp3", audioProxy), {src:"https://cc.abeiai.com/en.mp3",fallback:audioProxy});
  assert.deepEqual(creatorPictureBookMediaSources(undefined, audioProxy), {src:audioProxy, fallback:undefined});
});

test("公开专辑图片在 CDN 优化失败时回退到 1920 像素的 Creator 代理", async () => {
  const { creatorPictureBookImageSources } = await import("../src/lib/picture-book-public-media.js");
  const proxy = "/api/creator-media/items/frozen/pages/0/image";
  assert.deepEqual(creatorPictureBookImageSources("https://r.abeiai.com/books/cover.webp", proxy), {src:"https://cc.abeiai.com/books/cover.webp",fallback:`${proxy}?w=1920`});
  assert.deepEqual(creatorPictureBookImageSources(undefined, proxy), {src:proxy,fallback:undefined});
});
