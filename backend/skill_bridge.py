"""
SkillBridge — 统一技能加载接口（配置层插件化 Phase 1）

支持两种技能格式：
- 旧格式：manifest.yaml + system_prompt.md
- 新格式：SKILL.md（Agent Skills 标准）

两种格式统一输出 SkillDescriptor，供上层使用。
"""

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger("skill_bridge")


@dataclass
class SkillDescriptor:
    """统一的技能描述符 — 无论来源格式如何，输出一致。"""
    name: str
    version: str = "0.0.0"
    description: str = ""
    trigger: str = ""           # 触发条件描述（用于意图匹配）
    category: str = ""
    methodology: str = ""       # 核心方法论
    instructions: str = ""      # 完整指令（system prompt 等价物）
    required_tools: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)  # references/ 下的文件路径
    has_scripts: bool = False
    source_format: str = "legacy"  # "legacy" | "skill_md"
    base_path: str = ""

    def summary(self, max_len: int = 100) -> str:
        """L0 级轻量摘要（~50 tokens）"""
        desc = self.description[:max_len] + ("..." if len(self.description) > max_len else "")
        return f"[{self.category}] {self.name}: {desc}"


class SkillBridge:
    """统一技能加载桥接器。

    检测 SKILL.md 存在则按标准格式解析，否则回退到旧格式。
    """

    def __init__(self, skill_dir: str):
        self._skill_dir = Path(skill_dir)

    def discover(self) -> list[SkillDescriptor]:
        """发现所有技能（不加载完整内容，仅元数据）。"""
        skills = []
        if not self._skill_dir.exists():
            return skills

        for entry in sorted(self._skill_dir.iterdir()):
            if not entry.is_dir():
                continue
            try:
                desc = self._load_descriptor(entry)
                if desc:
                    skills.append(desc)
            except Exception as e:
                logger.warning("技能 %s 加载失败: %s", entry.name, e)
        return skills

    def load(self, skill_name: str) -> SkillDescriptor | None:
        """加载单个技能的完整描述符。"""
        skill_path = self._skill_dir / skill_name
        if not skill_path.exists():
            return None
        return self._load_descriptor(skill_path)

    def _load_descriptor(self, path: Path) -> SkillDescriptor | None:
        """根据目录内容自动检测格式并加载。"""
        skill_md = path / "SKILL.md"
        manifest_yaml = path / "manifest.yaml"

        if skill_md.exists():
            return self._load_skill_md(path, skill_md)
        elif manifest_yaml.exists():
            return self._load_legacy(path, manifest_yaml)
        else:
            logger.debug("跳过 %s：无 SKILL.md 或 manifest.yaml", path.name)
            return None

    def _load_skill_md(self, path: Path, skill_md: Path) -> SkillDescriptor:
        """按 Agent Skills 标准格式加载 SKILL.md。"""
        content = skill_md.read_text(encoding="utf-8")

        # 解析 frontmatter
        meta, body = self._parse_frontmatter(content)

        # 解析 references/ 目录
        references = []
        refs_dir = path / "references"
        if refs_dir.exists():
            for f in sorted(refs_dir.iterdir()):
                if f.is_file():
                    references.append(str(f))

        # 检查 scripts/ 目录
        scripts_dir = path / "scripts"
        has_scripts = scripts_dir.exists() and any(scripts_dir.iterdir())

        return SkillDescriptor(
            name=meta.get("name", path.name),
            version=meta.get("version", "0.0.0"),
            description=meta.get("description", ""),
            trigger=meta.get("trigger", meta.get("description", "")),
            category=meta.get("category", ""),
            methodology=meta.get("methodology", ""),
            instructions=body.strip(),
            required_tools=meta.get("required_tools", []),
            keywords=meta.get("keywords", []),
            references=references,
            has_scripts=has_scripts,
            source_format="skill_md",
            base_path=str(path),
        )

    def _load_legacy(self, path: Path, manifest_path: Path) -> SkillDescriptor:
        """按旧格式加载 manifest.yaml + system_prompt.md。"""
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}

        # 加载 system_prompt.md
        system_prompt_path = path / "system_prompt.md"
        instructions = ""
        if system_prompt_path.exists():
            instructions = system_prompt_path.read_text(encoding="utf-8")

        # 解析 references/（如果存在）
        references = []
        for subdir in ["knowledge", "references", "examples"]:
            ref_dir = path / subdir
            if ref_dir.exists():
                for f in sorted(ref_dir.iterdir()):
                    if f.is_file():
                        references.append(str(f))

        # 检查 rules/ 目录
        rules_dir = path / "rules"
        has_rules = rules_dir.exists()

        return SkillDescriptor(
            name=manifest.get("name", path.name),
            version=manifest.get("version", "0.0.0"),
            description=manifest.get("description", ""),
            trigger=manifest.get("description", ""),
            category=manifest.get("category", ""),
            methodology=manifest.get("methodology", ""),
            instructions=instructions,
            required_tools=manifest.get("required_tools", []),
            keywords=manifest.get("keywords", []),
            references=references,
            has_scripts=has_rules,  # 旧格式的 rules/ 等价于 scripts
            source_format="legacy",
            base_path=str(path),
        )

    @staticmethod
    def _parse_frontmatter(content: str) -> tuple:
        """解析 SKILL.md 的 YAML frontmatter + 正文。"""
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', content, re.DOTALL)
        if match:
            try:
                meta = yaml.safe_load(match.group(1)) or {}
            except yaml.YAMLError:
                meta = {}
            body = match.group(2)
            return meta, body
        return {}, content

    def export_to_skill_md(self, skill_name: str, output_path: str | None = None) -> bool:
        """将旧格式技能导出为 SKILL.md 格式（单向转换）。"""
        desc = self.load(skill_name)
        if not desc or desc.source_format != "legacy":
            return False

        # 构建 SKILL.md 内容
        frontmatter = {
            "name": desc.name,
            "version": desc.version,
            "description": desc.description,
            "trigger": desc.trigger,
            "category": desc.category,
            "methodology": desc.methodology,
            "required_tools": desc.required_tools,
            "keywords": desc.keywords,
        }

        content = "---\n"
        content += yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True)
        content += "---\n\n"
        content += desc.instructions

        target = Path(output_path) if output_path else self._skill_dir / skill_name / "SKILL.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        logger.info("已导出 %s 为 SKILL.md 格式: %s", skill_name, target)
        return True
