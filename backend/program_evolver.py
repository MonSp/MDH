"""
ProgramEvolver — 审阅意见驱动的程序修订与升级闭环 (program-pivot T5)

契约（spec [S2] 审阅—升级闭环、错误行为）：
- 输入：promoted 程序 + 审阅 fail 意见（issues）→ LLM 产出修订（main_py+
  test_py+version）→ registry.revise（promoted→candidate，路由暂不命中，
  任务自动回退 LLM 路径）→ T4 PromotionGate 门禁。
- 门禁通过 → 升级完成，清零连续失败计数。
- 门禁失败 → 快照回滚保留上一版（status 恢复 promoted，lineage event
  = rollback），consecutive_gate_failures +1；
  **连续 3 次失败 → 恢复快照并 deprecate（终态），该类任务回退 LLM 路径，
  等待下一轮沉淀**。
- 快照：修订前把 main.py/tests/ 备份到 .revisions/<seq>/，可完整还原。
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field, field_validator

from program_registry import ProgramStatus, ProgramRegistry
from promotion_gate import GateResult, PromotionGate

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], Awaitable[str]]

MAX_FAILURES_BEFORE_DEPRECATE = 3
MAX_CODE_CHARS = 50_000


class RevisionDraft(BaseModel):
    """LLM 产出的程序修订草稿（JSON 契约）。"""

    version: str = Field(..., description="修订后的语义化版本号")
    main_py: str
    test_py: str

    @field_validator("main_py")
    @classmethod
    def _check_main(cls, v: str) -> str:
        if "def run(" not in v:
            raise ValueError("main_py must define def run(")
        if len(v) > MAX_CODE_CHARS:
            raise ValueError("main_py exceeds 50KB limit")
        return v

    @field_validator("test_py")
    @classmethod
    def _check_test(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("test_py must be non-empty")
        if len(v) > MAX_CODE_CHARS:
            raise ValueError("test_py exceeds 50KB limit")
        return v


@dataclass
class UpgradeResult:
    """升级闭环结果。"""

    upgraded: bool = False
    rolled_back: bool = False
    deprecated: bool = False
    gate: GateResult | None = None
    failure_count: int = 0
    error: str | None = None
    error_code: str | None = None
    duration_ms: int = 0
    llm_calls: int = 0  # 修订 LLM 调用由调用方计入；门禁本身恒 0
    lineage: list[dict[str, Any]] = field(default_factory=list)


class ProgramEvolver:
    """审阅 fail 意见 → 修订 → 门禁 → 晋升/回滚/降级。"""

    def __init__(self, registry: ProgramRegistry, gate: PromotionGate | None = None):
        self._registry = registry
        self._gate = gate or PromotionGate(registry)

    # ── 快照 ──────────────────────────────────────────

    def _snapshot(self, program_id: str) -> str:
        """备份 main.py + tests/ 到 .revisions/<seq>/，返回快照目录。"""
        pack = self._registry.pack_dir(program_id)
        rev_root = os.path.join(pack, ".revisions")
        os.makedirs(rev_root, exist_ok=True)
        existing = [d for d in os.listdir(rev_root) if d.startswith("rev_")]
        seq = len(existing) + 1
        snap = os.path.join(rev_root, f"rev_{seq:04d}")
        os.makedirs(snap, exist_ok=True)
        main_path = os.path.join(pack, "main.py")
        if os.path.isfile(main_path):
            shutil.copy2(main_path, os.path.join(snap, "main.py"))
        tests = os.path.join(pack, "tests")
        if os.path.isdir(tests):
            shutil.copytree(
                tests, os.path.join(snap, "tests"), dirs_exist_ok=True
            )
        return snap

    def _latest_snapshot(self, program_id: str) -> str | None:
        rev_root = os.path.join(
            self._registry.pack_dir(program_id), ".revisions"
        )
        if not os.path.isdir(rev_root):
            return None
        snaps = sorted(
            d for d in os.listdir(rev_root) if d.startswith("rev_")
        )
        if not snaps:
            return None
        return os.path.join(rev_root, snaps[-1])

    def _restore(self, program_id: str, snap: str) -> None:
        pack = self._registry.pack_dir(program_id)
        main_snap = os.path.join(snap, "main.py")
        if os.path.isfile(main_snap):
            shutil.copy2(main_snap, os.path.join(pack, "main.py"))
        tests_snap = os.path.join(snap, "tests")
        if os.path.isdir(tests_snap):
            tests_dir = os.path.join(pack, "tests")
            if os.path.isdir(tests_dir):
                shutil.rmtree(tests_dir)
            shutil.copytree(tests_snap, tests_dir)

    # ── 修订 prompt / 解析 ────────────────────────────

    def build_prompt(
        self,
        program_id: str,
        issues: list[str],
        current_main: str,
        current_test: str,
        current_version: str,
    ) -> str:
        issues_text = "\n".join(f"- {i}" for i in issues[:20])
        return f"""你是程序修订专家。审阅者对下面程序给出 fail 意见，
请产出修订后的完整程序（仅标准库、确定性、禁止时间/随机/环境变量/网络）。

## 程序 {program_id}（当前版本 {current_version}）

### 当前 main.py
```python
{current_main[:MAX_CODE_CHARS]}
```

### 当前 tests
```python
{current_test[:MAX_CODE_CHARS]}
```

### 审阅意见（必须全部解决）
{issues_text}

## 要求
1. 修复全部意见；保留原行为中正确的部分。
2. tests 必须真实覆盖修复点且可通过（自洽）。
3. version 在当前版本上递增次版本号（如 {current_version} → 次版本+1）。
4. 严格按 JSON 返回：{{"version": "...", "main_py": "...", "test_py": "..."}}

