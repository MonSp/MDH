"""ProgramRegistry 单元测试 (program-pivot T1)

覆盖：manifest 校验 / 状态机合法与非法迁移 / 新鲜度失效（TTL + 模型换代）/
触发匹配（仅 promoted+fresh）/ legacy 只读登记。
"""

from datetime import datetime, timedelta, timezone

import pytest

from program_registry import (
    ProgramKind,
    ProgramManifest,
    ProgramRegistry,
    ProgramStatus,
    ProgramTrigger,
)


def _manifest(program_id: str = "demo_prog", **kwargs) -> ProgramManifest:
    defaults = dict(
        program_id=program_id,
        version="1.0.0",
        description="demo",
        trigger=ProgramTrigger(keywords=["部署", "deploy"]),
    )
    defaults.update(kwargs)
    return ProgramManifest(**defaults)


def _registry(tmp_path, ttl_days: int = 30) -> ProgramRegistry:
    return ProgramRegistry(str(tmp_path / "program_packs"), freshness_ttl_days=ttl_days)


def _validated(registry: ProgramRegistry, program_id: str, model: str = "deepseek-chat"):
    return registry.record_validation(program_id, model=model)


# ── manifest 校验 ────────────────────────────────────


def test_invalid_program_id_rejected():
    with pytest.raises(ValueError):
        _manifest(program_id="Bad-Id!")


def test_create_initial_status_is_candidate(tmp_path):
    reg = _registry(tmp_path)
    created = reg.create(_manifest())
    assert created.status == ProgramStatus.CANDIDATE
    assert reg.get("demo_prog") is not None


