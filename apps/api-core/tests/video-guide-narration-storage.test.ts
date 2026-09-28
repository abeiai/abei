import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  VideoGuideNarrationStorageError,
  audioAssetDataFromTtsPayload,
  deletePersistedVideoGuideNarrationAudio,
  persistVideoGuideNarrationAudio,
  sanitizePersistedTtsPayload,
  videoGuideNarrationObjectKey,
  verifyPersistedVideoGuideNarrationAudio,
  type PersistedVideoGuideNarrationAudio,
  type VideoGuideNarrationR2Config
} from "../src/audio/video-guide-narration-storage.js";

const audioBytes = Buffer.from("unit-test-mp3-data");
const audioSha256 = createHash("sha256").update(audioBytes).digest("hex");

function testR2Config(overrides: Partial<VideoGuideNarrationR2Config> = {}): VideoGuideNarrationR2Config {
  return {
    endpoint: "https://r2.example.com",
    bucket: "xueleai",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    publicBaseUrl: "https://cdn.xueleai.com",
    pathStyle: true,
    prefix: "video-guide/narration/",
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
    providerDownloadAllowedHosts: ["provider.example"],
    ...overrides
  };
}

function persistenceRequest() {
  return {
    lessonId: "lesson-1",
    generationId: "generation-1",
    nodeId: "s_001",
    audioTaskId: "task-1",
    format: "mp3" as const
  };
}

test("checkpoint 写入前也能根据任务参数推导 R2 对象键", () => {
  assert.equal(
    videoGuideNarrationObjectKey(persistenceRequest(), "video-guide/narration/"),
    "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3"
  );
});

function verifiedR2Fetch(
  bytes: Buffer,
  overrides: {
    contentLength?: number;
    contentType?: string;
    sha256?: string;
  } = {}
) {
  const calls: Array<{ method: string; url: string }> = [];
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url });

    if (method === "PUT") {
      return new Response(null, { status: 200 });
    }

    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": String(overrides.contentLength ?? bytes.byteLength),
          "content-type": overrides.contentType ?? "audio/mpeg",
          "x-amz-meta-sha256": overrides.sha256 ?? sha256
        }
      });
    }

    if (method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    throw new Error(`unexpected fetch: ${method} ${url}`);
  };

  return {
    calls,
    fetchImpl: fetchImpl as typeof fetch
  };
}

function persistedAudio(): PersistedVideoGuideNarrationAudio {
  return {
    storageProvider: "S3",
    objectKey: "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
    url: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: audioBytes.byteLength,
    sha256: audioSha256
  };
}

async function rejectsWithCode(operation: Promise<unknown>, code: string) {
  await assert.rejects(
    operation,
    (error: unknown) => error instanceof VideoGuideNarrationStorageError && error.code === code
  );
}

test("视频导学语音使用 Base64 上传 R2 并通过 HEAD 校验", async () => {
  const stages: string[] = [];
  const r2 = verifiedR2Fetch(audioBytes);
  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioBase64: audioBytes.toString("base64"),
      requestId: "req-1"
    },
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: r2.fetchImpl,
    onStage: async (stage) => {
      stages.push(stage);
    }
  });

  assert.deepEqual(stages, ["UPLOADING", "VERIFYING"]);
  assert.equal(
    persisted.objectKey,
    "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3"
  );
  assert.equal(persisted.url, `https://cdn.xueleai.com/${persisted.objectKey}`);
  assert.equal(persisted.sizeBytes, audioBytes.byteLength);
  assert.equal(persisted.sha256, audioSha256);
  assert.deepEqual(r2.calls.map((call) => call.method), ["PUT", "HEAD"]);
});

test("断点恢复前重新 HEAD 校验既有 R2 语音", async () => {
  const r2 = verifiedR2Fetch(audioBytes);

  await verifyPersistedVideoGuideNarrationAudio(persistedAudio(), {
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: r2.fetchImpl
  });

  assert.deepEqual(r2.calls.map((call) => call.method), ["HEAD"]);
});

