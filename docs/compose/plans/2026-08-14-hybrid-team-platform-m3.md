# [M3] 资产沉淀闭环 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"沉淀"成为全链路第 6-7 步的落地点：三类资产（产出物/模板/经验技能）在平台内沉淀、评测把关、按需复用，实现设计 [S5] M3 验收（试点部门 50%+ 纪要任务走平台；资产复用率可感知）。

**Architecture:** 新增 2 模块（`asset_store.py` 文件系统+JSON 索引的知识库/模板库；`asset_evaluator.py` 确定性检查+LLM judge seam 评测）+ 复用 2 既有组件（`ApprovalManager` 模板固化员工确认、`ExperienceExtractor` 技能进化/检索）+ 演示端点（`/api/assets/*`）。文件系统存储与 skill_packs/experience_extractor 增量区同构（零新依赖，data/assets gitignore）。

**Tech Stack:** Python 3.11 · pytest 9.1.1 + pytest-asyncio（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`）。
- **零新依赖**：不新增包；存储/评测/检索纯标准库。
- **代码风格**：snake_case 内部、camelCase wire；dataclass 新字段带默认值；注释仅非常规处。
- **不要动**：`ApprovalManager` 内部（request_gate/handle_gate_response 本身——只消费）、`ExperienceExtractor` 内部（extract_from_meeting/write_to_incremental_area/retrieve_relevant_rules 本身——只消费）、既有 mailer/工作流/员工目录。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn（package-lock.json、skill_packs/*/system_prompt.md 等）绝不提交；worktree 内 git add 必须具体路径。
- **已知基线**：`tests/test_skill_packs_structure.py` 为 PRE-EXISTING（勿处理）；`test_performance.py` 为 flaky。

---

### Task 1: AssetStore 数据层

**Covers:** [S3]

**Files:**
- Create: `backend/asset_store.py`
- Test: `backend/tests/test_asset_store.py`

**Interfaces:**
- Produces: `AssetStore(base_dir: str)`；`store_artifact(team_id, title, content, source_task_id="") -> dict`（直接入库 status=approved）；`propose_template(team_id, title, content, source_task_id="", approver="") -> str`（asset_id，status=proposed）；`approve_template(asset_id, approver) -> bool`；`reject_template(asset_id, reason) -> bool`（删除文件+索引移除）；`search(team_id, query="", asset_type="") -> list[dict]`；`list_assets(team_id, status=None) -> list[dict]`；`get(asset_id) -> dict | None`。资产 dict 键：`asset_id/type/title/content/source_task_id/team_id/status/approved_by/created_at/checks/judge_score`（checks/judge_score 默认空）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_store.py`）

```python
import os

from asset_store import AssetStore


def test_store_artifact(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "内容", source_task_id="minutes-abc")
    assert asset["type"] == "artifact" and asset["status"] == "approved"
    assert asset["team_id"] == "team-x" and asset["source_task_id"] == "minutes-abc"
    assert os.path.exists(tmp_path / "team-x" / "artifacts" / f"{asset['asset_id']}.json")


def test_propose_approve_template(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办", approver="emp-001")
    assert store.get(asset_id)["status"] == "proposed"
    assert store.approve_template(asset_id, "emp-001")
    assert store.get(asset_id)["status"] == "approved"
    assert store.get(asset_id)["approved_by"] == "emp-001"


def test_reject_template_removes(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "坏模板", "内容")
    assert store.reject_template(asset_id, "质量差")
    assert store.get(asset_id) is None


def test_search_by_type_and_query(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 上线日期")
    store.propose_template("team-x", "发布计划模板", "标题\n要点")
    hits = store.search("team-x", query="发布计划")
    assert len(hits) == 2
    artifacts = store.search("team-x", query="发布计划", asset_type="artifact")
    assert len(artifacts) == 1 and artifacts[0]["type"] == "artifact"
    # 团队隔离：其他团队检索不到
    assert store.search("team-y", query="发布计划") == []


def test_list_assets_by_status(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要", "内容")
    store.propose_template("team-x", "模板", "标题\n要点")
    approved = store.list_assets("team-x", status="approved")
    assert len(approved) == 1 and approved[0]["type"] == "artifact"


def test_duplicate_detection_in_search_checks(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "内容")
    store.store_artifact("team-x", "纪要-0815", "内容")  # 同团队同标题——去重标记
    assets = store.search("team-x", query="纪要-0815")
    assert len(assets) == 1  # search 去重：同标题只返回最新
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_store.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_store'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_store.py`）

