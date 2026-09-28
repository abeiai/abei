#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { findSensitivePatternNames } from "./sensitive-patterns.mjs";

const rootDir = resolve(import.meta.dirname, "../..");

test("release secret scan covers ElevenLabs keys and Python or SQL sources", async () => {
  const releaseCheck = await readText("scripts/release/check.mjs");
  const fakeElevenLabsKey = `sk_${"a".repeat(48)}`;

  assert.deepEqual(findSensitivePatternNames(fakeElevenLabsKey), ["疑似 ElevenLabs API Key"]);
  assert.deepEqual(findSensitivePatternNames("sk_test_placeholder"), []);
  assert.match(releaseCheck, /"\.py"/);
  assert.match(releaseCheck, /"\.sql"/);
});

test("release pipeline carries and verifies an immutable commit identity", async () => {
  const syncScript = await readText("scripts/release/sync-server.sh");
  const deployScript = await readText("scripts/release/deploy.sh");
  const publishScript = await readText("scripts/release/publish.sh");
  const serverReleaseScript = await readText("scripts/release/server-release.sh");
  const verifyScript = await readText("scripts/release/verify-live.mjs");
  const releaseCheck = await readText("scripts/release/check.mjs");
  const composeFile = await readText("docker-compose.prod.yml");
  const envExample = await readText(".env.example");
  const webDockerfile = await readText("apps/web/Dockerfile");
  const healthController = await readText("apps/api-core/src/health/health.controller.ts");
  const rootLayout = await readText("apps/web/src/app/layout.tsx");
  const packageJson = JSON.parse(await readText("package.json"));
  const apiPackageJson = JSON.parse(await readText("apps/api-core/package.json"));

  assert.match(syncScript, /\.release-source/);
  assert.match(syncScript, /RELEASE_COMMIT=/);
  assert.match(syncScript, /XUELEAI_RELEASE_ORCHESTRATED/);
  assert.match(syncScript, /--exclude="\/textbook\/"/);
  assert.match(syncScript, /--exclude="\/textbook-markdown-assets\/"/);
  assert.doesNotMatch(syncScript, /--exclude="textbook\/"/);
  assert.doesNotMatch(syncScript, /--exclude="textbook-markdown-assets\/"/);
  assert.match(deployScript, /RELEASE_SHA/);
  assert.match(deployScript, /verify_release_source/);
  assert.match(deployScript, /RELEASE_LOCK_DIR/);
  assert.match(deployScript, /release_sha=\$\{RELEASE_SHA\}/);
  assert.match(deployScript, /prepare_release_backup/);
  assert.match(deployScript, /postgres-before-migration\.dump/);
  assert.match(deployScript, /ensure_release_capacity/);
  assert.match(deployScript, /docker builder prune/);
  assert.match(deployScript, /pg_restore --list/);
  assert.match(deployScript, /rollback_running_release/);
  assert.match(deployScript, /compose stop nginx web api-core ai-gateway/);
  assert.match(deployScript, /manual-database-recovery-required/);
  assert.match(deployScript, /verify_public_release/);
  assert.match(
    deployScript,
    /page_html="\$\(curl --fail --silent --show-error --location[\s\S]*?\$\{base_url\}\/media-tutor\?release=\$\{RELEASE_SHA\}"/
  );
  assert.match(deployScript, /env[\s\S]*-u WEB_IMAGE/);
  assert.match(deployScript, /candidate/);
  assert.match(deployScript, /expected_image_id/);
  assert.match(deployScript, /persist_release_state/);
  assert.match(publishScript, /APP_RELEASE_SHA/);
  assert.match(publishScript, /RELEASE_SHA/);
  assert.match(serverReleaseScript, /release:github-check/);
  assert.match(serverReleaseScript, /acquire_release_lock/);
  assert.match(serverReleaseScript, /release_release_lock/);
  assert.match(serverReleaseScript, /deploy-nginx\.before-release/);
  assert.match(serverReleaseScript, /remote_deploy_started/);
  assert.match(serverReleaseScript, /XUELEAI_RELEASE_ORCHESTRATED=1/);
  assert.match(serverReleaseScript, /bash -s --/);
  assert.match(serverReleaseScript, /release:deploy/);
  assert.match(serverReleaseScript, /release:verify-live/);
  assert.equal(packageJson.scripts["release:sync-server"], undefined);
  assert.equal(
    packageJson.scripts["ai:sync-scenarios"],
    "pnpm --filter @xueleai/api-core ai:sync-scenarios"
  );
  assert.equal(packageJson.scripts["ai:sync-scenarios"].includes("--parallel"), false);
  assert.match(apiPackageJson.scripts["ai:sync-scenarios"], /sync-built-in-scenarios\.ts/);
  assert.match(
    deployScript,
    /compose run --rm api-core node apps\/api-core\/dist\/ai\/sync-built-in-scenarios\.js/
  );
  assert.ok(
    deployScript.indexOf("run verify_public_release") <
      deployScript.indexOf("run compose run --rm api-core node apps/api-core/dist/ai/sync-built-in-scenarios.js")
  );
  assert.ok(
    deployScript.indexOf("run compose run --rm api-core node apps/api-core/dist/ai/sync-built-in-scenarios.js") <
      deployScript.indexOf("release_succeeded=1")
  );
  assert.match(verifyScript, /EXPECTED_VERSION/);
  assert.match(verifyScript, /EXPECTED_RELEASE_SHA/);
  assert.match(releaseCheck, /release tests/);
  assert.match(composeFile, /APP_RELEASE_SHA/);
  assert.match(
    composeFile,
    /VIDEO_GUIDE_NARRATION_TTS_RPS:\s*\$\{VIDEO_GUIDE_NARRATION_TTS_RPS:-0\.75\}/
  );
  assert.match(envExample, /^VIDEO_GUIDE_NARRATION_TTS_RPS="0\.75"$/m);
  assert.match(webDockerfile, /FROM deps AS builder(?:(?!\nFROM )[\s\S])*ARG APP_RELEASE_SHA/);
  assert.match(healthController, /revision:/);
  assert.match(rootLayout, /data-release/);
});

