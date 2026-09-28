from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from app.audio_gateway.providers.dashscope_audio_adapter import (
    DashScopeAudioAdapter,
    DashScopeAudioConfig,
    DashScopeAudioError,
)
from app.audio_gateway.providers.minimax_audio_adapter import (
    MiniMaxAudioAdapter,
    MiniMaxAudioConfig,
    MiniMaxAudioError,
)
from app.audio_gateway.providers.elevenlabs_audio_adapter import (
    ElevenLabsAudioAdapter,
    ElevenLabsAudioConfig,
    ElevenLabsAudioError,
)
from app.audio_gateway.providers.abeiai_audio_adapter import (
    AbeiaiAudioAdapter,
    AbeiaiAudioConfig,
    AbeiaiAudioError,
)

app = FastAPI(title="AI SaaS AI Gateway", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "ai-gateway", "status": "ok"}


@app.get("/audio/health")
def audio_health() -> dict[str, str]:
    return {"service": "ai-gateway", "module": "audio", "status": "ok"}


class ChatMessage(BaseModel):
    role: str = Field(min_length=1, max_length=30)
    content: str | list[dict[str, Any]]


class TextAttachment(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=30)
    mimeType: str = Field(min_length=1, max_length=120)
    size: int = Field(default=0, ge=0, le=10 * 1024 * 1024)
    dataUrl: str | None = Field(default=None, max_length=15 * 1024 * 1024)


class Usage(BaseModel):
    inputTokens: int | None = None
    outputTokens: int | None = None
    totalTokens: int | None = None
    inputCacheHitTokens: int | None = None
    inputCacheMissTokens: int | None = None
    inputCacheCreationTokens: int | None = None
    inputCacheMode: str | None = None


TEXT_PROMPT_MAX_LENGTH = 320_000
TEXT_MAX_OUTPUT_TOKENS = 128_000
TEXT_DEFAULT_OUTPUT_TOKENS = 16_000


class TextGenerateRequest(BaseModel):
    scenarioSlug: str | None = None
    baseUrl: str | None = None
    apiKey: str | None = None
    modelName: str | None = None
    messages: list[ChatMessage] | None = None
    prompt: str = Field(min_length=1, max_length=TEXT_PROMPT_MAX_LENGTH)
    input: str = Field(min_length=1, max_length=2000)
    temperature: float = 0.7
    maxTokens: int = Field(default=TEXT_DEFAULT_OUTPUT_TOKENS, ge=1, le=TEXT_MAX_OUTPUT_TOKENS)
    timeoutMs: int = Field(default=45000, ge=1000, le=180000)
    attachments: list[TextAttachment] | None = None
    reasoningSwitchSupported: bool = False
    reasoningEnabled: bool = False
    searchEnabled: bool = False


class TextGenerateResponse(BaseModel):
    output: str
    text: str
    usage: Usage | None = None
    usageCredits: int | None = None
    provider: str
    model: str
    finishReason: str | None = None
    errorCode: str | None = None
    requestId: str | None = None
    latencyMs: int


class DashScopeAudioProviderConfig(BaseModel):
    baseUrl: str = Field(min_length=1, max_length=400)
    webSocketUrl: str | None = Field(default=None, max_length=400)
    apiKey: str = Field(min_length=1, max_length=4000)
    region: str | None = Field(default=None, max_length=40)
    providerKey: str | None = Field(default=None, max_length=80)
    adapterType: str | None = Field(default=None, max_length=80)
    timeoutMs: int = Field(default=45000, ge=1000, le=600000)


class DashScopeAudioTestRequest(DashScopeAudioProviderConfig):
    model: str = Field(min_length=1, max_length=120)


class DashScopeCloneVoiceRequest(DashScopeAudioProviderConfig):
    targetModel: str = Field(min_length=1, max_length=120)
    sourceAudioUrl: str = Field(min_length=1, max_length=1000)
    name: str = Field(min_length=1, max_length=80)
    prefix: str | None = Field(default=None, max_length=24)


class DashScopeDesignVoiceRequest(DashScopeAudioProviderConfig):
    targetModel: str = Field(min_length=1, max_length=120)
    voicePrompt: str = Field(min_length=1, max_length=500)
    name: str = Field(min_length=1, max_length=80)
    previewText: str | None = Field(default=None, max_length=300)


