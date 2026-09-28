import assert from "node:assert/strict";
import test from "node:test";

import {
  AudioProviderException,
  audioProviderErrorCode,
  isRetryableAudioProviderError
} from "../src/audio/audio.service.js";

test("语音 Provider 将容器 DNS 和连接抖动识别为可重试错误", () => {
  const dnsError = Object.assign(new Error("getaddrinfo EAI_AGAIN ai-gateway"), {
    code: "EAI_AGAIN"
  });
  const nestedError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
  });

  assert.equal(audioProviderErrorCode(dnsError), "EAI_AGAIN");
  assert.equal(audioProviderErrorCode(nestedError), "ECONNREFUSED");
  assert.equal(isRetryableAudioProviderError(dnsError), true);
  assert.equal(isRetryableAudioProviderError(nestedError), true);
  assert.equal(isRetryableAudioProviderError(new Error("AI Gateway 请求等待超时")), true);
});

test("语音 Provider 的明确终态错误不会重试", () => {
  const terminalError = new AudioProviderException("ASR_TASK_FAILED", "识别失败", true);

  assert.equal(isRetryableAudioProviderError(terminalError), false);
});

test("查询请求的限流错误可以重试", () => {
  assert.equal(
    isRetryableAudioProviderError(new AudioProviderException("Throttling", "稍后重试")),
    true
  );
});

test("提供商任务已经终态失败时即使错误码是限流也不能继续查询", () => {
  assert.equal(
    isRetryableAudioProviderError(
      new AudioProviderException("Throttling", "任务已终止", true)
    ),
    false
  );
});
