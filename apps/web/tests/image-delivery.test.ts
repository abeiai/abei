import assert from "node:assert/strict";
import test from "node:test";
import { imageSources } from "../src/lib/image-delivery.js";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PictureBookImage } from "../src/components/picture-books/picture-book-image.js";
import nextConfig from "../next.config.js";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern.js";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern.js";

test("卡片和阅读使用不同规格且提供响应式候选", () => {
  const card = imageSources("/picture-book-demos/test/cover.webp", "card");
  assert.equal(card.src, "/_next/image?url=%2Fpicture-book-demos%2Ftest%2Fcover.webp&w=640&q=82");
  assert.match(card.srcSet!, /w=320&q=82 320w/);
  assert.match(card.srcSet!, /w=640&q=82 640w/);
  assert.doesNotMatch(card.srcSet!, /1280w|1920w/);
  const reading = imageSources("/picture-book-demos/test/page.webp", "reading");
  assert.match(reading.src, /w=1920&q=90$/);
  assert.match(reading.srcSet!, /1920w/);
  assert.notEqual(reading.sizes, card.sizes);
});

test("私有绘本保持原鉴权接口，尺寸不进入公共 Next 图片缓存", () => {
  const image = imageSources("/api/picture-books/book/pages/1/image?v=page.png", "thumbnail");
  assert.equal(image.src, "/api/picture-books/book/pages/1/image?v=page.png&w=320");
  assert.match(image.srcSet!, /w=160 160w/);
  assert.doesNotMatch(image.src, /_next/);
  assert.equal(imageSources("/api/media/files/cover.png", "card").src, "/api/media/files/cover.png?w=640");
  assert.equal(imageSources("/api/unknown/private.png", "card").srcSet, undefined);
});

test("未知外部来源、SVG 和动图保持原图，不发起任意代理请求", () => {
  for (const src of ["https://unknown.example/image.png", "/logo.svg", "/animation.gif", "data:image/png;base64,abc", "//unknown.example/image.png"]) {
    assert.equal(imageSources(src, "card").src, src);
    assert.equal(imageSources(src, "card").srcSet, undefined);
  }
  assert.match(imageSources("https://r.abeiai.com/uploads/page.png", "card").src, /^\/_next\/image\?/);
});

test("翻页动画的 compact 仅精简错误提示，不把阅读图降成缩略图", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React;
  runtime.React = React;
  try {
    const html = renderToStaticMarkup(React.createElement(PictureBookImage, { src: "/picture-book-demos/test/page.webp", alt: "翻页", compact: true }));
    assert.match(html, /1920w/);
    assert.match(html, /q=90/);
  } finally { runtime.React = previous; }
});

test("静态图片源携带发布版本，CDN 分发仅用于公开图片", () => {
  const previousVersion = process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION;
  const previousBase = process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL;
  process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION = "release-2";
  process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL = "https://images.abei.example";
  try {
    const publicImage = imageSources("/picture-book-demos/test/cover.webp", "card");
    assert.equal(publicImage.src, "https://images.abei.example/_next/image?url=%2Fpicture-book-demos%2Ftest%2Fcover.webp%3Fv%3Drelease-2&w=640&q=82");
    assert.equal(imageSources("/api/picture-books/book/pages/1/image", "reading").src, "/api/picture-books/book/pages/1/image?w=1920");
    assert.equal(imageSources("/api/public/picture-books/book/cover", "card").src, "/api/public/picture-books/book/cover?w=640");
  } finally {
    if (previousVersion === undefined) delete process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION; else process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION = previousVersion;
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL; else process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL = previousBase;
  }
});

test("新的公开图片白名单兼容现有音色头像，同时拒绝陌生来源", () => {
  const patterns = nextConfig.images?.remotePatterns ?? [];
  assert.equal(hasRemoteMatch([], patterns, new URL("https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/teacher-avatar.jpg")), true);
  assert.equal(hasRemoteMatch([], patterns, new URL("https://r.abeiai.com/uploads/cover.png")), true);
  assert.equal(hasRemoteMatch([], patterns, new URL("https://attacker.example/image.png")), false);
});

test("本地公开图片的发布版本可由 Next 图片服务读取，带参数的私有路径仍被拒绝", () => {
  const patterns = nextConfig.images?.localPatterns ?? [{ pathname: "**", search: "" }];
  assert.equal(hasLocalMatch(patterns, "/home-assets/reading-hero-v2.webp?v=release-2"), true);
  assert.equal(hasLocalMatch(patterns, "/picture-book-demos/lele-bear/04.webp?v=release-2"), true);
  assert.equal(hasLocalMatch(patterns, "/images/voice-avatars/female-middle.jpg?v=release-2"), true);
  assert.equal(hasLocalMatch(patterns, "/api/private/image?v=release-2"), false);
});
