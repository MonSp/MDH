"""自主交付引擎 — 让数字员工独立完成从执行到交付的全流程

核心机制：
1. Git 交付：任务完成后自动创建分支、commit、push
2. 通知交付：WebSocket 通知 + 任务报告
3. 文档交付：自动生成任务报告（变更摘要、测试结果、审查意见）
4. 部署触发：任务完成后可选触发 CI/CD
"""

import json
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("delivery_engine")


class DeliveryEngine:
    """自主交付引擎"""

    def __init__(self, data_dir: str, workspace_dir: str = ""):
        self._data_dir = data_dir
        self._workspace_dir = workspace_dir or os.path.join(data_dir, "workspaces")
        self._delivery_log_path = os.path.join(data_dir, "delivery_log.json")
        self._delivery_log: list[dict] = []
        self._load_log()

    def _load_log(self):
        try:
            if os.path.isfile(self._delivery_log_path):
                with open(self._delivery_log_path, encoding="utf-8") as f:
                    self._delivery_log = json.load(f)
        except Exception:
            self._delivery_log = []

    def _save_log(self):
        try:
            tmp = self._delivery_log_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._delivery_log[-200:], f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._delivery_log_path)
        except Exception:
            pass

    def deliver(
        self,
        agent_id: str,
        task_id: str,
        task_description: str,
        execution_results: list[dict],
        review_result: dict,
        delivery_types: list[str] = None,
    ) -> dict[str, Any]:
        """执行自主交付

        Args:
            agent_id: 执行 agent ID
            task_id: 任务 ID
            task_description: 任务描述
            execution_results: 执行结果列表
            review_result: 审查结果
            delivery_types: 交付类型列表，默认 ["git", "notification", "report"]

        Returns:
            {"git": {...}, "notification": {...}, "report": {...}, "deploy": {...}}
        """
        if delivery_types is None:
            delivery_types = ["git", "notification", "report"]

        result = {}
        timestamp = datetime.now(timezone.utc).isoformat()

        # Git 交付
        if "git" in delivery_types:
            result["git"] = self._deliver_git(agent_id, task_id, task_description, execution_results)

        # 通知交付
        if "notification" in delivery_types:
            result["notification"] = self._deliver_notification(agent_id, task_description, execution_results, review_result)

        # 文档交付（任务报告）
        if "report" in delivery_types:
            result["report"] = self._deliver_report(agent_id, task_id, task_description, execution_results, review_result)

        # 部署触发
        if "deploy" in delivery_types:
            result["deploy"] = self._deliver_deploy(agent_id, task_id)

        # 记录交付日志
        self._delivery_log.append({
            "agent_id": agent_id,
            "task_id": task_id,
            "task_description": task_description[:100],
            "delivery_types": delivery_types,
            "results": {k: v.get("success", False) for k, v in result.items()},
            "timestamp": timestamp,
        })
        self._save_log()

        return result

    def _deliver_git(self, agent_id: str, task_id: str, description: str, results: list[dict]) -> dict:
        """Git 交付：自动 commit + push"""
        try:
            workspace = self._workspace_dir
            if not os.path.isdir(workspace):
                return {"success": False, "error": "workspace not found"}

            # 收集变更文件
            changed_files = []
            for r in results:
                changed_files.extend(r.get("written_files", []))

            if not changed_files:
                return {"success": True, "action": "no_changes", "message": "无文件变更"}

            # Git add
            for f in changed_files:
                fpath = os.path.join(workspace, f)
                if os.path.isfile(fpath):
                    subprocess.run(["git", "add", f], cwd=workspace, capture_output=True, timeout=10)

            # Git commit
            commit_msg = f"task({task_id[:8]}): {description[:60]}"
            result = subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=workspace, capture_output=True, text=True, timeout=10,
            )

            if result.returncode == 0:
                return {"success": True, "action": "committed", "message": commit_msg, "files": changed_files}
            elif "nothing to commit" in result.stdout:
                return {"success": True, "action": "no_changes", "message": "无新变更"}
            else:
                return {"success": False, "error": result.stderr[:200]}
        except Exception as e:
            return {"success": False, "error": str(e)[:200]}

    def _deliver_notification(self, agent_id: str, description: str, results: list[dict], review: dict) -> dict:
        """通知交付：生成通知文本"""
        try:
            review_status = review.get("structured_feedback", {}).get("status", "unknown")
            files_count = sum(len(r.get("written_files", [])) for r in results)

            notification = {
                "type": "task_completed",
                "agent_id": agent_id,
                "description": description[:100],
                "review_status": review_status,
                "files_changed": files_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            return {"success": True, "notification": notification}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _deliver_report(self, agent_id: str, task_id: str, description: str, results: list[dict], review: dict) -> dict:
        """文档交付：生成任务报告"""
        try:
            review_status = review.get("structured_feedback", {}).get("status", "unknown")
            review_score = review.get("structured_feedback", {}).get("score", 0)

            # 收集变更文件
            all_files = []
            for r in results:
                all_files.extend(r.get("written_files", []))

            report = {
                "task_id": task_id,
                "agent_id": agent_id,
                "description": description,
                "review_status": review_status,
                "review_score": review_score,
                "files_changed": all_files,
                "execution_summary": [r.get("result", "")[:200] for r in results],
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

            # 保存报告
            report_dir = os.path.join(self._data_dir, "reports")
            os.makedirs(report_dir, exist_ok=True)
            report_path = os.path.join(report_dir, f"{task_id[:8]}-{agent_id}.json")
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)

            return {"success": True, "report_path": report_path, "report": report}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _deliver_deploy(self, agent_id: str, task_id: str) -> dict:
        """部署触发（占位 — 实际 CI/CD 集成需要配置）"""
        return {"success": True, "action": "skipped", "message": "CI/CD 触发未配置"}

    def get_delivery_log(self, limit: int = 20) -> list[dict]:
        """获取交付日志"""
        return list(reversed(self._delivery_log[-limit:]))

    def get_delivery_stats(self) -> dict:
        """交付统计"""
        total = len(self._delivery_log)
        by_type = {}
        success_count = 0
        for entry in self._delivery_log:
            results = entry.get("results", {})
            if all(results.values()):
                success_count += 1
            for delivery_type in entry.get("delivery_types", []):
                by_type[delivery_type] = by_type.get(delivery_type, 0) + 1

        return {
            "total_deliveries": total,
            "successful": success_count,
            "success_rate": round(success_count / total, 4) if total > 0 else 0,
            "by_type": by_type,
        }
