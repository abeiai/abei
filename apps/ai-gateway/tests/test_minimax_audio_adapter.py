import unittest

from app.audio_gateway.providers.minimax_audio_adapter import (
    MiniMaxAudioAdapter,
    MiniMaxAudioConfig,
)


class CapturingMiniMaxAudioAdapter(MiniMaxAudioAdapter):
    def __init__(self):
        super().__init__(
            MiniMaxAudioConfig(
                base_url="https://api.minimaxi.example.com",
                api_key="test-key",
                timeout_seconds=5,
            )
        )
        self.path = ""
        self.payload = {}

    def _post_json(self, path, payload):
        self.path = path
        self.payload = payload

        if path == "/v1/voice_design":
            return {
                "voice_id": "minimax-voice-1",
                "trial_audio": "52494646",
                "trace_id": "trace-design",
                "base_resp": {
                    "status_code": 0,
                    "status_msg": "success",
                },
            }

        return {
            "data": {
                "audio": "52494646",
                "usage": {
                    "characters": 4,
                },
            },
            "trace_id": "trace-tts",
            "base_resp": {
                "status_code": 0,
                "status_msg": "success",
            },
        }


class MiniMaxAudioAdapterTest(unittest.TestCase):
    def test_voice_design_uses_minimax_prompt_payload(self):
        adapter = CapturingMiniMaxAudioAdapter()

        response = adapter.create_designed_voice(
            target_model="minimax-voice-design",
            voice_prompt="一位亲切的中学女英语教师，声音清晰有力。",
            name="严厉女教师",
            preview_text="今天我们来讲讲华盛顿。",
        )

        self.assertEqual(adapter.path, "/v1/voice_design")
        self.assertEqual(adapter.payload["prompt"], "一位亲切的中学女英语教师，声音清晰有力。")
        self.assertEqual(adapter.payload["preview_text"], "今天我们来讲讲华盛顿。")
        self.assertEqual(response["provider"], "minimax_audio")
        self.assertEqual(response["providerVoiceId"], "minimax-voice-1")
        self.assertEqual(response["audioBase64"], "UklGRg==")
        self.assertEqual(response["audioMimeType"], "audio/mpeg")

    def test_tts_uses_minimax_t2a_v2_payload(self):
        adapter = CapturingMiniMaxAudioAdapter()

        response = adapter.synthesize_speech(
            model="speech-2.8-hd",
            voice="male-qn-qingse",
            text="连接测试",
            format="mp3",
            sample_rate=32000,
            speed=1.1,
            pitch=100,
            volume=0.8,
        )

        self.assertEqual(adapter.path, "/v1/t2a_v2")
        self.assertEqual(adapter.payload["model"], "speech-2.8-hd")
        self.assertEqual(adapter.payload["stream"], False)
        self.assertEqual(adapter.payload["voice_setting"]["voice_id"], "male-qn-qingse")
        self.assertEqual(adapter.payload["voice_setting"]["speed"], 1.1)
        self.assertEqual(adapter.payload["voice_setting"]["pitch"], 1)
        self.assertEqual(adapter.payload["voice_setting"]["vol"], 0.8)
        self.assertEqual(adapter.payload["audio_setting"]["sample_rate"], 32000)
        self.assertEqual(adapter.payload["output_format"], "hex")
        self.assertEqual(response["audioBase64"], "UklGRg==")
        self.assertEqual(response["audioMimeType"], "audio/mpeg")


if __name__ == "__main__":
    unittest.main()
