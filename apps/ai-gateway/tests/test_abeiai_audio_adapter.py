import io
import json
import unittest
from unittest.mock import patch

from app.audio_gateway.providers.abeiai_audio_adapter import (
    AbeiaiAudioAdapter,
    AbeiaiAudioConfig,
    AbeiaiAudioError,
)
from app import main


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = io.BytesIO(body)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size: int = -1):
        return self.body.read(size)


class FakeOpener:
    def open(self, url: str, timeout: int):
        assert url == "https://dmx04.sdts.net.cn/audios/test.wav"
        assert timeout == 30
        return FakeResponse(b"RIFF\x04\x00\x00\x00WAVE")


class AbeiaiAudioAdapterTest(unittest.TestCase):
    def setUp(self):
        self.adapter = AbeiaiAudioAdapter(AbeiaiAudioConfig("https://dmx04.sdts.net.cn/v1", "test-key", 30))

    def test_speech_response_is_downloaded_for_persistent_storage(self):
        payload = json.dumps({"audio_url": "https://dmx04.sdts.net.cn/audios/test.wav"}).encode()
        with patch("urllib.request.urlopen", return_value=FakeResponse(payload)) as request, patch(
            "urllib.request.build_opener", return_value=FakeOpener()
        ):
            result = self.adapter.synthesize_speech(model="IndexTTS-2.5", voice="default", text="你好")

        self.assertEqual(result["audioBase64"], "UklGRgQAAABXQVZF")
        self.assertEqual(result["audioMimeType"], "audio/wav")
        self.assertEqual(result["usage"]["inputCharacters"], 2)
        body = json.loads(request.call_args.args[0].data.decode())
        self.assertEqual(body, {"model": "IndexTTS-2.5", "input": "你好", "voice": "default"})

    def test_rejects_external_audio_download(self):
        payload = json.dumps({"audio_url": "https://evil.example/audios/test.wav"}).encode()
        with patch("urllib.request.urlopen", return_value=FakeResponse(payload)):
            with self.assertRaises(AbeiaiAudioError):
                self.adapter.synthesize_speech(model="IndexTTS-2.5", voice="default", text="你好")

    def test_route_dispatches_to_abeiai(self):
        payload = main.DashScopeTtsRequest(
            baseUrl="https://dmx04.sdts.net.cn/v1", apiKey="test-key", providerKey="abeiai_audio",
            adapterType="OPENAI_COMPATIBLE", model="IndexTTS-2.5", voice="default", text="你好",
        )
        with patch.object(main, "abeiai_audio_adapter", return_value=self.adapter), patch.object(
            self.adapter, "synthesize_speech", return_value={"provider": "abeiai_audio"}
        ) as synthesize:
            result = main.synthesize_speech(payload)
        self.assertEqual(result["provider"], "abeiai_audio")
        synthesize.assert_called_once_with(model="IndexTTS-2.5", voice="default", text="你好")


if __name__ == "__main__":
    unittest.main()