```python
"""资产存储：知识库（产出物）+ 模板库，团队级目录 + JSON 索引。

设计 [S3]：data/assets/<team_id>/{index.json, artifacts/, templates/}。
资产即文件 + 索引（与 skill_packs/experience_extractor 增量区同构，零新依赖）。
"""

import json
import os
import re
import time
from hashlib import sha1


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _new_asset_id(kind: str) -> str:
    return f"{kind}-{int(time.time() * 1000)}-{sha1(os.urandom(8)).hexdigest()[:8]}"


def _norm_title(title: str) -> str:
    return re.sub(r"\s+", "", title).lower()


class AssetStore:
    def __init__(self, base_dir: str):
        self._base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    # ── 路径与索引 ─────────────────────────────
    def _team_dir(self, team_id: str) -> str:
        d = os.path.join(self._base_dir, team_id)
        os.makedirs(os.path.join(d, "artifacts"), exist_ok=True)
        os.makedirs(os.path.join(d, "templates"), exist_ok=True)
        return d

    def _index_path(self, team_id: str) -> str:
        return os.path.join(self._team_dir(team_id), "index.json")

    def _load_index(self, team_id: str) -> list[dict]:
        try:
            with open(self._index_path(team_id), encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError):
            return []  # 索引缺失/损坏 → 重建

    def _save_index(self, team_id: str, entries: list[dict]) -> None:
        tmp = self._index_path(team_id) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self._index_path(team_id))  # 原子写

    def _asset_path(self, team_id: str, asset_type: str, asset_id: str) -> str:
        return os.path.join(self._team_dir(team_id), f"{asset_type}s", f"{asset_id}.json")

    # ── 资产操作 ───────────────────────────────
    def _write_asset(self, team_id: str, asset: dict) -> dict:
        path = self._asset_path(team_id, asset["type"], asset["asset_id"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asset, f, ensure_ascii=False, indent=1)
        entries = self._load_index(team_id)
        entries = [e for e in entries if e.get("asset_id") != asset["asset_id"]]
        entries.append({"asset_id": asset["asset_id"], "type": asset["type"], "title": asset["title"], "status": asset["status"]})
        self._save_index(team_id, entries)
        return asset

    def store_artifact(self, team_id: str, title: str, content: str, source_task_id: str = "") -> dict:
        asset = {
            "asset_id": _new_asset_id("art"),
            "type": "artifact",
            "title": title,
            "content": content,
            "source_task_id": source_task_id,
            "team_id": team_id,
            "status": "approved",
            "approved_by": "",
            "created_at": _now_iso(),
            "checks": {},
            "judge_score": None,
        }
        return self._write_asset(team_id, asset)

    def propose_template(self, team_id: str, title: str, content: str, source_task_id: str = "", approver: str = "") -> str:
        asset = {
            "asset_id": _new_asset_id("tpl"),
            "type": "template",
            "title": title,
            "content": content,
            "source_task_id": source_task_id,
            "team_id": team_id,
            "status": "proposed",
            "approved_by": "",
            "created_at": _now_iso(),
            "checks": {},
            "judge_score": None,
        }
        self._write_asset(team_id, asset)
        return asset["asset_id"]

    def approve_template(self, asset_id: str, approver: str) -> bool:
        asset = self.get(asset_id)
        if asset is None or asset["type"] != "template" or asset["status"] != "proposed":
            return False
        asset["status"] = "approved"
        asset["approved_by"] = approver
        self._write_asset(asset["team_id"], asset)
        return True

    def reject_template(self, asset_id: str, reason: str) -> bool:
        asset = self.get(asset_id)
        if asset is None:
            return False
        try:
            os.remove(self._asset_path(asset["team_id"], asset["type"], asset_id))
        except OSError:
            pass
        entries = [e for e in self._load_index(asset["team_id"]) if e.get("asset_id") != asset_id]
        self._save_index(asset["team_id"], entries)
        return True

    def get(self, asset_id: str) -> dict | None:
        # 先查索引定位团队，再读文件
        for team_id in os.listdir(self._base_dir):
            team_dir = os.path.join(self._base_dir, team_id)
            if not os.path.isdir(team_dir):
                continue
            for entry in self._load_index(team_id):
                if entry.get("asset_id") == asset_id:
                    try:
                        with open(self._asset_path(team_id, entry["type"], asset_id), encoding="utf-8") as f:
                            return json.load(f)
                    except (OSError, json.JSONDecodeError):
                        return None
        return None

    def search(self, team_id: str, query: str = "", asset_type: str = "") -> list[dict]:
        team_dir = os.path.join(self._base_dir, team_id)
        if not os.path.isdir(team_dir):
            return []
        q = _norm_title(query) if query else ""
        out = []
        seen: dict[str, int] = {}
        for entry in self._load_index(team_id):
            if asset_type and entry.get("type") != asset_type:
                continue
            asset = self.get(entry["asset_id"])
            if asset is None:
                continue
            if q and q not in _norm_title(asset.get("title", "")) and q not in _norm_title(asset.get("content", "")):
                continue
            key = (asset.get("type"), _norm_title(asset.get("title", "")))
            if key in seen:
                continue  # 同类型同标题去重（保留先出现的）
            seen[key] = 1
            out.append(asset)
        return out

    def list_assets(self, team_id: str, status: str | None = None) -> list[dict]:
        team_dir = os.path.join(self._base_dir, team_id)
        if not os.path.isdir(team_dir):
            return []
        out = []
        for entry in self._load_index(team_id):
            if status and entry.get("status") != status:
                continue
            asset = self.get(entry["asset_id"])
            if asset is not None:
                out.append(asset)
        return out
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_store.py -v`
Expected: 6 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_store.py backend/tests/test_asset_store.py
git commit -m "feat(hybrid): asset store with team-scoped knowledge base and template library"
```

---

### Task 2: AssetEvaluator 评测

**Covers:** [S4]

**Files:**
- Create: `backend/asset_evaluator.py`
- Test: `backend/tests/test_asset_evaluator.py`

**Interfaces:**
- Consumes: Task 1 `AssetStore`（search 用于 duplicate 检查——通过依赖注入，构造时传 store）。
- Produces: `EvaluationResult` dataclass（`passed: bool, checks: dict, judge_score: float | None, reason: str = ""`）；`AssetEvaluator(store: AssetStore, judge: Callable[[dict], float] | None = None)`；`evaluate(asset: dict) -> EvaluationResult`。确定性检查键：`completeness`（title/content 非空）、`structure`（content 含 ≥2 个换行分隔的行 或 含 "待办"/"要点"/"标题" 之一）、`duplicate`（store.search 同团队同类型同标题仅自身）、`quality`（content 长度 ≥20 字符产出物 / ≥50 模板）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_evaluator.py`）

