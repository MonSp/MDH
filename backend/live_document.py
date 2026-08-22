"""活文档协作 — 让数字员工操作代码/数据/文档

核心能力：
1. 代码感知：解析代码仓库结构，理解模块关系
2. 数据感知：解析 CSV/JSON 数据集，提取摘要统计
3. 产出物追踪：自动追踪文件变更历史
4. 冲突检测：多 agent 编辑同一文件时检测冲突
"""

import csv
import io
import json
import logging
import os
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("live_document")

# 支持的代码文件类型
CODE_EXTENSIONS = {'.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.sql', '.sh'}
DATA_EXTENSIONS = {'.csv', '.json', '.yaml', '.yml'}


class LiveDocumentManager:
    """活文档协作管理器"""

    def __init__(self, data_dir: str, workspace_dir: str = ""):
        self._data_dir = data_dir
        self._workspace_dir = workspace_dir or os.path.join(data_dir, "workspaces")
        self._artifacts_path = os.path.join(data_dir, "artifact_history.json")
        self._conflicts_path = os.path.join(data_dir, "document_conflicts.json")
        self._artifacts: List[Dict] = []
        self._conflicts: List[Dict] = []
        self._load()

    def _load(self):
        try:
            if os.path.isfile(self._artifacts_path):
                with open(self._artifacts_path, encoding="utf-8") as f:
                    self._artifacts = json.load(f)
        except Exception:
            self._artifacts = []
        try:
            if os.path.isfile(self._conflicts_path):
                with open(self._conflicts_path, encoding="utf-8") as f:
                    self._conflicts = json.load(f)
        except Exception:
            self._conflicts = []

    def _save_artifacts(self):
        try:
            tmp = self._artifacts_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._artifacts[-500:], f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._artifacts_path)
        except Exception:
            pass

    def _save_conflicts(self):
        try:
            tmp = self._conflicts_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._conflicts[-100:], f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._conflicts_path)
        except Exception:
            pass

    # ── 代码感知 ──

    def analyze_codebase(self, workspace_path: str = "") -> Dict[str, Any]:
        """分析代码仓库结构"""
        path = workspace_path or self._workspace_dir
        if not os.path.isdir(path):
            return {"error": "workspace not found"}

        files_by_ext = Counter()
        total_lines = 0
        modules = []

        for root, dirs, files in os.walk(path):
            # 跳过隐藏目录和 node_modules
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules' and d != '__pycache__']
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in CODE_EXTENSIONS:
                    fpath = os.path.join(root, f)
                    try:
                        with open(fpath, encoding="utf-8", errors="replace") as fh:
                            lines = fh.readlines()
                        total_lines += len(lines)
                        files_by_ext[ext] += 1
                        rel_path = os.path.relpath(fpath, path)
                        modules.append({
                            "file": rel_path,
                            "lines": len(lines),
                            "type": ext.lstrip("."),
                        })
                    except Exception:
                        pass

        # 按行数排序，找大文件
        modules.sort(key=lambda m: -m["lines"])
        large_files = [m for m in modules if m["lines"] > 200][:10]

        return {
            "total_files": sum(files_by_ext.values()),
            "total_lines": total_lines,
            "by_extension": dict(files_by_ext),
            "large_files": large_files,
            "top_modules": modules[:10],
        }

    # ── 数据感知 ──

    def analyze_dataset(self, file_path: str) -> Dict[str, Any]:
        """解析 CSV/JSON 数据集，提取摘要统计"""
        if not os.path.isfile(file_path):
            return {"error": "file not found"}

        ext = os.path.splitext(file_path)[1].lower()
        try:
            if ext == '.csv':
                return self._analyze_csv(file_path)
            elif ext == '.json':
                return self._analyze_json(file_path)
            elif ext in ('.yaml', '.yml'):
                return self._analyze_yaml(file_path)
            else:
                return {"error": f"unsupported format: {ext}"}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def _analyze_csv(file_path: str) -> Dict:
        with open(file_path, encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            rows = list(reader)

        # 基本统计
        result = {
            "format": "csv",
            "columns": len(headers),
            "rows": len(rows),
            "headers": headers,
            "sample": rows[:3] if rows else [],
        }

        # 数值列统计
        numeric_cols = {}
        for col_idx, header in enumerate(headers):
            values = []
            for row in rows:
                if col_idx < len(row):
                    try:
                        values.append(float(row[col_idx]))
                    except ValueError:
                        pass
            if len(values) >= 2:
                numeric_cols[header] = {
                    "min": min(values),
                    "max": max(values),
                    "mean": round(sum(values) / len(values), 2),
                    "count": len(values),
                }
        result["numeric_columns"] = numeric_cols
        return result

    @staticmethod
    def _analyze_json(file_path: str) -> Dict:
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)

        result = {"format": "json"}
        if isinstance(data, list):
            result["type"] = "array"
            result["length"] = len(data)
            result["sample"] = data[:3]
            if data and isinstance(data[0], dict):
                result["keys"] = list(data[0].keys())
        elif isinstance(data, dict):
            result["type"] = "object"
            result["keys"] = list(data.keys())
            result["top_level_types"] = {k: type(v).__name__ for k, v in list(data.items())[:10]}
        return result

    @staticmethod
    def _analyze_yaml(file_path: str) -> Dict:
        import yaml
        with open(file_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        result = {"format": "yaml"}
        if isinstance(data, dict):
            result["type"] = "object"
            result["keys"] = list(data.keys())
        elif isinstance(data, list):
            result["type"] = "array"
            result["length"] = len(data)
        return result

    # ── 产出物追踪 ──

    def track_artifact(self, agent_id: str, task_id: str, file_path: str, action: str = "write"):
        """记录一次产出物变更"""
        entry = {
            "agent_id": agent_id,
            "task_id": task_id,
            "file_path": file_path,
            "action": action,  # write / edit / create / delete
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._artifacts.append(entry)
        self._save_artifacts()
        return entry

    def get_artifact_history(self, file_path: str = "", agent_id: str = "", limit: int = 20) -> List[Dict]:
        """获取产出物变更历史"""
        filtered = self._artifacts
        if file_path:
            filtered = [a for a in filtered if a.get("file_path") == file_path]
        if agent_id:
            filtered = [a for a in filtered if a.get("agent_id") == agent_id]
        return list(reversed(filtered[-limit:]))

    def get_artifact_stats(self) -> Dict:
        """产出物统计"""
        by_agent = Counter(a.get("agent_id", "?") for a in self._artifacts)
        by_action = Counter(a.get("action", "?") for a in self._artifacts)
        by_ext = Counter(os.path.splitext(a.get("file_path", ""))[1] for a in self._artifacts)
        return {
            "total_changes": len(self._artifacts),
            "by_agent": dict(by_agent.most_common(10)),
            "by_action": dict(by_action),
            "by_extension": dict(by_ext.most_common(10)),
        }

    # ── 冲突检测 ──

    def detect_conflict(self, file_path: str, agent_id: str) -> Optional[Dict]:
        """检测文件是否有并发编辑冲突"""
        # 查找最近 5 分钟内其他 agent 对同一文件的编辑
        from datetime import timedelta
        threshold = datetime.now(timezone.utc) - timedelta(minutes=5)

        recent_edits = [
            a for a in self._artifacts
            if a.get("file_path") == file_path
            and a.get("agent_id") != agent_id
            and a.get("timestamp", "") >= threshold.isoformat()
        ]

        if recent_edits:
            conflict = {
                "file_path": file_path,
                "agent_id": agent_id,
                "conflicting_agents": list({e["agent_id"] for e in recent_edits}),
                "conflict_count": len(recent_edits),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            }
            self._conflicts.append(conflict)
            self._save_conflicts()
            return conflict
        return None

    def get_conflicts(self, limit: int = 10) -> List[Dict]:
        """获取最近的冲突记录"""
        return list(reversed(self._conflicts[-limit:]))
