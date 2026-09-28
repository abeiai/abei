import unittest
from unittest.mock import patch

from app import main


class FakeElevenLabsAdapter:
    def __init__(self):
        self.calls = []

    def test_connection(self, model):
        self.calls.append(("test", model))
        return {"success": True, "provider": "elevenlabs_audio", "model": model}

    def synthesize_speech(self, **kwargs):
        self.calls.append(("tts", kwargs))
        return {"provider": "elevenlabs_audio", "model": kwargs["model"]}

    def list_default_voices(self):
        self.calls.append(("voices", None))
        return [{"providerVoiceId": "voice-1", "name": "Aria"}]


class ElevenLabsRoutesTest(unittest.TestCase):
    def setUp(self):
        self.payload = main.DashScopeTtsRequest(
            baseUrl="https://api.elevenlabs.io",
            apiKey="test-key",
            providerKey="elevenlabs_audio",
            adapterType="ELEVENLABS_AUDIO",
            model="eleven_multilingual_v2",
            voice="voice-1",
            text="你好",
        )

    def test_provider_predicate_only_matches_elevenlabs(self):
        self.assertTrue(main.is_elevenlabs_audio(self.payload))
        self.assertFalse(main.is_minimax_audio(self.payload))

    def test_tts_route_dispatches_to_elevenlabs_adapter(self):
        adapter = FakeElevenLabsAdapter()
        with patch.object(main, "elevenlabs_audio_adapter", return_value=adapter):
            result = main.synthesize_speech(self.payload)

        self.assertEqual(result["provider"], "elevenlabs_audio")
        self.assertEqual(adapter.calls[0][0], "tts")
        self.assertEqual(adapter.calls[0][1]["voice"], "voice-1")

    def test_non_billable_connection_and_default_voice_routes_use_same_provider_config(self):
        adapter = FakeElevenLabsAdapter()
        test_payload = main.DashScopeAudioTestRequest(
            baseUrl="https://api.elevenlabs.io",
            apiKey="test-key",
            providerKey="elevenlabs_audio",
            adapterType="ELEVENLABS_AUDIO",
            model="eleven_v3",
        )
        with patch.object(main, "elevenlabs_audio_adapter", return_value=adapter):
            test_result = main.test_elevenlabs_audio(test_payload)
            voice_result = main.list_elevenlabs_default_voices(test_payload)

        self.assertTrue(test_result["success"])
        self.assertEqual(voice_result["voices"][0]["providerVoiceId"], "voice-1")
        self.assertEqual(adapter.calls, [("test", "eleven_v3"), ("voices", None)])


if __name__ == "__main__":
    unittest.main()
