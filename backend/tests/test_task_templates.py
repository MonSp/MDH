"""TaskTemplateManager 单元测试。"""

import json

import pytest

from task_template_manager import TaskTemplateManager
from task_templates_preset import PRESET_TEMPLATES


@pytest.fixture
def mgr(tmp_path):
    """提供一个使用临时目录的 TaskTemplateManager 实例。"""
    return TaskTemplateManager(str(tmp_path))


# ── 预置模板加载 ──────────────────────────────────────────────


def test_list_returns_10_presets(mgr):
    """应加载 10 个预置模板。"""
    templates = mgr.list_templates()
    preset_count = sum(1 for t in templates if t.get("is_preset"))
    assert preset_count == 10


def test_filter_by_category(mgr):
    """按 category 过滤应只返回匹配的模板。"""
    dev = mgr.list_templates(category="development")
    assert all(t["category"] == "development" for t in dev)
    assert len(dev) >= 6  # code-review, api-design, bug-fix, refactor, db-design, perf-optimization, security-audit

    testing = mgr.list_templates(category="testing")
    assert len(testing) == 1
    assert testing[0]["template_id"] == "unit-testing"

    docs = mgr.list_templates(category="documentation")
    assert len(docs) == 1
    assert docs[0]["template_id"] == "doc-generation"

    devops = mgr.list_templates(category="devops")
    assert len(devops) == 1
    assert devops[0]["template_id"] == "deploy-config"


def test_get_template_by_id(mgr):
    """按 ID 获取模板应返回正确数据。"""
    t = mgr.get_template("code-review")
    assert t is not None
    assert t["title"] == "代码审查"
    assert t["category"] == "development"
    assert t["difficulty"] == "中等"
    assert t["icon"] == "🔍"


# ── 自定义模板 CRUD ──────────────────────────────────────────


def test_create_custom_template(mgr):
    """创建自定义模板应自动生成 ID 和时间戳。"""
    data = {
        "title": "自定义模板",
        "description": "测试",
        "category": "design",
        "difficulty": "简单",
        "task_prompt": "做点什么",
    }
    result = mgr.create_template(data)
    assert result["template_id"].startswith("custom-")
    assert result["is_preset"] is False
    assert result["usage_count"] == 0
    assert result["created_at"] != ""
    assert result["title"] == "自定义模板"

    # 可通过 get 获取
    fetched = mgr.get_template(result["template_id"])
    assert fetched is not None
    assert fetched["title"] == "自定义模板"


def test_update_custom_template(mgr):
    """更新自定义模板应修改字段。"""
    data = {"title": "原始", "task_prompt": "旧的提示"}
    created = mgr.create_template(data)
    tid = created["template_id"]

    updated = mgr.update_template(tid, {"title": "已更新", "task_prompt": "新的提示"})
    assert updated is not None
    assert updated["title"] == "已更新"
    assert updated["task_prompt"] == "新的提示"
    assert updated["is_preset"] is False


def test_cannot_delete_preset(mgr):
    """预置模板不可删除。"""
    ok = mgr.delete_template("code-review")
    assert ok is False
    assert mgr.get_template("code-review") is not None


def test_delete_custom_template(mgr):
    """删除自定义模板后不可再获取。"""
    created = mgr.create_template({"title": "要删除"})
    tid = created["template_id"]
    assert mgr.get_template(tid) is not None

    ok = mgr.delete_template(tid)
    assert ok is True
    assert mgr.get_template(tid) is None


def test_update_preset_returns_none(mgr):
    """尝试更新预置模板应返回 None。"""
    result = mgr.update_template("code-review", {"title": "被修改"})
    assert result is None


# ── 使用次数 ─────────────────────────────────────────────────


def test_increment_usage(mgr):
    """使用次数应正确递增。"""
    assert mgr.get_template("api-design")["usage_count"] == 0
    mgr.increment_usage("api-design")
    assert mgr.get_template("api-design")["usage_count"] == 1
    mgr.increment_usage("api-design")
    assert mgr.get_template("api-design")["usage_count"] == 2


def test_increment_usage_custom_template_persists(mgr, tmp_path):
    """自定义模板使用次数递增后应持久化。"""
    created = mgr.create_template({"title": "持久化测试"})
    tid = created["template_id"]
    mgr.increment_usage(tid)
    mgr.increment_usage(tid)

    # 重新加载验证持久化
    mgr2 = TaskTemplateManager(str(tmp_path))
    assert mgr2.get_template(tid)["usage_count"] == 2


def test_increment_usage_nonexistent(mgr):
    """对不存在的模板递增使用次数不应报错。"""
    mgr.increment_usage("nonexistent-id")  # 不应抛异常


# ── 预置模板完整性 ──────────────────────────────────────────


@pytest.mark.parametrize(
    "template_id",
    [t["template_id"] for t in PRESET_TEMPLATES],
    ids=[t["template_id"] for t in PRESET_TEMPLATES],
)
def test_preset_templates_have_required_fields(mgr, template_id):
    """每个预置模板都应包含所有必填字段。"""
    t = mgr.get_template(template_id)
    assert t is not None, f"模板 {template_id} 未加载"
    for field in (
        "template_id",
        "title",
        "description",
        "category",
        "difficulty",
        "task_prompt",
        "recommended_roles",
        "recommended_skills",
        "icon",
    ):
        assert field in t, f"模板 {template_id} 缺少字段 {field}"
        assert t[field], f"模板 {template_id} 字段 {field} 为空"


# ── 序列化 ──────────────────────────────────────────────────


def test_templates_json_serializable(mgr):
    """所有模板应可 JSON 序列化。"""
    templates = mgr.list_templates()
    serialized = json.dumps(templates, ensure_ascii=False)
    assert len(serialized) > 0
    # 反序列化后结构不变
    deserialized = json.loads(serialized)
    assert len(deserialized) == len(templates)
