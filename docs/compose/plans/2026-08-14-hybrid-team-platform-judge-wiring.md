# [M3 后续] LLM judge 接入演示端点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 LLM judge（试点已验证）接入 `/api/assets/templates` 演示端点：`make_llm_judge` 从试点脚本提炼为产品模块 `asset_judge.py`（含正则解析修复）；judge 异常语义改为 **fail-closed**（M3 评审落点：接入真实 judge 前评估）；server 以 **env 开关 `ASSET_JUDGE_ENABLED`** 控制注入（默认关——演示端点保持无 judge 快路径；开则真实 LLM 评测）。

**Architecture:** 新增 `backend/asset_judge.py`（纯标准库 LLM judge：urllib 直调 OpenAI 兼容 API + `make_judge_from_env()` 读 env）；`asset_evaluator.py` judge 异常 fail-closed（try/except → passed=False + reason）；`server.py` 惰性单例 `_get_asset_judge()`（env 开关 + key 存在才构造）注入 `_get_template_confirmation` 的 `AssetEvaluator(store, judge)`；`pilot_judge.py` 改 import 产品模块（去重）。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包；judge 用标准库 urllib。
- **不要动**：AssetStore/TemplateConfirmation/ApprovalManager 内部；端点响应形状（`_ok({"asset_id","request_id"})`）；既有 gate/资产语义。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn 绝不提交。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: asset_judge 产品模块（提炼 + 正则修复 + 试点去重）

**Covers:** [S4]（judge seam 产品化）

**Files:**
- Create: `backend/asset_judge.py`
- Modify: `backend/pilot_judge.py`（改 import 产品模块）
- Test: `backend/tests/test_asset_judge.py`

**Interfaces:**
- Produces: `make_llm_judge(api_key: str, base_url: str, model: str) -> Callable[[dict], float]`（urllib 直调 `/chat/completions`，prompt 只求 0-1 分数，正则解析 + clamp；解析失败抛 `ValueError`——fail-closed 由 AssetEvaluator 层处理）；`make_judge_from_env() -> Callable[[dict], float] | None`（读 `DEEPSEEK_API_KEY`（无则 None）/`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com/v1`）/`DEEPSEEK_MODEL`（默认 `deepseek-chat`））。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_judge.py`）

```python
import json
from unittest import mock

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
```

（`pytest` import 需在文件头加 `import pytest`。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_judge'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_judge.py`）

```python
"""LLM judge：资产质量评分（0-1），标准库 urllib 直调 OpenAI 兼容 API。

设计 [S4]：judge seam 可注入；本模块提供真实 LLM judge（试点已验证，
排序/阈值语义——好资产高分、差资产低分）。解析失败抛 ValueError，
fail-closed 由 AssetEvaluator.evaluate 层处理（judge 异常 → 拒绝）。
"""

import json
import os
import re
import urllib.request
from typing import Callable

_SCORE_RE = re.compile(r"\b(?:0(?:\.\d+)?|1(?:\.0+)?)\b")


def make_llm_judge(api_key: str, base_url: str, model: str) -> Callable[[dict], float]:
    """构造 LLM judge：输入资产 dict，返回 0-1 质量分数。"""

    def judge(asset: dict) -> float:
        prompt = (
            "你是资产质量评审专家。请评估以下会议纪要类资产的质量（结构化程度、完整性、"
            "是否包含可执行的待办与责任人）。只输出一个 0 到 1 之间的分数，不要其他内容。\n"
            f"资产类型: {asset.get('type')}\n标题: {asset.get('title')}\n内容:\n{asset.get('content')}\n"
        )
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "你是严谨的文档质量评审员，只输出分数。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 16,
        }
        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        m = _SCORE_RE.search(text)
        if not m:
            raise ValueError(f"无法从 judge 响应解析分数: {text!r}")
        return min(1.0, max(0.0, float(m.group())))

    return judge


def make_judge_from_env() -> Callable[[dict], float] | None:
    """从环境变量构造 judge；DEEPSEEK_API_KEY 缺失时返回 None。"""
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None
    return make_llm_judge(
        api_key,
        os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
    )
```

- [ ] **Step 4: 试点去重 + 运行确认通过**

`backend/pilot_judge.py`：删除本地 `make_llm_judge` 定义（及其 urllib/json/re import 若仅它用），改 `from asset_judge import make_llm_judge`。运行：
- `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge.py -v`（6 passed）
- `/home/test/miniconda3/envs/agentscope/bin/python -m py_compile pilot_judge.py`（去重后语法正确）

- [ ] **Step 5: 提交**

```bash
git add backend/asset_judge.py backend/tests/test_asset_judge.py backend/pilot_judge.py
git commit -m "feat(hybrid): productize LLM judge module with robust score parsing and env factory"
```

---

### Task 2: fail-closed 语义 + server env 开关接线

**Covers:** [S4]（judge fail-closed）· [S7]（端点接线）

