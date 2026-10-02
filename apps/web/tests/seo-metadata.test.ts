import assert from "node:assert/strict";
import test from "node:test";

test("生产 SEO 元数据始终使用 HTTPS 域名并覆盖全部公开教材", async () => {
  let seoModule: typeof import("../src/lib/seo-metadata") | null = null;

  try {
    seoModule = await import("../src/lib/seo-metadata");
  } catch {
    // The assertion below keeps the first TDD run focused on the missing behavior.
  }

  assert.ok(seoModule, "缺少统一的公开站点 SEO 元数据模块");

  const siteUrl = seoModule.resolvePublicSiteUrl("http://8.130.169.220", {
    environmentUrl: "https://xueleai.com/",
    production: true
  });
  assert.equal(siteUrl, "https://xueleai.com");
  assert.equal(
    seoModule.resolvePublicSiteUrl("https://example.com", {
      environmentUrl: "https://staging.example.com",
      production: true
    }),
    "https://xueleai.com"
  );
  assert.equal(
    seoModule.resolvePublicSiteUrl("http://8.130.169.220", {
      environmentUrl: undefined,
      production: true
    }),
    "https://xueleai.com"
  );
  assert.equal(
    seoModule.resolvePublicSiteUrl("http://localhost:3600/", {
      environmentUrl: undefined,
      production: false
    }),
    "http://localhost:3600"
  );

  const robots = seoModule.buildRobotsMetadata(siteUrl);
  assert.deepEqual(robots, {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: "https://xueleai.com/sitemap.xml"
  });

  const now = new Date("2026-08-07T00:00:00.000Z");
  const entries = seoModule.buildSitemapEntries({
    siteUrl,
    now,
    articles: [
      { slug: "demo", updatedAt: "2026-08-06T00:00:00.000Z", noIndex: false },
      { slug: "private", updatedAt: "2026-08-06T00:00:00.000Z", noIndex: true }
    ],
    pages: [{ slug: "about", updatedAt: "2026-08-05T00:00:00.000Z", noIndex: false }],
    textbooks: Array.from({ length: 125 }, (_, index) => ({
      slug: `textbook-${index + 1}`,
      updatedAt: "2026-08-04T00:00:00.000Z"
    }))
  });

  assert.equal(entries.length, 130);
  assert.ok(entries.some((entry) => entry.url === "https://xueleai.com/textbook"));
  assert.ok(entries.some((entry) => entry.url === "https://xueleai.com/textbook/textbook-125"));
  assert.ok(entries.every((entry) => entry.url.startsWith("https://xueleai.com")));
  assert.ok(!entries.some((entry) => entry.url.includes("private")));
});

test("后台页面通过元数据明确禁止索引", async () => {
  let adminLayout: typeof import("../src/app/admin/layout") | null = null;

  try {
    adminLayout = await import("../src/app/admin/layout");
  } catch {
    // The assertion below reports the missing noindex boundary clearly.
  }

  assert.ok(adminLayout, "缺少后台 noindex 元数据布局");
  assert.deepEqual(adminLayout.metadata.robots, {
    index: false,
    follow: false,
    nocache: true
  });
});
