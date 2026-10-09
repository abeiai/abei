import { HttpStatus } from "@nestjs/common";
import { decryptSecret } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { isProviderRequestTimeout } from "./provider-request-errors.js";
import { calculateUsageCredits, type TokenUsage } from "./ai-cost.js";
import type { AiModelPricingConfig, AiModelPricingUnit } from "./model-pricing.js";

export type ProviderAdapterType =
  | "OPENAI_COMPATIBLE"
  | "CUSTOM_OPENAI_COMPATIBLE"
  | "ANTHROPIC"
  | "GEMINI"
  | "DASHSCOPE_AUDIO"
  | "MINIMAX_AUDIO"
  | "ELEVENLABS_AUDIO"
  | "MINIMAX_VIDEO";

export interface ProviderAdapter {
  readonly type: ProviderAdapterType;
  testConnection(input: ProviderTestInput): Promise<ProviderTestResult>;
  generateText(input: ProviderTextInput): Promise<ProviderTextResult>;
  streamText(input: ProviderStreamInput): Promise<ProviderTextResult>;
  generateEmbedding(input: ProviderEmbeddingInput): Promise<ProviderEmbeddingResult>;
  generateImage(input: ProviderImageInput): Promise<ProviderImageResult>;
  calculateUsage(input: ProviderUsageInput): number;
}

export interface ProviderTestInput {
  baseUrl: string;
  apiKeyEncrypted: string;
  modelName: string;
  capabilityTags?: string[];
  timeoutMs: number;
  gatewayBaseUrl?: string;
  webSocketUrl?: string | null;
  region?: string | null;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  modelVerified?: boolean;
}

export interface ProviderTextInput {
  gatewayBaseUrl: string;
  scenarioSlug: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  modelName: string;
  prompt: string;
  input: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  attachments?: ProviderTextAttachment[];
  reasoningSwitchSupported?: boolean;
  reasoningEnabled?: boolean;
  searchEnabled?: boolean;
}

export interface ProviderTextAttachment {
  name: string;
  type: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
}

export interface ProviderStreamInput extends ProviderTextInput {
  onDelta: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface ProviderTextResult {
  text: string;
  usage?: TokenUsage;
  usageCredits?: number;
  provider?: string;
  model?: string;
  requestId?: string | null;
  finishReason?: string | null;
  errorCode?: string | null;
  latencyMs?: number | null;
  reasoningContent?: string;
}

export interface ProviderEmbeddingInput {
  text: string;
}

export interface ProviderEmbeddingResult {
  embedding: number[];
  usage?: TokenUsage;
}

export interface ProviderImageInput {
  prompt: string;
}

export interface ProviderImageResult {
  imageUrl?: string;
  imageBase64?: string;
}

export interface ProviderUsageInput {
  usage?: TokenUsage | null;
  inputPrice: number;
  outputPrice: number;
  pricingUnit?: AiModelPricingUnit | string | null;
  pricingConfig?: AiModelPricingConfig;
  fallbackCredits: number;
  maxCredits: number;
  minCredits?: number;
}

interface AiGatewayResponse {
  output?: unknown;
  text?: unknown;
  reasoningText?: unknown;
  reasoningContent?: unknown;
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
    inputCacheHitTokens?: unknown;
    inputCacheMissTokens?: unknown;
    inputCacheCreationTokens?: unknown;
    inputCacheMode?: unknown;
  };
  usageCredits?: unknown;
  provider?: unknown;
  model?: unknown;
  finishReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
  detail?: unknown;
}