```python
from asset_evaluator import AssetEvaluator
from asset_store import AssetStore


def test_evaluate_artifact_passes_checks(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    result = AssetEvaluator(store).evaluate(asset)
    assert result.passed
    assert all(result.checks.values())


def test_evaluate_empty_content_fails(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要", "")
    result = AssetEvaluator(store).evaluate(asset)
    assert not result.passed
    assert result.checks["completeness"] is False


def test_evaluate_template_quality_threshold(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.propose_template("team-x", "短模板", "标题")  # <50 字符 → quality 不过
    result = AssetEvaluator(store).evaluate(asset)
    assert not result.passed
    assert result.checks["quality"] is False


def test_evaluate_duplicate_fails(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料 销售部准备客户通知")
    dup = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料 销售部准备客户通知")
    result = AssetEvaluator(store).evaluate(dup)
    assert not result.passed
    assert result.checks["duplicate"] is False


def test_evaluate_judge_seam(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    good = AssetEvaluator(store, judge=lambda a: 0.9).evaluate(asset)
    assert good.passed and good.judge_score == 0.9
    bad = AssetEvaluator(store, judge=lambda a: 0.3).evaluate(asset)  # <0.5 阈值 → 不过
    assert not bad.passed


def test_evaluate_no_judge_skips(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    result = AssetEvaluator(store).evaluate(asset)
    assert result.judge_score is None  # judge 默认 None → 跳过
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_evaluator.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_evaluator'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_evaluator.py`）

