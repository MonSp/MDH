import json
from unittest import mock

import pytest

from asset_judge import make_judge_from_env, make_llm_judge


def _fake_urlopen(body: str):
    class Resp:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": body}}]}).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    return Resp()


def test_judge_parses_score(monkeypatch):
    calls = {}

    def fake_urlopen(req, timeout):
        calls["url"] = req.full_url
        calls["timeout"] = timeout
        return _fake_urlopen("0.85")

    monkeypatch.setattr("asset_judge.urllib.request.urlopen", fake_urlopen)
    judge = make_llm_judge("k", "https://api.deepseek.com/v1", "deepseek-chat")
    assert judge({"type": "template", "title": "t", "content": "c"}) == 0.85
    assert "chat/completions" in calls["url"] and calls["timeout"] == 30


def test_judge_parses_bare_zero_and_one(monkeypatch):
    # 修复试点正则瑕疵：裸 0 与 1 应可解析（旧正则 `0\.\d+|1\.0|1` 无法匹配裸 0、`1` 会截取 "10" 首位）
    monkeypatch.setattr("asset_judge.urllib.request.urlopen", lambda req, timeout: _fake_urlopen("0"))
    judge = make_llm_judge("k", "https://api.deepseek.com/v1", "deepseek-chat")
    assert judge({"type": "artifact", "title": "t", "content": "c"}) == 0.0
    monkeypatch.setattr("asset_judge.urllib.request.urlopen", lambda req, timeout: _fake_urlopen("1"))
    assert judge({"type": "artifact", "title": "t", "content": "c"}) == 1.0


def test_judge_clamps_out_of_range(monkeypatch):
    monkeypatch.setattr("asset_judge.urllib.request.urlopen", lambda req, timeout: _fake_urlopen("1.5"))
    judge = make_llm_judge("k", "https://api.deepseek.com/v1", "deepseek-chat")
    assert judge({"type": "artifact", "title": "t", "content": "c"}) == 1.0


def test_judge_unparseable_raises(monkeypatch):
    monkeypatch.setattr("asset_judge.urllib.request.urlopen", lambda req, timeout: _fake_urlopen("无法解析"))
    judge = make_llm_judge("k", "https://api.deepseek.com/v1", "deepseek-chat")
    with pytest.raises(ValueError):
        judge({"type": "artifact", "title": "t", "content": "c"})


def test_judge_from_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "env-key")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://env.example/v1")
    monkeypatch.setenv("DEEPSEEK_MODEL", "env-model")
    judge = make_judge_from_env()
    assert judge is not None


def test_judge_from_env_without_key_returns_none(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    assert make_judge_from_env() is None