test("断点恢复遇到已删除的 R2 对象时放弃旧检查点", async () => {
  const fetchImpl = async () => new Response(null, { status: 404 });

  await rejectsWithCode(
    verifyPersistedVideoGuideNarrationAudio(persistedAudio(), {
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: fetchImpl as typeof fetch
    }),
    "R2_VERIFY_INVALID"
  );
});

test("断点恢复拒绝不属于当前节点的 R2 对象", async () => {
  const r2 = verifiedR2Fetch(audioBytes);

  await rejectsWithCode(
    verifyPersistedVideoGuideNarrationAudio(
      {
        ...persistedAudio(),
        objectKey: "video-guide/narration/another-lesson/generation-1/s_001-task-1.mp3"
      },
      {
        request: persistenceRequest(),
        config: testR2Config(),
        fetchImpl: r2.fetchImpl
      }
    ),
    "R2_VERIFY_INVALID"
  );
  assert.equal(r2.calls.length, 0);
});

test("英文带学语音写入独立对象目录", async () => {
  const r2 = verifiedR2Fetch(audioBytes);
  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioBase64: audioBytes.toString("base64")
    },
    request: {
      ...persistenceRequest(),
      namespace: "english-guided-study"
    },
    config: testR2Config(),
    fetchImpl: r2.fetchImpl
  });

  assert.equal(
    persisted.objectKey,
    "video-guide/narration/english-guided-study/lesson-1/generation-1/s_001-task-1.mp3"
  );
});

test("Base64 缺失时下载 Provider 临时地址后再上传 R2", async () => {
  const r2 = verifiedR2Fetch(audioBytes);
  const calls: string[] = [];
  const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(method);

    if (method === "GET") {
      return new Response(audioBytes, {
        status: 200,
        headers: {
          "content-length": String(audioBytes.byteLength),
          "content-type": "audio/mpeg"
        }
      });
    }

    return r2.fetchImpl(input, init);
  };

  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioUrl: "https://provider.example/temporary.mp3?signature=secret"
    },
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(persisted.url.startsWith("https://cdn.xueleai.com/"), true);
  assert.deepEqual(calls, ["GET", "PUT", "HEAD"]);
});

test("Provider 音频下载中途断流时自动重新下载", async () => {
  const r2 = verifiedR2Fetch(audioBytes);
  const calls: string[] = [];
  let downloadAttempts = 0;
  const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(method);

    if (method === "GET") {
      downloadAttempts += 1;

      if (downloadAttempts === 1) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(audioBytes.subarray(0, 3));
            controller.error(new Error("connection reset"));
          }
        });

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "audio/mpeg"
          }
        });
      }

      return new Response(audioBytes, {
        status: 200,
        headers: {
          "content-length": String(audioBytes.byteLength),
          "content-type": "audio/mpeg"
        }
      });
    }

    return r2.fetchImpl(input, init);
  };

  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioUrl: "https://provider.example/temporary.mp3"
    },
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(persisted.sha256, audioSha256);
  assert.deepEqual(calls, ["GET", "GET", "PUT", "HEAD"]);
});

