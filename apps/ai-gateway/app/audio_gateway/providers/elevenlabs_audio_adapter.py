from __future__ import annotations

import base64
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass
from typing import Any


SUPPORTED_TTS_MODELS = {
    "eleven_v3",
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
}


class ElevenLabsAudioError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 502, terminal: bool = False):
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.terminal = terminal


@dataclass(frozen=True)
class ElevenLabsAudioConfig:
    base_url: str
    api_key: str
    timeout_seconds: int = 45


@dataclass(frozen=True)
class HttpResponse:
    body: bytes
    headers: dict[str, str]
    status_code: int = 200


class ElevenLabsAudioAdapter:
    def __init__(self, config: ElevenLabsAudioConfig):
        self.config = config

    def test_connection(self, model: str) -> dict[str, Any]:
        self._assert_api_key()
        if model not in SUPPORTED_TTS_MODELS:
            raise ElevenLabsAudioError(
                "ELEVENLABS_MODEL_UNSUPPORTED",
                "不支持的 ElevenLabs 语音模型",
                400,
            )

        model_response = self._request(
            method="GET",
            path="/v1/models",
            headers=self._json_headers(),
        )
        if 200 <= model_response.status_code < 300:
            payload = self._json_response(model_response)
            raw_models = payload.get("models") if isinstance(payload, dict) else payload
            models = raw_models if isinstance(raw_models, list) else []
            available = {
                item.get("model_id")
                for item in models
                if isinstance(item, dict) and item.get("can_do_text_to_speech") is not False
            }
            if model not in available:
                raise ElevenLabsAudioError(
                    "ELEVENLABS_MODEL_UNAVAILABLE",
                    f"ElevenLabs 当前账号不可用模型：{model}",
                    400,
                )

            return {
                "success": True,
                "message": "连接成功",
                "provider": "elevenlabs_audio",
                "model": model,
                "modelVerified": True,
            }

        if not self._is_missing_permission(model_response, "models_read"):
            self._ensure_success(model_response)

        permission_response = self._request(
            method="POST",
            path="/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
            headers={
                **self._json_headers(),
                "Accept": "audio/mpeg",
            },
            payload=json.dumps({"model_id": model}).encode("utf-8"),
        )
        if permission_response.status_code == 422:
            if not self._is_missing_text_validation(permission_response):
                self._ensure_success(permission_response, required_permission="text_to_speech")
        else:
            self._ensure_success(permission_response, required_permission="text_to_speech")

        return {
            "success": True,
            "message": "密钥与 TTS 权限验证成功；未授予 models_read，模型可用性将在首次合成时确认",
            "provider": "elevenlabs_audio",
            "model": model,
            "modelVerified": False,
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
        del pitch, volume
        self._assert_api_key()
        self._assert_tts_input(model=model, voice=voice, text=text, speed=speed)
        started_at = time.monotonic()
        output_format, expected_mime, pcm_sample_rate = output_format_config(format, sample_rate)
        encoded_voice = urllib.parse.quote(voice, safe="")
        payload: dict[str, Any] = {
            "text": text,
            "model_id": model,
        }

        if speed is not None:
            payload["voice_settings"] = {"speed": speed}

        response = self._request(
            method="POST",
            path=f"/v1/text-to-speech/{encoded_voice}?output_format={output_format}",
            headers={
                **self._json_headers(),
                "Accept": expected_mime,
            },
            payload=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
        self._ensure_success(response)

        if not response.body:
            raise ElevenLabsAudioError("ELEVENLABS_EMPTY_AUDIO", "ElevenLabs 未返回音频数据")

        audio_bytes = response.body
        audio_mime = response.headers.get("content-type", "").split(";", 1)[0].strip() or expected_mime

        if pcm_sample_rate is not None:
            audio_bytes = wav_from_pcm(audio_bytes, pcm_sample_rate)
            audio_mime = "audio/wav"

        return {
            "provider": "elevenlabs_audio",
            "model": model,
            "voice": voice,
            "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
            "audioMimeType": audio_mime,
            "usage": {
                "inputCharacters": len(text),
            },
            "requestId": response.headers.get("request-id") or response.headers.get("x-request-id"),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
        }

    def list_default_voices(self) -> list[dict[str, Any]]:
        self._assert_api_key()
        voices: list[dict[str, Any]] = []
        next_page_token: str | None = None

        for _ in range(100):
            path = "/v2/voices?page_size=100&voice_type=default&include_total_count=false"
            if next_page_token:
                path += f"&next_page_token={urllib.parse.quote(next_page_token, safe='')}"

            response = self._request(method="GET", path=path, headers=self._json_headers())
            self._ensure_success(response, required_permission="voices_read")
            payload = self._json_response(response)
            page_voices = payload.get("voices") if isinstance(payload, dict) else None

            if not isinstance(page_voices, list):
                raise ElevenLabsAudioError(
                    "ELEVENLABS_INVALID_VOICE_RESPONSE",
                    "ElevenLabs 默认音色返回格式不正确",
                )

            for item in page_voices:
                voice = normalized_voice(item)
                if voice:
                    voices.append(voice)

            has_more = payload.get("has_more") is True
            token = payload.get("next_page_token")
            next_page_token = token.strip() if isinstance(token, str) and token.strip() else None

            if not has_more:
                return voices
            if not next_page_token:
                raise ElevenLabsAudioError(
                    "ELEVENLABS_VOICE_PAGINATION_INVALID",
                    "ElevenLabs 默认音色分页信息不完整",
                )

        raise ElevenLabsAudioError(
            "ELEVENLABS_VOICE_PAGINATION_LIMIT",
            "ElevenLabs 默认音色分页数量异常",
        )

    def _request(
        self,
        *,
        method: str,
        path: str,
        headers: dict[str, str],
        payload: bytes | None = None,
    ) -> HttpResponse:
        endpoint = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        request = urllib.request.Request(endpoint, data=payload, headers=headers, method=method)

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                return HttpResponse(
                    body=response.read(),
                    headers={key.lower(): value for key, value in response.headers.items()},
                    status_code=response.status,
                )
        except urllib.error.HTTPError as error:
            return HttpResponse(
                body=error.read(),
                headers={key.lower(): value for key, value in error.headers.items()},
                status_code=error.code,
            )
        except TimeoutError as error:
            raise ElevenLabsAudioError("ELEVENLABS_TIMEOUT", "ElevenLabs 语音接口请求超时", 504) from error
        except OSError as error:
            raise ElevenLabsAudioError("ELEVENLABS_NETWORK_ERROR", "ElevenLabs 语音接口网络请求失败") from error

    def _assert_api_key(self) -> None:
        if not self.config.api_key.strip():
            raise ElevenLabsAudioError("ELEVENLABS_API_KEY_MISSING", "ElevenLabs API Key 未配置", 400)

    def _assert_tts_input(self, *, model: str, voice: str, text: str, speed: float | None) -> None:
        if model not in SUPPORTED_TTS_MODELS:
            raise ElevenLabsAudioError("ELEVENLABS_MODEL_UNSUPPORTED", "不支持的 ElevenLabs 语音模型", 400)
        if not voice.strip():
            raise ElevenLabsAudioError("ELEVENLABS_VOICE_REQUIRED", "请选择 ElevenLabs 音色", 400)
        if not text:
            raise ElevenLabsAudioError("ELEVENLABS_TEXT_REQUIRED", "语音合成文本不能为空", 400)

        limit = 5_000 if model == "eleven_v3" else 8_000
        if len(text) > limit:
            raise ElevenLabsAudioError(
                "ELEVENLABS_TEXT_TOO_LONG",
                f"{model} 单次最多合成 {limit} 个字符",
                400,
            )

        if speed is not None and not 0.7 <= speed <= 1.2:
            raise ElevenLabsAudioError(
                "ELEVENLABS_SPEED_INVALID",
                "ElevenLabs 语速必须在 0.7 到 1.2 之间",
                400,
            )

    def _json_headers(self) -> dict[str, str]:
        return {
            "xi-api-key": self.config.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _ensure_success(self, response: HttpResponse, required_permission: str | None = None) -> None:
        if 200 <= response.status_code < 300:
            return

        status = response.status_code
        if status in (401, 403):
            if required_permission and self._is_missing_permission(response, required_permission):
                permission_messages = {
                    "text_to_speech": (
                        "ELEVENLABS_TTS_PERMISSION_REQUIRED",
                        "ElevenLabs API Key 需要开启 text_to_speech 权限后才能合成语音",
                    ),
                    "voices_read": (
                        "ELEVENLABS_VOICES_READ_PERMISSION_REQUIRED",
                        "ElevenLabs API Key 需要开启 voices_read 权限后才能同步默认音色",
                    ),
                }
                error_code, message = permission_messages.get(
                    required_permission,
                    ("ELEVENLABS_PERMISSION_REQUIRED", "ElevenLabs API Key 缺少所需权限"),
                )
                raise ElevenLabsAudioError(error_code, message, status, True)

            raise ElevenLabsAudioError(
                "ELEVENLABS_AUTH_FAILED",
                "ElevenLabs API Key 无效或无权访问",
                status,
                True,
            )
        if status == 404:
            raise ElevenLabsAudioError(
                "ELEVENLABS_RESOURCE_NOT_FOUND",
                "ElevenLabs 音色或接口不存在",
                status,
                True,
            )
        if status == 422:
            raise ElevenLabsAudioError(
                "ELEVENLABS_INVALID_REQUEST",
                "ElevenLabs 模型、音色或合成参数无效",
                status,
                True,
            )
        if status == 429:
            raise ElevenLabsAudioError(
                "ELEVENLABS_RATE_LIMITED",
                "ElevenLabs 请求过于频繁，请稍后重试",
                status,
            )
        if status >= 500:
            raise ElevenLabsAudioError(
                "ELEVENLABS_PROVIDER_ERROR",
                "ElevenLabs 服务暂时不可用",
                status,
            )

        raise ElevenLabsAudioError(
            f"ELEVENLABS_HTTP_{status}",
            f"ElevenLabs 语音接口请求失败（HTTP {status}）",
            status,
            True,
        )

    def _is_missing_permission(self, response: HttpResponse, permission: str) -> bool:
        try:
            payload = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False

        detail = payload.get("detail") if isinstance(payload, dict) else None
        if not isinstance(detail, dict) or detail.get("status") != "missing_permissions":
            return False

        message = detail.get("message")
        return isinstance(message, str) and permission in message

    def _is_missing_text_validation(self, response: HttpResponse) -> bool:
        try:
            payload = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False

        details = payload.get("detail") if isinstance(payload, dict) else None
        if not isinstance(details, list) or not details:
            return False

        return all(
            isinstance(detail, dict)
            and detail.get("type") == "missing"
            and detail.get("loc") == ["body", "text"]
            for detail in details
        )

    def _json_response(self, response: HttpResponse) -> Any:
        try:
            return json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ElevenLabsAudioError(
                "ELEVENLABS_INVALID_JSON",
                "ElevenLabs 接口返回格式不正确",
            ) from error


def output_format_config(format: str, sample_rate: int | None) -> tuple[str, str, int | None]:
    normalized = format.strip().lower()
    if normalized == "opus":
        return "opus_48000_64", "audio/ogg", None
    if normalized == "wav":
        supported_rates = (16000, 22050, 24000, 44100)
        requested_rate = sample_rate or 24000
        selected_rate = min(supported_rates, key=lambda rate: abs(rate - requested_rate))
        return f"pcm_{selected_rate}", "audio/pcm", selected_rate
    return "mp3_44100_128", "audio/mpeg", None


def wav_from_pcm(pcm_bytes: bytes, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    return buffer.getvalue()


def normalized_voice(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    voice_id = value.get("voice_id")
    name = value.get("name")
    if not isinstance(voice_id, str) or not voice_id.strip() or not isinstance(name, str) or not name.strip():
        return None

    raw_labels = value.get("labels")
    labels = (
        {key: item for key, item in raw_labels.items() if isinstance(key, str) and isinstance(item, str)}
        if isinstance(raw_labels, dict)
        else {}
    )
    raw_languages = value.get("verified_languages")
    language: str | None = None
    if isinstance(raw_languages, list):
        language = next(
            (
                item.get("language").strip()
                for item in raw_languages
                if isinstance(item, dict)
                and isinstance(item.get("language"), str)
                and item.get("language").strip()
            ),
            None,
        )

    return {
        "providerVoiceId": voice_id.strip(),
        "name": name.strip(),
        "description": nullable_string(value.get("description")),
        "previewAudioUrl": nullable_string(value.get("preview_url")),
        "language": language or nullable_string(labels.get("language")),
        "labels": labels,
    }


def nullable_string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
