from app.audio_gateway.providers.dashscope_audio_adapter import (
    DashScopeAudioAdapter,
    DashScopeAudioConfig,
    DashScopeAudioError,
)


class StubDashScopeAudioAdapter(DashScopeAudioAdapter):
    def __init__(self):
        super().__init__(
            DashScopeAudioConfig(
                base_url="https://dashscope.example.com/api/v1",
                web_socket_url=None,
                api_key="test-key",
                timeout_seconds=5,
            )
        )
        self.submission = {"output": {"task_id": "task-1", "task_status": "PENDING"}, "request_id": "req-1"}
        self.query_response = {"output": {"task_id": "task-1", "task_status": "RUNNING"}, "request_id": "req-2"}
        self.result_text = ""

    def _post_json(self, path, payload, extra_headers=None):
        return self.submission

    def _request_json(self, method, path, payload=None, extra_headers=None):
        return self.query_response

    def _get_text(self, url):
        return self.result_text


def test_submit_asr_task_returns_provider_task_id_without_polling():
    adapter = StubDashScopeAudioAdapter()

    result = adapter.submit_transcription(
        model="qwen3-asr-flash",
        media_url="https://r2.example.com/asr.m4a",
        media_mime_type="audio/mp4",
        media_name="lesson.asr.m4a",
        language="auto",
        format="srt",
    )

    assert result["providerTaskId"] == "task-1"
    assert result["status"] == "PENDING"
    assert result["requestModel"] == "qwen3-asr-flash-filetrans"


def test_query_asr_task_reports_pending_without_treating_it_as_failure():
    adapter = StubDashScopeAudioAdapter()

    result = adapter.query_transcription_task(
        task_id="task-1",
        model="qwen3-asr-flash",
        media_mime_type="audio/mp4",
        media_name="lesson.asr.m4a",
        format="srt",
    )

    assert result["status"] == "PENDING"
    assert result["providerStatus"] == "RUNNING"


def test_query_asr_task_downloads_successful_result():
    adapter = StubDashScopeAudioAdapter()
    adapter.query_response = {
        "output": {
            "task_id": "task-1",
            "task_status": "SUCCEEDED",
            "results": [{"transcription_url": "https://result.example.com/result.json"}],
        },
        "request_id": "req-success",
    }
    adapter.result_text = '{"sentences":[{"begin_time":0,"end_time":1200,"text":"Hello world."}]}'

    result = adapter.query_transcription_task(
        task_id="task-1",
        model="qwen3-asr-flash",
        media_mime_type="audio/mp4",
        media_name="lesson.asr.m4a",
        format="srt",
    )

    assert result["status"] == "SUCCEEDED"
    assert "Hello world." in result["subtitleText"]
    assert result["requestId"] == "req-success"


def test_query_asr_task_preserves_terminal_provider_error():
    adapter = StubDashScopeAudioAdapter()
    adapter.query_response = {
        "output": {
            "task_id": "task-1",
            "task_status": "FAILED",
            "code": "InvalidFile.DownloadFailed",
            "message": "file cannot be downloaded",
        }
    }

    try:
        adapter.query_transcription_task(
            task_id="task-1",
            model="qwen3-asr-flash",
            media_mime_type="audio/mp4",
            media_name="lesson.asr.m4a",
            format="srt",
        )
    except DashScopeAudioError as error:
        assert error.error_code == "InvalidFile.DownloadFailed"
        assert error.message == "file cannot be downloaded"
        assert error.terminal is True
    else:
        raise AssertionError("terminal ASR failure must raise DashScopeAudioError")
