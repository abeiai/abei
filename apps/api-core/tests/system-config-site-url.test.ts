import assert from "node:assert/strict";
import test from "node:test";

test("系统配置拒绝生产环境的 HTTP、IP 和非站点根地址", async () => {
  let siteUrlModule: typeof import("../src/system-config/site-url") | null = null;

  try {
    siteUrlModule = await import("../src/system-config/site-url");
  } catch {
    // The assertion below keeps the first TDD run focused on the missing validator.
  }

  assert.ok(siteUrlModule, "缺少前台地址安全校验模块");
  assert.equal(siteUrlModule.normalizeSiteOrigin("https://xueleai.com/", true), "https://xueleai.com");
  assert.equal(siteUrlModule.normalizeSiteOrigin("http://localhost:3321/", false), "http://localhost:3321");
  assert.equal(siteUrlModule.defaultSiteOrigin("http://8.130.169.220", true), "https://xueleai.com");

  assert.throws(() => siteUrlModule.normalizeSiteOrigin("http://xueleai.com", true), /必须使用 HTTPS/);
  assert.throws(() => siteUrlModule.normalizeSiteOrigin("https://8.130.169.220", true), /不能使用 IP/);
  assert.throws(() => siteUrlModule.normalizeSiteOrigin("https://xueleai.com/path", true), /站点根地址/);
});
