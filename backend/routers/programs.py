"""
Program Registry REST API (program-pivot T1)

GET    /api/programs                     列表（可按 status 过滤）
POST   /api/programs                     创建程序包（manifest 校验）
GET    /api/programs/match               触发匹配（promoted + 新鲜）
POST   /api/programs/legacy/import       skill_packs 只读登记
GET    /api/programs/{program_id}        详情（含 lineage）
POST   /api/programs/{program_id}/promote    candidate -> promoted
POST   /api/programs/{program_id}/deprecate  -> deprecated
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from program_registry import PROGRAM_ID_RE, ProgramManifest, ProgramStatus
from program_executor import ProgramExecutor
from routers.common import fail, ok

router = APIRouter(prefix="/api/programs", tags=["programs"])

# 注入点 — 测试可通过 init 替换 registry / skill_packs 目录
_registry = None
_skill_packs_dir = "skill_packs"


def init(registry, skill_packs_dir: str = "skill_packs") -> None:
    global _registry, _skill_packs_dir
    _registry = registry
    _skill_packs_dir = skill_packs_dir


def _get_registry():
    if _registry is None:
        raise RuntimeError("programs router not initialized")
    return _registry


def _invalid_id(program_id: str):
    """非法 program_id（含路径遍历）→ 结构化 fail，避免 500。"""
    if not PROGRAM_ID_RE.match(program_id):
        return fail(f"invalid program_id: {program_id!r}", code="INVALID_ID")
    return None


class PromoteRequest(BaseModel):
    model: str | None = Field(None, description="晋升时所用模型标识（可选）")


class ExecuteRequest(BaseModel):
    input: Any = Field(None, description="传给程序包 run() 的输入（JSON）")
    timeout_seconds: float | None = Field(
        None, gt=0, le=300, description="执行超时（秒），默认 15"
    )


@router.get("")
async def list_programs(status: str | None = Query(None, description="candidate|promoted|deprecated")):
    try:
        parsed = ProgramStatus(status) if status else None
    except ValueError:
        return fail(f"invalid status: {status}", code="INVALID_STATUS")
    items = _get_registry().list(parsed)
    return ok([m.model_dump(mode="json") for m in items])


@router.post("")
async def create_program(manifest: ProgramManifest):
    try:
        created = _get_registry().create(manifest)
    except FileExistsError as e:
        return fail(str(e), code="ALREADY_EXISTS")
    except ValueError as e:
        return fail(str(e), code="INVALID_MANIFEST")
    return ok(created.model_dump(mode="json"), code="CREATED")


@router.get("/match")
async def match_programs(
    task_text: str = Query(..., description="任务描述文本"),
    model: str | None = Query(None, description="当前模型标识（新鲜度校验）"),
):
    hits = _get_registry().match(task_text, current_model=model)
    return ok([m.model_dump(mode="json") for m in hits])


@router.post("/legacy/import")
async def import_legacy():
    imported = _get_registry().import_legacy_skill_packs(_skill_packs_dir)
    return ok(
        {
            "imported": len(imported),
            "program_ids": [m.program_id for m in imported],
        },
        code="IMPORTED",
    )


@router.get("/{program_id}")
async def get_program(program_id: str):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    manifest = _get_registry().get(program_id)
    if manifest is None:
        return fail(f"program not found: {program_id}", code="NOT_FOUND")
    data: dict[str, Any] = manifest.model_dump(mode="json")
    data["lineage"] = _get_registry().read_lineage(program_id)
    return ok(data)


@router.post("/{program_id}/promote")
async def promote_program(program_id: str, body: PromoteRequest | None = None):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    registry = _get_registry()
    try:
        promoted = registry.promote(program_id)
        if body and body.model:
            promoted = registry.record_validation(program_id, model=body.model)
    except FileNotFoundError as e:
        return fail(str(e), code="NOT_FOUND")
    except PermissionError as e:
        return fail(str(e), code="READ_ONLY")
    except ValueError as e:
        return fail(str(e), code="INVALID_TRANSITION")
    return ok(promoted.model_dump(mode="json"))


@router.post("/{program_id}/deprecate")
async def deprecate_program(program_id: str):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    try:
        deprecated = _get_registry().deprecate(program_id)
    except FileNotFoundError as e:
        return fail(str(e), code="NOT_FOUND")
    except PermissionError as e:
        return fail(str(e), code="READ_ONLY")
    except ValueError as e:
        return fail(str(e), code="INVALID_TRANSITION")
    return ok(deprecated.model_dump(mode="json"))


@router.post("/{program_id}/execute")
async def execute_program(program_id: str, body: ExecuteRequest | None = None):
    """免 LLM 沙箱执行 promoted 程序包（program-pivot T2）。"""
    bad = _invalid_id(program_id)
    if bad:
        return bad
    req = body or ExecuteRequest()
    executor = ProgramExecutor(_get_registry())
    result = await executor.execute(
        program_id, req.input, timeout_seconds=req.timeout_seconds
    )
    telemetry = {
        "llm_calls": result.telemetry.llm_calls,
        "duration_ms": result.telemetry.duration_ms,
        "timed_out": result.telemetry.timed_out,
        "program_id": result.telemetry.program_id,
        "version": result.telemetry.version,
    }
    if result.success:
        return ok({"output": result.output, "telemetry": telemetry})
    return fail(
        result.error or "execution failed",
        code=result.error_code or "ERROR",
    ) | {"detail": {"telemetry": telemetry}}
