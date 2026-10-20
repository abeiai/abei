import assert from "node:assert/strict";
import test from "node:test";

import { homeSiteMetadata, resolveSiteSeo, rootSiteMetadata } from "../src/lib/site-seo-metadata";

test("首页 Title、描述、分享元信息与 canonical 使用后台站点配置", () => {
  const seo = resolveSiteSeo([
    { key: "siteName", value: "阿贝智能" },
    { key: "seoTitle", value: "阿贝智能 - AI 绘本创作" },
    { key: "seoDescription", value: "创作、阅读和聆听儿童绘本。" },
    { key: "siteUrl", value: "https://abeiai.com/" }
  ], { environmentUrl: "https://abeiai.com", production: true });
  const root = rootSiteMetadata(seo);
  const home = homeSiteMetadata(seo);

  assert.equal(home.title, seo.title);
  assert.equal(home.description, seo.description);
  assert.deepEqual(home.alternates, { canonical: "https://abeiai.com" });
  assert.equal(home.openGraph?.siteName, seo.siteName);
  assert.equal(home.openGraph?.title, seo.title);
  assert.equal(home.openGraph?.description, seo.description);
  assert.equal(home.openGraph?.url, seo.siteUrl);
  assert.equal(home.twitter?.title, seo.title);
  assert.equal(root.title, seo.title);
  assert.equal(new URL(root.metadataBase!.toString()).origin, seo.siteUrl);
  assert.equal(root.openGraph?.title, undefined);
  assert.equal(root.openGraph?.url, undefined);
  assert.equal(root.twitter?.title, undefined);
});

test("空白配置使用阿贝默认值，旧站点 URL 不覆盖本次发布域名", () => {
  const seo = resolveSiteSeo([
    { key: "siteName", value: " " },
    { key: "seoTitle", value: "" },
    { key: "siteUrl", value: "https://xueleai.com" }
  ], { environmentUrl: "https://abeiai.com", production: true });

  assert.equal(seo.siteName, "阿贝智能");
  assert.match(seo.title, /阿贝智能/);
  assert.ok(seo.description);
  assert.equal(seo.siteUrl, "https://abeiai.com");
});

test("生产配置和环境地址都不可用时仍使用阿贝域名", () => {
  const seo = resolveSiteSeo([], { environmentUrl: "", production: true });
  assert.equal(seo.siteUrl, "https://abeiai.com");
});