class DashScopeVoiceRequest(DashScopeAudioProviderConfig):
    providerVoiceId: str = Field(min_length=1, max_length=160)


class DashScopeTtsRequest(DashScopeAudioProviderConfig):
    model: str = Field(min_length=1, max_length=120)
    voice: str = Field(min_length=1, max_length=160)
    text: str = Field(min_length=1, max_length=8000)
    format: str = Field(default="mp3", min_length=2, max_length=12)
    sampleRate: int | None = Field(default=None, ge=8000, le=48000)
    speed: float | None = Field(default=None, ge=0.5, le=2)
    pitch: float | None = Field(default=None, ge=-500, le=500)
    volume: float | None = Field(default=None, ge=0, le=2)


class DashScopeAsrRequest(DashScopeAudioProviderConfig):
    model: str = Field(min_length=1, max_length=120)
    mediaUrl: str = Field(min_length=1, max_length=1000)
    mediaMimeType: str | None = Field(default=None, max_length=120)
    mediaName: str | None = Field(default=None, max_length=240)
    language: str | None = Field(default="auto", max_length=24)
    format: str = Field(default="srt", min_length=3, max_length=12)


class DashScopeAsrTaskRequest(DashScopeAudioProviderConfig):
    model: str = Field(min_length=1, max_length=120)
    taskId: str = Field(min_length=1, max_length=240)
    mediaMimeType: str | None = Field(default=None, max_length=120)
    mediaName: str | None = Field(default=None, max_length=240)
    format: str = Field(default="srt", min_length=3, max_length=12)


@app.post("/v1/text/generate")
def generate_text(payload: TextGenerateRequest) -> TextGenerateResponse:
    if not payload.baseUrl or not payload.apiKey or not payload.modelName:
        return mock_generate(payload)

    started_at = time.monotonic()
    response, request_id = call_openai_compatible(payload)
    output = extract_output(response)

    if not output:
        raise provider_error("EMPTY_OUTPUT", "AI Provider 返回内容为空")

    raw_usage = response.get("usage")
    usage: dict[str, Any] = raw_usage if isinstance(raw_usage, dict) else {}
    finish_reason = extract_finish_reason(response)

    return TextGenerateResponse(
        output=output,
        text=output,
        usage=usage_from_provider(usage),
        usageCredits=None,
        provider=provider_name(payload.baseUrl),
        model=payload.modelName,
        finishReason=finish_reason,
        errorCode=None,
        requestId=request_id,
        latencyMs=round((time.monotonic() - started_at) * 1000),
    )