test("Provider 白名单中的 HTTP 临时地址可以下载并上传 R2", async () => {
  const r2 = verifiedR2Fetch(audioBytes);
  const calls: string[] = [];
  const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${String(input)}`);

    if (method === "GET") {
      return new Response(audioBytes, {
        status: 200,
        headers: {
          "content-length": String(audioBytes.byteLength),
          "content-type": "audio/mpeg"
        }
      });
    }

    return r2.fetchImpl(input, init);
  };

  await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioUrl: "http://provider.example/temporary.mp3?signature=secret"
    },
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.deepEqual(calls, [
    "GET http://provider.example/temporary.mp3?signature=secret",
    "PUT https://r2.example.com/xueleai/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
    "HEAD https://r2.example.com/xueleai/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3"
  ]);
});

test("Provider 临时地址仍拒绝私网主机和未授权主机", async () => {
  const urls = [
    "https://127.0.0.1/temporary.mp3",
    "https://169.254.169.254/latest/meta-data",
    "https://untrusted.example/temporary.mp3"
  ];

  for (const audioUrl of urls) {
    let fetched = false;
    await rejectsWithCode(
      persistVideoGuideNarrationAudio({
        providerPayload: { audioUrl },
        request: persistenceRequest(),
        config: testR2Config(),
        fetchImpl: (async () => {
          fetched = true;
          throw new Error("不应发出请求");
        }) as typeof fetch
      }),
      "TTS_OUTPUT_INVALID"
    );
    assert.equal(fetched, false, audioUrl);
  }
});

test("Provider 下载重定向到未授权主机时拒绝继续请求", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: URL | RequestInfo) => {
    calls.push(String(input));
    return new Response(null, {
      status: 302,
      headers: {
        location: "https://127.0.0.1/private.mp3"
      }
    });
  };

  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: { audioUrl: "https://provider.example/temporary.mp3" },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: fetchImpl as typeof fetch
    }),
    "TTS_OUTPUT_INVALID"
  );
  assert.deepEqual(calls, ["https://provider.example/temporary.mp3"]);
});

test("没有音频数据时拒绝创建 R2 对象", async () => {
  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {},
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: verifiedR2Fetch(audioBytes).fetchImpl
    }),
    "TTS_OUTPUT_MISSING"
  );
});

test("单句音频超过上限时拒绝上传", async () => {
  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config({ maxBytes: audioBytes.byteLength - 1 }),
      fetchImpl: verifiedR2Fetch(audioBytes).fetchImpl
    }),
    "TTS_OUTPUT_INVALID"
  );
});

test("R2 PUT 失败时返回稳定错误码", async () => {
  let attempts = 0;
  const fetchImpl = async (_input: URL | RequestInfo, init?: RequestInit) => {
    assert.equal(init?.method, "PUT");
    attempts += 1;
    return new Response(null, { status: 503 });
  };

  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: fetchImpl as typeof fetch
    }),
    "R2_UPLOAD_FAILED"
  );
  assert.equal(attempts, 3);
});

test("R2 PUT 瞬时失败后自动重试并继续校验", async () => {
  const calls: string[] = [];
  let putAttempts = 0;
  const fetchImpl = async (_input: URL | RequestInfo, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(method);

    if (method === "PUT") {
      putAttempts += 1;
      return new Response(null, { status: putAttempts === 1 ? 503 : 200 });
    }

    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": String(audioBytes.byteLength),
          "content-type": "audio/mpeg",
          "x-amz-meta-sha256": audioSha256
        }
      });
    }

    throw new Error(`unexpected method: ${method}`);
  };

  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioBase64: audioBytes.toString("base64")
    },
    request: persistenceRequest(),
    config: testR2Config(),
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(persisted.sha256, audioSha256);
  assert.deepEqual(calls, ["PUT", "PUT", "HEAD"]);
});

test("R2 拒绝上传时不重试并返回配置错误", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response(null, { status: 403 });
  };

  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: fetchImpl as typeof fetch
    }),
    "R2_CONFIG_MISSING"
  );
  assert.equal(attempts, 1);
});

test("R2 HEAD 文件大小不一致时不能标记成功", async () => {
  const r2 = verifiedR2Fetch(audioBytes, {
    contentLength: audioBytes.byteLength + 1
  });

  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: r2.fetchImpl
    }),
    "R2_VERIFY_INVALID"
  );
  assert.deepEqual(r2.calls.map((call) => call.method), ["PUT", "HEAD", "DELETE"]);
});

test("R2 HEAD 音频类型不一致时不能标记成功", async () => {
  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: verifiedR2Fetch(audioBytes, {
        contentType: "application/octet-stream"
      }).fetchImpl
    }),
    "R2_VERIFY_INVALID"
  );
});

test("R2 HEAD 哈希元数据不一致时不能标记成功", async () => {
  await rejectsWithCode(
    persistVideoGuideNarrationAudio({
      providerPayload: {
        audioBase64: audioBytes.toString("base64")
      },
      request: persistenceRequest(),
      config: testR2Config(),
      fetchImpl: verifiedR2Fetch(audioBytes, {
        sha256: "wrong-sha256"
      }).fetchImpl
    }),
    "R2_VERIFY_INVALID"
  );
});

test("数据库落库失败后的补偿清理使用签名 DELETE", async () => {
  const calls: Array<{ method: string; authorization: string }> = [];
  const fetchImpl = async (_input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization") ?? ""
    });
    return new Response(null, { status: 204 });
  };

  await deletePersistedVideoGuideNarrationAudio(persistedAudio(), {
    config: testR2Config(),
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "DELETE");
  assert.match(calls[0]?.authorization ?? "", /^AWS4-HMAC-SHA256 /);
});

test("持久化后的 Provider 数据移除临时音频和嵌套原始响应", () => {
  const sanitized = sanitizePersistedTtsPayload(
    {
      audioBase64: "large-base64",
      audioUrl: "https://provider.example/temp.mp3?signature=secret",
      provider: "aliyun_dashscope_audio",
      model: "cosyvoice-v3-flash",
      requestId: "req-1",
      latencyMs: 125,
      usage: {
        inputCharacters: 12
      },
      raw: {
        output: {
          audio: {
            data: "nested-base64",
            url: "https://provider.example/nested.mp3?signature=secret"
          }
        }
      }
    },
    persistedAudio()
  );

  assert.equal("audioBase64" in sanitized, false);
  assert.equal("audioUrl" in sanitized, false);
  assert.equal("raw" in sanitized, false);
  assert.equal(sanitized.requestId, "req-1");
  assert.deepEqual(sanitized.persistence, {
    status: "SUCCEEDED",
    ...persistedAudio()
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /signature=secret|base64/i);
});

test("已校验的持久化数据转换为真实 S3 音频资产", () => {
  const payload = sanitizePersistedTtsPayload(
    {
      requestId: "req-1"
    },
    persistedAudio()
  );
  const asset = audioAssetDataFromTtsPayload("user-1", payload);

  assert.deepEqual(asset, {
    userId: "user-1",
    type: "TTS_OUTPUT",
    storageProvider: "S3",
    url: persistedAudio().url,
    objectKey: persistedAudio().objectKey,
    mimeType: "audio/mpeg",
    sizeBytes: audioBytes.byteLength
  });
  assert.equal(
    audioAssetDataFromTtsPayload("user-1", {
      audioUrl: "https://provider.example/temporary.mp3"
    }),
    null
  );
});

test("对象路径会清理标识符中的路径分隔符", async () => {
  const r2 = verifiedR2Fetch(audioBytes);
  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioBase64: audioBytes.toString("base64")
    },
    request: {
      lessonId: "../lesson/1",
      generationId: "generation\\1",
      nodeId: "s/001",
      audioTaskId: "task 1",
      format: "mp3"
    },
    config: testR2Config(),
    fetchImpl: r2.fetchImpl
  });

  assert.equal(
    persisted.objectKey,
    "video-guide/narration/lesson-1/generation-1/s-001-task-1.mp3"
  );
});

test("对象存储前缀拒绝父目录、查询字符和非 ASCII 字符", async () => {
  for (const prefix of ["../narration/", "video-guide/narration?/", "视频导学/语音/"]) {
    await rejectsWithCode(
      persistVideoGuideNarrationAudio({
        providerPayload: {
          audioBase64: audioBytes.toString("base64")
        },
        request: persistenceRequest(),
        config: testR2Config({ prefix }),
        fetchImpl: verifiedR2Fetch(audioBytes).fetchImpl
      }),
      "R2_CONFIG_MISSING"
    );
  }
});