export function getProviderAdapter(type: string | null | undefined): ProviderAdapter {
  if (type === "ANTHROPIC") {
    return new AnthropicProviderAdapter();
  }

  if (type === "GEMINI") {
    return new GeminiProviderAdapter();
  }

  if (type === "DASHSCOPE_AUDIO") {
    return new DashScopeAudioProviderAdapter();
  }

  if (type === "MINIMAX_AUDIO") {
    return new MiniMaxAudioProviderAdapter();
  }

  if (type === "ELEVENLABS_AUDIO") {
    return new ElevenLabsAudioProviderAdapter();
  }

  if (type === "MINIMAX_VIDEO") {
    return new MiniMaxVideoProviderAdapter();
  }

  return new OpenAiCompatibleProviderAdapter(
    type === "CUSTOM_OPENAI_COMPATIBLE" ? "CUSTOM_OPENAI_COMPATIBLE" : "OPENAI_COMPATIBLE"
  );
}

class OpenAiCompatibleProviderAdapter implements ProviderAdapter {
  constructor(readonly type: ProviderAdapterType = "OPENAI_COMPATIBLE") {}

  async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const testsImageAccess = input.capabilityTags?.includes("IMAGE_GENERATION") === true ||
        ["Qwen3.5-122B-A10B-FP8", "Qwen2-Audio-7B-Instruct", "Qwen3-VL-8B-Instruct", "IndexTTS-2.5", "Laya"].includes(input.modelName);
      const response = await fetch(
        `${normalizeBaseUrl(input.baseUrl)}/${testsImageAccess ? "models" : "chat/completions"}`,
        testsImageAccess
          ? {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`
              },
              signal: controller.signal
            }
          : {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: input.modelName,
                messages: [
                  {
                    role: "user",
                    content: "ping"
                  }
                ],
                max_tokens: 1,
                temperature: 0
              }),
              signal: controller.signal
            }
      );

      if (!response.ok) {
        return {
          success: false,
          message: providerTestMessage(response.status)
        };
      }

      if (["Qwen3.5-122B-A10B-FP8", "Qwen2-Audio-7B-Instruct", "Qwen3-VL-8B-Instruct", "Qwen-Image-2.1", "IndexTTS-2.5", "Laya"].includes(input.modelName)) {
        const payload: unknown = await response.json();
        const models = payload && typeof payload === "object" && "data" in payload && Array.isArray(payload.data)
          ? payload.data as Array<{ id?: unknown }>
          : [];
        if (!models.some((model) => model?.id === input.modelName)) {
          return { success: false, message: "连接成功，但当前 API Key 无法访问所选模型" };
        }
        return { success: true, message: "模型连接成功", modelVerified: true };
      }

      return {
        success: true,
        message: "连接成功"
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof ProviderAdapterException
            ? error.message
            : error instanceof Error && error.name === "AbortError"
              ? "连接超时"
              : "Base URL 无法访问"
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateText(input: ProviderTextInput): Promise<ProviderTextResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    const startedAt = Date.now();

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(`${input.gatewayBaseUrl}/v1/text/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scenarioSlug: input.scenarioSlug,
          baseUrl: input.baseUrl,
          apiKey,
          modelName: input.modelName,
          prompt: input.prompt,
          messages: [
            {
              role: "user",
              content: openAiCompatibleUserContent(input)
            }
          ],
          input: input.input,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          timeoutMs: input.timeoutMs,
          attachments: input.attachments,
          reasoningSwitchSupported: Boolean(input.reasoningSwitchSupported),
          reasoningEnabled: Boolean(input.reasoningEnabled),
          searchEnabled: Boolean(input.searchEnabled)
        }),
        signal: controller.signal
      });
      const responsePayload = (await response.json().catch(() => null)) as AiGatewayResponse | null;

      if (!response.ok) {
        const errorDetail = gatewayErrorDetail(responsePayload);

        throw new ProviderAdapterException(
          responsePayload?.errorCode ?? errorDetail.errorCode ?? `HTTP_${response.status}`,
          gatewayErrorMessage(responsePayload),
          errorDetail.providerStatusCode
        );
      }

      const text = textOutput(responsePayload);

      if (!text) {
        throw new ProviderAdapterException("EMPTY_OUTPUT", "AI Provider 返回内容为空");
      }

      return {
        text,
        usage: usageFromGateway(responsePayload),
        usageCredits: typeof responsePayload?.usageCredits === "number" ? responsePayload.usageCredits : undefined,
        provider: stringValue(responsePayload?.provider),
        model: stringValue(responsePayload?.model),
        requestId: responsePayload?.requestId ?? null,
        finishReason: responsePayload?.finishReason ?? null,
        errorCode: responsePayload?.errorCode ?? null,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof ProviderAdapterException) {
        throw error;
      }

      throw new ProviderAdapterException(
        error instanceof Error && error.name === "AbortError" ? "AI_GATEWAY_TIMEOUT" : "AI_GATEWAY_ERROR",
        "AI Gateway 调用失败"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async streamText(input: ProviderStreamInput): Promise<ProviderTextResult> {
    const startedAt = Date.now();
    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(`${input.gatewayBaseUrl}/v1/text/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          scenarioSlug: input.scenarioSlug,
          baseUrl: input.baseUrl,
          apiKey,
          modelName: input.modelName,
          prompt: input.prompt,
          messages: [
            {
              role: "user",
              content: openAiCompatibleUserContent(input)
            }
          ],
          input: input.input,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          timeoutMs: input.timeoutMs,
          attachments: input.attachments,
          reasoningSwitchSupported: Boolean(input.reasoningSwitchSupported),
          reasoningEnabled: Boolean(input.reasoningEnabled),
          searchEnabled: Boolean(input.searchEnabled)
        }),
        signal: input.signal
      });

      if (!response.ok || !response.body) {
        throw new ProviderAdapterException(`HTTP_${response.status}`, "AI Gateway 流式调用失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let reasoningContent = "";
      let donePayload: (AiGatewayResponse & { done?: boolean }) | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true
        });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part
            .split("\n")
            .find((item) => item.startsWith("data:"))
            ?.replace(/^data:\s*/, "");

          if (!line) {
            continue;
          }

          const payload = JSON.parse(line) as AiGatewayResponse & {
            done?: boolean;
          };

          if (typeof payload.errorMessage === "string" && payload.errorMessage) {
            throw new ProviderAdapterException(payload.errorCode ?? "STREAM_ERROR", payload.errorMessage);
          }

          const reasoningChunk = reasoningDeltaOutput(payload);
          const chunk = deltaOutput(payload);

          if (reasoningChunk) {
            reasoningContent += reasoningChunk;
            input.onReasoningDelta?.(reasoningChunk);
          }

          if (chunk) {
            text += chunk;
            input.onDelta(chunk);
          }

          if (payload.done) {
            donePayload = payload;
          }
        }
      }

      if (!text.trim()) {
        throw new ProviderAdapterException("EMPTY_OUTPUT", "AI Provider 返回内容为空");
      }

      return {
        text,
        reasoningContent,
        usage: usageFromGateway(donePayload),
        usageCredits: typeof donePayload?.usageCredits === "number" ? donePayload.usageCredits : undefined,
        provider: stringValue(donePayload?.provider),
        model: stringValue(donePayload?.model),
        requestId: donePayload?.requestId ?? null,
        finishReason: donePayload?.finishReason ?? null,
        errorCode: donePayload?.errorCode ?? null,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof ProviderAdapterException || (error instanceof Error && error.name === "AbortError")) {
        throw error;
      }

      throw new ProviderAdapterException("AI_GATEWAY_STREAM_ERROR", "AI Gateway 流式调用失败");
    }
  }

  async generateEmbedding(): Promise<ProviderEmbeddingResult> {
    throw unsupportedCapability("Embedding 生成");
  }

  async generateImage(): Promise<ProviderImageResult> {
    throw unsupportedCapability("图像生成");
  }

  calculateUsage(input: ProviderUsageInput) {
    return calculateUsageCredits(input);
  }
}

class ReservedProviderAdapter implements ProviderAdapter {
  constructor(readonly type: ProviderAdapterType) {}

  async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    void input;

    return {
      success: false,
      message: `${adapterName(this.type)} Adapter 已预留，暂未启用`
    };
  }

  async generateText(): Promise<ProviderTextResult> {
    throw reservedAdapter(this.type);
  }

  async streamText(): Promise<ProviderTextResult> {
    throw reservedAdapter(this.type);
  }

  async generateEmbedding(): Promise<ProviderEmbeddingResult> {
    throw reservedAdapter(this.type);
  }

  async generateImage(): Promise<ProviderImageResult> {
    throw reservedAdapter(this.type);
  }

  calculateUsage(input: ProviderUsageInput) {
    return calculateUsageCredits(input);
  }
}

class AnthropicProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("ANTHROPIC");
  }
}

class GeminiProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("GEMINI");
  }
}

class DashScopeAudioProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("DASHSCOPE_AUDIO");
  }

  override async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(`${normalizeBaseUrl(input.gatewayBaseUrl ?? "http://127.0.0.1:3323")}/audio/providers/dashscope/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          baseUrl: input.baseUrl,
          webSocketUrl: input.webSocketUrl,
          apiKey,
          region: input.region,
          model: input.modelName,
          timeoutMs: input.timeoutMs
        }),
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        detail?: {
          errorMessage?: string;
        };
      } | null;

      if (!response.ok) {
        return {
          success: false,
          message: payload?.detail?.errorMessage ?? "阿里云语音 Provider 连接失败"
        };
      }

      return {
        success: payload?.success !== false,
        message: typeof payload?.message === "string" && payload.message ? payload.message : "连接成功"
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof ProviderAdapterException
            ? error.message
            : error instanceof Error && error.name === "AbortError"
              ? "连接超时"
              : "AI Gateway 语音接口无法访问"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class MiniMaxAudioProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("MINIMAX_AUDIO");
  }

  override async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(`${normalizeBaseUrl(input.gatewayBaseUrl ?? "http://127.0.0.1:3323")}/audio/providers/minimax/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          baseUrl: input.baseUrl,
          webSocketUrl: input.webSocketUrl,
          apiKey,
          region: input.region,
          model: input.modelName,
          providerKey: "minimax_audio",
          adapterType: "MINIMAX_AUDIO",
          timeoutMs: input.timeoutMs
        }),
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        detail?: {
          errorMessage?: string;
        };
      } | null;

      if (!response.ok) {
        return {
          success: false,
          message: payload?.detail?.errorMessage ?? "MiniMax 语音 Provider 连接失败"
        };
      }

      return {
        success: payload?.success !== false,
        message: typeof payload?.message === "string" && payload.message ? payload.message : "连接成功"
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof ProviderAdapterException
            ? error.message
            : error instanceof Error && error.name === "AbortError"
              ? "连接超时"
              : "AI Gateway 语音接口无法访问"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class ElevenLabsAudioProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("ELEVENLABS_AUDIO");
  }

  override async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(
        `${normalizeBaseUrl(input.gatewayBaseUrl ?? "http://127.0.0.1:3323")}/audio/providers/elevenlabs/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            baseUrl: input.baseUrl,
            webSocketUrl: input.webSocketUrl,
            apiKey,
            region: input.region,
            model: input.modelName,
            providerKey: "elevenlabs_audio",
            adapterType: "ELEVENLABS_AUDIO",
            timeoutMs: input.timeoutMs
          }),
          signal: controller.signal
        }
      );
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        modelVerified?: boolean;
        detail?: {
          errorMessage?: string;
        };
      } | null;

      if (!response.ok) {
        return {
          success: false,
          message: payload?.detail?.errorMessage ?? "ElevenLabs 语音 Provider 连接失败"
        };
      }

      return {
        success: payload?.success !== false,
        message: typeof payload?.message === "string" && payload.message ? payload.message : "连接成功",
        ...(typeof payload?.modelVerified === "boolean" ? { modelVerified: payload.modelVerified } : {})
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof ProviderAdapterException
            ? error.message
            : error instanceof Error && error.name === "AbortError"
              ? "连接超时"
              : "AI Gateway ElevenLabs 语音接口无法访问"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class MiniMaxVideoProviderAdapter extends ReservedProviderAdapter {
  constructor() {
    super("MINIMAX_VIDEO");
  }

  override async testConnection(input: ProviderTestInput): Promise<ProviderTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const apiKey = decryptProviderApiKey(input.apiKeyEncrypted);
      const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v2/query/video_generation?page_num=1&page_size=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as {
        items?: unknown;
        total?: unknown;
        error?: {
          message?: unknown;
        };
      } | null;

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: "API Key 无效或当前服务器未加入访问白名单"
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          message: "MiniMax H3s 视频接口不存在，请检查 Base URL"
        };
      }

      if (!response.ok) {
        return {
          success: false,
          message:
            typeof payload?.error?.message === "string" && payload.error.message
              ? `MiniMax H3s 连接失败：${payload.error.message}`
              : `MiniMax H3s 服务返回异常（HTTP ${response.status}）`
        };
      }

      if (!payload || !Array.isArray(payload.items) || !Number.isFinite(Number(payload.total))) {
        return {
          success: false,
          message: "MiniMax H3s 服务返回格式不符合 V2 协议"
        };
      }

      const knownModels = payload.items
        .map((item) => {
          return item && typeof item === "object" && !Array.isArray(item)
            ? (item as { model?: unknown }).model
            : null;
        })
        .filter((model): model is string => typeof model === "string" && Boolean(model));

      if (knownModels.length > 0 && !knownModels.includes(input.modelName)) {
        return {
          success: false,
          message: `模型名称错误：当前服务任务记录使用 ${Array.from(new Set(knownModels)).join("、")}`
        };
      }

      return {
        success: true,
        message: "连接成功"
      };
    } catch (error) {
      return {
        success: false,
        message: isProviderRequestTimeout(error, controller.signal.aborted)
          ? "MiniMax H3s 视频服务连接超时，请检查服务器网络。"
          : "MiniMax H3s Base URL 无法访问"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class ProviderAdapterException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number | null = null
  ) {
    super(message);
  }
}