@app.post("/v1/text/stream")
def stream_text(payload: TextGenerateRequest) -> StreamingResponse:
    def event_stream():
        try:
            if not payload.baseUrl or not payload.apiKey or not payload.modelName:
                yield from stream_mock_text(payload)
            else:
                yield from stream_openai_compatible(payload)
        except HTTPException as error:
            detail = error.detail if isinstance(error.detail, dict) else {}
            yield sse_event(
                {
                    "done": True,
                    "errorCode": detail.get("errorCode") or "STREAM_FAILED",
                    "errorMessage": detail.get("errorMessage") or "AI 流式生成失败",
                }
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/audio/providers/dashscope/test")
def test_dashscope_audio(payload: DashScopeAudioTestRequest) -> dict[str, Any]:
    try:
        return dashscope_audio_adapter(payload).test_connection(payload.model)
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/providers/minimax/test")
def test_minimax_audio(payload: DashScopeAudioTestRequest) -> dict[str, Any]:
    try:
        return minimax_audio_adapter(payload).test_connection(payload.model)
    except MiniMaxAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/providers/elevenlabs/test")
def test_elevenlabs_audio(payload: DashScopeAudioTestRequest) -> dict[str, Any]:
    try:
        return elevenlabs_audio_adapter(payload).test_connection(payload.model)
    except ElevenLabsAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/providers/elevenlabs/voices/defaults")
def list_elevenlabs_default_voices(payload: DashScopeAudioTestRequest) -> dict[str, Any]:
    try:
        return {
            "provider": "elevenlabs_audio",
            "voices": elevenlabs_audio_adapter(payload).list_default_voices(),
        }
    except ElevenLabsAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/voices/clone")
def clone_voice(payload: DashScopeCloneVoiceRequest) -> dict[str, Any]:
    try:
        return dashscope_audio_adapter(payload).create_cloned_voice(
            target_model=payload.targetModel,
            source_audio_url=payload.sourceAudioUrl,
            name=payload.name,
            prefix=payload.prefix,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/voices/design")
def design_voice(payload: DashScopeDesignVoiceRequest) -> dict[str, Any]:
    try:
        if is_minimax_audio(payload):
            return minimax_audio_adapter(payload).create_designed_voice(
                target_model=payload.targetModel,
                voice_prompt=payload.voicePrompt,
                name=payload.name,
                preview_text=payload.previewText,
            )

        return dashscope_audio_adapter(payload).create_designed_voice(
            target_model=payload.targetModel,
            voice_prompt=payload.voicePrompt,
            name=payload.name,
            preview_text=payload.previewText,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error
    except MiniMaxAudioError as error:
        raise audio_provider_error(error) from error


@app.get("/audio/voices/{provider_voice_id}")
def query_voice(
    provider_voice_id: str,
    base_url: str = Header(alias="X-DashScope-Base-Url"),
    api_key: str = Header(alias="X-DashScope-Api-Key"),
    web_socket_url: str | None = Header(default=None, alias="X-DashScope-WebSocket-Url"),
    region: str | None = Header(default=None, alias="X-DashScope-Region"),
    timeout_ms: int = Header(default=45000, alias="X-DashScope-Timeout-Ms"),
) -> dict[str, Any]:
    try:
        payload = DashScopeVoiceRequest(
            providerVoiceId=provider_voice_id,
            baseUrl=base_url,
            apiKey=api_key,
            webSocketUrl=web_socket_url,
            region=region,
            timeoutMs=timeout_ms,
        )
        return dashscope_audio_adapter(payload).query_voice(provider_voice_id)
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.delete("/audio/voices/{provider_voice_id}")
def delete_voice(
    provider_voice_id: str,
    base_url: str = Header(alias="X-DashScope-Base-Url"),
    api_key: str = Header(alias="X-DashScope-Api-Key"),
    web_socket_url: str | None = Header(default=None, alias="X-DashScope-WebSocket-Url"),
    region: str | None = Header(default=None, alias="X-DashScope-Region"),
    timeout_ms: int = Header(default=45000, alias="X-DashScope-Timeout-Ms"),
) -> dict[str, Any]:
    try:
        payload = DashScopeVoiceRequest(
            providerVoiceId=provider_voice_id,
            baseUrl=base_url,
            apiKey=api_key,
            webSocketUrl=web_socket_url,
            region=region,
            timeoutMs=timeout_ms,
        )
        return dashscope_audio_adapter(payload).delete_voice(provider_voice_id)
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/tts")
def synthesize_speech(payload: DashScopeTtsRequest) -> dict[str, Any]:
    try:
        if is_abeiai_audio(payload):
            return abeiai_audio_adapter(payload).synthesize_speech(
                model=payload.model,
                voice=payload.voice,
                text=payload.text,
            )

        if is_elevenlabs_audio(payload):
            return elevenlabs_audio_adapter(payload).synthesize_speech(
                model=payload.model,
                voice=payload.voice,
                text=payload.text,
                format=payload.format,
                sample_rate=payload.sampleRate,
                speed=payload.speed,
                pitch=payload.pitch,
                volume=payload.volume,
            )

        if is_minimax_audio(payload):
            return minimax_audio_adapter(payload).synthesize_speech(
                model=payload.model,
                voice=payload.voice,
                text=payload.text,
                format=payload.format,
                sample_rate=payload.sampleRate,
                speed=payload.speed,
                pitch=payload.pitch,
                volume=payload.volume,
            )

        return dashscope_audio_adapter(payload).synthesize_speech(
            model=payload.model,
            voice=payload.voice,
            text=payload.text,
            format=payload.format,
            sample_rate=payload.sampleRate,
            speed=payload.speed,
            pitch=payload.pitch,
            volume=payload.volume,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error
    except MiniMaxAudioError as error:
        raise audio_provider_error(error) from error
    except ElevenLabsAudioError as error:
        raise audio_provider_error(error) from error
    except AbeiaiAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/asr")
def transcribe_audio(payload: DashScopeAsrRequest) -> dict[str, Any]:
    try:
        return dashscope_audio_adapter(payload).transcribe_audio(
            model=payload.model,
            media_url=payload.mediaUrl,
            media_mime_type=payload.mediaMimeType,
            media_name=payload.mediaName,
            language=payload.language,
            format=payload.format,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/asr/tasks")
def submit_transcription(payload: DashScopeAsrRequest) -> dict[str, Any]:
    try:
        return dashscope_audio_adapter(payload).submit_transcription(
            model=payload.model,
            media_url=payload.mediaUrl,
            media_mime_type=payload.mediaMimeType,
            media_name=payload.mediaName,
            language=payload.language,
            format=payload.format,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


@app.post("/audio/asr/tasks/query")
def query_transcription(payload: DashScopeAsrTaskRequest) -> dict[str, Any]:
    try:
        return dashscope_audio_adapter(payload).query_transcription_task(
            task_id=payload.taskId,
            model=payload.model,
            media_mime_type=payload.mediaMimeType,
            media_name=payload.mediaName,
            format=payload.format,
        )
    except DashScopeAudioError as error:
        raise audio_provider_error(error) from error


def call_openai_compatible(payload: TextGenerateRequest) -> tuple[dict[str, Any], str | None]:
    endpoint = chat_completions_url(payload.baseUrl or "")
    request_body = openai_compatible_request_body(payload)
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {payload.apiKey}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds(payload)) as response:
            body = response.read().decode("utf-8")
            request_id = response.headers.get("x-request-id") or response.headers.get("x-request-id".title())
    except urllib.error.HTTPError as error:
        detail = safe_json(error.read().decode("utf-8", errors="ignore"))
        raise provider_error(
            provider_error_code(detail, error.code),
            provider_error_message(detail, error.code),
            error.code,
        ) from error
    except TimeoutError as error:
        raise provider_error("PROVIDER_TIMEOUT", "AI Provider 请求超时") from error
    except OSError as error:
        raise provider_error("PROVIDER_NETWORK_ERROR", "AI Provider 网络请求失败") from error

    parsed = safe_json(body)

    if not isinstance(parsed, dict):
        raise provider_error("INVALID_PROVIDER_RESPONSE", "AI Provider 返回格式不正确")

    return parsed, request_id


def stream_openai_compatible(payload: TextGenerateRequest):
    endpoint = chat_completions_url(payload.baseUrl or "")
    request_body = openai_compatible_request_body(payload, stream=True)
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {payload.apiKey}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    raw_usage: dict[str, Any] = {}
    text_parts: list[str] = []
    finish_reason: str | None = None
    request_id: str | None = None

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds(payload)) as response:
            request_id = response.headers.get("x-request-id") or response.headers.get("x-request-id".title())

            for raw_line in response:
                line = raw_line.decode("utf-8", errors="ignore").strip()

                if not line or not line.startswith("data:"):
                    continue

                data = line.removeprefix("data:").strip()

                if data == "[DONE]":
                    break

                parsed = safe_json(data)

                if not isinstance(parsed, dict):
                    continue

                chunk_usage = parsed.get("usage")

                if isinstance(chunk_usage, dict):
                    raw_usage = chunk_usage

                chunk_finish_reason = extract_finish_reason(parsed)

                if chunk_finish_reason:
                    finish_reason = chunk_finish_reason

                reasoning_text = extract_stream_reasoning_delta(parsed)
                text = extract_stream_delta(parsed)

                if reasoning_text:
                    yield sse_event({"reasoningText": reasoning_text, "done": False})

                if not text:
                    continue

                text_parts.append(text)
                yield sse_event({"text": text, "done": False})
    except urllib.error.HTTPError as error:
        detail = safe_json(error.read().decode("utf-8", errors="ignore"))
        raise provider_error(
            provider_error_code(detail, error.code),
            provider_error_message(detail, error.code),
            error.code,
        ) from error
    except TimeoutError as error:
        raise provider_error("PROVIDER_TIMEOUT", "AI Provider 请求超时") from error
    except OSError as error:
        raise provider_error("PROVIDER_NETWORK_ERROR", "AI Provider 网络请求失败") from error

    if not "".join(text_parts).strip():
        raise provider_error("EMPTY_OUTPUT", "AI Provider 返回内容为空")

    yield sse_event(
        {
            "text": "",
            "done": True,
            "usage": usage_to_dict(usage_from_provider(raw_usage)),
            "usageCredits": None,
            "provider": provider_name(payload.baseUrl or ""),
            "model": payload.modelName,
            "finishReason": finish_reason,
            "requestId": request_id,
        }
    )


def stream_mock_text(payload: TextGenerateRequest):
    result = mock_generate(payload)

    for index in range(0, len(result.text), 8):
        chunk = result.text[index : index + 8]
        yield sse_event({"text": chunk, "done": False})
        time.sleep(0.01)

    yield sse_event(
        {
            "text": "",
            "done": True,
            "usage": usage_to_dict(result.usage) if result.usage else None,
            "usageCredits": result.usageCredits,
            "provider": result.provider,
            "model": result.model,
            "finishReason": result.finishReason,
            "requestId": result.requestId,
        }
    )


def openai_compatible_request_body(payload: TextGenerateRequest, stream: bool = False) -> dict[str, Any]:
    request_body: dict[str, Any] = {
        "model": payload.modelName,
        "messages": openai_compatible_messages(payload),
        "temperature": payload.temperature,
        "max_tokens": max(payload.maxTokens, 3000) if payload.modelName == "Qwen3.5-122B-A10B-FP8" else payload.maxTokens,
    }

    if stream:
        request_body["stream"] = True
        request_body["stream_options"] = {"include_usage": True}

    if should_send_qwen_thinking_switch(payload):
        request_body["enable_thinking"] = bool(payload.reasoningEnabled)

    return request_body


def openai_compatible_messages(payload: TextGenerateRequest) -> list[dict[str, Any]]:
    if payload.messages:
        return [chat_message_to_dict(message) for message in payload.messages]

    content_parts: list[dict[str, Any]] = [{"type": "text", "text": payload.prompt}]

    for attachment in payload.attachments or []:
        if is_inline_image_attachment(attachment):
            content_parts.append({"type": "image_url", "image_url": {"url": attachment.dataUrl}})
        elif payload.modelName == "Qwen2-Audio-7B-Instruct" and attachment.type == "audio" and attachment.dataUrl and attachment.dataUrl.startswith("data:audio/"):
            content_parts.append({"type": "audio_url", "audio_url": {"url": attachment.dataUrl}})
        elif payload.modelName == "Qwen3-VL-8B-Instruct" and attachment.type == "video" and attachment.dataUrl and attachment.dataUrl.startswith("data:video/"):
            content_parts.append({"type": "video_url", "video_url": {"url": attachment.dataUrl}})

    if len(content_parts) == 1:
        return [{"role": "user", "content": payload.prompt}]

    return [{"role": "user", "content": content_parts}]


def chat_message_to_dict(message: ChatMessage) -> dict[str, Any]:
    if hasattr(message, "model_dump"):
        return message.model_dump()

    return message.dict()


def is_inline_image_attachment(attachment: TextAttachment) -> bool:
    return (
        attachment.type == "image"
        and attachment.mimeType.startswith("image/")
        and isinstance(attachment.dataUrl, str)
        and attachment.dataUrl.startswith("data:image/")
    )


def usage_to_dict(usage: Usage | None) -> dict[str, int | None] | None:
    if usage is None:
        return None

    if hasattr(usage, "model_dump"):
        return usage.model_dump()

    return usage.dict()


def timeout_seconds(payload: TextGenerateRequest) -> int:
    return max(1, min(round(payload.timeoutMs / 1000), 180))


def mock_generate(payload: TextGenerateRequest) -> TextGenerateResponse:
    user_input = payload.input.strip()

    if "触发失败" in user_input or "fail" in user_input.lower():
        raise provider_error("MOCK_FAILED", "模拟生成失败")

    usage_credits = min(120, max(20, len(user_input) // 6 + 28))
    text = "\n".join(
        [
            f"主题：{user_input}",
            "",
            "这是一版面向简体中文用户的运营文案草稿，适合用于工具站首页、活动页或内容导流入口。",
            "",
            "推荐文案：",
            f"用「{user_input}」帮助用户更快完成内容构思、结构整理和表达优化。",
            "先强调具体场景，再说明能节省的时间和降低的操作门槛，最后引导用户进入工具体验。",
        ]
    )

    return TextGenerateResponse(
        output=text,
        text=text,
        usage=None,
        usageCredits=usage_credits,
        provider="mock",
        model="mock-copywriting",
        finishReason="stop",
        errorCode=None,
        requestId=None,
        latencyMs=0,
    )


def chat_completions_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")

    if normalized.endswith("/chat/completions"):
        return normalized

    return f"{normalized}/chat/completions"


def extract_output(response: dict[str, Any]) -> str:
    choices = response.get("choices")

    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]

    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")

    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"].strip()

    if isinstance(first_choice.get("text"), str):
        return first_choice["text"].strip()

    return ""


def extract_finish_reason(response: dict[str, Any]) -> str | None:
    choices = response.get("choices")

    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        finish_reason = choices[0].get("finish_reason")
        return finish_reason if isinstance(finish_reason, str) else None

    return None


def extract_stream_delta(response: dict[str, Any]) -> str:
    choices = response.get("choices")

    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""

    first_choice = choices[0]
    delta = first_choice.get("delta")

    if isinstance(delta, dict):
        content = delta.get("content")

        if isinstance(content, str):
            return content

        if isinstance(content, list):
            return "".join(part.get("text", "") for part in content if isinstance(part, dict))

    message = first_choice.get("message")

    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"]

    if isinstance(first_choice.get("text"), str):
        return first_choice["text"]

    return ""


def extract_stream_reasoning_delta(response: dict[str, Any]) -> str:
    choices = response.get("choices")

    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""

    first_choice = choices[0]
    delta = first_choice.get("delta")

    if isinstance(delta, dict):
        for key in ("reasoning_content", "reasoning", "reasoning_text"):
            value = delta.get(key)

            if isinstance(value, str):
                return value

    message = first_choice.get("message")

    if isinstance(message, dict):
        value = message.get("reasoning_content")

        if isinstance(value, str):
            return value

    return ""


def should_send_qwen_thinking_switch(payload: TextGenerateRequest) -> bool:
    model_name = (payload.modelName or "").lower()
    base_url = (payload.baseUrl or "").lower()

    if not payload.reasoningSwitchSupported:
        return False

    return model_name.startswith("qwen") or "dashscope.aliyuncs.com" in base_url


def usage_from_provider(usage: dict[str, Any]) -> Usage:
    input_tokens = usage.get("prompt_tokens", usage.get("input_tokens"))
    output_tokens = usage.get("completion_tokens", usage.get("output_tokens"))
    total_tokens = usage.get("total_tokens")
    raw_details = usage.get("prompt_tokens_details", usage.get("input_tokens_details"))
    details = raw_details if isinstance(raw_details, dict) else {}
    raw_cache_creation = details.get("cache_creation")
    cache_creation = raw_cache_creation if isinstance(raw_cache_creation, dict) else {}
    has_explicit_cache = (
        details.get("cache_type") == "ephemeral"
        or "cache_creation_input_tokens" in details
        or "cache_creation_input_tokens" in usage
        or bool(cache_creation)
    )

    return Usage(
        inputTokens=int_value(input_tokens),
        outputTokens=int_value(output_tokens),
        totalTokens=int_value(total_tokens),
        inputCacheHitTokens=int_value(
            details.get(
                "cached_tokens",
                usage.get("prompt_cache_hit_tokens", usage.get("input_cache_hit_tokens")),
            )
        ),
        inputCacheMissTokens=int_value(usage.get("prompt_cache_miss_tokens", usage.get("input_cache_miss_tokens"))),
        inputCacheCreationTokens=int_value(
            details.get(
                "cache_creation_input_tokens",
                cache_creation.get(
                    "ephemeral_5m_input_tokens",
                    usage.get("cache_creation_input_tokens"),
                ),
            )
        ),
        inputCacheMode="EXPLICIT" if has_explicit_cache else "IMPLICIT",
    )


def safe_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def provider_error_code(detail: Any, status_code: int) -> str:
    if isinstance(detail, dict):
        if isinstance(detail.get("code"), str):
            return detail["code"]

        error = detail.get("error")
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            return error["code"]

    return f"PROVIDER_HTTP_{status_code}"


def provider_error_message(detail: Any, status_code: int) -> str:
    if isinstance(detail, dict):
        if isinstance(detail.get("message"), str):
            return detail["message"]

        error = detail.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]

    return f"AI Provider 请求失败：HTTP {status_code}"


def provider_error(error_code: str, message: str, provider_status_code: int | None = None) -> HTTPException:
    detail = {
        "errorCode": error_code,
        "errorMessage": message,
    }

    if provider_status_code is not None:
        detail["providerStatusCode"] = provider_status_code

    return HTTPException(
        status_code=502,
        detail=detail,
    )


def audio_provider_error(error: DashScopeAudioError | MiniMaxAudioError | ElevenLabsAudioError | AbeiaiAudioError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail={
            "errorCode": error.error_code,
            "errorMessage": error.message,
            "terminal": error.terminal,
        },
    )


def is_minimax_audio(payload: DashScopeAudioProviderConfig) -> bool:
    adapter_type = (payload.adapterType or "").strip().upper()
    provider_key = (payload.providerKey or "").strip().lower()

    return adapter_type == "MINIMAX_AUDIO" or provider_key == "minimax_audio"


def is_elevenlabs_audio(payload: DashScopeAudioProviderConfig) -> bool:
    adapter_type = (payload.adapterType or "").strip().upper()
    provider_key = (payload.providerKey or "").strip().lower()

    return adapter_type == "ELEVENLABS_AUDIO" or provider_key == "elevenlabs_audio"


def is_abeiai_audio(payload: DashScopeAudioProviderConfig) -> bool:
    return (payload.providerKey or "").strip().lower() == "abeiai_audio"


def abeiai_audio_adapter(payload: DashScopeAudioProviderConfig) -> AbeiaiAudioAdapter:
    return AbeiaiAudioAdapter(
        AbeiaiAudioConfig(
            base_url=payload.baseUrl,
            api_key=payload.apiKey,
            timeout_seconds=max(1, round(payload.timeoutMs / 1000)),
        )
    )


def dashscope_audio_adapter(payload: DashScopeAudioProviderConfig) -> DashScopeAudioAdapter:
    return DashScopeAudioAdapter(
        DashScopeAudioConfig(
            base_url=payload.baseUrl,
            web_socket_url=payload.webSocketUrl,
            api_key=payload.apiKey,
            region=payload.region,
            timeout_seconds=max(1, round(payload.timeoutMs / 1000)),
        )
    )


def minimax_audio_adapter(payload: DashScopeAudioProviderConfig) -> MiniMaxAudioAdapter:
    return MiniMaxAudioAdapter(
        MiniMaxAudioConfig(
            base_url=payload.baseUrl,
            api_key=payload.apiKey,
            timeout_seconds=max(1, round(payload.timeoutMs / 1000)),
        )
    )


def elevenlabs_audio_adapter(payload: DashScopeAudioProviderConfig) -> ElevenLabsAudioAdapter:
    return ElevenLabsAudioAdapter(
        ElevenLabsAudioConfig(
            base_url=payload.baseUrl,
            api_key=payload.apiKey,
            timeout_seconds=max(1, round(payload.timeoutMs / 1000)),
        )
    )


def sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def provider_name(base_url: str) -> str:
    normalized = base_url.replace("https://", "").replace("http://", "").strip("/")
    return normalized.split("/")[0] or "openai-compatible"


def int_value(value: Any) -> int | None:
    return int(value) if isinstance(value, (int, float)) and value > 0 else None