```python
"""资产评测把关：确定性检查 + LLM judge seam（仿 AIP Evals）。

设计 [S4]：确定性检查是主门槛（纯代码可测）；judge 可注入
（默认 None 跳过——试点接真实 key，单测用 fake）。
"""

from dataclasses import dataclass
from typing import Callable

from asset_store import AssetStore

_JUDGE_THRESHOLD = 0.5
_MIN_LENGTH = {"artifact": 20, "template": 50}


@dataclass
class EvaluationResult:
    passed: bool
    checks: dict
    judge_score: float | None
    reason: str = ""


class AssetEvaluator:
    def __init__(self, store: AssetStore, judge: Callable[[dict], float] | None = None):
        self._store = store
        self._judge = judge

    def evaluate(self, asset: dict) -> EvaluationResult:
        checks = {
            "completeness": bool(asset.get("title", "").strip()) and bool(asset.get("content", "").strip()),
            "structure": self._check_structure(asset),
            "duplicate": not self._is_duplicate(asset),
            "quality": len(asset.get("content", "")) >= _MIN_LENGTH.get(asset.get("type", "artifact"), 20),
        }
        judge_score = None
        if self._judge is not None:
            judge_score = float(self._judge(asset))
        passed = all(checks.values()) and (judge_score is None or judge_score >= _JUDGE_THRESHOLD)
        reason = "" if passed else "; ".join(k for k, v in checks.items() if not v) or "judge_score 低于阈值"
        return EvaluationResult(passed=passed, checks=checks, judge_score=judge_score, reason=reason)

    def _check_structure(self, asset: dict) -> bool:
        content = asset.get("content", "")
        if content.count("\n") >= 1:
            return True
        return any(k in content for k in ("待办", "要点", "标题", "日期", "决定"))

    def _is_duplicate(self, asset: dict) -> bool:
        hits = self._store.search(asset.get("team_id", ""), query=asset.get("title", ""), asset_type=asset.get("type"))
        return any(h.get("asset_id") != asset.get("asset_id") for h in hits)
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_evaluator.py tests/test_asset_store.py -q`
Expected: 12 passed（6 + 6）。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_evaluator.py backend/tests/test_asset_evaluator.py
git commit -m "feat(hybrid): asset evaluator with deterministic checks and LLM judge seam"
```

---

### Task 3: 模板固化流程（评测 → gate 确认 → 入库/拒绝）

**Covers:** [S5]

**Files:**
- Create: `backend/template_confirmation.py`
- Test: `backend/tests/test_template_confirmation.py`

**Interfaces:**
- Consumes: Task 1 `AssetStore.propose_template/approve_template/reject_template`；Task 2 `AssetEvaluator.evaluate`；`ApprovalManager.request_gate/handle_gate_response/get_gate_audit`（approval_manager.py，async）。
- Produces: `TemplateConfirmation(store: AssetStore, evaluator: AssetEvaluator, approvals: ApprovalManager)`；`async submit(team_id, title, content, source_task_id="", approver="") -> dict`（评测不过 → `{"ok": False, "reason"}`；评测过 → request_gate → `{"ok": True, "asset_id", "request_id"}`）；`async on_gate_result(asset_id, approved, approver="") -> bool`（approved → approve_template；否则 reject_template）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_template_confirmation.py`）

```python
import pytest

from approval_manager import ApprovalManager
from asset_evaluator import AssetEvaluator
from asset_store import AssetStore
from template_confirmation import TemplateConfirmation


def _make(tmp_path):
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    tc = TemplateConfirmation(store, AssetEvaluator(store), approvals)
    return store, approvals, tc


@pytest.mark.asyncio
async def test_submit_evaluates_and_requests_gate(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排", approver="emp-001")
    assert result["ok"] and result["asset_id"]
    pending = approvals.get_pending_requests()
    assert any(p["taskId"] == result["asset_id"] for p in pending)


@pytest.mark.asyncio
async def test_submit_evaluation_failure_rejects(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "坏模板", "标题")  # 质量不过
    assert not result["ok"]
    assert store.get(result.get("asset_id", "?")) is None  # 不入库


@pytest.mark.asyncio
async def test_on_gate_result_approve(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排", approver="emp-001")
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], True, reason="ok")
    assert store.get(result["asset_id"])["status"] == "approved"
    decided = [e for e in approvals.get_gate_audit(req["gateId"]) if e["event"] == "gate/decided"]
    assert decided  # 审计成对


@pytest.mark.asyncio
async def test_on_gate_result_reject_removes(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排", approver="emp-001")
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], False, reason="不需要")
    assert store.get(result["asset_id"]) is None  # 拒绝 → 移除
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_template_confirmation.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'template_confirmation'`。

- [ ] **Step 3: 实现**（新建 `backend/template_confirmation.py`）

