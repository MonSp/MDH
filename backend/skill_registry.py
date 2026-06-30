"""技能注册中心 - 管理标准化技能包（只读基础库 + 可写增量区）

提供技能包的注册、克隆、版本管理等核心功能。
基础技能包为只读参考，项目启动时克隆到独立增量区供智能体使用。
"""

import datetime
import logging
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

logger = logging.getLogger(__name__)

# 标准化技能包必须包含的目录结构
REQUIRED_MANIFEST_FIELDS = {"name", "version", "description"}

INCREMENTAL_STRUCTURE = {
    "files": ["system_prompt_addon.md", "README.md"],
    "dirs": ["rules", "tools", "knowledge_add"],
}


@dataclass
class SkillPackage:
    """技能包数据类，描述一个已注册的标准化技能包。"""

    skill_id: str           # 唯一标识符
    name: str               # 技能名称
    version: str            # 版本号 (semver 格式)
    description: str        # 技能描述
    base_path: str          # 技能包基础路径
    manifest: dict          # manifest.yaml 原始内容
    created_at: str         # 注册时间
    required_env: list      # 所需环境
    dependencies: list      # 依赖列表


class SkillRegistry:
    """技能注册中心，负责基础技能包的注册、查询、克隆和版本管理。

    基础技能库存储在 base_dir 下，每个技能包以 skill_id 命名的子目录存放。
    """

    def __init__(self, base_dir: str):
        """初始化技能注册中心。

        Args:
            base_dir: 基础技能库存储目录路径。
        """
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)
        # 内存索引：skill_id -> SkillPackage
        self._registry: dict[str, SkillPackage] = {}
        # 加载已有技能包
        self._load_existing()

    def _load_existing(self) -> None:
        """扫描 base_dir 目录，加载已注册的技能包。"""
        for entry in self._base_dir.iterdir():
            if entry.is_dir():
                manifest_path = entry / "manifest.yaml"
                if manifest_path.exists():
                    try:
                        manifest = self._read_manifest(manifest_path)
                        meta_path = entry / ".skill_meta.yaml"
                        if meta_path.exists():
                            meta = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
                            skill_id = meta.get("skill_id", entry.name)
                            created_at = meta.get("created_at", "")
                        else:
                            skill_id = entry.name
                            created_at = ""

                        pkg = SkillPackage(
                            skill_id=skill_id,
                            name=manifest.get("name", entry.name),
                            version=manifest.get("version", "0.0.0"),
                            description=manifest.get("description", ""),
                            base_path=str(entry),
                            manifest=manifest,
                            created_at=created_at,
                            required_env=manifest.get("required_env", []),
                            dependencies=manifest.get("dependencies", []),
                        )
                        self._registry[pkg.skill_id] = pkg
                    except Exception as e:
                        logger.warning("跳过无效技能包 %s: %s", entry.name, e)

    @staticmethod
    def _read_manifest(manifest_path: Path) -> dict:
        """读取并解析 manifest.yaml 文件。

        Args:
            manifest_path: manifest.yaml 的路径。

        Returns:
            解析后的字典。
        """
        text = manifest_path.read_text(encoding="utf-8")
        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            raise ValueError(f"manifest.yaml 格式错误: 应为字典，实际为 {type(data).__name__}")
        return data

    def validate_structure(self, skill_dir: str) -> bool:
        """验证技能包目录结构完整性。

        检查技能包目录是否包含必需的 manifest.yaml 文件，以及
        manifest 中是否包含 name、version、description 字段。

        Args:
            skill_dir: 技能包目录路径。

        Returns:
            结构是否合法。
        """
        skill_path = Path(skill_dir)
        if not skill_path.is_dir():
            return False

        manifest_path = skill_path / "manifest.yaml"
        if not manifest_path.is_file():
            return False

        try:
            manifest = self._read_manifest(manifest_path)
        except (ValueError, yaml.YAMLError):
            return False

        missing = REQUIRED_MANIFEST_FIELDS - set(manifest.keys())
        if missing:
            logger.debug("manifest.yaml 缺少字段: %s", missing)
            return False

        return True

    def register(self, skill_dir: str) -> SkillPackage:
        """注册一个技能包到注册中心。

        校验目录结构后，将技能包复制到基础库中，并建立索引。

        Args:
            skill_dir: 技能包目录路径（需包含 manifest.yaml）。

        Returns:
            注册成功的 SkillPackage 对象。

        Raises:
            ValueError: 目录结构不合法或 manifest 内容不合法。
        """
        skill_path = Path(skill_dir)
        if not self.validate_structure(skill_dir):
            raise ValueError(
                f"技能包目录结构不合法: {skill_dir}。"
                "需包含 manifest.yaml，且其中必须有 name, version, description 字段。"
            )

        manifest = self._read_manifest(skill_path / "manifest.yaml")
        skill_name = manifest.get("name", "")

        # 检查是否已存在同名技能
        for existing in self._registry.values():
            if existing.name == skill_name:
                raise ValueError(f"技能 '{skill_name}' 已注册，不能重复注册")

        skill_id = str(uuid.uuid4())
        dest_dir = self._base_dir / skill_id

        # 复制整个技能包目录到基础库
        shutil.copytree(skill_path, dest_dir)

        # 写入元数据文件记录 skill_id 和注册时间
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        meta = {"skill_id": skill_id, "created_at": now}
        meta_path = dest_dir / ".skill_meta.yaml"
        meta_path.write_text(yaml.dump(meta, allow_unicode=True), encoding="utf-8")

        pkg = SkillPackage(
            skill_id=skill_id,
            name=manifest.get("name", ""),
            version=manifest.get("version", "0.0.0"),
            description=manifest.get("description", ""),
            base_path=str(dest_dir),
            manifest=manifest,
            created_at=now,
            required_env=manifest.get("required_env", []),
            dependencies=manifest.get("dependencies", []),
        )
        self._registry[skill_id] = pkg
        logger.info("已注册技能包: %s (%s)", pkg.name, skill_id)
        return pkg

    def clone(self, skill_id: str, target_dir: str) -> str:
        """克隆基础技能包到目标目录。

        创建目标目录（含增量区结构），然后将基础技能包复制到
        target_dir/base 下（只读参考），并创建增量区目录。

        Args:
            skill_id: 技能包 ID。
            target_dir: 目标目录路径。

        Returns:
            克隆后的技能包路径（含 base 子目录的绝对路径）。

        Raises:
            KeyError: 技能包不存在。
        """
        if skill_id not in self._registry:
            raise KeyError(f"技能包不存在: {skill_id}")

        pkg = self._registry[skill_id]
        target = Path(target_dir)
        target.mkdir(parents=True, exist_ok=True)

        # 将基础技能包复制到 target/base（只读参考）
        base_dest = target / "base"
        if base_dest.exists():
            shutil.rmtree(base_dest)
        shutil.copytree(pkg.base_path, base_dest)

        # 创建增量区目录结构
        self.create_incremental_area(str(target / "incremental"))

        logger.info("已克隆技能包 %s -> %s", skill_id, target)
        return str(base_dest)

    def list_skills(self) -> list[dict]:
        """返回所有已注册技能包列表。

        Returns:
            包含 skill_id, name, version, description 的字典列表。
        """
        return [
            {
                "skill_id": pkg.skill_id,
                "name": pkg.name,
                "version": pkg.version,
                "description": pkg.description,
            }
            for pkg in self._registry.values()
        ]

    def get_skill(self, skill_id: str) -> SkillPackage:
        """获取技能包详情。

        Args:
            skill_id: 技能包 ID。

        Returns:
            SkillPackage 对象。

        Raises:
            KeyError: 技能包不存在。
        """
        if skill_id not in self._registry:
            raise KeyError(f"技能包不存在: {skill_id}")
        return self._registry[skill_id]

    def get_versions(self, skill_id: str) -> list[dict]:
        """获取技能包的所有版本。

        从技能包目录下的 versions/ 子目录读取版本历史。
        每个版本以子目录形式存储，包含 manifest.yaml 和 changelog。

        Args:
            skill_id: 技能包 ID。

        Returns:
            版本列表，每个版本包含 version, created_at, changelog。

        Raises:
            KeyError: 技能包不存在。
        """
        if skill_id not in self._registry:
            raise KeyError(f"技能包不存在: {skill_id}")

        pkg = self._registry[skill_id]
        versions_dir = Path(pkg.base_path) / "versions"

        versions = []

        # 始终包含当前版本
        versions.append({
            "version": pkg.version,
            "created_at": pkg.created_at,
            "changelog": "当前版本",
        })

        # 扫描历史版本目录
        if versions_dir.is_dir():
            for ver_dir in sorted(versions_dir.iterdir(), reverse=True):
                if not ver_dir.is_dir():
                    continue
                ver_manifest = ver_dir / "manifest.yaml"
                changelog_path = ver_dir / "CHANGELOG.md"

                version = ver_dir.name
                created_at = ""
                changelog = ""

                if ver_manifest.exists():
                    try:
                        m = self._read_manifest(ver_manifest)
                        version = m.get("version", version)
                    except Exception:
                        pass

                if changelog_path.exists():
                    changelog = changelog_path.read_text(encoding="utf-8").strip()

                # 从目录名或 .meta.yaml 读取创建时间
                meta_path = ver_dir / ".meta.yaml"
                if meta_path.exists():
                    try:
                        meta = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
                        created_at = meta.get("created_at", "")
                    except Exception:
                        pass

                versions.append({
                    "version": version,
                    "created_at": created_at,
                    "changelog": changelog,
                })

        return versions

    def create_incremental_area(self, target_dir: str) -> str:
        """创建增量区目录结构。

        Args:
            target_dir: 目标路径。

        Returns:
            增量区根目录路径。
        """
        target = Path(target_dir)
        target.mkdir(parents=True, exist_ok=True)

        # 创建子目录
        for dir_name in INCREMENTAL_STRUCTURE["dirs"]:
            (target / dir_name).mkdir(exist_ok=True)

        # 创建空文件（如果不存在）
        for file_name in INCREMENTAL_STRUCTURE["files"]:
            file_path = target / file_name
            if not file_path.exists():
                file_path.write_text("", encoding="utf-8")

        # 创建 README 说明
        readme_path = target / "README.md"
        if readme_path.read_text(encoding="utf-8").strip() == "":
            readme_path.write_text(
                "# 增量区\n\n"
                "此目录为技能包增量区，存储项目执行过程中积累的经验和改进。\n\n"
                "## 目录结构\n\n"
                "- `system_prompt_addon.md` - 追加的系统指令\n"
                "- `rules/` - 经验规则文件 (YAML)\n"
                "- `tools/` - 新增/修改的工具\n"
                "- `knowledge_add/` - 新增知识\n",
                encoding="utf-8",
            )

        logger.info("已创建增量区目录: %s", target)
        return str(target)
