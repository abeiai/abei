import unittest

from app.audio_gateway.providers.dashscope_audio_adapter import (
    DashScopeAudioAdapter,
    DashScopeAudioConfig,
)


class CapturingAdapter(DashScopeAudioAdapter):
    def __init__(self):
        super().__init__(DashScopeAudioConfig(
            base_url="https://dashscope.example.com/api/v1",
            web_socket_url=None,
            api_key="test-key",
        ))
        self.calls = []

    def synthesize_speech(self, **kwargs):
        self.calls.append(kwargs)
        return {"audioUrl": "https://example.com/sample.wav"}

    def list_voices(self, **kwargs):
        raise AssertionError("系统音色模型不应调用自定义音色列表")


class QwenAudioTtsConnectionTest(unittest.TestCase):
    def test_connection_uses_supported_qwen_system_voice(self):
        adapter = CapturingAdapter()
        result = adapter.test_connection("qwen-audio-3.1-tts-flash")

        self.assertTrue(result["success"])
        self.assertEqual(adapter.calls[0]["voice"], "yuxiaoyun_v3.1")
        self.assertEqual(adapter.calls[0]["model"], "qwen-audio-3.1-tts-flash")

    def test_synthesis_places_audio_settings_in_input(self):
        class PayloadAdapter(DashScopeAudioAdapter):
            def __init__(self):
                super().__init__(DashScopeAudioConfig(
                    base_url="https://dashscope.example.com/api/v1",
                    web_socket_url=None,
                    api_key="test-key",
                ))
                self.payload = None

            def _post_json(self, path, payload):
                self.payload = payload
                return {"output": {"audio": {"url": "https://example.com/sample.wav"}}, "usage": {"input_tokens": 4, "output_tokens": 20}}

        adapter = PayloadAdapter()
        result = adapter.synthesize_speech(
            model="qwen-audio-3.1-tts-flash",
            voice="yuxiaoyun_v3.1",
            text="你好",
            format="wav",
            sample_rate=24000,
            speed=1.2,
            volume=1.5,
        )

        self.assertEqual(adapter.payload["input"]["format"], "wav")
        self.assertEqual(adapter.payload["input"]["sample_rate"], 24000)
        self.assertEqual(adapter.payload["input"]["rate"], 1.2)
        self.assertEqual(adapter.payload["input"]["volume"], 75)
        self.assertNotIn("parameters", adapter.payload)
        self.assertEqual(result["usage"]["providerUsage"]["output_tokens"], 20)

        adapter.synthesize_speech(model="cosyvoice-v3-flash", voice="longanyang", text="你好", format="mp3")
        self.assertEqual(adapter.payload["parameters"]["format"], "mp3")


if __name__ == "__main__":
    unittest.main()
