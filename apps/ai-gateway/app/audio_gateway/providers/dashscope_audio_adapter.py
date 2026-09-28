from __future__ import annotations

import base64
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from typing import Any


ABBREVIATION_SENTENCE_STARTERS = frozenset(
    {
        "A",
        "An",
        "And",
        "As",
        "At",
        "Because",
        "Before",
        "But",
        "By",
        "Finally",
        "For",
        "He",
        "Her",
        "Here",
        "His",
        "However",
        "I",
        "If",
        "In",
        "It",
        "Its",
        "Later",
        "Meanwhile",
        "Next",
        "Now",
        "On",
        "Once",
        "She",
        "Since",
        "So",
        "That",
        "The",
        "Their",
        "Then",
        "There",
        "These",
        "They",
        "This",
        "Those",
        "Today",
        "Tomorrow",
        "We",
        "When",
        "Where",
        "While",
        "Who",
        "Why",
        "Yesterday",
        "You",
        "Your",
    }
)
SIMPLE_ABBREVIATIONS = frozenset({"dr", "jr", "mr", "mrs", "ms", "prof", "sr", "st"})
ABBREVIATION_PAUSE_THRESHOLD_SECONDS = 0.6


class DashScopeAudioError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 502, terminal: bool = False):
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.terminal = terminal


@dataclass(frozen=True)
class DashScopeAudioConfig:
    base_url: str
    web_socket_url: str | None
    api_key: str
    region: str | None = None
    timeout_seconds: int = 45