**Files:**
- Modify: `backend/asset_evaluator.py`（judge 异常 fail-closed）
- Modify: `backend/server.py`（`_get_asset_judge()` 惰性单例 + `_get_template_confirmation` 接线）
- Test: `backend/tests/test_asset_evaluator.py`（追加 fail-closed）+ `backend/tests/test_asset_endpoints.py`（追加接线）

**Interfaces:**
- Consumes: Task 1 `make_judge_from_env`。
- Produces: `AssetEvaluator.evaluate` 在 judge 抛异常时 **fail-closed**（`judge_score=None` + `passed=False` + `reason="judge 异常: <msg>"`）；`server._get_asset_judge() -> Callable | None`（`ASSET_JUDGE_ENABLED == "1"` 且 env key 存在 → `make_judge_from_env()`；否则 None）；`_get_template_confirmation` 用 `_get_asset_judge()` 构造 `AssetEvaluator(store, judge)`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_asset_evaluator.py` 追加：

```python
def test_judge_exception_fails_closed(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")

    def broken_judge(asset_dict):
        raise ConnectionError("judge 网络错误")

    result = AssetEvaluator(store, judge=broken_judge).evaluate(asset)
    assert not result.passed
    assert result.judge_score is None
    assert "judge 异常" in result.reason
```

`backend/tests/test_asset_endpoints.py` 追加：

```python
def test_templates_endpoint_with_judge_wiring(tmp_path, monkeypatch):
    from asset_evaluator import AssetEvaluator
    from asset_store import AssetStore
    from approval_manager import ApprovalManager
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    monkeypatch.setattr(server, "_get_asset_judge", lambda: lambda a: 0.9)  # 高分 judge
    tc = TemplateConfirmation(store, AssetEvaluator(store, lambda a: 0.9), approvals)
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    client = TestClient(server.app)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "发布计划模板",
        "content": "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排，市场部与销售部同步确认",
        "approver": "emp-001",
    })
    assert resp.status_code == 200 and resp.json()["success"]


def test_get_asset_judge_respects_env_switch(monkeypatch):
    monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    assert server._get_asset_judge() is None  # 未启用 → None（演示端点快路径）
    monkeypatch.setenv("ASSET_JUDGE_ENABLED", "1")
    assert server._get_asset_judge() is not None  # 启用 + key → judge
    monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)  # 清理（单例已置位，后续测试注意）
```

（**注意**：`_get_asset_judge` 是惰性单例——env 开关测试会置位全局；测试尾部需复位 `server._asset_judge = None`（用 try/finally 或 monkeypatch 后手动清）。以实际实现为准调整。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_evaluator.py::test_judge_exception_fails_closed tests/test_asset_endpoints.py::test_get_asset_judge_respects_env_switch -v`
Expected: FAIL——judge 异常当前传播（fail-open）；`_get_asset_judge` 不存在（AttributeError）。

- [ ] **Step 3: 实现**

`backend/asset_evaluator.py` `evaluate`（judge 分支）：

```python
        judge_score = None
        if self._judge is not None:
            try:
                judge_score = float(self._judge(asset))
            except Exception as exc:  # fail-closed：LLM 出错不放行资产（仿 AIP Evals 评测纪律）
                return EvaluationResult(
                    passed=False, checks=checks, judge_score=None,
                    reason=f"judge 异常: {exc}",
                )
        passed = all(checks.values()) and (judge_score is None or judge_score >= _JUDGE_THRESHOLD)
```

（docstring 同步更新：fail-open → fail-closed。）

`backend/server.py`（资产端点区追加）：

```python
_asset_judge: Optional[object] = None


def _get_asset_judge():
    global _asset_judge
    if _asset_judge is None and os.environ.get("ASSET_JUDGE_ENABLED") == "1":
        from asset_judge import make_judge_from_env
        _asset_judge = make_judge_from_env()  # 无 key → None（幂等）
    return _asset_judge
```

`_get_template_confirmation` 改：

```python
        _template_confirmation = TemplateConfirmation(store, AssetEvaluator(store, _get_asset_judge()), _demo_gate_manager)
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_evaluator.py tests/test_asset_endpoints.py tests/test_template_confirmation.py tests/test_asset_judge.py -q`
Expected: 全绿（fail-closed 新用例 + 接线用例 + 既有回归）。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_evaluator.py backend/server.py backend/tests/test_asset_evaluator.py backend/tests/test_asset_endpoints.py
git commit -m "feat(hybrid): fail-closed LLM judge and env-gated demo endpoint wiring"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→[S4]（judge seam 产品化 + 解析鲁棒性）；T2→[S4]/[S7]（fail-closed 落点 + 端点 env 开关接线）。M3 评审"接入真实 judge 前评估 fail-closed"与试点边界"演示端点接入需 server 配置"均落地。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及单例复位（env 开关测试）给出明确指引。
- **类型一致性**：`make_llm_judge`/`make_judge_from_env`/`_get_asset_judge` 签名跨任务一致；`AssetEvaluator(store, judge)` 构造向后兼容（judge=None 现状不变）。
- **低耦合**：AssetStore/TemplateConfirmation/ApprovalManager 零改动；judge 注入在 server 层（env 开关）+ evaluator 层（fail-closed 语义）。
