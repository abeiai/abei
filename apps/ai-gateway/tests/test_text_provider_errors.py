import unittest

from app.main import provider_error


class TextProviderErrorTests(unittest.TestCase):
    def test_provider_error_preserves_original_http_status_for_retry_classification(self):
        error = provider_error("Throttling.RateQuota", "请求过于频繁", 429)

        self.assertEqual(error.status_code, 502)
        self.assertEqual(error.detail["errorCode"], "Throttling.RateQuota")
        self.assertEqual(error.detail["errorMessage"], "请求过于频繁")
        self.assertEqual(error.detail["providerStatusCode"], 429)


if __name__ == "__main__":
    unittest.main()