```python
"""模板固化流程：评测 → 员工把关确认 → 入库/拒绝。

设计 [S5]：复用 ApprovalManager（把关点引擎）——模板固化 = 一个 gate 请求，
员工决定即入库许可；审计成对（gate/requested + gate/decided）。
"""

from asset_evaluator import AssetEvaluator
from asset_store import AssetStore
from approval_manager import ApprovalManager


class TemplateConfirmation:
    def __init__(self, store: AssetStore, evaluator: AssetEvaluator, approvals: ApprovalManager):
        self._store = store
        self._evaluator = evaluator
        self._approvals = approvals

    async def submit(self, team_id: str, title: str, content: str, source_task_id: str = "", approver: str = "") -> dict:
        asset_id = self._store.propose_template(team_id, title, content, source_task_id=source_task_id, approver=approver)
        asset = self._store.get(asset_id)
        result = self._evaluator.evaluate(asset)
        if not result.passed:
            self._store.reject_template(asset_id, result.reason)
            return {"ok": False, "reason": f"评测不过: {result.reason}", "checks": result.checks}
        pending = await self._approvals.request_gate(
            requester_id="asset-service",
            operation="template_confirm",
            description=f"模板固化确认: {title}",
            task_id=asset_id,
            gate_id=f"template:{asset_id}",
            approver=approver,
            timeout=60.0,
        )
        return {"ok": True, "asset_id": asset_id, "request_id": pending.id}

    async def on_gate_result(self, asset_id: str, approved: bool, approver: str = "") -> bool:
        if approved:
            return self._store.approve_template(asset_id, approver)
        return self._store.reject_template(asset_id, "员工拒绝")
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_template_confirmation.py tests/test_asset_store.py tests/test_asset_evaluator.py -q`
Expected: 16 passed（4 + 6 + 6）。

- [ ] **Step 5: 提交**

```bash
git add backend/template_confirmation.py backend/tests/test_template_confirmation.py
git commit -m "feat(hybrid): template confirmation flow with evaluation gate and approval"
```

---

### Task 4: 技能进化接线（把关差异 → 增量区）

**Covers:** [S6]

**Files:**
- Create: `backend/skill_evolution.py`
- Test: `backend/tests/test_skill_evolution.py`