只返回一个 JSON 对象。"""

    def parse_revision(self, text: str) -> RevisionDraft:
        start = (text or "").find("{")
        data: Any = None
        if start >= 0:
            try:
                data, _ = json.JSONDecoder().raw_decode(text[start:])
            except json.JSONDecodeError:
                data = None
        if data is None:
            match = re.search(r"\{[\s\S]*\}", text or "")
            if not match:
                raise ValueError(f"no JSON in revision response: {text[:200]!r}")
            data = json.loads(match.group())
        return RevisionDraft.model_validate(data)

    # ── 升级闭环主流程 ────────────────────────────────

    async def upgrade(
        self,
        program_id: str,
        issues: list[str],
        generate_revision: GenerateFn,
        model: str | None = None,
    ) -> UpgradeResult:
        start = time.monotonic()
        if not issues:
            return UpgradeResult(
                error="issues required for revision",
                error_code="NO_ISSUES",
            )
        manifest = self._registry.get(program_id)
        if manifest is None:
            return UpgradeResult(
                error=f"program not found: {program_id}",
                error_code="NOT_FOUND",
            )
        if manifest.status != ProgramStatus.PROMOTED:
            return UpgradeResult(
                error=(
                    f"upgrade requires promoted program: {program_id} "
                    f"(status={manifest.status.value})"
                ),
                error_code="NOT_PROMOTED",
            )

        pack = self._registry.pack_dir(program_id)
        main_path = os.path.join(pack, "main.py")
        tests_dir = os.path.join(pack, "tests")
        if not os.path.isfile(main_path) or not os.path.isdir(tests_dir):
            return UpgradeResult(
                error=f"program pack incomplete: {program_id}",
                error_code="PROGRAM_INCOMPLETE",
            )
        current_main = _read(main_path)
        current_test = _read_dir_files(tests_dir)

        prompt = self.build_prompt(
            program_id, issues, current_main, current_test, manifest.version
        )
        try:
            raw = await generate_revision(prompt)
            draft = self.parse_revision(raw)
        except ValueError as e:
            return UpgradeResult(
                error=str(e), error_code="REVISION_INVALID"
            )
        except Exception as e:
            logger.exception("revision generation failed")
            return UpgradeResult(
                error=str(e), error_code="REVISION_FAILED"
            )

        # 快照旧版 → revise（翻回 candidate，路由停用）→ 写入新代码
        snap = self._snapshot(program_id)
        self._registry.revise(program_id, new_version=draft.version)
        try:
            _write_atomic(main_path, draft.main_py)
            os.makedirs(tests_dir, exist_ok=True)
            for name in os.listdir(tests_dir):
                if name.endswith(".py"):
                    os.remove(os.path.join(tests_dir, name))
            _write_atomic(os.path.join(tests_dir, "test_upgraded.py"), draft.test_py)
        except OSError as e:
            logger.exception("revision write failed, restoring %s", program_id)
            self._restore(program_id, snap)
            self._registry.restore_version(program_id, manifest.version)
            self._registry.promote(program_id, event="rollback")
            return UpgradeResult(
                error=f"revision write failed: {e}",
                error_code="REVISION_WRITE_FAILED",
            )

        # T4 门禁
        gate_result = await self._gate.evaluate(program_id, model=model)

        if gate_result.passed and gate_result.promoted:
            self._registry.reset_gate_failures(program_id)
            m = self._registry.get(program_id)
            return UpgradeResult(
                upgraded=True,
                gate=gate_result,
                failure_count=m.consecutive_gate_failures if m else 0,
                duration_ms=int((time.monotonic() - start) * 1000),
                lineage=self._registry.read_lineage(program_id),
            )

        # 门禁失败（含 timeout/race 等非晋升情形）
        count = self._registry.record_gate_failure(program_id)
        self._restore(program_id, snap)
        self._registry.restore_version(program_id, manifest.version)

        if count >= MAX_FAILURES_BEFORE_DEPRECATE:
            # 连续 3 次失败：恢复上一版代码后整体降级（终态），回退 LLM 路径
            m = self._registry.get(program_id)
            if m is not None and m.status == ProgramStatus.CANDIDATE:
                self._registry.promote(program_id, event="rollback")
            self._registry.deprecate(program_id)
            logger.warning(
                "program %s deprecated after %s consecutive gate failures",
                program_id,
                count,
            )
            return UpgradeResult(
                deprecated=True,
                gate=gate_result,
                failure_count=count,
                error=(
                    f"deprecated after {count} consecutive gate failures"
                ),
                error_code="UPGRADE_DEPRECATED",
                duration_ms=int((time.monotonic() - start) * 1000),
                lineage=self._registry.read_lineage(program_id),
            )

        # 回滚保留上一版：恢复 promoted 状态（此刻是 candidate）
        self._registry.promote(program_id, event="rollback")
        return UpgradeResult(
            rolled_back=True,
            gate=gate_result,
            failure_count=count,
            error=gate_result.error,
            error_code=gate_result.error_code or "UPGRADE_ROLLED_BACK",
            duration_ms=int((time.monotonic() - start) * 1000),
            lineage=self._registry.read_lineage(program_id),
        )


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def _read_dir_files(directory: str) -> str:
    parts: list[str] = []
    for name in sorted(os.listdir(directory)):
        if name.endswith(".py"):
            parts.append(f"# --- {name} ---\n{_read(os.path.join(directory, name))}")
    return "\n".join(parts)


def _write_atomic(path: str, content: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    os.replace(tmp, path)
