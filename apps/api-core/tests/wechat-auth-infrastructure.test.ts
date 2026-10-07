import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
function file(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}
test("abei入口为公众号登录禁用访问日志/缓存并限制消息体", () => {
  const config = file("deploy/abei/nginx.conf");
  assert.match(
    config,
    /location \^~ \/api\/auth\/wechat\/mp\/ \{[\s\S]*?access_log off;[\s\S]*?proxy_pass http:\/\/api-core:3602;/,
  );
  assert.match(config, /client_max_body_size 64k;/);
  assert.match(config, /proxy_cache off;/);
});
test("abei Compose 允许注入公网同源 APP_BASE_URL", () => {
  assert.equal(
    (
      file("docker-compose.yml").match(
        /APP_BASE_URL: \$\{APP_BASE_URL:-http:\/\/localhost:3600\}/g,
      ) ?? []
    ).length,
    2,
  );
});
