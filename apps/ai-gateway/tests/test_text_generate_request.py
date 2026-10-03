import unittest

from pydantic import ValidationError

from app.main import ChatMessage, TextAttachment, TextGenerateRequest, openai_compatible_request_body, usage_from_provider


class TextGenerateRequestTest(unittest.TestCase):
    def test_abeiai_reasoning_model_has_minimum_output_budget(self):
        request = TextGenerateRequest(
            prompt="你好", input="测试", modelName="Qwen3.5-122B-A10B-FP8", maxTokens=64
        )
        self.assertEqual(openai_compatible_request_body(request)["max_tokens"], 3000)

    def test_abeiai_audio_attachment_uses_audio_url_content(self):
        request = TextGenerateRequest(
            prompt="转写", input="测试", modelName="Qwen2-Audio-7B-Instruct",
            attachments=[TextAttachment(name="voice.wav", type="audio", mimeType="audio/wav", size=4,
                                        dataUrl="data:audio/wav;base64,AAAA")],
        )
        content = openai_compatible_request_body(request)["messages"][0]["content"]
        self.assertEqual(content[1], {"type": "audio_url", "audio_url": {"url": "data:audio/wav;base64,AAAA"}})

    def test_abeiai_multimodal_messages_from_core_are_preserved(self):
        content = [{"type": "text", "text": "转写"},
                   {"type": "audio_url", "audio_url": {"url": "data:audio/wav;base64,AAAA"}}]
        request = TextGenerateRequest(
            prompt="转写", input="测试", modelName="Qwen2-Audio-7B-Instruct",
            messages=[ChatMessage(role="user", content=content)],
        )
        self.assertEqual(openai_compatible_request_body(request)["messages"][0]["content"], content)

    def test_accepts_long_guided_study_prompt(self):
        request = TextGenerateRequest(prompt="p" * 270000, input="英文带学")

        self.assertEqual(len(request.prompt), 270000)

    def test_accepts_complete_picture_book_storyboard_input(self):
        storyboard = "角色、场景、道具和逐页分镜要求。" * 500
        request = TextGenerateRequest(scenarioSlug="picture-book-outline", prompt=storyboard, input=storyboard)

        self.assertEqual(request.input, storyboard)

    def test_rejects_input_beyond_internal_safety_limit(self):
        with self.assertRaises(ValidationError):
            TextGenerateRequest(prompt="分镜", input="字" * 320001)

    def test_rejects_prompt_beyond_internal_safety_limit(self):
        with self.assertRaises(ValidationError):
            TextGenerateRequest(prompt="p" * 320001, input="英文带学")

    def test_defaults_text_scenarios_to_provider_safe_output_tokens(self):
        request = TextGenerateRequest(prompt="prompt", input="AI 场景")

        self.assertEqual(request.maxTokens, 16000)

    def test_accepts_explicit_128k_output_budget_for_capable_models(self):
        request = TextGenerateRequest(prompt="prompt", input="AI 场景", maxTokens=128000)

        self.assertEqual(request.maxTokens, 128000)

    def test_rejects_output_budget_beyond_128k_tokens(self):
        with self.assertRaises(ValidationError):
            TextGenerateRequest(prompt="prompt", input="AI 场景", maxTokens=128001)

    def test_extracts_openai_compatible_cache_usage_details(self):
        usage = usage_from_provider(
            {
                "prompt_tokens": 3019,
                "completion_tokens": 104,
                "total_tokens": 3123,
                "prompt_tokens_details": {
                    "cached_tokens": 2048,
                },
            }
        )

        self.assertEqual(usage.inputCacheHitTokens, 2048)
        self.assertEqual(usage.inputCacheCreationTokens, None)
        self.assertEqual(usage.inputCacheMode, "IMPLICIT")

    def test_extracts_explicit_cache_creation_usage(self):
        usage = usage_from_provider(
            {
                "prompt_tokens": 3019,
                "completion_tokens": 104,
                "total_tokens": 3123,
                "prompt_tokens_details": {
                    "cached_tokens": 1024,
                    "cache_creation_input_tokens": 1536,
                },
            }
        )

        self.assertEqual(usage.inputCacheHitTokens, 1024)
        self.assertEqual(usage.inputCacheCreationTokens, 1536)
        self.assertEqual(usage.inputCacheMode, "EXPLICIT")

    def test_extracts_nested_explicit_cache_creation_usage(self):
        usage = usage_from_provider(
            {
                "prompt_tokens": 3019,
                "completion_tokens": 104,
                "total_tokens": 3123,
                "prompt_tokens_details": {
                    "cached_tokens": 1024,
                    "cache_creation": {
                        "ephemeral_5m_input_tokens": 1536,
                    },
                    "cache_type": "ephemeral",
                },
            }
        )

        self.assertEqual(usage.inputCacheHitTokens, 1024)
        self.assertEqual(usage.inputCacheCreationTokens, 1536)
        self.assertEqual(usage.inputCacheMode, "EXPLICIT")


if __name__ == "__main__":
    unittest.main()