def test_duplicate_create_rejected(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    with pytest.raises(FileExistsError):
        reg.create(_manifest())


def test_legacy_kind_cannot_create(tmp_path):
    reg = _registry(tmp_path)
    with pytest.raises(ValueError):
        reg.create(_manifest(kind=ProgramKind.LEGACY_SKILL_PACK))


# ── 状态机 ──────────────────────────────────────────


def test_promote_candidate_ok(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    promoted = reg.promote("demo_prog")
    assert promoted.status == ProgramStatus.PROMOTED


def test_invalid_transition_deprecated_to_promoted(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.deprecate("demo_prog")
    with pytest.raises(ValueError):
        reg.promote("demo_prog")


def test_invalid_transition_promote_twice(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    with pytest.raises(ValueError):
        reg.promote("demo_prog")


def test_deprecate_from_candidate_and_promoted(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest("from_cand"))
    reg.deprecate("from_cand")
    assert reg.get("from_cand").status == ProgramStatus.DEPRECATED

    reg.create(_manifest("from_promoted"))
    reg.promote("from_promoted")
    reg.deprecate("from_promoted")
    assert reg.get("from_promoted").status == ProgramStatus.DEPRECATED


def test_lineage_records_transitions(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    lineage = reg.read_lineage("demo_prog")
    events = [e["event"] for e in lineage]
    assert events == ["create", "promote"]
    assert lineage[1]["from"] == "candidate"
    assert lineage[1]["to"] == "promoted"


# ── 新鲜度 ──────────────────────────────────────────


def test_freshness_requires_validation(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    m = reg.get("demo_prog")
    assert reg.is_fresh(m) is False  # 从未评测 → 不新鲜


def test_fresh_after_validation_within_ttl(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    _validated(reg, "demo_prog")
    m = reg.get("demo_prog")
    assert reg.is_fresh(m) is True


def test_stale_after_ttl_expiry(tmp_path):
    reg = _registry(tmp_path, ttl_days=30)
    reg.create(_manifest())
    reg.promote("demo_prog")
    past = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    reg.record_validation("demo_prog", model="deepseek-chat", validated_at=past)
    m = reg.get("demo_prog")
    assert reg.is_fresh(m) is False


def test_stale_on_model_upgrade(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    _validated(reg, "demo_prog", "deepseek-chat")
    m = reg.get("demo_prog")
    assert reg.is_fresh(m, current_model="deepseek-v4") is False
    assert reg.is_fresh(m, current_model="deepseek-chat") is True


def test_stale_when_no_validated_model_but_current_required(tmp_path):
    """宁重勿轻：调用方要求模型校验但从未记录验证模型 → 不新鲜。"""
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    reg.record_validation("demo_prog", model=None)  # 只记时间不记模型
    m = reg.get("demo_prog")
    assert reg.is_fresh(m, current_model="deepseek-chat") is False
    assert reg.is_fresh(m, current_model=None) is True  # 不传模型时只看 TTL


def test_list_skips_stray_entries(tmp_path):
    """base_dir 存在非规范文件（如 .tmp）时 list/match 不崩。"""
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    _validated(reg, "demo_prog")
    stray = tmp_path / "program_packs" / "stray-file.tmp"
    stray.write_text("junk", encoding="utf-8")
    (tmp_path / "program_packs" / "not a valid id").mkdir(exist_ok=True)

    assert [m.program_id for m in reg.list()] == ["demo_prog"]
    assert [m.program_id for m in reg.match("帮我部署这个服务")] == ["demo_prog"]


# ── 触发匹配 ────────────────────────────────────────


def test_match_only_promoted_and_fresh(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest("cand_prog"))
    reg.create(_manifest("proged_prog"))
    reg.promote("proged_prog")
    _validated(reg, "proged_prog")

    hits = reg.match("帮我部署这个服务")
    assert [m.program_id for m in hits] == ["proged_prog"]


def test_match_requires_keyword_hit(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest())
    reg.promote("demo_prog")
    _validated(reg, "demo_prog")
    assert reg.match("完全不相关的内容") == []


def test_match_stale_not_included(tmp_path):
    reg = _registry(tmp_path, ttl_days=30)
    reg.create(_manifest())
    reg.promote("demo_prog")
    past = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    reg.record_validation("demo_prog", model="deepseek-chat", validated_at=past)
    assert reg.match("帮我部署这个服务") == []


def test_match_ranks_by_keyword_hits(tmp_path):
    reg = _registry(tmp_path)
    reg.create(_manifest("one_kw", trigger=ProgramTrigger(keywords=["部署"])))
    reg.create(
        _manifest(
            "two_kw",
            trigger=ProgramTrigger(keywords=["部署", "deploy"]),
        )
    )
    for pid in ("one_kw", "two_kw"):
        reg.promote(pid)
        _validated(reg, pid)
    hits = reg.match("请 deploy 部署服务")
    assert [m.program_id for m in hits] == ["two_kw", "one_kw"]


# ── legacy 只读登记 ──────────────────────────────────


def test_legacy_import_readonly_and_not_matched(tmp_path):
    packs = tmp_path / "skill_packs"
    (packs / "frontend_dev").mkdir(parents=True)
    (packs / "frontend_dev" / "manifest.yaml").write_text(
        "name: frontend_dev\nversion: '1.0.0'\ndescription: 前端开发\n",
        encoding="utf-8",
    )
    reg = _registry(tmp_path)
    imported = reg.import_legacy_skill_packs(str(packs))
    assert len(imported) == 1
    legacy = reg.get("legacy_frontend_dev")
    assert legacy.kind == ProgramKind.LEGACY_SKILL_PACK
    assert legacy.status == ProgramStatus.DEPRECATED

    # 不参与触发匹配
    assert reg.match("前端开发组件") == []

    # 不可晋升（read-only）
    with pytest.raises(PermissionError):
        reg.promote("legacy_frontend_dev")

    # 不可记录验证（read-only）
    with pytest.raises(PermissionError):
        reg.record_validation("legacy_frontend_dev", model="deepseek-chat")


def test_legacy_import_idempotent(tmp_path):
    packs = tmp_path / "skill_packs"
    (packs / "backend_dev").mkdir(parents=True)
    (packs / "backend_dev" / "manifest.yaml").write_text(
        "name: backend_dev\n", encoding="utf-8"
    )
    reg = _registry(tmp_path)
    assert len(reg.import_legacy_skill_packs(str(packs))) == 1
    assert len(reg.import_legacy_skill_packs(str(packs))) == 0
