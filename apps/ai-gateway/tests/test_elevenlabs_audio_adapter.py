import base64
import json
import unittest

from app.audio_gateway.providers.elevenlabs_audio_adapter import (
    ElevenLabsAudioAdapter,
    ElevenLabsAudioConfig,
    ElevenLabsAudioError,
    HttpResponse,
)


class CapturingElevenLabsAdapter(ElevenLabsAudioAdapter):
    def __init__(self):
        super().__init__(
            ElevenLabsAudioConfig(
                base_url="https://api.elevenlabs.io",
                api_key="test-elevenlabs-key",
                timeout_seconds=9,
            )
        )
        self.requests = []
        self.responses = []

    def _request(self, *, method, path, headers, payload=None):
        self.requests.append(
            {
                "method": method,
                "path": path,
                "headers": headers,
                "payload": payload,
            }
        )
        return self.responses.pop(0)


class ElevenLabsAudioAdapterTest(unittest.TestCase):
    def test_tts_sends_provider_contract_and_normalizes_binary_audio(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=b"ID3test",
                headers={"content-type": "audio/mpeg", "request-id": "req-eleven-1"},
            )
        )

        result = adapter.synthesize_speech(
            model="eleven_multilingual_v2",
            voice="voice/a b",
            text="你好世界",
            format="mp3",
            speed=1.1,
        )

        request = adapter.requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(
            request["path"],
            "/v1/text-to-speech/voice%2Fa%20b?output_format=mp3_44100_128",
        )
        self.assertEqual(request["headers"]["xi-api-key"], "test-elevenlabs-key")
        self.assertEqual(request["headers"]["Accept"], "audio/mpeg")
        self.assertEqual(
            json.loads(request["payload"].decode("utf-8")),
            {
                "text": "你好世界",
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"speed": 1.1},
            },
        )
        self.assertEqual(result["provider"], "elevenlabs_audio")
        self.assertEqual(result["model"], "eleven_multilingual_v2")
        self.assertEqual(result["voice"], "voice/a b")
        self.assertEqual(result["audioBase64"], base64.b64encode(b"ID3test").decode("ascii"))
        self.assertEqual(result["audioMimeType"], "audio/mpeg")
        self.assertEqual(result["requestId"], "req-eleven-1")
        self.assertEqual(result["usage"], {"inputCharacters": 4})

    def test_pcm_output_is_wrapped_as_real_wav(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=b"\x00\x01\x02\x03",
                headers={"content-type": "audio/pcm"},
            )
        )

        result = adapter.synthesize_speech(
            model="eleven_flash_v2_5",
            voice="voice-1",
            text="试听",
            format="wav",
            sample_rate=24000,
        )

        self.assertEqual(
            adapter.requests[0]["path"],
            "/v1/text-to-speech/voice-1?output_format=pcm_24000",
        )
        wav_bytes = base64.b64decode(result["audioBase64"])
        self.assertEqual(wav_bytes[:4], b"RIFF")
        self.assertEqual(wav_bytes[8:12], b"WAVE")
        self.assertEqual(result["audioMimeType"], "audio/wav")

    def test_v3_rejects_more_than_5000_characters_before_network(self):
        adapter = CapturingElevenLabsAdapter()

        with self.assertRaises(ElevenLabsAudioError) as context:
            adapter.synthesize_speech(
                model="eleven_v3",
                voice="voice-1",
                text="测" * 5001,
            )

        self.assertEqual(context.exception.error_code, "ELEVENLABS_TEXT_TOO_LONG")
        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(adapter.requests, [])

    def test_connection_verifies_requested_model_when_models_read_is_allowed(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=json.dumps(
                    [
                        {
                            "model_id": "eleven_multilingual_v2",
                            "can_do_text_to_speech": True,
                        }
                    ]
                ).encode("utf-8"),
                headers={"content-type": "application/json"},
            )
        )

        result = adapter.test_connection("eleven_multilingual_v2")

        self.assertTrue(result["success"])
        self.assertTrue(result["modelVerified"])
        self.assertEqual(adapter.requests[0]["method"], "GET")
        self.assertEqual(adapter.requests[0]["path"], "/v1/models")

    def test_connection_falls_back_to_tts_permission_when_models_read_is_denied(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.extend(
            [
                HttpResponse(
                    body=json.dumps(
                        {
                            "detail": {
                                "status": "missing_permissions",
                                "message": "The API key is missing the permission models_read.",
                            }
                        }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                    status_code=401,
                ),
                HttpResponse(
                    body=json.dumps(
                    {
                        "detail": [
                            {
                                "type": "missing",
                                "loc": ["body", "text"],
                                "msg": "Field required",
                            }
                        ]
                    }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                    status_code=422,
                ),
            ]
        )

        result = adapter.test_connection("eleven_multilingual_v2")

        self.assertTrue(result["success"])
        self.assertFalse(result["modelVerified"])
        self.assertIn("首次合成", result["message"])
        self.assertEqual(adapter.requests[0]["path"], "/v1/models")
        self.assertEqual(adapter.requests[1]["method"], "POST")
        self.assertEqual(
            adapter.requests[1]["path"],
            "/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
        )
        self.assertEqual(
            json.loads(adapter.requests[1]["payload"].decode("utf-8")),
            {"model_id": "eleven_multilingual_v2"},
        )

    def test_connection_rejects_unrelated_422_response(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.extend(
            [
                HttpResponse(
                    body=json.dumps(
                        {
                            "detail": {
                                "status": "missing_permissions",
                                "message": "The API key is missing the permission models_read.",
                            }
                        }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                    status_code=401,
                ),
                HttpResponse(
                    body=json.dumps(
                    {
                        "detail": [
                            {
                                "type": "value_error",
                                "loc": ["body", "model_id"],
                                "msg": "Model is unavailable",
                            }
                        ]
                    }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                    status_code=422,
                ),
            ]
        )

        with self.assertRaises(ElevenLabsAudioError) as context:
            adapter.test_connection("eleven_v3")

        self.assertEqual(context.exception.error_code, "ELEVENLABS_INVALID_REQUEST")

    def test_connection_rejects_model_missing_from_readable_model_list(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=json.dumps(
                    [
                        {
                            "model_id": "eleven_flash_v2_5",
                            "can_do_text_to_speech": True,
                        }
                    ]
                ).encode("utf-8"),
                headers={"content-type": "application/json"},
            )
        )

        with self.assertRaises(ElevenLabsAudioError) as context:
            adapter.test_connection("eleven_v3")

        self.assertEqual(context.exception.error_code, "ELEVENLABS_MODEL_UNAVAILABLE")

    def test_default_voice_sync_uses_filtered_pagination_and_normalizes_metadata(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.extend(
            [
                HttpResponse(
                    body=json.dumps(
                        {
                            "voices": [
                                {
                                    "voice_id": "voice-1",
                                    "name": "Aria",
                                    "category": "premade",
                                    "description": "Warm narrator",
                                    "preview_url": "https://cdn.example/aria.mp3",
                                    "labels": {"gender": "female", "accent": "American"},
                                    "verified_languages": [
                                        {"language": "en", "model_id": "eleven_multilingual_v2"}
                                    ],
                                }
                            ],
                            "has_more": True,
                            "next_page_token": "next token",
                        }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                ),
                HttpResponse(
                    body=json.dumps(
                        {
                            "voices": [
                                {
                                    "voice_id": "voice-2",
                                    "name": "Roger",
                                    "category": "premade",
                                    "description": None,
                                    "preview_url": None,
                                    "labels": {"gender": "male"},
                                    "verified_languages": [],
                                }
                            ],
                            "has_more": False,
                            "next_page_token": None,
                        }
                    ).encode("utf-8"),
                    headers={"content-type": "application/json"},
                ),
            ]
        )

        voices = adapter.list_default_voices()

        self.assertEqual(
            [request["path"] for request in adapter.requests],
            [
                "/v2/voices?page_size=100&voice_type=default&include_total_count=false",
                "/v2/voices?page_size=100&voice_type=default&include_total_count=false&next_page_token=next%20token",
            ],
        )
        self.assertEqual(
            voices,
            [
                {
                    "providerVoiceId": "voice-1",
                    "name": "Aria",
                    "description": "Warm narrator",
                    "previewAudioUrl": "https://cdn.example/aria.mp3",
                    "language": "en",
                    "labels": {"gender": "female", "accent": "American"},
                },
                {
                    "providerVoiceId": "voice-2",
                    "name": "Roger",
                    "description": None,
                    "previewAudioUrl": None,
                    "language": None,
                    "labels": {"gender": "male"},
                },
            ],
        )

    def test_provider_errors_are_chinese_and_do_not_echo_secret_or_upstream_body(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=b'{"detail":{"message":"secret test-elevenlabs-key"}}',
                headers={"content-type": "application/json"},
                status_code=401,
            )
        )

        with self.assertRaises(ElevenLabsAudioError) as context:
            adapter.test_connection("eleven_v3")

        self.assertEqual(context.exception.error_code, "ELEVENLABS_AUTH_FAILED")
        self.assertEqual(context.exception.message, "ElevenLabs API Key 无效或无权访问")
        self.assertNotIn("test-elevenlabs-key", context.exception.message)

    def test_default_voice_sync_explains_missing_voices_read_permission(self):
        adapter = CapturingElevenLabsAdapter()
        adapter.responses.append(
            HttpResponse(
                body=json.dumps(
                    {
                        "detail": {
                            "status": "missing_permissions",
                            "message": "The API key is missing the permission voices_read.",
                        }
                    }
                ).encode("utf-8"),
                headers={"content-type": "application/json"},
                status_code=401,
            )
        )

        with self.assertRaises(ElevenLabsAudioError) as context:
            adapter.list_default_voices()

        self.assertEqual(context.exception.error_code, "ELEVENLABS_VOICES_READ_PERMISSION_REQUIRED")
        self.assertEqual(context.exception.message, "ElevenLabs API Key 需要开启 voices_read 权限后才能同步默认音色")


if __name__ == "__main__":
    unittest.main()
