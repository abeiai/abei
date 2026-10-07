import assert from "node:assert/strict";
import test from "node:test";
import { WechatMpClient } from "../src/auth/wechat-mp.client.js";
import {
  loadWechatMpConfig,
  type ScanRecord,
  type WechatMpConfig,
} from "../src/auth/wechat-mp.types.js";
import {
  RedisWechatScanStore,
  scanKey,
  type WechatScanStore,
} from "../src/auth/wechat-mp.store.js";
const config: WechatMpConfig = {
  appId: "wx0123456789abcdef",
  appSecret: "unit-secret",
  token: "unitcallbacktoken",
  encodingKey: Buffer.alloc(32, 7).toString("base64").slice(0, -1),
  originalId: "gh_unit",
  origin: "https://abei.example",
  registrationEnabled: false,
};
class Store implements WechatScanStore {
  values = new Map<string, ScanRecord>();
  async read(key: string) {
    return this.values.get(key) ?? null;
  }
  async atomic<T>(
    keys: string[],
    update: (values: Array<ScanRecord | null>) => {
      values: Array<ScanRecord | null>;
      result: T;
    },
  ) {
    const result = update(
      keys.map((k) => {
        const v = this.values.get(k);
        return v && v.expiresAt > Date.now() ? structuredClone(v) : null;
      }),
    );
    result.values.forEach((v, i) => {
      if (v) this.values.set(keys[i]!, v);
      else this.values.delete(keys[i]!);
    });
    return result.result;
  }
}
test("多个客户端共享 stable_token 单次刷新，生成 QR_STR_SCENE 且不强制刷新", async () => {
  let refreshes = 0;
  const store = new Store();
  const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("stable_token")) {
      refreshes++;
      assert.equal(JSON.parse(String(init.body)).force_refresh, false);
      await new Promise((r) => setTimeout(r, 20));
      return Response.json({ access_token: "unit-stable", expires_in: 7200 });
    }
    const body = JSON.parse(String(init.body));
    assert.equal(body.action_name, "QR_STR_SCENE");
    assert.equal(body.expire_seconds, 180);
    assert.equal(url.searchParams.get("access_token"), "unit-stable");
    return Response.json({
      ticket: "ticket-" + body.action_info.scene.scene_str,
      expire_seconds: 180,
    });
  }) as typeof fetch;
  const clients = Array.from(
    { length: 3 },
    () => new WechatMpClient(store, config, request),
  );
  const results = await Promise.all(
    clients.map((c, i) => c.createQrcode("scene-" + i)),
  );
  assert.equal(refreshes, 1);
  assert.equal(
    results[1]!.url,
    "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=ticket-scene-1",
  );
  assert.equal(
    [...store.values.keys()].some(
      (x) => x.includes(config.appId) || x.includes(config.appSecret),
    ),
    false,
  );
});
test("上游凭据错误不泄露详情，基本资料缺少 UnionID不阻止公众号身份", async () => {
  const request = (async (input: RequestInfo | URL) =>
    String(input).includes("stable_token")
      ? Response.json({ access_token: "unit-stable", expires_in: 7200 })
      : Response.json({ openid: "owner", subscribe: 1 })) as typeof fetch;
  const client = new WechatMpClient(new Store(), config, request);
  assert.equal((await client.identity("owner")).unionId, null);
  const failed = new WechatMpClient(new Store(), config, (async () =>
    Response.json({
      errcode: 40013,
      errmsg: "unit-secret-provider-detail",
    })) as typeof fetch);
  await assert.rejects(
    () => failed.createQrcode("scene"),
    (error) =>
      error instanceof Error &&
      !error.message.includes("unit-secret") &&
      !error.message.includes("provider-detail"),
  );
});
test("公众号配置独立于网站应用配置，生产 HTTP 配置失败关闭", () => {
  const values = {
    WECHAT_MP_LOGIN_ENABLED: "true",
    WECHAT_APP_ID: config.appId,
    WECHAT_APP_SECRET: config.appSecret,
    WECHAT_MP_CALLBACK_TOKEN: config.token,
    WECHAT_MP_ENCODING_AES_KEY: config.encodingKey,
    WECHAT_MP_ORIGINAL_ID: config.originalId,
    APP_BASE_URL: config.origin,
    NODE_ENV: "production",
  };
  const previous = new Map(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  delete process.env.WECHAT_OPEN_APP_ID;
  delete process.env.WECHAT_OPEN_APP_SECRET;
  try {
    assert.equal(loadWechatMpConfig().appId, config.appId);
    process.env.APP_BASE_URL = "http://abei.example";
    assert.throws(() => loadWechatMpConfig());
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
test("真实 Redis 原子竞争只允许一个消费者且不会延长原截止点", async () => {
  const store = new RedisWechatScanStore(),
    key = scanKey(config.appId, "test", String(Math.random()));
  try {
    await store.atomic([key], (values) => {
      values[0] = {
        kind: "EVENT",
        expiresAt: Date.now() + 10_000,
        reply: "unused",
      };
      return { values, result: null };
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.atomic([key], (values) => {
          if (values[0] === null) return { values, result: false };
          values[0] = null;
          return { values, result: true };
        }),
      ),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await store.read(key), null);
  } finally {
    await store.onModuleDestroy();
  }
});

test("反复查询 Redis 不累积客户端错误监听器", async () => {
  const store = new RedisWechatScanStore(),
    warnings: Error[] = [];
  const listener = (warning: Error) => {
    if (warning.name === "MaxListenersExceededWarning") warnings.push(warning);
  };
  process.on("warning", listener);
  try {
    for (let i = 0; i < 30; i++)
      await store.read(scanKey(config.appId, "listener-test", "absent"));
    await new Promise((r) => setImmediate(r));
    assert.equal(warnings.length, 0);
  } finally {
    process.off("warning", listener);
    await store.onModuleDestroy();
  }
});
