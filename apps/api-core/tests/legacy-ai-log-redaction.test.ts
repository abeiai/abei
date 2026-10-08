import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { legacyLogFilters, redactLogJson, redactLogText } from "../src/operations/legacy-ai-logs.types.js";
import { legacyLogFile } from "../src/operations/legacy-ai-log-files.js";

test("授权头、完整 Cookie 和正文 JSON 凭据不进入浏览器", () => {
  for (const text of [
    "Authorization: Basic Zml4dHVyZTpwYXNzd29yZA==\n正常日志",
    "Cookie: theme=dark; sid=fixture-session-secret; remember=fixture-remember-secret\n正常日志",
    '{"token":"fixture-token-secret","password":"fixture password with spaces","content":"正常日志"}',
    "Authorization=Bearer fixture-bearer-secret\n正常日志",
  ]) {
    const result = redactLogText(text)!;
    assert.doesNotMatch(result, /Zml4dHVyZTpwYXNzd29yZA|fixture-session-secret|fixture-remember-secret|fixture-token-secret|fixture password with spaces|fixture-bearer-secret/);
    assert.match(result, /正常日志/);
  }
});

test("摘要、嵌套参考素材和音视频输出隐藏远端地址，保留业务文字与字段路径", () => {
  const result = redactLogJson({
    preview: "生成结果 https://old.invalid/image.png?token=fixture-url-secret",
    reference: { character: ["https://old.invalid/private.png", "s3://old-bucket/reference.jpg"] },
    output: { audio: "https:\\/\\/old.invalid/audio.mp3", video: "oss://old-bucket/video.mp4" },
    prompt_zh: "熊猫在森林中与朋友分享",
    requestedAt: new Date("2026-10-01T00:00:00Z"),
  }) as { prompt_zh: string; requestedAt: Date };
  assert.doesNotMatch(JSON.stringify(result), /old\.invalid|old-bucket|fixture-url-secret/);
  assert.equal(result.prompt_zh, "熊猫在森林中与朋友分享");
  assert.equal(result.requestedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.match(JSON.stringify(result), /character|audio|video/);
});

test("模型和版本查询与用户筛选同时生效", () => {
  const { where } = legacyLogFilters({ model: "历史版本", user: "123" });
  assert.deepEqual(where.AND, [{ OR: [
    { modelName: { contains: "历史版本", mode: "insensitive" } },
    { versionName: { contains: "历史版本", mode: "insensitive" } },
  ] }]);
  assert.ok(where.OR?.some(filter => filter.sourceUserId === "123"));
});

test("私有素材目录经符号链接落入公共 uploads 时仍拒绝读取", async () => {
  const dir = await mkdtemp(join(tmpdir(), "abei-log-directory-boundary-"));
  const originalPrivate = process.env.LEGACY_AI_LOG_ASSET_DIR;
  const originalUploads = process.env.UPLOAD_DIR;
  try {
    const uploads = join(dir, "uploads");
    await mkdir(join(uploads, "private"), { recursive: true });
    await writeFile(join(uploads, "private", "asset.png"), "private-fixture");
    await symlink(uploads, join(dir, "alias"));
    process.env.UPLOAD_DIR = uploads;
    process.env.LEGACY_AI_LOG_ASSET_DIR = join(dir, "alias", "private");
    await assert.rejects(() => legacyLogFile({ status: "AVAILABLE", mediaType: "IMAGE", mimeType: "image/png", storageKey: "asset.png", filename: "测试" }), (error: unknown) => (error as { status: number }).status === 404);
  } finally {
    if (originalPrivate === undefined) delete process.env.LEGACY_AI_LOG_ASSET_DIR; else process.env.LEGACY_AI_LOG_ASSET_DIR = originalPrivate;
    if (originalUploads === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = originalUploads;
    await rm(dir, { recursive: true, force: true });
  }
});
