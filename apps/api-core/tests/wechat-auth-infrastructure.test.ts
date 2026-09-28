import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function repositoryFile(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

test("生产 Compose 将公网 APP_BASE_URL 传入 API 容器", () => {
  const compose = repositoryFile("docker-compose.prod.yml");

  assert.match(
    compose,
    /APP_BASE_URL:\s+\$\{APP_BASE_URL:-https:\/\/xueleai\.com\}/u
  );
  assert.doesNotMatch(compose, /DOCKER_APP_BASE_URL/u);
});

test("微信授权回调不会把 code 和 state 写入 Nginx 访问日志", () => {
  for (const path of [
    "deploy/nginx/conf.d/https.conf",
    "deploy/nginx/conf.d/https.example"
  ]) {
    const config = repositoryFile(path);

    assert.match(
      config,
      /location = \/api\/auth\/wechat\/callback \{[\s\S]*?access_log off;[\s\S]*?proxy_pass http:\/\/xueleai_api_core;[\s\S]*?\}/u,
      path
    );
  }
});
