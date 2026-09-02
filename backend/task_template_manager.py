"""任务模板管理器：预置模板 + 自定义模板 CRUD。"""

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from task_templates_preset import PRESET_TEMPLATES


@dataclass
class TaskTemplate:
    template_id: str
    title: str
    description: str
    category: str  # development/testing/documentation/devops/design
    difficulty: str  # 简单/中等/高级
    task_prompt: str
    recommended_roles: list[str] = field(default_factory=list)
    recommended_skills: list[str] = field(default_factory=list)
    expected_output: str = ""
    icon: str = ""
    tags: list[str] = field(default_factory=list)
    usage_count: int = 0
    is_preset: bool = True
    created_at: str = ""


class TaskTemplateManager:
    """管理预置任务模板与用户自定义模板。"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._custom_dir = os.path.join(data_dir, "task_templates")
        self._custom_path = os.path.join(self._custom_dir, "custom.json")
        os.makedirs(self._custom_dir, exist_ok=True)

        # 加载预置模板
        self._templates: dict[str, dict] = {}
        for t in PRESET_TEMPLATES:
            entry = dict(t)
            entry.setdefault("usage_count", 0)
            entry.setdefault("is_preset", True)
            entry.setdefault("created_at", "")
            self._templates[entry["template_id"]] = entry

        # 加载自定义模板
        self._load_custom()

    # ── 持久化 ──────────────────────────────────────────────

    def _load_custom(self) -> None:
        if not os.path.exists(self._custom_path):
            return
        try:
            with open(self._custom_path, "r", encoding="utf-8") as f:
                custom_list = json.load(f)
            for entry in custom_list:
                entry["is_preset"] = False
                self._templates[entry["template_id"]] = entry
        except (json.JSONDecodeError, OSError):
            pass

    def _save_custom(self) -> None:
        custom_list = [t for t in self._templates.values() if not t.get("is_preset", True)]
        with open(self._custom_path, "w", encoding="utf-8") as f:
            json.dump(custom_list, f, ensure_ascii=False, indent=2)

    # ── 公开接口 ─────────────────────────────────────────────

    def list_templates(self, category: str | None = None) -> list[dict]:
        """列出模板，可选按 category 过滤。"""
        templates = list(self._templates.values())
        if category:
            templates = [t for t in templates if t.get("category") == category]
        return templates

    def get_template(self, template_id: str) -> dict | None:
        """按 ID 获取单个模板。"""
        return self._templates.get(template_id)

    def create_template(self, data: dict) -> dict:
        """创建自定义模板，自动生成 template_id 和 created_at。"""
        template_id = data.get("template_id") or f"custom-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "template_id": template_id,
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "category": data.get("category", "development"),
            "difficulty": data.get("difficulty", "中等"),
            "task_prompt": data.get("task_prompt", ""),
            "recommended_roles": data.get("recommended_roles", []),
            "recommended_skills": data.get("recommended_skills", []),
            "expected_output": data.get("expected_output", ""),
            "icon": data.get("icon", ""),
            "tags": data.get("tags", []),
            "usage_count": 0,
            "is_preset": False,
            "created_at": data.get("created_at", now),
        }
        self._templates[template_id] = entry
        self._save_custom()
        return entry

    def update_template(self, template_id: str, data: dict) -> dict | None:
        """更新自定义模板（预置模板不可修改）。"""
        existing = self._templates.get(template_id)
        if existing is None:
            return None
        if existing.get("is_preset", True):
            return None
        for key, value in data.items():
            if key in ("template_id", "is_preset", "usage_count"):
                continue
            existing[key] = value
        self._templates[template_id] = existing
        self._save_custom()
        return existing

    def delete_template(self, template_id: str) -> bool:
        """删除自定义模板（预置模板不可删除）。"""
        existing = self._templates.get(template_id)
        if existing is None:
            return False
        if existing.get("is_preset", True):
            return False
        del self._templates[template_id]
        self._save_custom()
        return True

    def increment_usage(self, template_id: str) -> None:
        """模板使用次数 +1。"""
        existing = self._templates.get(template_id)
        if existing is None:
            return
        existing["usage_count"] = existing.get("usage_count", 0) + 1
        if not existing.get("is_preset", True):
            self._save_custom()
