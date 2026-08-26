"""
SkillForkManager — 技能包 Fork 管理器（技能市场 Stage 1）

支持从共享池 fork 技能包到项目本地，项目可本地修改。
存储结构：
    data/skill_forks/
    └── <project_id>/
        └── <skill_name>/
            ├── SKILL.md        # fork 的技能文件
            └── fork_meta.json  # fork 元数据
"""

import json
import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("skill_fork")


@dataclass
class SkillFork:
    """技能包 Fork 记录"""
    fork_id: str
    source_skill: str        # 共享池中的技能名
    project_id: str          # fork 到的项目
    local_path: str          # 本地路径
    source_version: str      # fork 时的版本
    local_changes: bool      # 是否有本地修改
    created_at: float = 0.0


class SkillForkManager:
    """技能包 Fork 管理器。

    用法：
        manager = SkillForkManager("data/skill_forks", "skill_packs")

        # Fork 技能包到项目
        fork = manager.fork_skill("frontend_dev", "proj-1")

        # 列出项目的 fork
        forks = manager.list_forks("proj-1")

        # 从共享池拉取更新
        manager.pull_update("frontend_dev", "proj-1")
    """

    def __init__(self, forks_dir: str, source_skill_dir: str):
        self._forks_dir = Path(forks_dir)
        self._source_dir = Path(source_skill_dir)
        self._forks_dir.mkdir(parents=True, exist_ok=True)

    def fork_skill(self, skill_name: str, project_id: str) -> Optional[SkillFork]:
        """Fork 技能包到项目本地。

        Args:
            skill_name: 技能名称
            project_id: 目标项目 ID

        Returns:
            SkillFork 记录，失败返回 None
        """
        source_path = self._source_dir / skill_name
        if not source_path.exists():
            logger.warning("技能 %s 不存在", skill_name)
            return None

        # 目标路径
        project_dir = self._forks_dir / project_id / skill_name
        if project_dir.exists():
            logger.info("技能 %s 已 fork 到项目 %s", skill_name, project_id)
            return self._load_fork_meta(project_dir)

        # 复制技能文件
        project_dir.mkdir(parents=True, exist_ok=True)
        for item in source_path.iterdir():
            if item.name.startswith("."):
                continue
            dest = project_dir / item.name
            if item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dest)

        # 读取源版本
        source_version = self._read_skill_version(source_path)

        # 创建 fork 元数据
        fork = SkillFork(
            fork_id=f"{project_id}:{skill_name}",
            source_skill=skill_name,
            project_id=project_id,
            local_path=str(project_dir),
            source_version=source_version,
            local_changes=False,
            created_at=time.time(),
        )
        self._save_fork_meta(project_dir, fork)

        logger.info("已 fork 技能 %s 到项目 %s", skill_name, project_id)
        return fork

    def list_forks(self, project_id: str) -> List[SkillFork]:
        """列出项目的所有 fork"""
        project_dir = self._forks_dir / project_id
        if not project_dir.exists():
            return []

        forks = []
        for entry in sorted(project_dir.iterdir()):
            if entry.is_dir():
                fork = self._load_fork_meta(entry)
                if fork:
                    forks.append(fork)
        return forks

    def pull_update(self, skill_name: str, project_id: str) -> bool:
        """从源目录拉取更新到项目 fork。

        简单策略：覆盖 SKILL.md，保留本地修改的其他文件。

        Args:
            skill_name: 技能名称
            project_id: 项目 ID

        Returns:
            是否有更新
        """
        project_dir = self._forks_dir / project_id / skill_name
        source_path = self._source_dir / skill_name

        if not project_dir.exists() or not source_path.exists():
            return False

        # 检查源版本
        source_version = self._read_skill_version(source_path)
        fork_meta = self._load_fork_meta(project_dir)

        if fork_meta and fork_meta.source_version == source_version:
            logger.info("技能 %s 已是最新版本", skill_name)
            return False

        # 更新 SKILL.md
        source_skill_md = source_path / "SKILL.md"
        if source_skill_md.exists():
            shutil.copy2(source_skill_md, project_dir / "SKILL.md")

        # 更新 fork 元数据
        if fork_meta:
            fork_meta.source_version = source_version
            fork_meta.local_changes = True
            self._save_fork_meta(project_dir, fork_meta)

        logger.info("已更新技能 %s (项目 %s): %s → %s", skill_name, project_id,
                    fork_meta.source_version if fork_meta else "?", source_version)
        return True

    def get_fork_path(self, skill_name: str, project_id: str) -> Optional[Path]:
        """获取 fork 的本地路径"""
        path = self._forks_dir / project_id / skill_name
        return path if path.exists() else None

    def _load_fork_meta(self, project_dir: Path) -> Optional[SkillFork]:
        """加载 fork 元数据"""
        meta_path = project_dir / "fork_meta.json"
        if not meta_path.exists():
            return None
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            return SkillFork(**data)
        except Exception:
            return None

    def _save_fork_meta(self, project_dir: Path, fork: SkillFork) -> None:
        """保存 fork 元数据"""
        from dataclasses import asdict
        meta_path = project_dir / "fork_meta.json"
        meta_path.write_text(
            json.dumps(asdict(fork), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _read_skill_version(skill_path: Path) -> str:
        """读取技能版本号"""
        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            import re
            content = skill_md.read_text(encoding="utf-8")
            match = re.search(r'version:\s*["\']?([\d.]+)', content)
            if match:
                return match.group(1)

        manifest = skill_path / "manifest.yaml"
        if manifest.exists():
            import yaml
            data = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
            return str(data.get("version", "0.0.0"))

        return "0.0.0"
