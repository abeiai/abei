import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoGuideNarrationTtsRateLimiter,
  type NarrationTtsRateLimitClient
} from "../src/video-guide/video-guide-narration-rate-limit.js";

class SharedRateLimitStore {
  expiresAt = 0;
  now = 0;
}

class FakeRateLimitClient implements NarrationTtsRateLimitClient {
  isOpen = true;
  destroyCalls = 0;
  quitCalls = 0;

  constructor(private readonly store: SharedRateLimitStore) {}

  async connect() {}

  async set(_key: string, _value: string, options: { NX: true; PX: number }) {
    if (this.store.expiresAt > this.store.now) {
      return null;
    }

    this.store.expiresAt = this.store.now + options.PX;
    return "OK";
  }

  async pTTL() {
    return Math.max(0, this.store.expiresAt - this.store.now);
  }

  async quit() {
    this.quitCalls += 1;
  }

  destroy() {
    this.destroyCalls += 1;
    this.isOpen = false;
  }
}

test("不同实例共享启动间隔并限制为每秒两次", async () => {
  const store = new SharedRateLimitStore();
  const waits: number[] = [];
  const createLimiter = () =>
    new VideoGuideNarrationTtsRateLimiter({
      client: new FakeRateLimitClient(store),
      requestsPerSecond: 2,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        store.now += milliseconds;
      }
    });
  const first = createLimiter();
  const second = createLimiter();

  await first.acquire();
  await second.acquire();

  assert.deepEqual(waits, [500]);
  assert.equal(store.now, 500);
});

test("默认启动节奏保留外部调用余量并限制为每分钟四十五次", async () => {
  const previousRps = process.env.VIDEO_GUIDE_NARRATION_TTS_RPS;
  const store = new SharedRateLimitStore();
  const waits: number[] = [];
  const createLimiter = () =>
    new VideoGuideNarrationTtsRateLimiter({
      client: new FakeRateLimitClient(store),
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        store.now += milliseconds;
      }
    });

  delete process.env.VIDEO_GUIDE_NARRATION_TTS_RPS;

  try {
    await createLimiter().acquire();
    await createLimiter().acquire();

    assert.deepEqual(waits, [1_334]);
    assert.equal(store.now, 1_334);
  } finally {
    if (previousRps === undefined) {
      delete process.env.VIDEO_GUIDE_NARRATION_TTS_RPS;
    } else {
      process.env.VIDEO_GUIDE_NARRATION_TTS_RPS = previousRps;
    }
  }
});

test("Redis 命令长时间无响应时限速器会明确失败", async () => {
  const client = new FakeRateLimitClient(new SharedRateLimitStore());
  client.set = async () => new Promise<string | null>(() => undefined);
  const limiter = new VideoGuideNarrationTtsRateLimiter({
    client,
    commandTimeoutMs: 10
  });

  await assert.rejects(limiter.acquire(), /全局限速服务响应超时/);
  assert.equal(client.destroyCalls, 1);
  assert.equal(client.isOpen, false);
});

test("关闭 Redis 限速器时直接销毁专用连接", async () => {
  const client = new FakeRateLimitClient(new SharedRateLimitStore());
  const limiter = new VideoGuideNarrationTtsRateLimiter({
    client,
    commandTimeoutMs: 10
  });

  await limiter.close();
  assert.equal(client.destroyCalls, 1);
  assert.equal(client.quitCalls, 0);
  assert.equal(client.isOpen, false);
});
