"""
ArtifactStore — 执行产物的结构化存储

角色执行产出的文件通过 ArtifactStore 保存引用，后续角色可读取
实际文件内容而非仅依赖 LLM 文本摘要。
"""

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("artifact_store")


@dataclass
class ArtifactRef:
    """轻量引用协议"""
    type: str  # "file" | "code" | "document" | "data"
    path: str  # 相对于工作区的路径
    summary: str = ""  # 文件摘要（前 200 字符）
    agent_id: str = ""
    size: int = 0
    created_at: float = field(default_factory=time.time)


class ArtifactStore:
    """执行产物存储

    职责：
    - 保存执行产出的文件引用（ArtifactRef）
    - 按项目隔离存储
    - 提供文件内容读取接口
    """

    def __init__(self, workspace_root: str):
        self._workspace = workspace_root
        self._artifacts_dir = os.path.join(workspace_root, ".artifacts")
        os.makedirs(self._artifacts_dir, exist_ok=True)

    def save_artifacts(
        self,
        task_id: str,
        agent_id: str,
        files_written: List[str],
        result_summary: str = "",
    ) -> List[ArtifactRef]:
        """保存执行产物引用

        Args:
            task_id: 任务 ID
            agent_id: 执行 agent ID
            files_written: 写入的文件路径列表
            result_summary: 执行结果摘要

        Returns:
            保存的 ArtifactRef 列表
        """
        refs = []
        for fpath in files_written:
            abs_path = os.path.join(self._workspace, fpath) if not os.path.isabs(fpath) else fpath
            size = 0
            summary = ""
            try:
                if os.path.exists(abs_path):
                    size = os.path.getsize(abs_path)
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        summary = f.read(200)
            except Exception:
                pass

            ref = ArtifactRef(
                type=_infer_type(fpath),
                path=fpath,
                summary=summary,
                agent_id=agent_id,
                size=size,
            )
            refs.append(ref)

        # 保存引用索引
        index_path = os.path.join(self._artifacts_dir, f"{task_id}.json")
        try:
            data = {
                "task_id": task_id,
                "agent_id": agent_id,
                "result_summary": result_summary[:500],
                "artifacts": [asdict(r) for r in refs],
                "created_at": time.time(),
            }
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("保存 artifact 索引失败: %s", e)

        return refs

    def load_artifacts(self, task_id: str) -> List[ArtifactRef]:
        """加载任务的 artifact 引用"""
        index_path = os.path.join(self._artifacts_dir, f"{task_id}.json")
        if not os.path.exists(index_path):
            return []
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return [ArtifactRef(**a) for a in data.get("artifacts", [])]
        except Exception as e:
            logger.warning("加载 artifact 索引失败: %s", e)
            return []

    def read_artifact_content(self, ref: ArtifactRef, max_chars: int = 5000) -> str:
        """读取 artifact 的实际文件内容

        Args:
            ref: ArtifactRef 引用
            max_chars: 最大读取字符数

        Returns:
            文件内容，读取失败返回空字符串
        """
        abs_path = os.path.join(self._workspace, ref.path) if not os.path.isabs(ref.path) else ref.path
        try:
            if os.path.exists(abs_path):
                with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                    return f.read(max_chars)
        except Exception as e:
            logger.warning("读取 artifact 失败 %s: %s", ref.path, e)
        return ""

    def build_artifact_context(self, task_ids: List[str], max_chars_per_file: int = 2000) -> str:
        """构建 artifact 上下文文本（供审查使用）

        读取指定任务的 artifact 文件内容，构建结构化上下文。

        Args:
            task_ids: 任务 ID 列表
            max_chars_per_file: 每个文件最大字符数

        Returns:
            结构化的 artifact 上下文文本
        """
        parts = []
        for task_id in task_ids:
            refs = self.load_artifacts(task_id)
            if not refs:
                continue
            for ref in refs:
                content = self.read_artifact_content(ref, max_chars=max_chars_per_file)
                if content:
                    parts.append(f"[文件: {ref.path}]\n{content}")
                elif ref.summary:
                    parts.append(f"[文件: {ref.path} (摘要)]\n{ref.summary}")
        return "\n\n".join(parts)


def _infer_type(path: str) -> str:
    """根据文件扩展名推断类型"""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".c", ".cpp"):
        return "code"
    if ext in (".md", ".txt", ".rst", ".doc", ".docx"):
        return "document"
    if ext in (".json", ".yaml", ".yml", ".csv", ".xml"):
        return "data"
    return "file"