function decryptProviderApiKey(apiKeyEncrypted: string) {
  try {
    return decryptSecret(apiKeyEncrypted);
  } catch {
    throw new ProviderAdapterException(
      "PROVIDER_CREDENTIAL_DECRYPT_FAILED",
      "Provider API Key 无法解密，请恢复原 SECRET_ENCRYPTION_KEY，或在后台重新保存该 Provider 的 API Key。"
    );
  }
}

function reservedAdapter(type: ProviderAdapterType) {
  return new AppException(40001, `${adapterName(type)} Adapter 已预留，暂未接入生成流程`, HttpStatus.BAD_REQUEST);
}

function unsupportedCapability(name: string) {
  return new AppException(40001, `${name}暂未接入当前 Provider Adapter`, HttpStatus.BAD_REQUEST);
}

function adapterName(type: ProviderAdapterType) {
  const names: Record<ProviderAdapterType, string> = {
    OPENAI_COMPATIBLE: "OpenAI-compatible",
    CUSTOM_OPENAI_COMPATIBLE: "自定义 OpenAI-compatible",
    ANTHROPIC: "Anthropic",
    GEMINI: "Gemini",
    DASHSCOPE_AUDIO: "阿里云百炼语音",
    MINIMAX_AUDIO: "MiniMax 语音",
    ELEVENLABS_AUDIO: "ElevenLabs 语音",
    MINIMAX_VIDEO: "MiniMax 视频"
  };

  return names[type];
}