**Interfaces:**
- Consumes: `ExperienceExtractor`（experience_extractor.py，`extract_from_meeting(project_id, task_description, discussion_results, review_result, execution_results) -> list[ExperienceRule]`；`write_to_incremental_area(rule) -> bool`；`submit_for_review(rule) -> str`；`approve_rule(rule_id, reviewer_comment="") -> bool`）。
- Produces: `SkillEvolution(extractor: ExperienceExtractor)`；`evolve_from_feedback(project_id, task_type, transcript, feedback, keywords) -> dict`（构造 ExecutionLog 风格输入 → extract_from_meeting → submit_for_review → approve_rule → write_to_incremental_area；返回 `{"ok", "rule_id", "count"}`；无规则时 `{"ok": True, "count": 0}`）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_skill_evolution.py`）

```python
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_evolve_from_feedback_writes_rule(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback(
        project_id="proj-minutes-1",
        task_type="minutes",
        transcript="会议讨论发布计划，确定 8 月 15 日上线。",
        feedback="审核修改：遗漏了行动项的责任人，需要为每项待办补充负责人与截止日期。",
        keywords=["纪要", "待办"],
    )
    assert result["ok"]
    assert result["count"] >= 1
    assert extractor.get_all_rules(status="approved")  # 规则已批准并写入增量区


def test_evolve_returns_zero_when_no_feedback(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback("p1", "minutes", "会议讨论发布计划。", "", ["纪要"])
    assert result["ok"] and result["count"] == 0
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_skill_evolution.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'skill_evolution'`。

- [ ] **Step 3: 实现**（新建 `backend/skill_evolution.py`）

```python
"""技能进化接线：把关差异 → 经验规则 → CoW 增量区。

设计 [S6]：复用 ExperienceExtractor（extract_from_meeting 既有提炼逻辑 +
write_to_incremental_area 增量区），把关反馈作为 review_result 输入。
"""

from experience_extractor import ExperienceExtractor


class SkillEvolution:
    def __init__(self, extractor: ExperienceExtractor):
        self._extractor = extractor

    def evolve_from_feedback(self, project_id: str, task_type: str, transcript: str, feedback: str, keywords: list) -> dict:
        if not feedback or not feedback.strip():
            return {"ok": True, "count": 0}
        rules = self._extractor.extract_from_meeting(
            project_id=project_id,
            task_description=f"[{task_type}] {transcript[:120]}",
            discussion_results=[{"stance": "support", "text": transcript}],
            review_result={"feedback": feedback, "requires_changes": True},
            execution_results=[{"success": True, "result": transcript}],
        )
        written = 0
        for rule in rules:
            review_id = self._extractor.submit_for_review(rule)
            if self._extractor.approve_rule(review_id, reviewer_comment="auto-approve (skill evolution)"):
                if self._extractor.write_to_incremental_area(rule):
                    written += 1
        return {"ok": True, "rule_id": rules[0].rule_id if rules else "", "count": written}
```

（**实现者注意**：若 `extract_from_meeting` 的输入形状与上述不完全匹配（discussion_results/review_result 结构），先读 experience_extractor.py:606-720 实际解析逻辑并适配——保持"把关反馈作为 review_result 输入"的意图；`submit_for_review`/`approve_rule`/`write_to_incremental_area` 的流程以实际签名为准，测试断言以实际行为为准。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_skill_evolution.py tests/test_experience_extractor.py -q`
Expected: 新 2 用例 + 既有 experience 回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/skill_evolution.py backend/tests/test_skill_evolution.py
git commit -m "feat(hybrid): skill evolution wiring from gate feedback to incremental area"
```

---

### Task 5: 资产复用检索（三类资产合并）

**Covers:** [S6]

**Files:**
- Create: `backend/asset_search.py`
- Test: `backend/tests/test_asset_search.py`

**Interfaces:**
- Consumes: Task 1 `AssetStore.search`；`ExperienceExtractor.retrieve_relevant_rules(task_type, keywords) -> list[ExperienceRule]`（experience_extractor.py:523）。
- Produces: `AssetSearch(store: AssetStore, extractor: ExperienceExtractor)`；`search(team_id, query="", asset_type="", task_type="", keywords=None) -> dict`（`{"artifacts": [...], "templates": [...], "rules": [{"rule_id","trigger_condition","action"}]}`）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_search.py`）

```python
from asset_search import AssetSearch
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_search_merges_three_asset_types(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["纪要", "待办"],
    )
    result = AssetSearch(store, extractor).search("team-x", query="发布计划", task_type="minutes", keywords=["纪要", "待办"])
    assert result["artifacts"] and result["templates"]
    assert any(r["rule_id"] for r in result["rules"])  # 技能规则检索
    assert result["templates"][0]["status"] == "proposed"  # 模板含 proposed（可复用候选）


def test_search_empty_when_no_assets(tmp_path):
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    result = AssetSearch(store, extractor).search("team-x", query="无", task_type="minutes", keywords=["纪要"])
    assert result == {"artifacts": [], "templates": [], "rules": []}
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_search.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_search'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_search.py`）

```python
"""资产复用检索：知识库/模板（AssetStore.search）+ 技能规则（ExperienceExtractor）合并。

设计 [S6]：下次同类任务注入候选——演示端点合并返回三类资产。
"""

from asset_store import AssetStore
from experience_extractor import ExperienceExtractor


class AssetSearch:
    def __init__(self, store: AssetStore, extractor: ExperienceExtractor):
        self._store = store
        self._extractor = extractor

    def search(self, team_id: str, query: str = "", asset_type: str = "", task_type: str = "", keywords: list | None = None) -> dict:
        artifacts = self._store.search(team_id, query=query, asset_type="artifact" if not asset_type or asset_type == "artifact" else asset_type)
        templates = self._store.search(team_id, query=query, asset_type="template" if not asset_type or asset_type == "template" else asset_type)
        rules = []
        if task_type and keywords:
            for rule in self._extractor.retrieve_relevant_rules(task_type, keywords):
                rules.append({
                    "rule_id": rule.rule_id,
                    "trigger_condition": rule.trigger_condition,
                    "action": rule.action,
                })
        return {"artifacts": artifacts, "templates": templates, "rules": rules}
```

（**实现者注意**：若传入具体 `asset_type`（如 "artifact"），另一类仍应检索（返回空或照常）——以"三类资产合并返回"意图为准；`ExperienceRule` 字段（rule_id/trigger_condition/action）以实际 dataclass 为准，先读 experience_extractor.py:37-51。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_search.py tests/test_skill_evolution.py -q`
Expected: 新 2 用例 + 回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_search.py backend/tests/test_asset_search.py
git commit -m "feat(hybrid): asset reuse search merging knowledge base, templates and skill rules"
```

---

### Task 6: 演示端点 /api/assets/*

**Covers:** [S7]

**Files:**
- Modify: `backend/server.py`（新增 5 端点 + 模块级 `_asset_components()` 惰性组装）
- Test: `backend/tests/test_asset_endpoints.py`（新建）

**Interfaces:**
- Consumes: Task 1 `AssetStore`；Task 2 `AssetEvaluator`；Task 3 `TemplateConfirmation`；Task 4 `SkillEvolution`；Task 5 `AssetSearch`；`ApprovalManager`（server 既有 `_demo_gate_manager` 或新实例——读 server.py 既有 gate 演示端点的管理器用法）。
- Produces: `POST /api/assets/artifacts`（body: team_id/title/content/source_task_id → `_ok({"asset_id"})`）；`POST /api/assets/templates`（body: team_id/title/content/source_task_id/approver → `_ok({"ok", "asset_id", "request_id"})` 或 `_fail(reason)`）；`GET /api/assets/search?q=&type=&team_id=&task_type=&keywords=`（→ `_ok({"artifacts","templates","rules"})`）；`POST /api/assets/experience`（body: team_id/task_type/transcript/feedback/keywords → `_ok({"rule_id","count"})`）；`GET /api/assets?team_id=&status=`（→ `_ok(list)`）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_endpoints.py`）

```python
from fastapi.testclient import TestClient

import server

server.BACKEND_TOKEN = ""


def test_artifacts_endpoint_stores(tmp_path, monkeypatch):
    from asset_store import AssetStore
    store = AssetStore(str(tmp_path))
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    client = TestClient(server.app)
    resp = client.post("/api/assets/artifacts", json={
        "team_id": "team-x", "title": "纪要-0815", "content": "发布计划 确定 8 月 15 日上线 市场部负责宣传物料",
    })
    assert resp.status_code == 200
    assert resp.json()["success"] and resp.json()["data"]["asset_id"]


def test_templates_endpoint_requests_gate(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_evaluator import AssetEvaluator
    from approval_manager import ApprovalManager
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    tc = TemplateConfirmation(store, AssetEvaluator(store), approvals)
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    client = TestClient(server.app)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "发布计划模板", "content": "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排",
        "approver": "emp-001",
    })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ok"] and data["asset_id"]
    assert approvals.get_pending_requests()  # gate 已发起


def test_templates_endpoint_evaluation_failure(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_evaluator import AssetEvaluator
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    tc = TemplateConfirmation(store, AssetEvaluator(store), ApprovalManager())
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    client = TestClient(server.app)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "坏模板", "content": "标题",
    })
    assert resp.status_code == 200 and not resp.json()["success"]


