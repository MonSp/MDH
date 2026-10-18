"""
ProgramRegistry — 程序包注册中心 (program-pivot T1)

程序包 (ProgramPack) 目录结构:
    <base_dir>/<program_id>/
        manifest.yaml    # 元数据 + 触发条件 + 新鲜度
        lineage.json     # 状态变更血缘 (append-only)

状态机: candidate -> promoted -> deprecated
    - candidate 可晋升 (promote) 或废弃 (deprecate)
    - promoted 可废弃 (deprecate)
    - deprecated 为终态 (不可晋升)
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import threading
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import yaml
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

PROGRAM_ID_RE = re.compile(r"^[a-z0-9_][a-z0-9_-]{0,63}$")

DEFAULT_FRESHNESS_TTL_DAYS = 30


class ProgramStatus(str, Enum):
    CANDIDATE = "candidate"
    PROMOTED = "promoted"
    DEPRECATED = "deprecated"


class ProgramKind(str, Enum):
    PROGRAM = "program"
    LEGACY_SKILL_PACK = "legacy_skill_pack"


ALLOWED_TRANSITIONS: dict[ProgramStatus, set[ProgramStatus]] = {
    ProgramStatus.CANDIDATE: {ProgramStatus.PROMOTED, ProgramStatus.DEPRECATED},
    ProgramStatus.PROMOTED: {ProgramStatus.DEPRECATED},
    ProgramStatus.DEPRECATED: set(),
}


class ProgramTrigger(BaseModel):
    """触发条件：路由匹配用的关键词集合"""

    keywords: list[str] = Field(default_factory=list, description="任务文本匹配关键词")


class ProgramManifest(BaseModel):
    """ProgramPack manifest (manifest.yaml)"""

    program_id: str = Field(..., description="程序包唯一 ID，小写字母/数字/下划线/连字符")
    version: str = Field(..., description="语义化版本号")
    description: str = Field("", description="供路由匹配与展示的描述")
    kind: ProgramKind = ProgramKind.PROGRAM
    status: ProgramStatus = ProgramStatus.CANDIDATE
    trigger: ProgramTrigger = Field(default_factory=ProgramTrigger)
    io_schema: dict[str, Any] = Field(
        default_factory=dict, description="JSON-serializable 输入输出 schema 描述"
    )
    model_dependency: str | None = Field(
        None, description="编译时所用模型标识；与当前模型不一致时视为不新鲜"
    )
    last_validated_model: str | None = Field(None, description="最近一次通过评测的模型")
    last_validated_at: str | None = Field(
        None, description="最近一次通过评测的 ISO-8601 UTC 时间"
    )
    tests_path: str = Field("tests", description="包内验收测试目录相对路径")

    @field_validator("program_id")
    @classmethod
    def _check_program_id(cls, v: str) -> str:
        if not PROGRAM_ID_RE.match(v):
            raise ValueError(
                "program_id must match ^[a-z0-9_][a-z0-9_-]{0,63}$"
            )
        return v


class ProgramRegistry:
    """线程安全的程序包注册中心（单 JSON 风格目录存储）。"""

    def __init__(
        self,
        base_dir: str,
        freshness_ttl_days: int = DEFAULT_FRESHNESS_TTL_DAYS,
    ) -> None:
        self._base_dir = base_dir
        self._freshness_ttl_days = freshness_ttl_days
        # RLock: match() 持锁期间会调用 list()/is_fresh()
        self._lock = threading.RLock()
        os.makedirs(self._base_dir, exist_ok=True)

    # ── 存储 ──────────────────────────────────────────

    def _pack_dir(self, program_id: str) -> str:
        if not PROGRAM_ID_RE.match(program_id):
            raise ValueError(f"invalid program_id: {program_id!r}")
        return os.path.join(self._base_dir, program_id)

    def _manifest_path(self, program_id: str) -> str:
        return os.path.join(self._pack_dir(program_id), "manifest.yaml")

    def _lineage_path(self, program_id: str) -> str:
        return os.path.join(self._pack_dir(program_id), "lineage.json")

    def pack_dir(self, program_id: str) -> str:
        """程序包目录（供执行器等外部组件定位 main.py/tests）。"""
        return self._pack_dir(program_id)

    def _write_manifest(self, manifest: ProgramManifest) -> None:
        pack_dir = self._pack_dir(manifest.program_id)
        os.makedirs(pack_dir, exist_ok=True)
        path = self._manifest_path(manifest.program_id)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                manifest.model_dump(mode="json"),
                f,
                allow_unicode=True,
                sort_keys=False,
            )
        os.replace(tmp, path)

    def _read_manifest(self, program_id: str) -> ProgramManifest | None:
        path = self._manifest_path(program_id)
        if not os.path.isfile(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            return ProgramManifest.model_validate(data)
        except (
            yaml.YAMLError,
            OSError,
            ValueError,  # pydantic ValidationError
        ) as e:
            # 损坏 manifest → 视为不存在（宁重勿轻，避免 list/match 500）
            logger.warning("corrupt manifest for %s: %s", program_id, e)
            return None

    def _append_lineage(self, program_id: str, event: dict[str, Any]) -> None:
        path = self._lineage_path(program_id)
        records: list[dict[str, Any]] = []
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as f:
                    records = json.load(f)
            except (json.JSONDecodeError, OSError):
                logger.warning("lineage corrupt for %s, rebuilding", program_id)
                records = []
        records.append(event)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    def read_lineage(self, program_id: str) -> list[dict[str, Any]]:
        with self._lock:
            path = self._lineage_path(program_id)
            if not os.path.isfile(path):
                return []
            try:
                with open(path, encoding="utf-8") as f:
                    return list(json.load(f))
            except (json.JSONDecodeError, OSError):
                return []

    def append_lineage(self, program_id: str, event: dict[str, Any]) -> None:
        """追加 lineage 事件（供 promotion_gate 等记录门禁审计轨迹）。"""
        with self._lock:
            if self._read_manifest(program_id) is None:
                raise FileNotFoundError(f"program not found: {program_id}")
            self._append_lineage(program_id, event)

    # ── CRUD ──────────────────────────────────────────

    def create(self, manifest: ProgramManifest) -> ProgramManifest:
        """登记新程序包；初始状态必须为 candidate，kind=program。"""
        if manifest.kind != ProgramKind.PROGRAM:
            raise ValueError("only kind=program can be created via create()")
        with self._lock:
            if self._read_manifest(manifest.program_id) is not None:
                raise FileExistsError(
                    f"program already exists: {manifest.program_id}"
                )
            stored = manifest.model_copy(update={"status": ProgramStatus.CANDIDATE})
            self._write_manifest(stored)
            self._append_lineage(
                stored.program_id,
                {
                    "event": "create",
                    "version": stored.version,
                    "from": None,
                    "to": ProgramStatus.CANDIDATE.value,
                    "at": _utc_now(),
                },
            )
            return stored

    def get(self, program_id: str) -> ProgramManifest | None:
        with self._lock:
            return self._read_manifest(program_id)

    def delete(self, program_id: str) -> None:
        """删除 candidate 程序包（编译写盘失败时回滚用）。

        仅 candidate 可删——promoted/deprecated 为受审计状态，禁止删除。
        """
        with self._lock:
            manifest = self._read_manifest(program_id)
            if manifest is None:
                raise FileNotFoundError(f"program not found: {program_id}")
            if manifest.status != ProgramStatus.CANDIDATE:
                raise ValueError(
                    f"only candidate can be deleted, got {manifest.status.value}"
                )
            pack_dir = self._pack_dir(program_id)
            shutil.rmtree(pack_dir, ignore_errors=True)

    def list(
        self, status: ProgramStatus | None = None
    ) -> list[ProgramManifest]:
        with self._lock:
            manifests: list[ProgramManifest] = []
            if not os.path.isdir(self._base_dir):
                return []
            for name in sorted(os.listdir(self._base_dir)):
                if not PROGRAM_ID_RE.match(name):
                    continue  # 跳过非规范条目（临时文件等），宁重勿轻
                m = self._read_manifest(name)
                if m is None:
                    continue
                if status is not None and m.status != status:
                    continue
                manifests.append(m)
            return manifests

    # ── 状态机 ────────────────────────────────────────

    def _transition(
        self,
        program_id: str,
        target: ProgramStatus,
        event: str,
        allow_legacy: bool = False,
    ) -> ProgramManifest:
        with self._lock:
            manifest = self._read_manifest(program_id)
            if manifest is None:
                raise FileNotFoundError(f"program not found: {program_id}")
            if manifest.kind == ProgramKind.LEGACY_SKILL_PACK and not allow_legacy:
                raise PermissionError(
                    f"legacy skill pack is read-only: {program_id}"
                )
            allowed = ALLOWED_TRANSITIONS[manifest.status]
            if target not in allowed:
                raise ValueError(
                    f"invalid transition {manifest.status.value} -> "
                    f"{target.value} for {program_id}"
                )
            updated = manifest.model_copy(update={"status": target})
            self._write_manifest(updated)
            self._append_lineage(
                program_id,
                {
                    "event": event,
                    "version": updated.version,
                    "from": manifest.status.value,
                    "to": target.value,
                    "at": _utc_now(),
                },
            )
            return updated

    def promote(
        self, program_id: str, validated_model: str | None = None
    ) -> ProgramManifest:
        """candidate -> promoted（由 T4 promotion_gate 调用）。

        validated_model 非空时在同一锁内完成验证记录（promote+validate
        原子，避免中途 deprecate 造成事件错挂）。
        """
        with self._lock:
            updated = self._transition(
                program_id, ProgramStatus.PROMOTED, "promote"
            )
            if validated_model:
                updated = self._record_validation_locked(
                    program_id, model=validated_model
                )
            return updated

    def deprecate(self, program_id: str) -> ProgramManifest:
        """candidate|promoted -> deprecated。"""
        return self._transition(program_id, ProgramStatus.DEPRECATED, "deprecate")

    def _record_validation_locked(
        self,
        program_id: str,
        model: str | None = None,
        validated_at: str | None = None,
    ) -> ProgramManifest:
        manifest = self._read_manifest(program_id)
        if manifest is None:
            raise FileNotFoundError(f"program not found: {program_id}")
        if manifest.kind == ProgramKind.LEGACY_SKILL_PACK:
            raise PermissionError(f"legacy skill pack is read-only: {program_id}")
        updated = manifest.model_copy(
            update={
                "last_validated_model": model or manifest.last_validated_model,
                "last_validated_at": validated_at or _utc_now(),
            }
        )
        self._write_manifest(updated)
        self._append_lineage(
            program_id,
            {
                "event": "validated",
                "version": updated.version,
                "from": manifest.status.value,
                "to": updated.status.value,
                "at": _utc_now(),
                "model": updated.last_validated_model,
            },
        )
        return updated

    def record_validation(
        self,
        program_id: str,
        model: str | None = None,
        validated_at: str | None = None,
    ) -> ProgramManifest:
        """记录一次评测通过：刷新 last_validated_model / last_validated_at。"""
        with self._lock:
            return self._record_validation_locked(
                program_id, model=model, validated_at=validated_at
            )

    # ── 新鲜度与触发匹配 ──────────────────────────────

    def is_fresh(
        self, manifest: ProgramManifest, current_model: str | None = None
    ) -> bool:
        """模型换代或超过 TTL 视为不新鲜（对应 spec「路由命中前校验」）。"""
        if manifest.last_validated_at is None:
            return False
        try:
            validated = datetime.fromisoformat(manifest.last_validated_at)
        except ValueError:
            return False
        if validated.tzinfo is None:
            validated = validated.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - validated
        if age.total_seconds() > self._freshness_ttl_days * 86400:
            return False
        if current_model is not None:
            # 宁重勿轻：调用方要求模型校验时，从未记录验证模型视为不新鲜
            return manifest.last_validated_model == current_model
        return True

    def match(
        self, task_text: str, current_model: str | None = None
    ) -> list[ProgramManifest]:
        """返回 promoted、新鲜、且触发关键词命中的程序包（按命中数降序）。"""
        text = task_text or ""
        with self._lock:
            hits: list[tuple[int, ProgramManifest]] = []
            for m in self.list():
                if m.kind != ProgramKind.PROGRAM:
                    continue
                if m.status != ProgramStatus.PROMOTED:
                    continue
                if not self.is_fresh(m, current_model):
                    continue
                score = sum(1 for kw in m.trigger.keywords if kw and kw in text)
                if score > 0:
                    hits.append((score, m))
        hits.sort(key=lambda t: (-t[0], t[1].program_id))
        return [m for _, m in hits]

    # ── 旧资产只读登记 ────────────────────────────────

    def import_legacy_skill_packs(
        self, skill_packs_dir: str
    ) -> list[ProgramManifest]:
        """把 skill_packs/ 只读登记为 legacy 条目（不参与路由匹配、不可晋升）。"""
        imported: list[ProgramManifest] = []
        if not os.path.isdir(skill_packs_dir):
            return imported
        with self._lock:
            for name in sorted(os.listdir(skill_packs_dir)):
                pack_path = os.path.join(skill_packs_dir, name)
                manifest_path = os.path.join(pack_path, "manifest.yaml")
                if not os.path.isdir(pack_path) or not os.path.isfile(manifest_path):
                    continue
                try:
                    with open(manifest_path, encoding="utf-8") as f:
                        raw = yaml.safe_load(f) or {}
                except (yaml.YAMLError, OSError):
                    logger.warning("skip unreadable skill pack manifest: %s", name)
                    continue
                program_id = f"legacy_{name}"
                if not PROGRAM_ID_RE.match(program_id):
                    continue
                if self._read_manifest(program_id) is not None:
                    continue  # idempotent
                legacy = ProgramManifest(
                    program_id=program_id,
                    version=str(raw.get("version", "0.0.0")),
                    description=str(raw.get("description", "")),
                    kind=ProgramKind.LEGACY_SKILL_PACK,
                    status=ProgramStatus.DEPRECATED,
                    trigger=ProgramTrigger(keywords=[name]),
                    tests_path="",
                )
                self._write_manifest(legacy)
                self._append_lineage(
                    program_id,
                    {
                        "event": "legacy_import",
                        "version": legacy.version,
                        "from": None,
                        "to": ProgramStatus.DEPRECATED.value,
                        "at": _utc_now(),
                        "source": manifest_path,
                    },
                )
                imported.append(legacy)
        return imported


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