test("release state update preserves secrets and replaces only release keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-release-env-"));
  const envFile = join(directory, ".env.production");
  const updater = resolve(rootDir, "scripts/release/update-release-env.sh");

  await writeFile(
    envFile,
    [
      "POSTGRES_PASSWORD=do-not-change",
      "COMPOSE_PROJECT_NAME=xueleai-prod",
      'APP_VERSION="0.0.7"',
      "APP_RELEASE_SHA=old",
      'WEB_IMAGE="xueleai-web:0.0.7"',
      'API_CORE_IMAGE="xueleai-api-core:0.0.7"',
      'AI_GATEWAY_IMAGE="xueleai-ai-gateway:0.0.7"',
      "CUSTOM_VALUE=keep-me",
      ""
    ].join("\n"),
    { mode: 0o640 }
  );
  await chmod(envFile, 0o640);

  const result = spawnSync(
    updater,
    [
      envFile,
      "0.0.16",
      "1234567890abcdef1234567890abcdef12345678",
      "xueleai-web:0.0.16",
      "xueleai-api-core:0.0.16",
      "xueleai-ai-gateway:0.0.16"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const updated = await readFile(envFile, "utf8");
  assert.match(updated, /^POSTGRES_PASSWORD=do-not-change$/m);
  assert.match(updated, /^COMPOSE_PROJECT_NAME=xueleai-prod$/m);
  assert.match(updated, /^CUSTOM_VALUE=keep-me$/m);
  assert.match(updated, /^APP_VERSION="0\.0\.16"$/m);
  assert.match(updated, /^APP_RELEASE_SHA="1234567890abcdef1234567890abcdef12345678"$/m);
  assert.match(updated, /^WEB_IMAGE="xueleai-web:0\.0\.16"$/m);
  assert.match(updated, /^API_CORE_IMAGE="xueleai-api-core:0\.0\.16"$/m);
  assert.match(updated, /^AI_GATEWAY_IMAGE="xueleai-ai-gateway:0\.0\.16"$/m);
  assert.equal((updated.match(/^APP_VERSION=/gm) ?? []).length, 1);
  assert.equal((await stat(envFile)).mode & 0o777, 0o640);
});