class DashScopeAudioAdapter:
    def __init__(self, config: DashScopeAudioConfig):
        self.config = config

    def test_connection(self, model: str) -> dict[str, Any]:
        if not self.config.api_key.strip():
            raise DashScopeAudioError("DASHSCOPE_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置", 400)

        if supports_system_voice(model):
            self.synthesize_speech(
                model=model,
                voice="yuxiaoyun_v3.1" if model == "qwen-audio-3.1-tts-flash" else "longanyang",
                text="连接测试",
                format="mp3",
                sample_rate=24000,
            )
        else:
            self.list_voices(prefix="_xueleai_connection_test_", page_size=1)

        return {
            "success": True,
            "message": "连接成功",
            "provider": "aliyun_dashscope_audio",
            "model": model,
        }

    def create_cloned_voice(
        self,
        *,
        target_model: str,
        source_audio_url: str,
        name: str,
        prefix: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "model": "voice-enrollment",
            "input": {
                "action": "create_voice",
                "target_model": target_model,
                "audio_url": source_audio_url,
                "prefix": prefix or normalized_prefix(name),
            },
        }
        return self._post_json(customization_path(), payload)

    def create_designed_voice(
        self,
        *,
        target_model: str,
        voice_prompt: str,
        name: str,
        preview_text: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "model": "voice-enrollment",
            "input": {
                "action": "create_voice",
                "target_model": target_model,
                "voice_prompt": voice_prompt,
                "prefix": normalized_prefix(name),
                "preview_text": preview_text,
            },
            "parameters": {
                "sample_rate": 24000,
                "response_format": "wav",
            },
        }
        return normalize_designed_voice_response(self._post_json(customization_path(), payload))

    def query_voice(self, provider_voice_id: str) -> dict[str, Any]:
        payload = {
            "model": "voice-enrollment",
            "input": {
                "action": "query_voices",
                "voice_id": provider_voice_id,
            },
        }
        return self._post_json(customization_path(), payload)

    def delete_voice(self, provider_voice_id: str) -> dict[str, Any]:
        payload = {
            "model": "voice-enrollment",
            "input": {
                "action": "delete_voice",
                "voice_id": provider_voice_id,
            },
        }
        return self._post_json(customization_path(), payload)

    def list_voices(self, *, prefix: str | None = None, page_size: int = 1) -> dict[str, Any]:
        payload = {
            "model": "voice-enrollment",
            "input": {
                "action": "list_voices",
                "page_size": page_size,
            },
        }

        if prefix:
            payload["input"]["prefix"] = prefix

        return self._post_json(customization_path(), payload)

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
            "input": {
                "text": text,
                "voice": voice,
            },
        }
        settings = payload["input"] if model == "qwen-audio-3.1-tts-flash" else payload.setdefault("parameters", {})
        settings["format"] = format

        if sample_rate:
            settings["sample_rate"] = sample_rate
        if speed is not None:
            settings["rate"] = speed
        if pitch is not None and pitch != 0:
            settings["pitch"] = pitch
        if volume is not None:
            settings["volume"] = normalized_volume(volume)

        response = self._post_json("/services/audio/tts/SpeechSynthesizer", payload)
        audio_url = nested_string(response, ["output", "audio", "url"]) or nested_string(response, ["output", "url"])
        audio_data = nested_string(response, ["output", "audio", "data"]) or nested_string(response, ["output", "data"])
        usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}

        return {
            "provider": "aliyun_dashscope_audio",
            "model": model,
            "voice": voice,
            "audioUrl": audio_url,
            "audioBase64": audio_data,
            "usage": {
                "inputCharacters": len(text),
                "providerUsage": usage,
            },
            "requestId": request_id_from_response(response),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
            "raw": response,
        }

    def stream_synthesize_speech(self, **kwargs: Any) -> dict[str, Any]:
        # 阶段 21 先以统一接口保留流式入口；后续前台接入时再补充 WebSocket 音频帧透传。
        return self.synthesize_speech(**kwargs)

    def transcribe_audio(
        self,
        *,
        model: str,
        media_url: str,
        media_mime_type: str | None = None,
        media_name: str | None = None,
        language: str | None = None,
        format: str = "srt",
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        submitted = self.submit_transcription(
            model=model,
            media_url=media_url,
            media_mime_type=media_mime_type,
            media_name=media_name,
            language=language,
            format=format,
        )
        task_id = str(submitted.get("providerTaskId") or "").strip()

        if not task_id:
            raise DashScopeAudioError("ASR_TASK_ID_MISSING", "语音识别接口未返回任务编号")

        deadline = time.monotonic() + max(5, self.config.timeout_seconds)

        while time.monotonic() < deadline:
            time.sleep(2)
            result = self.query_transcription_task(
                task_id=task_id,
                model=model,
                media_mime_type=media_mime_type,
                media_name=media_name,
                format=format,
            )

            if result.get("status") == "SUCCEEDED":
                result["latencyMs"] = round((time.monotonic() - started_at) * 1000)
                return result

        raise DashScopeAudioError("PROVIDER_TIMEOUT", "语音识别任务等待超时")

    def submit_transcription(
        self,
        *,
        model: str,
        media_url: str,
        media_mime_type: str | None = None,
        media_name: str | None = None,
        language: str | None = None,
        format: str = "srt",
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        request_model = file_transcription_model(model)
        parameters: dict[str, Any] = {}
        language_hint = (language or "").strip()

        if language_hint and language_hint.lower() != "auto":
            parameters["language_hints"] = [language_hint]
        if request_model.startswith("qwen3-asr"):
            # 字幕引擎以 word-level timestamps 为准，句子边界只作为断句信号。
            parameters["enable_words"] = True
        if request_model.startswith("paraformer"):
            parameters["timestamp_alignment_enabled"] = True

        payload = {
            "model": request_model,
            "input": transcription_input(request_model, media_url),
            "parameters": parameters,
        }
        response = self._post_json(
            "/services/audio/asr/transcription",
            payload,
            extra_headers={"X-DashScope-Async": "enable"},
        )
        task_id = task_id_from_response(response)

        if not task_id:
            raise DashScopeAudioError("ASR_TASK_ID_MISSING", "语音识别接口未返回任务编号")

        provider_status = task_status_from_response(response) or "PENDING"

        return {
            "provider": "aliyun_dashscope_audio",
            "model": model,
            "requestModel": request_model,
            "mediaName": media_name,
            "mediaMimeType": media_mime_type,
            "providerTaskId": task_id,
            "providerStatus": provider_status,
            "status": normalized_task_state(provider_status),
            "format": format,
            "requestId": request_id_from_response(response),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
            "raw": response,
        }

    def query_transcription_task(
        self,
        *,
        task_id: str,
        model: str,
        media_mime_type: str | None = None,
        media_name: str | None = None,
        format: str = "srt",
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        request_model = file_transcription_model(model)
        response = self._request_json("GET", f"/tasks/{urllib.parse.quote(task_id)}")
        provider_status = task_status_from_response(response)

        if provider_status in {"FAILED", "CANCELED", "CANCELLED", "UNKNOWN"}:
            raise DashScopeAudioError(
                task_error_code(response) or "ASR_TASK_FAILED",
                task_error_message(response) or "语音识别任务失败",
                task_error_status_code(response),
                terminal=True,
            )

        if provider_status not in {"SUCCEEDED", "SUCCESS", "COMPLETED"}:
            return {
                "provider": "aliyun_dashscope_audio",
                "model": model,
                "requestModel": request_model,
                "mediaName": media_name,
                "mediaMimeType": media_mime_type,
                "providerTaskId": task_id,
                "providerStatus": provider_status or "PENDING",
                "status": "PENDING",
                "format": format,
                "requestId": request_id_from_response(response),
                "latencyMs": round((time.monotonic() - started_at) * 1000),
                "raw": response,
            }

        result_payload = response
        transcription_url = transcription_url_from_response(response)

        if transcription_url:
            downloaded = self._get_text(transcription_url)
            downloaded_payload = safe_json(downloaded)
            result_payload = downloaded_payload if isinstance(downloaded_payload, dict) else {"subtitleText": downloaded}

        subtitle_artifacts = subtitle_artifacts_from_response(result_payload)
        subtitle_text = str(subtitle_artifacts.get("srtText") or "")
        if not subtitle_text:
            subtitle_text = subtitle_text_from_response(result_payload)
        if not subtitle_text:
            plain_text = plain_text_from_response(result_payload)
            subtitle_text = plain_text_to_srt(plain_text) if plain_text else ""

        if not subtitle_text.strip():
            raise DashScopeAudioError("ASR_EMPTY_RESULT", "语音识别未返回字幕内容")

        return {
            "provider": "aliyun_dashscope_audio",
            "model": model,
            "requestModel": request_model,
            "mediaName": media_name,
            "mediaMimeType": media_mime_type,
            "providerTaskId": task_id,
            "providerStatus": provider_status,
            "status": "SUCCEEDED",
            "subtitleText": normalize_srt_text(subtitle_text),
            "srtText": normalize_srt_text(subtitle_text),
            "punctuatedText": subtitle_artifacts.get("punctuatedText") or "",
            "wordTimeline": subtitle_artifacts.get("wordTimeline") or [],
            "sentenceSubtitles": subtitle_artifacts.get("sentenceSubtitles") or [],
            "format": format,
            "requestId": request_id_from_response(response),
            "latencyMs": round((time.monotonic() - started_at) * 1000),
            "raw": response,
        }

    def _resolve_transcription_response(self, response: dict[str, Any]) -> dict[str, Any]:
        task_id = task_id_from_response(response)

        if not task_id:
            return response

        deadline = time.monotonic() + max(5, self.config.timeout_seconds)
        last_response = response

        while time.monotonic() < deadline:
            time.sleep(2)
            last_response = self._request_json("GET", f"/tasks/{urllib.parse.quote(task_id)}")
            status = task_status_from_response(last_response)

            if status in {"SUCCEEDED", "SUCCESS", "COMPLETED"}:
                return last_response

            if status in {"FAILED", "CANCELED", "CANCELLED", "UNKNOWN"}:
                raise DashScopeAudioError(
                    "ASR_TASK_FAILED",
                    task_error_message(last_response) or "语音识别任务失败",
                )

        raise DashScopeAudioError("PROVIDER_TIMEOUT", "语音识别任务等待超时")

    def _get_text(self, url: str) -> str:
        request = urllib.request.Request(url, headers={"Accept": "application/json,text/plain,*/*"}, method="GET")

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                return response.read().decode("utf-8", errors="ignore")
        except TimeoutError as error:
            raise DashScopeAudioError("PROVIDER_TIMEOUT", "阿里云语音识别结果下载超时") from error
        except OSError as error:
            raise DashScopeAudioError("PROVIDER_NETWORK_ERROR", "阿里云语音识别结果下载失败") from error

    def _post_json(
        self,
        path: str,
        payload: dict[str, Any],
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("POST", path, payload, extra_headers)

    def _request_json(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        endpoint = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        headers.update(extra_headers or {})
        request = urllib.request.Request(
            endpoint,
            data=data,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                body = response.read()
                parsed = safe_json(body.decode("utf-8", errors="ignore"))
                if not isinstance(parsed, dict):
                    if response.headers.get("content-type", "").startswith("audio/"):
                        parsed = {
                            "output": {
                                "audio": {
                                    "data": base64.b64encode(body).decode("ascii")
                                }
                            }
                        }
                    else:
                        raise DashScopeAudioError("INVALID_PROVIDER_RESPONSE", "阿里云语音接口返回格式不正确")

                request_id = response.headers.get("x-request-id") or response.headers.get("X-Request-Id")
                if request_id and "request_id" not in parsed:
                    parsed["request_id"] = request_id
                return parsed
        except urllib.error.HTTPError as error:
            detail = safe_json(error.read().decode("utf-8", errors="ignore"))
            raise DashScopeAudioError(
                provider_error_code(detail, error.code),
                provider_error_message(detail, error.code),
                error.code,
            ) from error
        except TimeoutError as error:
            raise DashScopeAudioError("PROVIDER_TIMEOUT", "阿里云语音接口请求超时") from error
        except OSError as error:
            raise DashScopeAudioError("PROVIDER_NETWORK_ERROR", "阿里云语音接口网络请求失败") from error


def safe_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def file_transcription_model(model: str) -> str:
    normalized = model.strip()

    if normalized == "qwen3-asr-flash":
        return "qwen3-asr-flash-filetrans"

    return normalized


def transcription_input(model: str, media_url: str) -> dict[str, Any]:
    if model.startswith("qwen3-asr"):
        return {"file_url": media_url}

    return {"file_urls": [media_url]}


def task_id_from_response(value: dict[str, Any]) -> str | None:
    return (
        nested_string(value, ["output", "task_id"])
        or nested_string(value, ["output", "taskId"])
        or string_field(value, "task_id")
        or string_field(value, "taskId")
    )


def task_status_from_response(value: dict[str, Any]) -> str:
    status = (
        nested_string(value, ["output", "task_status"])
        or nested_string(value, ["output", "taskStatus"])
        or nested_string(value, ["output", "status"])
        or string_field(value, "task_status")
        or string_field(value, "status")
        or ""
    )

    return status.upper()


def task_error_message(value: dict[str, Any]) -> str | None:
    return (
        nested_string(value, ["output", "message"])
        or nested_string(value, ["output", "error_message"])
        or string_field(value, "message")
        or string_field(value, "error_message")
    )


def task_error_code(value: dict[str, Any]) -> str | None:
    return (
        nested_string(value, ["output", "code"])
        or nested_string(value, ["output", "error_code"])
        or string_field(value, "code")
        or string_field(value, "error_code")
    )


def task_error_status_code(value: dict[str, Any]) -> int:
    code = (task_error_code(value) or "").lower()

    if "unauthorized" in code or "authentication" in code:
        return 401
    if "forbidden" in code:
        return 403
    if "throttl" in code or "rate" in code:
        return 429
    if "invalid" in code or "file" in code or "format" in code:
        return 400

    return 502


def normalized_task_state(status: str) -> str:
    normalized = status.upper()

    if normalized in {"SUCCEEDED", "SUCCESS", "COMPLETED"}:
        return "SUCCEEDED"
    if normalized in {"FAILED", "CANCELED", "CANCELLED", "UNKNOWN"}:
        return "FAILED"

    return "PENDING"


def transcription_url_from_response(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("transcription_url", "transcriptionUrl", "result_url", "resultUrl"):
            field_value = value.get(key)
            if isinstance(field_value, str) and field_value.strip():
                return field_value.strip()

        for child in value.values():
            found = transcription_url_from_response(child)
            if found:
                return found

    if isinstance(value, list):
        for child in value:
            found = transcription_url_from_response(child)
            if found:
                return found

    return None


def subtitle_text_from_response(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("subtitleText", "subtitle_text", "srtText", "srt_text", "srt", "subtitle"):
            field_value = value.get(key)
            if isinstance(field_value, str) and field_value.strip():
                return field_value.strip()

        text_value = value.get("text")
        if isinstance(text_value, str) and looks_like_srt(text_value):
            return text_value.strip()

        for child in value.values():
            found = subtitle_text_from_response(child)
            if found:
                return found

    if isinstance(value, list):
        for child in value:
            found = subtitle_text_from_response(child)
            if found:
                return found

    return ""


def segments_from_response(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        for key in ("sentences", "segments", "results"):
            field_value = value.get(key)
            if isinstance(field_value, list):
                direct_segments = [item for item in field_value if is_segment_like(item)]
                if direct_segments:
                    return direct_segments

                nested_segments: list[dict[str, Any]] = []
                for item in field_value:
                    nested_segments.extend(segments_from_response(item))
                if nested_segments:
                    return nested_segments

        for child in value.values():
            found = segments_from_response(child)
            if found:
                return found

    if isinstance(value, list):
        direct_segments = [item for item in value if is_segment_like(item)]
        if direct_segments:
            return direct_segments

        for child in value:
            found = segments_from_response(child)
            if found:
                return found

    return []


def is_segment_like(value: Any) -> bool:
    if not isinstance(value, dict):
        return False

    has_text = isinstance(value.get("text"), str) and bool(value["text"].strip())
    has_start = any(key in value for key in ("begin_time", "start_time", "start", "begin"))
    has_end = any(key in value for key in ("end_time", "end"))

    return has_text and has_start and has_end


class SentenceAligner:
    def __init__(self, max_words: int = 18, max_duration: float = 4.0, pause_threshold: float = 0.6):
        self.max_words = max_words
        self.max_duration = max_duration
        self.pause_threshold = pause_threshold

    def split(self, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
        punctuated_segments, trailing_words = self._split_by_punctuation(words)
        if punctuated_segments:
            segments = [self._flush(segment_words) for segment_words in punctuated_segments]
            segments.extend(self._fallback_split(trailing_words))
            return segments

        return self._fallback_split(words)

    def _split_by_punctuation(self, words: list[dict[str, Any]]) -> tuple[list[list[dict[str, Any]]], list[dict[str, Any]]]:
        segments: list[list[dict[str, Any]]] = []
        buffer: list[dict[str, Any]] = []

        for index, word in enumerate(words):
            buffer.append(word)
            if word_has_sentence_boundary(words, index, self.pause_threshold):
                segments.append(buffer)
                buffer = []

        return segments, buffer

    def _fallback_split(self, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
        segments: list[dict[str, Any]] = []
        buffer: list[dict[str, Any]] = []

        for index, word in enumerate(words):
            buffer.append(word)
            next_word = words[index + 1] if index + 1 < len(words) else None
            gap = 0.0
            if next_word:
                gap = max(0.0, (int_value(next_word.get("begin_time")) - int_value(word.get("end_time"))) / 1000)

            duration = max(0.0, (int_value(buffer[-1].get("end_time")) - int_value(buffer[0].get("begin_time"))) / 1000)

            if (
                bool(word.get("sentence_end"))
                or gap > self.pause_threshold
                or len(buffer) >= self.max_words
                or duration >= self.max_duration
                or word_has_sentence_boundary(words, index, self.pause_threshold)
            ):
                segments.append(self._flush(buffer))
                buffer = []

        if buffer:
            segments.append(self._flush(buffer))

        return segments

    def _flush(self, buffer: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "start": int_value(buffer[0].get("begin_time")) / 1000,
            "end": int_value(buffer[-1].get("end_time")) / 1000,
            "text": normalize_sentence_display_spacing(join_subtitle_words(buffer)),
            "words": buffer,
        }


class SubtitleRefiner:
    def __init__(self, max_words: int = 22):
        self.max_words = max_words

    def refine(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        refined: list[dict[str, Any]] = []

        for segment in segments:
            words = segment_words(segment)
            text = str(segment.get("text") or "").strip()

            if len(words) > self.max_words and not is_sentence_end_text(text):
                refined.extend(self._split_long_by_words(words))
                continue

            if starts_with_continuation(text) and refined and not is_sentence_end_text(str(refined[-1].get("text") or "")):
                refined[-1] = merge_segments(refined[-1], segment)
                continue

            refined.append(segment)

        return [segment for segment in refined if str(segment.get("text") or "").strip()]

    def _split_long_by_words(self, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(words) <= self.max_words:
            return [segment_from_words(words)]

        segments: list[dict[str, Any]] = []
        for start in range(0, len(words), self.max_words):
            segments.append(segment_from_words(words[start : start + self.max_words]))

        return segments


class SRTGenerator:
    def generate(self, segments: list[dict[str, Any]]) -> str:
        cues: list[str] = []

        for segment in segments:
            text = str(segment.get("text") or "").strip()
            start = float_value(segment.get("start")) or 0.0
            end = float_value(segment.get("end")) or start

            if not text:
                continue
            if end <= start:
                end = start + 0.5

            cues.append(f"{len(cues) + 1}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text}")

        return "\n\n".join(cues)


def subtitle_artifacts_from_response(value: Any) -> dict[str, Any]:
    words = words_from_response(value, apply_punctuation=False)
    punctuated_text = punctuated_text_from_response(value)
    sentence_segments = sentence_segments_from_punctuated_text_and_words(punctuated_text, words)

    if not sentence_segments and words:
        punctuated_words = words_from_response(value, apply_punctuation=True)
        sentence_segments = SentenceAligner().split(punctuated_words)
        sentence_segments = SubtitleRefiner().refine(sentence_segments)
        if not punctuated_text:
            punctuated_text = join_subtitle_words(punctuated_words)

    if not sentence_segments:
        sentence_segments = segments_from_response(value)

    punctuated_text = normalize_sentence_display_spacing(punctuated_text)
    srt_text = SRTGenerator().generate(sentence_segments) if sentence_segments else ""

    return {
        "punctuatedText": punctuated_text,
        "wordTimeline": word_timeline_payload(words),
        "sentenceSubtitles": sentence_subtitle_payload(sentence_segments),
        "srtText": srt_text,
    }


def subtitle_srt_from_response(value: Any) -> str:
    artifacts = subtitle_artifacts_from_response(value)
    srt_text = str(artifacts.get("srtText") or "")

    if srt_text:
        return srt_text

    words = words_from_response(value)
    if words:
        segments = SentenceAligner().split(words)
        segments = SubtitleRefiner().refine(segments)
        return SRTGenerator().generate(segments)

    sentence_segments = segments_from_response(value)
    return segments_to_srt(sentence_segments) if sentence_segments else ""


def punctuated_text_from_response(value: Any) -> str:
    explicit = explicit_punctuated_text_from_response(value)

    if explicit:
        return explicit

    texts: list[str] = []
    collect_punctuated_texts(value, texts)

    return clean_punctuated_text(" ".join(dedupe_texts(texts)))


def explicit_punctuated_text_from_response(value: Any) -> str:
    candidates: list[str] = []
    collect_explicit_punctuated_texts(value, candidates)
    candidates = dedupe_texts(candidates)

    if not candidates:
        return ""

    return clean_punctuated_text(max(candidates, key=len))


def collect_explicit_punctuated_texts(value: Any, texts: list[str]) -> None:
    if isinstance(value, dict):
        for key in ("punctuatedText", "punctuated_text", "transcriptText", "transcript_text", "fullText", "full_text"):
            field_value = value.get(key)
            if isinstance(field_value, str) and is_plain_transcript_text(field_value):
                texts.append(clean_plain_text(field_value))

        for child in value.values():
            collect_explicit_punctuated_texts(child, texts)

    if isinstance(value, list):
        for child in value:
            collect_explicit_punctuated_texts(child, texts)


def collect_punctuated_texts(value: Any, texts: list[str]) -> None:
    if isinstance(value, dict):
        if is_word_like(value):
            return

        text_value = value.get("text")
        words_value = value.get("words")

        if isinstance(words_value, list) and isinstance(text_value, str) and is_plain_transcript_text(text_value):
            texts.append(clean_plain_text(text_value))
            return

        segment_list = first_segment_list(value)
        if segment_list is not None:
            before_count = len(texts)
            for item in segment_list:
                collect_punctuated_texts(item, texts)
            if len(texts) > before_count:
                return

        if isinstance(text_value, str) and is_plain_transcript_text(text_value) and has_sentence_punctuation(text_value):
            texts.append(clean_plain_text(text_value))
            return

        for key, child in value.items():
            if key == "words":
                continue
            collect_punctuated_texts(child, texts)

    if isinstance(value, list):
        for child in value:
            collect_punctuated_texts(child, texts)


def first_segment_list(value: dict[str, Any]) -> list[Any] | None:
    for key in ("sentences", "segments", "results"):
        field_value = value.get(key)
        if isinstance(field_value, list):
            return field_value

    return None


def sentence_segments_from_punctuated_text_and_words(punctuated_text: str, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sentences = split_sentence_text(punctuated_text, words=words)
    if not sentences or not words:
        return []

    sentence_tokens: list[str] = []
    token_sentence_indexes: list[int] = []
    for sentence_index, sentence in enumerate(sentences):
        for token in sentence_word_tokens(sentence):
            normalized_token = alignment_token(token)
            if normalized_token:
                sentence_tokens.append(normalized_token)
                token_sentence_indexes.append(sentence_index)

    word_tokens: list[str] = []
    word_token_indexes: list[int] = []
    for word_index, word in enumerate(words):
        for token in sentence_word_tokens(str(word.get("text") or "")):
            normalized_token = alignment_token(token)
            if normalized_token:
                word_tokens.append(normalized_token)
                word_token_indexes.append(word_index)

    if not sentence_tokens or not word_tokens:
        return []

    word_sentence_indexes = align_word_sentence_indexes(
        sentence_tokens,
        token_sentence_indexes,
        word_tokens,
        word_token_indexes,
        len(words),
    )
    sentence_word_groups: list[list[dict[str, Any]]] = [[] for _ in sentences]

    for word_index, sentence_index in enumerate(word_sentence_indexes):
        if sentence_index is None or sentence_index < 0 or sentence_index >= len(sentences):
            continue
        sentence_word_groups[sentence_index].append(words[word_index])

    segments: list[dict[str, Any]] = []
    for sentence, sentence_words in zip(sentences, sentence_word_groups, strict=False):
        if not sentence_words:
            continue

        segment = segment_from_words(sentence_words)
        segment["text"] = sentence.strip()
        segments.append(segment)

    return [segment for segment in segments if str(segment.get("text") or "").strip()]


def align_word_sentence_indexes(
    sentence_tokens: list[str],
    token_sentence_indexes: list[int],
    word_tokens: list[str],
    word_token_indexes: list[int],
    word_count: int,
) -> list[int | None]:
    text_length = len(sentence_tokens)
    word_token_length = len(word_tokens)
    gap_penalty = -1.0

    scores: list[list[float]] = [[0.0] * (word_token_length + 1) for _ in range(text_length + 1)]
    moves: list[list[str]] = [[""] * (word_token_length + 1) for _ in range(text_length + 1)]

    for text_index in range(1, text_length + 1):
        scores[text_index][0] = scores[text_index - 1][0] + gap_penalty
        moves[text_index][0] = "up"

    for word_index in range(1, word_token_length + 1):
        scores[0][word_index] = scores[0][word_index - 1] + gap_penalty
        moves[0][word_index] = "left"

    for text_index in range(1, text_length + 1):
        for word_index in range(1, word_token_length + 1):
            diagonal_score = scores[text_index - 1][word_index - 1] + alignment_score(
                sentence_tokens[text_index - 1],
                word_tokens[word_index - 1],
            )
            up_score = scores[text_index - 1][word_index] + gap_penalty
            left_score = scores[text_index][word_index - 1] + gap_penalty

            if diagonal_score >= up_score and diagonal_score >= left_score:
                scores[text_index][word_index] = diagonal_score
                moves[text_index][word_index] = "diag"
            elif up_score >= left_score:
                scores[text_index][word_index] = up_score
                moves[text_index][word_index] = "up"
            else:
                scores[text_index][word_index] = left_score
                moves[text_index][word_index] = "left"

    aligned_pairs: list[tuple[int | None, int | None]] = []
    text_index = text_length
    word_index = word_token_length
    while text_index > 0 or word_index > 0:
        move = moves[text_index][word_index]
        if move == "diag":
            aligned_pairs.append((text_index - 1, word_index - 1))
            text_index -= 1
            word_index -= 1
        elif move == "up":
            aligned_pairs.append((text_index - 1, None))
            text_index -= 1
        else:
            aligned_pairs.append((None, word_index - 1))
            word_index -= 1

    aligned_pairs.reverse()

    word_sentence_votes: list[list[int]] = [[] for _ in range(word_count)]
    pending_word_indexes: list[int] = []
    last_sentence_index: int | None = None

    for text_token_index, word_token_index in aligned_pairs:
        current_sentence_index = token_sentence_indexes[text_token_index] if text_token_index is not None else None

        if current_sentence_index is not None and pending_word_indexes:
            fallback_sentence_index = last_sentence_index if last_sentence_index is not None else current_sentence_index
            for pending_word_index in pending_word_indexes:
                word_sentence_votes[pending_word_index].append(fallback_sentence_index)
            pending_word_indexes.clear()

        if word_token_index is not None:
            original_word_index = word_token_indexes[word_token_index]
            if current_sentence_index is not None:
                word_sentence_votes[original_word_index].append(current_sentence_index)
            elif last_sentence_index is not None:
                word_sentence_votes[original_word_index].append(last_sentence_index)
            else:
                pending_word_indexes.append(original_word_index)

        if current_sentence_index is not None:
            last_sentence_index = current_sentence_index

    if pending_word_indexes and last_sentence_index is not None:
        for pending_word_index in pending_word_indexes:
            word_sentence_votes[pending_word_index].append(last_sentence_index)

    assignments: list[int | None] = []
    for votes in word_sentence_votes:
        if votes:
            assignments.append(Counter(votes).most_common(1)[0][0])
        else:
            assignments.append(None)

    last_known_sentence_index: int | None = None
    for word_index, sentence_index in enumerate(assignments):
        if sentence_index is None and last_known_sentence_index is not None:
            assignments[word_index] = last_known_sentence_index
        elif sentence_index is not None:
            last_known_sentence_index = sentence_index

    next_known_sentence_index: int | None = None
    for word_index in range(len(assignments) - 1, -1, -1):
        sentence_index = assignments[word_index]
        if sentence_index is None and next_known_sentence_index is not None:
            assignments[word_index] = next_known_sentence_index
        elif sentence_index is not None:
            next_known_sentence_index = sentence_index

    return assignments


def alignment_score(left: str, right: str) -> float:
    if left == right:
        return 3.0

    if left and right and (left in right or right in left) and min(len(left), len(right)) >= 4:
        return 1.0

    return -2.0


def alignment_token(value: str) -> str:
    normalized = value.lower().replace("’", "'")
    normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff']+", "", normalized)
    return normalized.strip("'")


def word_timeline_payload(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "text": str(word.get("text") or "").strip(),
            "beginTime": int_value(word.get("begin_time")),
            "endTime": int_value(word.get("end_time")),
            "startSeconds": int_value(word.get("begin_time")) / 1000,
            "endSeconds": int_value(word.get("end_time")) / 1000,
        }
        for word in words
        if str(word.get("text") or "").strip()
    ]


def sentence_subtitle_payload(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []

    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("text") or "").strip()
        if not text:
            continue

        start_seconds = float_value(segment.get("start"))
        end_seconds = float_value(segment.get("end"))

        if start_seconds is None:
            start_seconds = segment_time_seconds(segment, ("begin_time", "start_time", "begin"), default=0.0) or 0.0
        if end_seconds is None:
            end_seconds = segment_time_seconds(segment, ("end_time",), default=start_seconds + 0.5) or start_seconds + 0.5

        payload.append(
            {
                "index": index,
                "text": text,
                "startSeconds": start_seconds,
                "endSeconds": end_seconds,
                "timeRange": f"{format_srt_time(start_seconds)} --> {format_srt_time(end_seconds)}",
            }
        )

    return payload


def is_word_like(value: dict[str, Any]) -> bool:
    has_text = any(isinstance(value.get(key), str) and value[key].strip() for key in ("text", "word", "token"))
    has_start = any(key in value for key in ("begin_time", "start_time", "start", "begin"))
    has_end = any(key in value for key in ("end_time", "end"))

    return has_text and has_start and has_end


def is_plain_transcript_text(value: str) -> bool:
    return bool(value.strip()) and not looks_like_srt(value)


def clean_plain_text(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value.strip())
    cleaned = re.sub(r"(?<=[A-Z])\.\s+(?=[A-Z]\.)", ".", cleaned)
    cleaned = re.sub(
        r"\b((?:[A-Za-z]\.)+[A-Za-z])\.(?=[A-Za-z])",
        lambda match: match.group(1).replace(".", "\uE000") + "\uE001",
        cleaned,
    )
    cleaned = re.sub(r"(?<=\d)\.(?=\d)", "\uE000", cleaned)
    cleaned = re.sub(r"(?<=[A-Za-z])\.(?=[A-Za-z]\.)", "\uE000", cleaned)
    cleaned = re.sub(r"([.?!。？！])(?=[A-Za-z0-9\u4e00-\u9fff])", r"\1 ", cleaned)
    cleaned = cleaned.replace("\uE001", ".")
    cleaned = cleaned.replace("\uE000", ".")
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)

    return collapse_adjacent_duplicate_phrases(cleaned)


def clean_punctuated_text(value: str) -> str:
    cleaned = clean_plain_text(value)
    sentences = split_sentence_text(cleaned, format_display=False)

    return " ".join(sentences) if sentences else cleaned


def collapse_adjacent_duplicate_phrases(value: str) -> str:
    token = r"(?:[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?|[\u4e00-\u9fff])"
    cleaned = value

    for token_count in range(4, 1, -1):
        phrase = rf"{token}(?:\s+{token}){{{token_count - 1}}}"
        pattern = re.compile(rf"\b({phrase})(?:\s+\1\b)+", re.IGNORECASE)
        previous = None
        while previous != cleaned:
            previous = cleaned
            cleaned = pattern.sub(r"\1", cleaned)

    return cleaned


def merge_overlapping_sentence_boundaries(sentences: list[str]) -> list[str]:
    merged: list[str] = []

    for sentence in sentences:
        cleaned_sentence = sentence.strip()
        if not cleaned_sentence:
            continue

        if merged:
            overlap = sentence_token_overlap(merged[-1], cleaned_sentence)
            if overlap >= 2:
                merged[-1] = merge_sentence_text(merged[-1], cleaned_sentence, overlap)
                continue

        merged.append(cleaned_sentence)

    return merged


def sentence_token_overlap(left: str, right: str) -> int:
    left_tokens = [alignment_token(token) for token in sentence_word_tokens(left)]
    right_tokens = [alignment_token(token) for token in sentence_word_tokens(right)]
    left_tokens = [token for token in left_tokens if token]
    right_tokens = [token for token in right_tokens if token]
    max_overlap = min(6, len(left_tokens), len(right_tokens))

    for overlap in range(max_overlap, 1, -1):
        if left_tokens[-overlap:] == right_tokens[:overlap]:
            return overlap

    return 0


def merge_sentence_text(left: str, right: str, overlap: int) -> str:
    left_base = re.sub(r"""[.?!。？！]+["'”’)\]}》」』]*\s*$""", "", left).rstrip(" ,;:，；：")
    right_tail = remove_leading_tokens(right, overlap).lstrip(" ,;:，；：")

    if not right_tail:
        return left

    return f"{left_base} {right_tail}".strip()


def remove_leading_tokens(value: str, token_count: int) -> str:
    matches = list(re.finditer(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|[\u4e00-\u9fff]", value))

    if token_count <= 0 or token_count >= len(matches):
        return "" if token_count >= len(matches) else value

    return value[matches[token_count].start() :]


def dedupe_overlapping_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []

    for word in words:
        if is_overlapping_duplicate_word(word, deduped[-8:]):
            continue
        deduped.append(word)

    return deduped


def is_overlapping_duplicate_word(word: dict[str, Any], previous_words: list[dict[str, Any]]) -> bool:
    signature = word_signature(word)
    start = int_value(word.get("begin_time"))
    end = int_value(word.get("end_time"))

    if not signature or start is None or end is None:
        return False

    for previous in reversed(previous_words):
        previous_signature = word_signature(previous)
        previous_start = int_value(previous.get("begin_time"))
        previous_end = int_value(previous.get("end_time"))

        if not previous_signature or previous_start is None or previous_end is None:
            continue
        if signature != previous_signature:
            continue
        if abs(start - previous_start) <= 250 and start <= previous_end + 250 and previous_start <= end + 250:
            return True

    return False


def word_signature(word: dict[str, Any]) -> str:
    tokens = [alignment_token(token) for token in sentence_word_tokens(str(word.get("text") or ""))]
    return " ".join(token for token in tokens if token)


def has_sentence_punctuation(value: str) -> bool:
    return any(character in value for character in ".?!。？！")


def dedupe_texts(texts: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for text in texts:
        cleaned = clean_plain_text(text)
        if not cleaned or cleaned in seen:
            continue

        seen.add(cleaned)
        result.append(cleaned)

    return result


def words_from_response(value: Any, apply_punctuation: bool = True) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    collect_words(value, words, apply_punctuation=apply_punctuation)

    return dedupe_overlapping_words(words)


def collect_words(value: Any, words: list[dict[str, Any]], *, apply_punctuation: bool = True) -> None:
    if isinstance(value, dict):
        words_value = value.get("words")
        if isinstance(words_value, list):
            sentence_words = [normalized_word(item) for item in words_value]
            sentence_words = [word for word in sentence_words if word]
            if sentence_words:
                if apply_punctuation:
                    apply_sentence_text_punctuation(sentence_words, str(value.get("text") or ""))
                if bool_value(value.get("sentence_end")):
                    sentence_words[-1]["sentence_end"] = True
                words.extend(sentence_words)
                return

        for child in value.values():
            collect_words(child, words, apply_punctuation=apply_punctuation)

    if isinstance(value, list):
        for child in value:
            collect_words(child, words, apply_punctuation=apply_punctuation)


def normalized_word(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    text = word_text(value)
    start = word_time_milliseconds(value, ("begin_time", "start_time", "start", "begin"))
    end = word_time_milliseconds(value, ("end_time", "end"))

    if not text or start is None or end is None or end <= start:
        return None

    return {
        "begin_time": start,
        "end_time": end,
        "sentence_end": bool_value(value.get("sentence_end")),
        "text": text,
    }


def word_text(value: dict[str, Any]) -> str:
    for key in ("text", "word", "token"):
        field_value = value.get(key)
        if isinstance(field_value, str) and field_value.strip():
            return field_value.strip()

    return ""


def word_time_milliseconds(value: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        if key not in value:
            continue

        raw_value = value.get(key)
        numeric_value = float_value(raw_value)

        if numeric_value is None:
            continue

        if key in {"begin_time", "end_time", "start_time"} or numeric_value > 10000:
            return round(numeric_value)

        return round(numeric_value * 1000)

    return None


def apply_sentence_text_punctuation(words: list[dict[str, Any]], sentence_text: str) -> None:
    text_sentences = split_sentence_text(sentence_text, words=words)
    if not text_sentences:
        return

    cursor = 0
    for index, text_sentence in enumerate(text_sentences):
        punctuated_tokens = sentence_punctuated_tokens(text_sentence)
        sentence_tokens = [token for token, _punctuation in punctuated_tokens]
        if not sentence_tokens:
            continue

        remaining_tokens = sum(len(sentence_word_tokens(sentence)) for sentence in text_sentences[index + 1 :])
        boundary_index = cursor + len(sentence_tokens) - 1
        max_boundary_index = len(words) - 1 - remaining_tokens if remaining_tokens > 0 else len(words) - 1
        boundary_index = min(boundary_index, max_boundary_index, len(words) - 1)

        if boundary_index < cursor:
            continue

        for token_index, (_token, punctuation) in enumerate(punctuated_tokens):
            word_index = cursor + token_index
            if word_index > boundary_index:
                break

            if punctuation:
                append_word_punctuation(words[word_index], punctuation, is_sentence_end_text(punctuation))

        cursor = boundary_index + 1
        if cursor >= len(words):
            break


def split_sentence_text(
    text: str,
    *,
    format_display: bool = True,
    words: list[dict[str, Any]] | None = None,
) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.strip())
    if not normalized:
        return []

    sentences: list[str] = []
    cursor = 0
    index = 0

    while index < len(normalized):
        character = normalized[index]
        explicit_sentence_end = (
            sentence_period_has_explicit_boundary(normalized, index, words) if character == "." else False
        )
        period_gap = sentence_period_gap_seconds(normalized, index, words) if character == "." else None
        is_boundary = character in "?!。？！" or (
            character == "."
            and (explicit_sentence_end or is_sentence_boundary_period(normalized, index, period_gap))
        )
        if not is_boundary:
            index += 1
            continue

        end = index + 1
        while end < len(normalized) and normalized[end] in ".?!。？！":
            end += 1
        while end < len(normalized) and normalized[end] in "\"'”’)]}》」』":
            end += 1

        sentence = normalized[cursor:end].strip()
        if format_display:
            sentence = normalize_sentence_display_spacing(sentence)
        if sentence:
            sentences.append(sentence)
        cursor = end
        index = end

    trailing_text = normalized[cursor:].strip()
    if format_display:
        trailing_text = normalize_sentence_display_spacing(trailing_text)
    if trailing_text:
        sentences.append(trailing_text)

    return merge_overlapping_sentence_boundaries(sentences)


def normalize_sentence_display_spacing(text: str) -> str:
    normalized = re.sub(r"(?<=[A-Z])\.\s+(?=[A-Z]\.)", ".", text)
    return re.sub(r"\b((?:[A-Za-z]\.)+[A-Za-z])\.(?=[A-Za-z])", r"\1. ", normalized)


def is_sentence_boundary_period(text: str, period_index: int, following_gap_seconds: float | None = None) -> bool:
    previous_character = text[period_index - 1] if period_index > 0 else ""
    next_character = text[period_index + 1] if period_index + 1 < len(text) else ""

    if previous_character.isdigit() and next_character.isdigit():
        return False

    if (
        previous_character.isalpha()
        and next_character.isalpha()
        and period_index + 2 < len(text)
        and text[period_index + 2] == "."
    ):
        return False

    following_match = re.match(r"\s*([A-Za-z]+)", text[period_index + 1 :])
    if not following_match:
        return True

    previous_token_match = re.search(r"([A-Za-z](?:\.[A-Za-z])*)$", text[:period_index])
    previous_token = previous_token_match.group(1) if previous_token_match else ""
    next_word = following_match.group(1)

    if re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]", previous_token):
        if next_character.isalpha():
            return False
        return abbreviation_starts_new_sentence(next_word, following_gap_seconds)

    abbreviation_match = re.search(r"([A-Za-z]+)$", text[:period_index])
    abbreviation = abbreviation_match.group(1).lower() if abbreviation_match else ""
    if abbreviation in SIMPLE_ABBREVIATIONS:
        return abbreviation_starts_new_sentence(next_word, following_gap_seconds)

    if len(previous_token) == 1 and previous_token.isupper():
        return abbreviation_starts_new_sentence(next_word, following_gap_seconds)

    return True


def abbreviation_starts_new_sentence(next_word: str, following_gap_seconds: float | None) -> bool:
    if following_gap_seconds is not None and following_gap_seconds > ABBREVIATION_PAUSE_THRESHOLD_SECONDS:
        return True

    return next_word in ABBREVIATION_SENTENCE_STARTERS


def sentence_period_gap_seconds(
    text: str,
    period_index: int,
    words: list[dict[str, Any]] | None,
) -> float | None:
    word_index = sentence_period_word_index(text, period_index, words)
    if word_index is None or not words or word_index + 1 >= len(words):
        return None

    return word_gap_seconds(words, word_index)


def sentence_period_has_explicit_boundary(
    text: str,
    period_index: int,
    words: list[dict[str, Any]] | None,
) -> bool:
    word_index = sentence_period_word_index(text, period_index, words)
    return bool(word_index is not None and words and words[word_index].get("sentence_end"))


def sentence_period_word_index(
    text: str,
    period_index: int,
    words: list[dict[str, Any]] | None,
) -> int | None:
    if not words:
        return None

    token_position = len(sentence_word_tokens(text[: period_index + 1])) - 1
    if token_position < 0:
        return None

    token_word_indexes: list[int] = []
    for word_index, word in enumerate(words):
        token_count = max(1, len(sentence_word_tokens(str(word.get("text") or ""))))
        token_word_indexes.extend([word_index] * token_count)

    if token_position >= len(token_word_indexes):
        return None

    current_word_index = token_word_indexes[token_position]
    if token_position + 1 < len(token_word_indexes) and token_word_indexes[token_position + 1] == current_word_index:
        return None

    return current_word_index


def word_has_sentence_boundary(
    words: list[dict[str, Any]],
    word_index: int,
    pause_threshold: float,
) -> bool:
    word = words[word_index]
    text = str(word.get("text") or "").strip()
    if bool(word.get("sentence_end")):
        return True
    if not is_sentence_end_word(text):
        return False

    normalized = text.rstrip().rstrip("\"'”’)]}》」』").rstrip()
    if not normalized.endswith("."):
        return True

    core = normalized[:-1]
    next_word = words[word_index + 1] if word_index + 1 < len(words) else None
    if next_word is None:
        return True

    next_tokens = sentence_word_tokens(str(next_word.get("text") or ""))
    next_token = next_tokens[0] if next_tokens else ""
    if not next_token:
        return True

    if len(core) == 1 and core.isupper():
        if word_index + 1 < len(words):
            next_text = str(words[word_index + 1].get("text") or "").strip()
            next_core = next_text.rstrip(".")
            if len(next_core) == 1 and next_core.isupper() and next_text.endswith("."):
                return False

        previous_text = str(words[word_index - 1].get("text") or "").strip() if word_index > 0 else ""
        previous_core = previous_text.rstrip(".")
        if len(previous_core) == 1 and previous_core.isupper() and previous_text.endswith("."):
            return abbreviation_starts_new_sentence(next_token, word_gap_seconds(words, word_index))

        return abbreviation_starts_new_sentence(next_token, word_gap_seconds(words, word_index))

    if re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]", core) or core.lower() in SIMPLE_ABBREVIATIONS:
        gap = word_gap_seconds(words, word_index)
        if gap > pause_threshold:
            return True
        return abbreviation_starts_new_sentence(next_token, gap)

    return True


def word_gap_seconds(words: list[dict[str, Any]], word_index: int) -> float:
    if word_index + 1 >= len(words):
        return 0.0

    return max(
        0.0,
        (int_value(words[word_index + 1].get("begin_time")) - int_value(words[word_index].get("end_time"))) / 1000,
    )


def sentence_word_tokens(text: str) -> list[str]:
    return [token for token, _punctuation in sentence_punctuated_tokens(text)]


def sentence_punctuated_tokens(text: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|[\u4e00-\u9fff]", text))
    tokens: list[tuple[str, str]] = []

    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        punctuation = re.sub(r"\s+", "", text[match.end() : next_start])
        tokens.append((match.group(0), punctuation))

    return tokens


def append_word_punctuation(word: dict[str, Any], punctuation: str, sentence_end: bool) -> None:
    word_text_value = str(word.get("text") or "").strip()
    if not word_text_value or is_sentence_end_text(word_text_value):
        return

    cleaned_punctuation = re.sub(r"\s+", "", punctuation)
    if not cleaned_punctuation or word_text_value.endswith(cleaned_punctuation):
        return

    word["text"] = f"{word_text_value}{cleaned_punctuation}"
    if sentence_end:
        word["sentence_end"] = True


def segment_words(segment: dict[str, Any]) -> list[dict[str, Any]]:
    words = segment.get("words")

    return words if isinstance(words, list) else []


def segment_from_words(words: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "end": int_value(words[-1].get("end_time")) / 1000,
        "start": int_value(words[0].get("begin_time")) / 1000,
        "text": join_subtitle_words(words),
        "words": words,
    }


def merge_segments(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    words = segment_words(left) + segment_words(right)
    if words:
        return segment_from_words(words)

    return {
        "end": right.get("end"),
        "start": left.get("start"),
        "text": f"{str(left.get('text') or '').strip()} {str(right.get('text') or '').strip()}".strip(),
    }


def join_subtitle_words(words: list[dict[str, Any]]) -> str:
    text = ""

    for word in words:
        token = str(word.get("text") or "").strip()
        if not token:
            continue

        if not text:
            text = token
        elif no_space_before(token) or no_space_after(text[-1]):
            text += token
        else:
            text += f" {token}"

    return text.strip()


def no_space_before(token: str) -> bool:
    return token[0] in ".,!?;:%)]}”’》」』"


def no_space_after(character: str) -> bool:
    return character in "([{“‘《「『"


def starts_with_continuation(text: str) -> bool:
    return text.startswith(("And ", "But ", "Or ", "So "))


def is_sentence_end_word(word: str) -> bool:
    return is_sentence_end_text(word)


def is_sentence_end_text(text: str) -> bool:
    normalized = text.rstrip().rstrip("\"'”’)]}》」』").rstrip()
    return normalized.endswith((".", "?", "!", "。", "？", "！"))


def segments_to_srt(segments: list[dict[str, Any]]) -> str:
    cues: list[str] = []
    cursor = 0.0

    for index, segment in enumerate(segments, start=1):
        text = string_field(segment, "text") or ""
        if not text.strip():
            continue

        start = segment_time_seconds(segment, ("begin_time", "start_time"), default=None)
        if start is None:
            start = segment_time_seconds(segment, ("start", "begin"), default=cursor)

        end = segment_time_seconds(segment, ("end_time",), default=None)
        if end is None:
            end = segment_time_seconds(segment, ("end",), default=start + max(2.0, len(text) / 8))

        if end <= start:
            end = start + max(1.5, len(text) / 8)

        cursor = end
        cues.append(f"{index}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text.strip()}")

    return "\n\n".join(cues)


def segment_time_seconds(segment: dict[str, Any], keys: tuple[str, ...], default: float | None) -> float | None:
    for key in keys:
        if key not in segment:
            continue

        raw_value = segment.get(key)
        numeric_value = float_value(raw_value)

        if numeric_value is None:
            continue

        if key in {"begin_time", "end_time", "start_time"} or numeric_value > 10000:
            return numeric_value / 1000

        return numeric_value

    return default


def plain_text_from_response(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("transcript", "text", "content"):
            field_value = value.get(key)
            if isinstance(field_value, str) and field_value.strip() and not looks_like_srt(field_value):
                return field_value.strip()

        for child in value.values():
            found = plain_text_from_response(child)
            if found:
                return found

    if isinstance(value, list):
        for child in value:
            found = plain_text_from_response(child)
            if found:
                return found

    return ""


def plain_text_to_srt(value: str) -> str:
    return f"1\n00:00:00,000 --> 00:00:05,000\n{value.strip()}"


def normalize_srt_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").strip().replace("\n", "\r\n")


def looks_like_srt(value: str) -> bool:
    return "-->" in value and any(character.isdigit() for character in value[:20])


def format_srt_time(seconds: float) -> str:
    milliseconds_total = max(0, round(seconds * 1000))
    milliseconds = milliseconds_total % 1000
    seconds_total = milliseconds_total // 1000
    hours = seconds_total // 3600
    minutes = (seconds_total % 3600) // 60
    seconds_value = seconds_total % 60

    return f"{hours:02}:{minutes:02}:{seconds_value:02},{milliseconds:03}"


def float_value(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None

    return None


def int_value(value: Any) -> int:
    numeric_value = float_value(value)

    return round(numeric_value) if numeric_value is not None else 0


def bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}

    return bool(value)


def string_field(value: dict[str, Any], key: str) -> str | None:
    field_value = value.get(key)

    return field_value.strip() if isinstance(field_value, str) and field_value.strip() else None


def provider_error_code(detail: Any, status_code: int) -> str:
    if isinstance(detail, dict):
        code = detail.get("code") or detail.get("error_code")
        if isinstance(code, str):
            return code
        error = detail.get("error")
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            return error["code"]

    if status_code in (401, 403):
        return "DASHSCOPE_AUTH_FAILED"
    if status_code == 404:
        return "DASHSCOPE_RESOURCE_NOT_FOUND"
    return f"DASHSCOPE_HTTP_{status_code}"


def provider_error_message(detail: Any, status_code: int) -> str:
    if status_code in (401, 403):
        return "DASHSCOPE_API_KEY 无效或权限不足"

    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("error_message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        error = detail.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]

    if status_code == 404:
        return "阿里云语音资源不存在"
    return f"阿里云语音接口请求失败：HTTP {status_code}"


def customization_path() -> str:
    return "/services/audio/tts/customization"


def supports_system_voice(model: str) -> bool:
    normalized = model.strip().lower()

    return normalized in {"qwen-audio-3.1-tts-flash", "cosyvoice-v3-flash", "cosyvoice-v3-plus", "cosyvoice-v2", "cosyvoice-v1", "sambert"}


def normalized_volume(value: float) -> int | float:
    if 0 <= value <= 2:
        return round(value * 50)
    return value


def normalized_prefix(value: str) -> str:
    prefix = "".join(character.lower() for character in value if character.isascii() and character.isalnum())[:10]
    return prefix or "voice"


def normalize_designed_voice_response(response: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(response)
    audio_base64 = nested_string(response, ["output", "preview_audio", "data"])
    audio_url = nested_string(response, ["output", "preview_audio", "url"])

    if audio_base64:
        normalized["audioBase64"] = audio_base64
    if audio_url:
        normalized["audioUrl"] = audio_url
        normalized["previewAudioUrl"] = audio_url

    return normalized


def nested_string(value: dict[str, Any], path: list[str]) -> str | None:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, str) and current.strip() else None


def request_id_from_response(value: dict[str, Any]) -> str | None:
    request_id = value.get("request_id") or value.get("requestId")
    return request_id if isinstance(request_id, str) else None