function providerTestMessage(status: number) {
  if (status === 401 || status === 403) {
    return "API Key 无效";
  }

  if (status === 404) {
    return "模型名称错误";
  }

  if (status >= 500) {
    return "Provider 返回错误";
  }

  return "连接失败，请检查 API Key 或 Base URL";
}

function usageFromGateway(payload: AiGatewayResponse | null): TokenUsage | undefined {
  if (!payload?.usage) {
    return undefined;
  }

  return {
    inputTokens: integerValue(payload.usage.inputTokens),
    outputTokens: integerValue(payload.usage.outputTokens),
    totalTokens: integerValue(payload.usage.totalTokens),
    inputCacheHitTokens: integerValue(payload.usage.inputCacheHitTokens),
    inputCacheMissTokens: integerValue(payload.usage.inputCacheMissTokens),
    inputCacheCreationTokens: integerValue(payload.usage.inputCacheCreationTokens),
    inputCacheMode: payload.usage.inputCacheMode === "EXPLICIT" ? "EXPLICIT" : "IMPLICIT"
  };
}

function textOutput(payload: AiGatewayResponse | null) {
  const value = payload?.output ?? payload?.text;

  return typeof value === "string" ? value.trim() : "";
}

function deltaOutput(payload: AiGatewayResponse | null) {
  const value = payload?.output ?? payload?.text;

  return typeof value === "string" ? value : "";
}