test("internal release steps reject accidental standalone execution", () => {
  const syncResult = spawnSync(resolve(rootDir, "scripts/release/sync-server.sh"), {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.notEqual(syncResult.status, 0);
  assert.match(syncResult.stdout + syncResult.stderr, /只能由 pnpm release:server 调用/);

  const deployResult = spawnSync(
    resolve(rootDir, "scripts/release/deploy.sh"),
    ["0.0.16"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_SHA: "1234567890abcdef1234567890abcdef12345678"
      }
    }
  );
  assert.notEqual(deployResult.status, 0);
  assert.match(deployResult.stdout + deployResult.stderr, /只能由 pnpm release:server/);
});

test("production nginx sends the Next-owned hanzi route to the web service", async () => {
  const configPaths = [
    "deploy/nginx/conf.d/https.conf",
    "deploy/nginx/conf.d/https.example"
  ];

  for (const configPath of configPaths) {
    const config = await readText(configPath);

    assert.match(
      config,
      /location = \/api\/hanzi\/strokes \{[\s\S]*?proxy_pass http:\/\/xueleai_web;[\s\S]*?\n  \}/,
      `${configPath} 必须把汉字数据接口转发到 Next.js Web 服务`
    );
    assert.match(
      config,
      /location = \/api\/ai\/image\/student-photo\/download \{[\s\S]*?proxy_pass http:\/\/xueleai_web;[\s\S]*?\n  \}/,
      `${configPath} 必须把证照裁剪下载接口转发到 Next.js Web 服务`
    );
    assert.match(
      config,
      /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/xueleai_api_core;[\s\S]*?\n  \}/,
      `${configPath} 的其余 API 必须继续转发到 NestJS API Core`
    );
  }
});

test("production edge config enforces the public security baseline", async () => {
  const nginxConfig = await readText("deploy/nginx/nginx.conf");
  const httpConfig = await readText("deploy/nginx/conf.d/default.conf");
  const httpsConfig = await readText("deploy/nginx/conf.d/https.conf");
  const nextConfig = await readText("apps/web/next.config.ts");

  assert.match(nginxConfig, /server_tokens off;/);
  assert.match(nginxConfig, /proxy_hide_header X-Powered-By;/);
  assert.match(httpConfig, /listen 3320 default_server;[\s\S]*?location \/ \{\s*return 444;/);
  assert.match(
    httpConfig,
    /server_name www\.xueleai\.com;[\s\S]*?return 301 https:\/\/xueleai\.com\$request_uri;/,
    "HTTP www 域名必须一次永久跳转到 HTTPS 裸域名"
  );
  assert.doesNotMatch(httpConfig, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(httpsConfig, /listen 3326 ssl default_server;[\s\S]*?ssl_reject_handshake on;/);
  assert.match(
    httpsConfig,
    /server_name www\.xueleai\.com;[\s\S]*?return 301 https:\/\/xueleai\.com\$request_uri;/,
    "HTTPS www 域名必须永久跳转到裸域名并保留路径与查询参数"
  );
  assert.match(httpsConfig, /server_name xueleai\.com;/);
  assert.doesNotMatch(httpsConfig, /server_name xueleai\.com www\.xueleai\.com;/);
  assert.match(httpsConfig, /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
  assert.match(httpsConfig, /add_header X-Content-Type-Options "nosniff" always;/);
  assert.match(httpsConfig, /add_header X-Frame-Options "SAMEORIGIN" always;/);
  assert.match(httpsConfig, /add_header Referrer-Policy "strict-origin-when-cross-origin" always;/);
  assert.match(httpsConfig, /add_header Permissions-Policy "camera=\(self\), microphone=\(self\), geolocation=\(\)" always;/);
  assert.match(httpsConfig, /add_header Content-Security-Policy-Report-Only /);
  assert.match(httpsConfig, /location = \/healthz \{[\s\S]*?default_type text\/plain;/);
  assert.doesNotMatch(httpsConfig, /location = \/healthz \{[\s\S]*?add_header Content-Type/);
  assert.match(nextConfig, /poweredByHeader:\s*false/);
});

async function readText(relativePath) {
  try {
    return await readFile(resolve(rootDir, relativePath), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
