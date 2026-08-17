"""
RegistryClient — Git 注册表客户端（技能市场 Stage 3）

使用 Git 仓库作为技能包注册表。支持：
- 克隆/拉取注册表仓库
- 搜索技能包
- 安装技能包到本地
- 发布技能包（创建 PR）

设计原则：
- 复用现有 Git 工具，不引入新依赖
- 支持本地缓存，减少网络请求
- 兼容 Stage 1-2 的技能包格式
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("registry_client")


@dataclass
class SkillMeta:
    """技能包元数据"""
    name: str
    version: str
    description: str
    author: str = ""
    category: str = ""
    keywords: List[str] = field(default_factory=list)
    license: str = ""
    repository: str = ""
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "SkillMeta":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class RegistryClient:
    """Git 注册表客户端。

    用法：
        client = RegistryClient("https://github.com/mdh-community/skill-registry")

        # 搜索技能
        results = client.search(keywords=["react", "frontend"])

        # 安装技能
        client.install("frontend_dev", "/path/to/skill_packs")

        # 发布技能
        client.publish("/path/to/skill_packs/frontend_dev", {
            "name": "frontend_dev",
            "version": "2.0.0",
            "description": "前端开发技能",
            "author": "user@example.com"
        })
    """

    def __init__(
        self,
        repo_url: str = "",
        local_cache_dir: str = "",
        auto_clone: bool = True,
    ):
        self._repo_url = repo_url
        self._cache_dir = Path(local_cache_dir) if local_cache_dir else Path.home() / ".mdh" / "registry"
        self._skills_dir = self._cache_dir / "skills"
        self._index_path = self._cache_dir / "index.json"
        self._index: Dict[str, SkillMeta] = {}

        if auto_clone and repo_url:
            self._ensure_repo()

    def _ensure_repo(self) -> None:
        """确保本地仓库存在（克隆或拉取）"""
        if not self._cache_dir.exists():
            self._clone()
        else:
            self._pull()

    def _clone(self) -> None:
        """克隆注册表仓库"""
        self._cache_dir.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", self._repo_url, str(self._cache_dir)],
                check=True,
                capture_output=True,
                text=True,
            )
            self._load_index()
            logger.info("已克隆注册表: %s", self._repo_url)
        except subprocess.CalledProcessError as e:
            logger.warning("克隆注册表失败: %s", e.stderr)
        except FileNotFoundError:
            logger.warning("Git 未安装，无法克隆注册表")

    def _pull(self) -> None:
        """拉取最新更新"""
        try:
            subprocess.run(
                ["git", "-C", str(self._cache_dir), "pull", "--ff-only"],
                check=True,
                capture_output=True,
                text=True,
            )
            self._load_index()
        except subprocess.CalledProcessError:
            logger.debug("拉取注册表更新失败，使用本地缓存")

    def _load_index(self) -> None:
        """加载技能索引"""
        if self._index_path.exists():
            try:
                data = json.loads(self._index_path.read_text(encoding="utf-8"))
                self._index = {name: SkillMeta.from_dict(meta) for name, meta in data.items()}
            except Exception as e:
                logger.warning("加载注册表索引失败: %s", e)
                self._index = {}
        else:
            self._build_index()

    def _build_index(self) -> None:
        """从技能目录构建索引"""
        self._index = {}
        if not self._skills_dir.exists():
            return

        for skill_dir in self._skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue

            meta = self._read_skill_meta(skill_dir)
            if meta:
                self._index[meta.name] = meta

        self._save_index()

    def _save_index(self) -> None:
        """保存索引"""
        try:
            data = {name: meta.to_dict() for name, meta in self._index.items()}
            self._index_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error("保存注册表索引失败: %s", e)

    def _read_skill_meta(self, skill_dir: Path) -> Optional[SkillMeta]:
        """读取技能包元数据"""
        # 优先读取 manifest.json
        manifest_path = skill_dir / "manifest.json"
        if manifest_path.exists():
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                return SkillMeta.from_dict(data)
            except Exception:
                pass

        # 回退到 SKILL.md frontmatter
        skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            try:
                import re
                import yaml
                content = skill_md.read_text(encoding="utf-8")
                match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
                if match:
                    meta_data = yaml.safe_load(match.group(1)) or {}
                    return SkillMeta.from_dict(meta_data)
            except Exception:
                pass

        # 回退到 manifest.yaml
        manifest_yaml = skill_dir / "manifest.yaml"
        if manifest_yaml.exists():
            try:
                import yaml
                data = yaml.safe_load(manifest_yaml.read_text(encoding="utf-8")) or {}
                return SkillMeta.from_dict(data)
            except Exception:
                pass

        return None

    def search(
        self,
        keywords: List[str] = None,
        category: str = "",
        limit: int = 20,
    ) -> List[SkillMeta]:
        """搜索技能包。

        Args:
            keywords: 搜索关键词
            category: 类别过滤
            limit: 返回数量限制

        Returns:
            按相关度排序的技能包元数据列表
        """
        keywords = keywords or []
        query_keywords = set(k.lower() for k in keywords)

        results = []
        for name, meta in self._index.items():
            # 类别过滤
            if category and meta.category != category:
                continue

            # 关键词匹配
            if query_keywords:
                meta_keywords = set(k.lower() for k in meta.keywords)
                overlap = len(meta_keywords & query_keywords)
                # 名称匹配
                if any(kw in name.lower() for kw in query_keywords):
                    overlap += 2
                # 描述匹配
                if any(kw in meta.description.lower() for kw in query_keywords):
                    overlap += 1

                if overlap > 0:
                    results.append((overlap, meta))
            else:
                results.append((0, meta))

        results.sort(key=lambda x: -x[0])
        return [meta for _, meta in results[:limit]]

    def install(self, skill_name: str, target_dir: str) -> bool:
        """安装技能包到本地。

        Args:
            skill_name: 技能名称
            target_dir: 目标目录（skill_packs/）

        Returns:
            是否成功
        """
        source_dir = self._skills_dir / skill_name
        if not source_dir.exists():
            logger.warning("技能 %s 不存在于注册表", skill_name)
            return False

        target_path = Path(target_dir) / skill_name
        if target_path.exists():
            logger.info("技能 %s 已存在，跳过安装", skill_name)
            return True

        try:
            shutil.copytree(str(source_dir), str(target_path))
            logger.info("已安装技能 %s 到 %s", skill_name, target_path)
            return True
        except Exception as e:
            logger.error("安装技能 %s 失败: %s", skill_name, e)
            return False

    def publish(self, skill_path: str, metadata: dict) -> bool:
        """发布技能包到注册表（创建 Git 分支和提交）。

        Args:
            skill_path: 技能包路径
            metadata: 技能元数据

        Returns:
            是否成功创建提交
        """
        skill_path = Path(skill_path)
        if not skill_path.exists():
            logger.warning("技能路径不存在: %s", skill_path)
            return False

        skill_name = metadata.get("name", skill_path.name)
        target_dir = self._skills_dir / skill_name

        try:
            # 确保仓库是最新的
            self._pull()

            # 创建技能目录
            if target_dir.exists():
                shutil.rmtree(str(target_dir))
            shutil.copytree(str(skill_path), str(target_dir))

            # 写入 manifest.json
            manifest_path = target_dir / "manifest.json"
            manifest_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            # 创建 Git 分支并提交
            branch_name = f"publish/{skill_name}-{int(time.time())}"
            self._run_git(["checkout", "-b", branch_name])
            self._run_git(["add", str(target_dir.relative_to(self._cache_dir))])
            self._run_git(["commit", "-m", f"feat: publish {skill_name} v{metadata.get('version', '1.0.0')}"])

            logger.info("已创建发布分支: %s", branch_name)
            logger.info("请推送到远程仓库并创建 PR: git push origin %s", branch_name)
            return True

        except Exception as e:
            logger.error("发布技能 %s 失败: %s", skill_name, e)
            return False

    def _run_git(self, args: List[str]) -> str:
        """执行 Git 命令"""
        result = subprocess.run(
            ["git", "-C", str(self._cache_dir)] + args,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Git 命令失败: {result.stderr}")
        return result.stdout

    def list_installed(self, target_dir: str) -> List[str]:
        """列出本地已安装的技能"""
        target_path = Path(target_dir)
        if not target_path.exists():
            return []
        return [d.name for d in target_path.iterdir() if d.is_dir() and not d.name.startswith(".")]

    def get_skill_info(self, skill_name: str) -> Optional[SkillMeta]:
        """获取技能包详细信息"""
        return self._index.get(skill_name)

    def update_cache(self) -> bool:
        """更新本地缓存"""
        try:
            self._pull()
            return True
        except Exception:
            return False
