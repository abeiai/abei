from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class MiniMaxAudioError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 502, terminal: bool = False):
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.terminal = terminal


@dataclass(frozen=True)
class MiniMaxAudioConfig:
    base_url: str
    api_key: str
    timeout_seconds: int = 45


class MiniMaxAudioAdapter:
    def __init__(self, config: MiniMaxAudioConfig):
        self.config = config

    def test_connection(self, model: str) -> dict[str, Any]:
        if not self.config.api_key.strip():
            raise MiniMaxAudioError("MINIMAX_API_KEY_MISSING", "MINIMAX_API_KEY 未配置", 400)

        request_model = model if model.startswith("speech-2.8-") else "speech-2.8-turbo"
        self.synthesize_speech(
            model=request_model,
            voice="male-qn-qingse",
            text="连接测试",
            format="mp3",
            sample_rate=32000,
        )

        return {
            "success": True,
            "message": "连接成功",
            "provider": "minimax_audio",
            "model": model,
        }

    def create_designed_voice(
        self,
        *,
        target_model: str,
        voice_prompt: str,
        name: str,
        preview_text: str | None = None,
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        payload = {
            "prompt": voice_prompt,
            "preview_text": preview_text or default_preview_text(name),
        }
        response = self._post_json("/v1/voice_design", payload)
        voice_id = string_field(response, "voice_id")
        audio_hex = string_field(response, "trial_audio")
        audio_base64 = base64_from_hex(audio_hex)

        if not voice_id:
            raise MiniMaxAudioError("MINIMAX_VOICE_ID_MISSING", "MiniMax 音色设计未返回音色 ID")

        output: dict[str, Any] = {
            "voice_id": voice_id,
        }

        if audio_base64:
            output["preview_audio"] = {
                "data": audio_base64,
                "encoding": "base64",
                "sourceEncoding": "hex",
            }

        return {
            "provider": "minimax_audio",
            "model": target_model,
            "providerVoiceId": voice_id,
            "voice_id": voice_id,
            "audioBase64": audio_base64,
            "audioMimeType": "audio/mpeg",
            "output": output,
            "usage": {
                "inputCharacters": len(voice_prompt) + len(payload["preview_text"]),
            },
            "requestId": request_id_from_response(response),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
            "raw": response,
        }

    def synthesize_speech(
        self,
        *,
        model: str,
        voice: str,
        text: str,
        format: str = "mp3",
        sample_rate: int | None = None,
        speed: float | None = None,
        pitch: float | None = None,
        volume: float | None = None,
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        payload: dict[str, Any] = {
            "model": model,
            "text": text,
            "stream": False,
            "voice_setting": {
                "voice_id": voice,
                "speed": speed if speed is not None else 1,
                "vol": volume if volume is not None else 1,
                "pitch": round(pitch / 100) if pitch is not None else 0,
            },
            "audio_setting": {
                "sample_rate": sample_rate or 32000,
                "bitrate": 128000,
                "format": format,
                "channel": 1,
            },
            "output_format": "hex",
        }
        response = self._post_json("/v1/t2a_v2", payload)
        data = response.get("data") if isinstance(response.get("data"), dict) else {}
        audio_hex = (
            string_field(data, "audio")
            or string_field(data, "audio_hex")
            or string_field(response, "audio")
            or string_field(response, "audio_hex")
        )
        audio_url = string_field(data, "audio_url") or string_field(data, "url") or string_field(response, "audio_url")
        audio_base64 = base64_from_hex(audio_hex)
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}

        return {
            "provider": "minimax_audio",
            "model": model,
            "voice": voice,
            "audioUrl": audio_url,
            "audioBase64": audio_base64,
            "audioMimeType": {
                "wav": "audio/wav",
                "opus": "audio/ogg",
                "flac": "audio/flac",
            }.get(format.lower(), "audio/mpeg"),
            "usage": {
                "inputCharacters": len(text),
                "providerUsage": usage,
            },
            "requestId": request_id_from_response(response),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
            "raw": response,
        }

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        endpoint = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                parsed = safe_json(response.read().decode("utf-8", errors="ignore"))
                if not isinstance(parsed, dict):
                    raise MiniMaxAudioError("INVALID_PROVIDER_RESPONSE", "MiniMax 语音接口返回格式不正确")

                trace_id = response.headers.get("Trace-Id") or response.headers.get("trace-id")
                if trace_id and "trace_id" not in parsed:
                    parsed["trace_id"] = trace_id
                raise_for_minimax_base_response(parsed)
                return parsed
        except urllib.error.HTTPError as error:
            detail = safe_json(error.read().decode("utf-8", errors="ignore"))
            raise MiniMaxAudioError(
                provider_error_code(detail, error.code),
                provider_error_message(detail, error.code),
                error.code,
            ) from error
        except TimeoutError as error:
            raise MiniMaxAudioError("PROVIDER_TIMEOUT", "MiniMax 语音接口请求超时") from error
        except OSError as error:
            raise MiniMaxAudioError("PROVIDER_NETWORK_ERROR", "MiniMax 语音接口网络请求失败") from error


def default_preview_text(name: str) -> str:
    return f"这是一段用于试听{name}音色效果的示例文本。"


def base64_from_hex(value: str | None) -> str | None:
    if not value:
        return None

    try:
        return base64.b64encode(bytes.fromhex(value)).decode("ascii")
    except ValueError:
        return value


def raise_for_minimax_base_response(response: dict[str, Any]) -> None:
    base_resp = response.get("base_resp") if isinstance(response.get("base_resp"), dict) else None
    status_code = int_value(base_resp.get("status_code")) if base_resp else 0

    if status_code == 0:
        return

    message = string_field(base_resp, "status_msg") if base_resp else None
    raise MiniMaxAudioError(
        f"MINIMAX_STATUS_{status_code}",
        message or "MiniMax 语音接口返回失败",
        minimax_status_http_code(status_code),
    )


def minimax_status_http_code(status_code: int) -> int:
    if status_code in {1001, 1002, 1004}:
        return 401
    if status_code in {1008, 2013, 2049}:
        return 400
    if status_code in {1007, 1027}:
        return 429
    return 502


def safe_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def string_field(value: dict[str, Any], key: str) -> str | None:
    field_value = value.get(key)

    return field_value.strip() if isinstance(field_value, str) and field_value.strip() else None


def int_value(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value)
    if isinstance(value, str):
        try:
            return round(float(value))
        except ValueError:
            return 0
    return 0


def request_id_from_response(value: dict[str, Any]) -> str | None:
    request_id = value.get("trace_id") or value.get("request_id") or value.get("requestId")
    return request_id if isinstance(request_id, str) and request_id.strip() else None


def provider_error_code(detail: Any, status_code: int) -> str:
    if isinstance(detail, dict):
        base_resp = detail.get("base_resp")
        if isinstance(base_resp, dict):
            code = base_resp.get("status_code")
            if code is not None:
                return f"MINIMAX_STATUS_{code}"

        code = detail.get("code") or detail.get("error_code")
        if isinstance(code, str):
            return code

    if status_code in (401, 403):
        return "MINIMAX_AUTH_FAILED"
    if status_code == 404:
        return "MINIMAX_RESOURCE_NOT_FOUND"
    return f"MINIMAX_HTTP_{status_code}"


def provider_error_message(detail: Any, status_code: int) -> str:
    if status_code in (401, 403):
        return "MINIMAX_API_KEY 无效或权限不足"

    if isinstance(detail, dict):
        base_resp = detail.get("base_resp")
        if isinstance(base_resp, dict):
            message = base_resp.get("status_msg")
            if isinstance(message, str) and message.strip():
                return message.strip()

        message = detail.get("message") or detail.get("error_message")
        if isinstance(message, str) and message.strip():
            return message.strip()

    if status_code == 404:
        return "MiniMax 语音资源不存在"
    return f"MiniMax 语音接口请求失败：HTTP {status_code}"
