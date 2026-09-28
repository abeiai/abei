import unittest

from app.audio_gateway.providers.dashscope_audio_adapter import (
    DashScopeAudioAdapter,
    DashScopeAudioConfig,
)


class CapturingDashScopeAudioAdapter(DashScopeAudioAdapter):
    def __init__(self):
        super().__init__(
            DashScopeAudioConfig(
                base_url="https://dashscope.example.com/api/v1",
                web_socket_url=None,
                api_key="test-key",
                timeout_seconds=5,
            )
        )
        self.path = ""
        self.payload = {}

    def _post_json(self, path, payload, extra_headers=None):
        self.path = path
        self.payload = payload
        return {
            "output": {
                "voice_id": "voice-test-1",
                "preview_audio": {
                    "data": "UklGRg=="
                },
            },
            "request_id": "req-voice-design",
        }


class DashScopeVoiceDesignTest(unittest.TestCase):
    def test_voice_design_uses_dashscope_create_voice_action(self):
        adapter = CapturingDashScopeAudioAdapter()

        response = adapter.create_designed_voice(
            target_model="cosyvoice-v3.5-plus",
            voice_prompt="一位亲切的中学女英语教师，声音清晰有力。",
            name="严厉女教师",
            preview_text="今天我们来讲讲华盛顿。",
        )

        self.assertEqual(adapter.path, "/services/audio/tts/customization")
        self.assertEqual(adapter.payload["model"], "voice-enrollment")
        self.assertEqual(adapter.payload["input"]["action"], "create_voice")
        self.assertEqual(adapter.payload["input"]["target_model"], "cosyvoice-v3.5-plus")
        self.assertEqual(adapter.payload["input"]["voice_prompt"], "一位亲切的中学女英语教师，声音清晰有力。")
        self.assertEqual(adapter.payload["input"]["preview_text"], "今天我们来讲讲华盛顿。")
        self.assertEqual(adapter.payload["parameters"]["sample_rate"], 24000)
        self.assertEqual(adapter.payload["parameters"]["response_format"], "wav")
        self.assertEqual(response["output"]["voice_id"], "voice-test-1")
        self.assertEqual(response["audioBase64"], "UklGRg==")


if __name__ == "__main__":
    unittest.main()