def test_search_endpoint_merges(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_search import AssetSearch
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback("p1", "minutes", "会议讨论发布计划。",
                                                   "审核修改：遗漏行动项责任人。", ["纪要", "待办"])
    monkeypatch.setattr(server, "_get_asset_search", lambda: AssetSearch(store, extractor))
    client = TestClient(server.app)
    resp = client.get("/api/assets/search", params={
        "team_id": "team-x", "q": "发布计划", "task_type": "minutes", "keywords": "纪要,待办",
    })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["artifacts"] and data["rules"]


def test_experience_endpoint_writes_rule(tmp_path, monkeypatch):
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    extractor = ExperienceExtractor(str(tmp_path))
    monkeypatch.setattr(server, "_get_skill_evolution", lambda: SkillEvolution(extractor))
    client = TestClient(server.app)
    resp = client.post("/api/assets/experience", json={
        "team_id": "team-x", "task_type": "minutes", "transcript": "会议讨论发布计划。",
        "feedback": "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", "keywords": ["纪要", "待办"],
    })
    assert resp.status_code == 200
    assert resp.json()["data"]["count"] >= 1


def test_list_endpoint_filters_by_team(tmp_path, monkeypatch):
    from asset_store import AssetStore
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    client = TestClient(server.app)
    resp = client.get("/api/assets", params={"team_id": "team-x"})
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_endpoints.py -v`
Expected: FAIL——`AttributeError: module 'server' has no attribute '_get_asset_store'`（端点未实现）。

- [ ] **Step 3: 实现**（修改 `backend/server.py`，在既有演示端点区（api_assets 前）追加）

```python
# ── 资产沉淀端点（M3）────────────────────────
# 惰性组装 + monkeypatch 可测（TestClient 测试替换全局）
_asset_store: Optional[object] = None
_template_confirmation: Optional[object] = None
_skill_evolution: Optional[object] = None
_asset_search: Optional[object] = None


def _get_asset_store():
    global _asset_store
    if _asset_store is None:
        from asset_store import AssetStore
        _asset_store = AssetStore(os.path.join(os.path.dirname(__file__), "data", "assets"))
    return _asset_store


def _get_template_confirmation():
    global _template_confirmation
    if _template_confirmation is None:
        from asset_evaluator import AssetEvaluator
        from template_confirmation import TemplateConfirmation
        store = _get_asset_store()
        _template_confirmation = TemplateConfirmation(store, AssetEvaluator(store), ApprovalManager())
    return _template_confirmation


def _get_skill_evolution():
    global _skill_evolution
    if _skill_evolution is None:
        from experience_extractor import ExperienceExtractor
        from skill_evolution import SkillEvolution
        _skill_evolution = SkillEvolution(ExperienceExtractor(os.path.join(os.path.dirname(__file__), "data", "rules")))
    return _skill_evolution


def _get_asset_search():
    global _asset_search
    if _asset_search is None:
        from asset_search import AssetSearch
        from experience_extractor import ExperienceExtractor
        _asset_search = AssetSearch(_get_asset_store(), ExperienceExtractor(os.path.join(os.path.dirname(__file__), "data", "rules")))
    return _asset_search


@app.post("/api/assets/artifacts")
async def api_asset_artifacts(body: dict):
    """演示：产出物入库（知识库）。"""
    try:
        team_id = body["team_id"]
        asset = _get_asset_store().store_artifact(team_id, body.get("title", ""), body.get("content", ""), body.get("source_task_id", ""))
        return _ok({"asset_id": asset["asset_id"]})
    except KeyError:
        return _fail("缺少必填字段: team_id")


@app.post("/api/assets/templates")
async def api_asset_templates(body: dict):
    """演示：模板固化（评测 + 员工把关确认）。"""
    try:
        result = await _get_template_confirmation().submit(
            team_id=body["team_id"],
            title=body.get("title", ""),
            content=body.get("content", ""),
            source_task_id=body.get("source_task_id", ""),
            approver=body.get("approver", ""),
        )
        if result["ok"]:
            return _ok({"asset_id": result["asset_id"], "request_id": result["request_id"]})
        return _fail(result["reason"])
    except KeyError:
        return _fail("缺少必填字段: team_id")


@app.get("/api/assets/search")
async def api_asset_search(team_id: str, q: str = "", type: str = "", task_type: str = "", keywords: str = ""):
    """演示：三类资产复用检索（产出物/模板/技能规则）。"""
    kw = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
    return _ok(_get_asset_search().search(team_id, query=q, asset_type=type, task_type=task_type, keywords=kw))


@app.post("/api/assets/experience")
async def api_asset_experience(body: dict):
    """演示：把关差异 → 技能进化（经验规则 → CoW 增量区）。"""
    try:
        result = _get_skill_evolution().evolve_from_feedback(
            project_id=body.get("project_id", f"proj-{body['team_id']}"),
            task_type=body.get("task_type", ""),
            transcript=body.get("transcript", ""),
            feedback=body.get("feedback", ""),
            keywords=body.get("keywords", []),
        )
        return _ok({"rule_id": result["rule_id"], "count": result["count"]})
    except KeyError:
        return _fail("缺少必填字段: team_id")


@app.get("/api/assets")
async def api_asset_list(team_id: str, status: str = ""):
    """演示：资产列表（per team）。"""
    return _ok(_get_asset_store().list_assets(team_id, status=status or None))
```

（**实现者注意**：`_ok`/`_fail` 为 server 既有 helper（server.py:149-150）；`ApprovalManager` 已在 server 顶部 import（若否，端点内 import）；函数级 import 遵循既有惯例；`data/` 目录 gitignore 已覆盖（backend/data/*）。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_endpoints.py tests/test_hybrid_endpoints.py tests/test_minutes_endpoint.py -q`
Expected: 新 6 用例 + 既有端点回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_asset_endpoints.py
git commit -m "feat(hybrid): asset sedimentation demo endpoints (artifacts, templates, search, experience, list)"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→[S3]（存储）；T2→[S4]（评测）；T3→[S5]（固化流程）；T4→[S6]（技能进化）；T5→[S6]（复用检索）；T6→[S7]（演示端点）。[S1]/[S2]/[S8] 为设计说明/验收，无独立实现节。全部覆盖。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及既有 API 形状处（extract_from_meeting 输入结构、ExperienceRule 字段、_ok/_fail helper）给出"先读代码确认"指引与明确意图。
- **类型一致性**：`AssetStore`（store_artifact/propose_template/approve_template/reject_template/search/list_assets/get）、`EvaluationResult`（passed/checks/judge_score/reason）、`TemplateConfirmation`（submit/on_gate_result）、`SkillEvolution`（evolve_from_feedback）、`AssetSearch`（search）在 T1-T6 间签名一致；wire 键（asset_id/rule_id/count/artifacts/templates/rules）跨端点与模块一致。
- **复用边界**：ApprovalManager/ExperienceExtractor 只消费不修改；存储/评测/检索纯标准库零新依赖。
