from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class AbeiaiAudioError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 502):
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.terminal = False


@dataclass(frozen=True)
class AbeiaiAudioConfig:
    base_url: str
    api_key: str
    timeout_seconds: int = 45


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


class AbeiaiAudioAdapter:
    def __init__(self, config: AbeiaiAudioConfig):
        self.config = config

    def synthesize_speech(self, *, model: str, voice: str, text: str) -> dict[str, Any]:
        if model != "IndexTTS-2.5":
            raise AbeiaiAudioError("ABEI_AUDIO_MODEL_UNSUPPORTED", "阿贝智能语音模型不受支持", 400)
        if not text or len(text) > 7000:
            raise AbeiaiAudioError("ABEI_AUDIO_TEXT_INVALID", "语音合成文本需为 1 到 7000 字符", 400)
        if voice != "default" and not self._trusted_voice_url(voice):
            raise AbeiaiAudioError("ABEI_AUDIO_VOICE_INVALID", "参考音频地址无效", 400)

        started_at = time.monotonic()
        endpoint = f"{self.config.base_url.rstrip('/')}/audio/speech"
        request = urllib.request.Request(
            endpoint,
            data=json.dumps({"model": model, "input": text, "voice": voice}, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                payload = json.load(response)
        except (urllib.error.URLError, ValueError) as error:
            raise AbeiaiAudioError("ABEI_AUDIO_REQUEST_FAILED", "阿贝智能语音合成失败") from error

        audio_url = payload.get("audio_url") if isinstance(payload, dict) else None
        if not isinstance(audio_url, str) or not self._trusted_audio_url(audio_url):
            raise AbeiaiAudioError("ABEI_AUDIO_OUTPUT_INVALID", "阿贝智能未返回可信的音频地址")

        try:
            opener = urllib.request.build_opener(NoRedirect)
            with opener.open(audio_url, timeout=self.config.timeout_seconds) as response:
                audio = response.read(20 * 1024 * 1024 + 1)
        except urllib.error.URLError as error:
            raise AbeiaiAudioError("ABEI_AUDIO_DOWNLOAD_FAILED", "阿贝智能音频下载失败") from error

        if len(audio) < 12 or len(audio) > 20 * 1024 * 1024 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
            raise AbeiaiAudioError("ABEI_AUDIO_OUTPUT_INVALID", "阿贝智能返回的 WAV 音频文件无效")

        return {
            "provider": "abeiai_audio",
            "model": model,
            "voice": voice,
            "audioBase64": base64.b64encode(audio).decode("ascii"),
            "audioMimeType": "audio/wav",
            "usage": {"inputCharacters": len(text)},
            "latencyMs": round((time.monotonic() - started_at) * 1000),
        }

    def _trusted_audio_url(self, value: str) -> bool:
        try:
            parsed = urllib.parse.urlsplit(value)
            return (
                parsed.scheme == "https"
                and parsed.hostname == "dmx04.sdts.net.cn"
                and parsed.port is None
                and parsed.username is None
                and parsed.password is None
                and (parsed.path.startswith("/audios/") or parsed.path.startswith("/dl/"))
            )
        except ValueError:
            return False

    def _trusted_voice_url(self, value: str) -> bool:
        try:
            parsed = urllib.parse.urlsplit(value)
            return (
                parsed.scheme == "https"
                and parsed.hostname in {"cdn.xueleai.com", "dmx04.sdts.net.cn"}
                and parsed.port is None
                and parsed.username is None
                and parsed.password is None
            )
        except ValueError:
            return False
