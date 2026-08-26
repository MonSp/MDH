"""
SkillExporter — 技能包导入导出器（技能市场 Stage 2）

支持将技能包 + 经验规则导出为可移植的 zip 包，
其他 MDH 实例可导入。

导出格式：
    skill_export_<name>_<version>.zip
    ├── manifest.json           # 导出元数据
    ├── skills/
    │   └── <skill_name>/
    │       ├── SKILL.md
    │       └── references/
    └── experience/
        └── rules/
            ├── rule_001.yaml
            └── rule_002.yaml
"""

import json
import logging
import re
import time
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml

logger = logging.getLogger("skill_exporter")


@dataclass
class ExportManifest:
    """导出包元数据"""
    export_id: str
    skill_name: str
    skill_version: str
    description: str
    exported_at: float = field(default_factory=time.time)
    source_instance: str = ""
    rules_count: int = 0
    includes_experience: bool = True
    desensitized: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ImportResult:
    """导入结果"""
    success: bool
    skill_name: str
    skill_version: str
    rules_imported: int = 0
    warnings: List[str] = field(default_factory=list)
    error: str = ""


class SkillExporter:
    """技能包导入导出器。

    用法：
        exporter = SkillExporter("skill_packs", "data/shared_experience")

        # 导出
        path = exporter.export_skill("frontend_dev", include_experience=True)

        # 导入
        result = exporter.import_skill("path/to/export.zip")
    """

    def __init__(self, skill_dir: str, experience_dir: str, export_dir: str = "data/exports"):
        self._skill_dir = Path(skill_dir)
        self._experience_dir = Path(experience_dir)
        self._export_dir = Path(export_dir)
        self._export_dir.mkdir(parents=True, exist_ok=True)

    def export_skill(
        self,
        skill_name: str,
        include_experience: bool = True,
        desensitize: bool = False,
        source_instance: str = "",
    ) -> Optional[str]:
        """导出技能包为 zip 文件。

        Args:
            skill_name: 技能名称
            include_experience: 是否包含相关经验规则
            desensitize: 是否脱敏（移除 team_id、project_id 等）
            source_instance: 来源实例标识

        Returns:
            导出文件路径，失败返回 None
        """
        skill_path = self._skill_dir / skill_name
        if not skill_path.exists():
            logger.warning("技能 %s 不存在", skill_name)
            return None

        # 读取技能版本
        version = self._read_version(skill_path)
        description = self._read_description(skill_path)

        # 收集经验规则
        rules = []
        if include_experience:
            rules = self._collect_related_rules(skill_name, desensitize)

        # 构建 manifest
        import uuid
        manifest = ExportManifest(
            export_id=str(uuid.uuid4())[:12],
            skill_name=skill_name,
            skill_version=version,
            description=description,
            source_instance=source_instance,
            rules_count=len(rules),
            includes_experience=include_experience,
            desensitized=desensitize,
        )

        # 创建 zip
        zip_name = f"skill_export_{skill_name}_{version}.zip"
        zip_path = self._export_dir / zip_name

        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zf:
            # 写入 manifest
            zf.writestr("manifest.json", json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2))

            # 写入技能文件
            for file_path in skill_path.rglob("*"):
                if file_path.is_file() and not file_path.name.startswith("."):
                    arcname = f"skills/{skill_name}/{file_path.relative_to(skill_path)}"
                    zf.write(str(file_path), arcname)

            # 写入经验规则
            for i, rule in enumerate(rules):
                rule_yaml = yaml.dump(rule, default_flow_style=False, allow_unicode=True)
                zf.writestr(f"experience/rules/rule_{i:03d}.yaml", rule_yaml)

        logger.info("已导出技能 %s (v%s): %s (%d 条规则)", skill_name, version, zip_path, len(rules))
        return str(zip_path)

    def import_skill(self, zip_path: str, overwrite: bool = False) -> ImportResult:
        """导入技能包。

        Args:
            zip_path: zip 文件路径
            overwrite: 是否覆盖已有技能

        Returns:
            ImportResult
        """
        zip_file = Path(zip_path)
        if not zip_file.exists():
            return ImportResult(success=False, skill_name="", skill_version="", error="文件不存在")

        try:
            with zipfile.ZipFile(str(zip_file), 'r') as zf:
                # 读取 manifest
                manifest_data = json.loads(zf.read("manifest.json"))
                skill_name = manifest_data.get("skill_name", "")
                skill_version = manifest_data.get("skill_version", "0.0.0")

                if not skill_name:
                    return ImportResult(success=False, skill_name="", skill_version="", error="无效的导出包：缺少 skill_name")

                # 检查是否已存在
                target_dir = self._skill_dir / skill_name
                if target_dir.exists() and not overwrite:
                    return ImportResult(
                        success=False,
                        skill_name=skill_name,
                        skill_version=skill_version,
                        error=f"技能 {skill_name} 已存在，使用 overwrite=True 覆盖",
                    )

                # 解压技能文件
                target_dir.mkdir(parents=True, exist_ok=True)
                prefix = f"skills/{skill_name}/"
                for info in zf.infolist():
                    if info.filename.startswith(prefix):
                        # 提取技能内的相对路径
                        rel_path = info.filename[len(prefix):]
                        if not rel_path or rel_path.endswith("/"):
                            continue
                        target_file = target_dir / rel_path
                        target_file.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(info) as src, open(str(target_file), 'wb') as dst:
                            dst.write(src.read())

                # 导入经验规则
                rules_imported = 0
                warnings = []
                if manifest_data.get("includes_experience"):
                    rules_imported, warnings = self._import_experience_rules(zf, skill_name, manifest_data)

                return ImportResult(
                    success=True,
                    skill_name=skill_name,
                    skill_version=skill_version,
                    rules_imported=rules_imported,
                    warnings=warnings,
                )

        except zipfile.BadZipFile:
            return ImportResult(success=False, skill_name="", skill_version="", error="无效的 zip 文件")
        except Exception as e:
            return ImportResult(success=False, skill_name="", skill_version="", error=str(e))

    def list_exports(self) -> List[dict]:
        """列出所有导出包"""
        exports = []
        for zf_path in sorted(self._export_dir.glob("skill_export_*.zip")):
            try:
                with zipfile.ZipFile(str(zf_path), 'r') as zf:
                    manifest = json.loads(zf.read("manifest.json"))
                    exports.append({
                        "file": zf_path.name,
                        "path": str(zf_path),
                        "skill_name": manifest.get("skill_name", ""),
                        "version": manifest.get("skill_version", ""),
                        "rules_count": manifest.get("rules_count", 0),
                        "exported_at": manifest.get("exported_at", 0),
                    })
            except Exception:
                continue
        return exports

    def _collect_related_rules(self, skill_name: str, desensitize: bool) -> List[dict]:
        """收集与技能相关的经验规则"""
        rules = []
        if not self._experience_dir.exists():
            return rules

        for rule_file in self._experience_dir.rglob("*.yaml"):
            try:
                rule_data = yaml.safe_load(rule_file.read_text(encoding="utf-8")) or {}
                # 检查是否与技能相关
                keywords = rule_data.get("keywords", [])
                if skill_name in keywords or any(kw in skill_name for kw in keywords):
                    if desensitize:
                        rule_data = self._desensitize_rule(rule_data)
                    rules.append(rule_data)
            except Exception:
                continue

        return rules

    def _import_experience_rules(self, zf: zipfile.ZipFile, skill_name: str, manifest: dict) -> tuple:
        """导入经验规则到共享池"""
        from shared_experience_pool import SharedExperiencePool
        pool = SharedExperiencePool(str(self._experience_dir))

        imported = 0
        warnings = []

        for info in zf.infolist():
            if info.filename.startswith("experience/rules/") and info.filename.endswith(".yaml"):
                try:
                    with zf.open(info) as f:
                        rule_data = yaml.safe_load(f.read())
                    if rule_data:
                        rule_data["keywords"] = rule_data.get("keywords", []) + [skill_name]
                        result = pool.publish_rule(
                            rule_data,
                            source_project=f"import:{manifest.get('source_instance', 'unknown')}",
                        )
                        if result:
                            imported += 1
                except Exception as e:
                    warnings.append(f"规则 {info.filename} 导入失败: {e}")

        return imported, warnings

    @staticmethod
    def _desensitize_rule(rule_data: dict) -> dict:
        """脱敏：移除 team_id、project_id 等标识"""
        for key in ["team_id", "project_id", "source_project", "source_team"]:
            if key in rule_data:
                rule_data[key] = ""
        return rule_data

    @staticmethod
    def _read_version(skill_path: Path) -> str:
        """读取技能版本"""
        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            content = skill_md.read_text(encoding="utf-8")
            match = re.search(r'version:\s*["\']?([\d.]+)', content)
            if match:
                return match.group(1)
        manifest = skill_path / "manifest.yaml"
        if manifest.exists():
            data = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
            return str(data.get("version", "0.0.0"))
        return "0.0.0"

    @staticmethod
    def _read_description(skill_path: Path) -> str:
        """读取技能描述"""
        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            content = skill_md.read_text(encoding="utf-8")
            match = re.search(r'description:\s*["\']?(.+?)["\']?\s*$', content, re.MULTILINE)
            if match:
                return match.group(1).strip()
        manifest = skill_path / "manifest.yaml"
        if manifest.exists():
            data = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
            return str(data.get("description", ""))
        return ""