function reasoningDeltaOutput(payload: AiGatewayResponse | null) {
  const value = payload?.reasoningText ?? payload?.reasoningContent;

  return typeof value === "string" ? value : "";
}

function gatewayErrorMessage(payload: AiGatewayResponse | null) {
  if (typeof payload?.errorMessage === "string" && payload.errorMessage) {
    return normalizeGatewayErrorMessage(payload.errorMessage);
  }

  const detail = gatewayErrorDetail(payload);

  if (detail.errorMessage) {
    return normalizeGatewayErrorMessage(detail.errorMessage);
  }

  return "AI Provider 调用失败";
}

function gatewayErrorDetail(payload: AiGatewayResponse | null) {
  const detail = payload?.detail;

  if (typeof detail === "string") {
    return {
      errorCode: null,
      errorMessage: detail,
      providerStatusCode: null
    };
  }

  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return {
      errorCode: null,
      errorMessage: null,
      providerStatusCode: null
    };
  }

  const value = detail as Record<string, unknown>;

  return {
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
    providerStatusCode:
      typeof value.providerStatusCode === "number" && Number.isInteger(value.providerStatusCode)
        ? value.providerStatusCode
        : null
  };
}

function normalizeGatewayErrorMessage(message: string) {
  const normalized = message.trim();

  if (normalized === "Not Found") {
    return "AI Gateway 接口不存在，请检查 AI_GATEWAY_BASE_URL 是否指向本项目的 xueleai AI Gateway。";
  }

  return normalized;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function openAiCompatibleUserContent(input: ProviderTextInput) {
  const mediaParts = (input.attachments ?? []).flatMap((attachment): Array<
    | { type: "image_url"; image_url: { url: string } }
    | { type: "audio_url"; audio_url: { url: string } }
    | { type: "video_url"; video_url: { url: string } }
  > => {
    if (isInlineImageAttachment(attachment)) {
      return [{ type: "image_url", image_url: { url: attachment.dataUrl } }];
    }
    if (input.modelName === "Qwen2-Audio-7B-Instruct" && attachment.type === "audio" && attachment.dataUrl?.startsWith("data:audio/")) {
      return [{ type: "audio_url", audio_url: { url: attachment.dataUrl } }];
    }
    if (input.modelName === "Qwen3-VL-8B-Instruct" && attachment.type === "video" && attachment.dataUrl?.startsWith("data:video/")) {
      return [{ type: "video_url", video_url: { url: attachment.dataUrl } }];
    }
    return [];
  });

  if (mediaParts.length === 0) {
    return input.prompt;
  }

  return [
    {
      type: "text",
      text: input.prompt
    },
    ...mediaParts
  ];
}

function isInlineImageAttachment(
  attachment: ProviderTextAttachment
): attachment is ProviderTextAttachment & { dataUrl: string } {
  return (
    attachment.type === "image" &&
    attachment.mimeType.startsWith("image/") &&
    typeof attachment.dataUrl === "string" &&
    attachment.dataUrl.startsWith("data:image/")
  );
}
