import pytest

from src import ai_client


@pytest.fixture(autouse=True)
def no_api_key(monkeypatch):
    for name in ("GROQ_API_KEY", "AI_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    ai_client._client = None


def test_importing_without_a_key_does_not_raise():
    # The module is already imported by this point; the assertion that matters
    # is that asking for a client is what fails, not the import.
    assert ai_client.is_configured() is False
    with pytest.raises(ai_client.MissingAPIKey):
        ai_client.client()


def test_key_is_read_from_any_supported_variable(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "generic-key")
    assert ai_client.api_key() == "generic-key"
    monkeypatch.setenv("GROQ_API_KEY", "preferred-key")
    assert ai_client.api_key() == "preferred-key"


def test_gemini_key_is_not_treated_as_configured(monkeypatch):
    # A Google key cannot authenticate against Groq; claiming otherwise turns
    # a clear "not configured" message into an opaque 401.
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.some-google-key")
    assert ai_client.api_key() is None
    assert ai_client.is_configured() is False


def test_model_name_falls_back_to_default(monkeypatch):
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    assert ai_client.model_name() == ai_client.DEFAULT_MODEL
    monkeypatch.setenv("GROQ_MODEL", "custom-model")
    assert ai_client.model_name() == "custom-model"


def test_extract_json_handles_markdown_fences():
    assert ai_client._extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_extract_json_handles_surrounding_prose():
    assert ai_client._extract_json('Sure! {"a": 1} Hope that helps.') == {"a": 1}


def test_extract_json_rejects_garbage():
    with pytest.raises(ValueError):
        ai_client._extract_json("no json at all")


def test_as_str_list_accepts_strings_dicts_and_junk():
    assert ai_client._as_str_list(["a", "", {"description": "b"}, 7, None]) == ["a", "b"]
    assert ai_client._as_str_list("single") == ["single"]
    assert ai_client._as_str_list(None) == []


def test_normalise_history_handles_both_shapes():
    history = [
        {"role": "user", "content": "hi"},
        {"role": "model", "parts": ["hello"]},
        {"role": "assistant", "content": "again"},
        {"role": "user", "content": ""},
        "not a dict",
    ]
    assert ai_client._normalise_history(history) == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "assistant", "content": "again"},
    ]


def test_normalise_history_is_capped():
    history = [{"role": "user", "content": f"m{i}"} for i in range(50)]
    out = ai_client._normalise_history(history)
    assert len(out) == ai_client.MAX_HISTORY_MESSAGES
    assert out[-1]["content"] == "m49"


def test_report_context_is_skipped_when_empty():
    assert ai_client._report_context(None) is None
    assert ai_client._report_context({}) is None
    assert ai_client._report_context({"unrelated": 1}) is None


def test_report_context_includes_the_score():
    context = ai_client._report_context({"url": "https://a.test", "score": 72})
    assert context is not None and "72" in context
