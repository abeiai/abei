import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { uploadCourseCover } from "../src/lib/course-cover-upload.js";

test("封面通过稳定接口上传并携带同源身份，不依赖发布版本的动作编号", async () => {
  const original = globalThis.fetch;
  const blob = new Blob(["image"], { type: "image/jpeg" });
  globalThis.fetch = (async (url, options) => {
    assert.equal(url, "/api/courses/cover");
    assert.equal(options?.method, "POST");
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.headers, undefined);
    assert.ok(options?.body instanceof FormData);
    assert.equal((options.body.get("file") as File).type, "image/jpeg");
    assert.equal((options.body.get("file") as File).size, blob.size);
    return new Response(JSON.stringify({ code: 0, data: { id: "cover", url: "/cover.jpg" } }));
  }) as typeof fetch;
  try { assert.deepEqual(await uploadCourseCover(blob), { ok: true, data: { id: "cover", url: "/cover.jpg" }, message: "专辑封面已上传。" }); }
  finally { globalThis.fetch = original; }
  const source = readFileSync(new URL("../src/components/courses/course-cover-uploader.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /uploadCourseCoverAction/);
});

test("登录失效、体积限制、服务端校验和网络错误不会误报为图片处理失败", async () => {
  const original = globalThis.fetch;
  const cases: Array<[Response | Error, RegExp]> = [
    [new Response("login", { status: 401 }), /登录已失效/],
    [new Response("too large", { status: 413 }), /图片过大/],
    [new Response(JSON.stringify({ code: 40001, message: "封面图片比例必须为 16:9" }), { status: 400 }), /比例必须为 16:9/],
    [new Response("<html>Bad gateway</html>", { status: 502 }), /上传失败/],
    [new Response(JSON.stringify({ code: 50001, message: "Prisma 数据库 error", data: null }), { status: 500 }), /上传失败/],
    [new TypeError("Failed to fetch"), /网络/],
    [new Response(JSON.stringify({ code: 0, data: null })), /上传失败/]
  ];
  try {
    for (const [response, message] of cases) {
      globalThis.fetch = (async () => { if (response instanceof Error) throw response; return response; }) as typeof fetch;
      const result = await uploadCourseCover(new Blob(["image"]));
      assert.equal(result.ok, false);
      assert.match(result.message, message);
    }
  } finally { globalThis.fetch = original; }
});
