"""团队协同优化 — 分析 agent 组合效率，推荐最优搭配

核心机制：
1. 协同分析：哪些 agent 组合完成任务成功率最高
2. 瓶颈识别：团队协作中的瓶颈 agent
3. 最优搭配：基于历史数据推荐最优 agent 组合
4. 任务匹配：根据任务类型自动推荐最合适的 agent 组合
"""

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("team_synergy")


class TeamSynergy:
    """团队协同优化器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._profile_dir = os.path.join(data_dir, "agent_profiles")
        self._synergy_path = os.path.join(data_dir, "team_synergy.json")
        self._synergy: Dict[str, Any] = {}
        self._load_synergy()

    def _load_synergy(self):
        try:
            if os.path.isfile(self._synergy_path):
                with open(self._synergy_path, encoding="utf-8") as f:
                    self._synergy = json.load(f)
        except Exception:
            self._synergy = {"pair_stats": {}, "task_history": []}

    def _save_synergy(self):
        try:
            tmp = self._synergy_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._synergy, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._synergy_path)
        except Exception:
            pass

    def record_team_task(self, agent_ids: List[str], task_type: str, success: bool, review_score: float = 0):
        """记录一次团队任务执行

        Args:
            agent_ids: 参与任务的 agent ID 列表
            task_type: 任务类型
            success: 是否成功
            review_score: 审查评分
        """
        # 记录任务历史
        self._synergy.setdefault("task_history", []).append({
            "agent_ids": sorted(agent_ids),
            "task_type": task_type,
            "success": success,
            "review_score": review_score,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # 更新 pair_stats（每对 agent 的协同记录）
        pair_stats = self._synergy.setdefault("pair_stats", {})
        for i, a1 in enumerate(agent_ids):
            for a2 in agent_ids[i + 1:]:
                pair_key = tuple(sorted([a1, a2]))
                pair_key_str = f"{pair_key[0]}|{pair_key[1]}"
                stats = pair_stats.setdefault(pair_key_str, {
                    "agent_a": pair_key[0], "agent_b": pair_key[1],
                    "total": 0, "success": 0, "scores": [],
                })
                stats["total"] += 1
                if success:
                    stats["success"] += 1
                if review_score > 0:
                    stats["scores"].append(review_score)

        # 只保留最近 500 条记录
        self._synergy["task_history"] = self._synergy["task_history"][-500:]
        self._save_synergy()

    def analyze_synergy(self) -> Dict[str, Any]:
        """分析团队协同效率

        Returns:
            {
                "pairs": [{agent_a, agent_b, success_rate, total, synergy_score}],
                "bottlenecks": [{agent_id, impact, reason}],
                "best_teams": [{agents, success_rate, total}],
            }
        """
        pair_stats = self._synergy.get("pair_stats", {})
        history = self._synergy.get("task_history", [])

        # 1. 分析 agent 对协同
        pairs = []
        for pair_key, stats in pair_stats.items():
            total = stats["total"]
            success = stats["success"]
            rate = success / total if total > 0 else 0
            avg_score = sum(stats.get("scores", [])) / len(stats.get("scores", [])) if stats.get("scores") else 0
            synergy_score = rate * 0.7 + (avg_score / 10) * 0.3 if total >= 2 else 0
            pairs.append({
                "agent_a": stats["agent_a"],
                "agent_b": stats["agent_b"],
                "total": total,
                "success_rate": round(rate, 4),
                "avg_review_score": round(avg_score, 2),
                "synergy_score": round(synergy_score, 4),
            })
        pairs.sort(key=lambda x: x["synergy_score"], reverse=True)

        # 2. 识别瓶颈 agent
        bottlenecks = self._identify_bottlenecks(history)

        # 3. 推荐最优团队搭配
        best_teams = self._recommend_teams(history)

        return {
            "pairs": pairs[:10],
            "bottlenecks": bottlenecks,
            "best_teams": best_teams,
            "total_tasks_analyzed": len(history),
        }

    def _identify_bottlenecks(self, history: List[Dict]) -> List[Dict]:
        """识别瓶颈 agent

        瓶颈：参与的任务成功率显著低于团队平均
        """
        agent_stats: Dict[str, Dict] = {}
        for entry in history:
            for agent_id in entry.get("agent_ids", []):
                stats = agent_stats.setdefault(agent_id, {"total": 0, "success": 0})
                stats["total"] += 1
                if entry.get("success"):
                    stats["success"] += 1

        if not agent_stats:
            return []

        overall_rates = [s["success"] / s["total"] for s in agent_stats.values() if s["total"] >= 2]
        avg_rate = sum(overall_rates) / len(overall_rates) if overall_rates else 0.5

        bottlenecks = []
        for agent_id, stats in agent_stats.items():
            if stats["total"] < 2:
                continue
            rate = stats["success"] / stats["total"]
            if rate < avg_rate * 0.6:  # 低于平均 60% 视为瓶颈
                bottlenecks.append({
                    "agent_id": agent_id,
                    "success_rate": round(rate, 4),
                    "total_tasks": stats["total"],
                    "impact": round(avg_rate - rate, 4),
                    "reason": f"成功率 {rate:.0%} 显著低于团队平均 {avg_rate:.0%}",
                })
        bottlenecks.sort(key=lambda x: x["impact"], reverse=True)
        return bottlenecks

    def _recommend_teams(self, history: List[Dict]) -> List[Dict]:
        """推荐最优团队搭配

        基于历史数据，找出成功率最高的 agent 组合。
        """
        team_stats: Dict[str, Dict] = {}
        for entry in history:
            agents = tuple(sorted(entry.get("agent_ids", [])))
            if len(agents) < 2:
                continue
            team_key = "|".join(agents)
            stats = team_stats.setdefault(team_key, {"agents": list(agents), "total": 0, "success": 0})
            stats["total"] += 1
            if entry.get("success"):
                stats["success"] += 1

        teams = []
        for team_key, stats in team_stats.items():
            if stats["total"] < 2:
                continue
            rate = stats["success"] / stats["total"]
            teams.append({
                "agents": stats["agents"],
                "total": stats["total"],
                "success_rate": round(rate, 4),
            })
        teams.sort(key=lambda x: x["success_rate"], reverse=True)
        return teams[:5]

    def recommend_for_task(self, task_type: str, available_agents: List[str]) -> List[str]:
        """为任务推荐最优 agent 组合

        Args:
            task_type: 任务类型
            available_agents: 可用的 agent ID 列表

        Returns:
            推荐的 agent ID 列表
        """
        # 从历史中找到该任务类型的最佳组合
        history = self._synergy.get("task_history", [])
        task_history = [e for e in history if e.get("task_type") == task_type]

        if not task_history:
            # 无历史数据，返回可用 agent 的前 2 个
            return available_agents[:2]

        # 统计每个 agent 在该任务类型上的表现
        agent_scores: Dict[str, Dict] = {}
        for entry in task_history:
            for agent_id in entry.get("agent_ids", []):
                if agent_id not in available_agents:
                    continue
                stats = agent_scores.setdefault(agent_id, {"total": 0, "success": 0})
                stats["total"] += 1
                if entry.get("success"):
                    stats["success"] += 1

        # 按成功率排序
        ranked = sorted(
            agent_scores.items(),
            key=lambda x: x[1]["success"] / max(x[1]["total"], 1),
            reverse=True,
        )
        return [agent_id for agent_id, _ in ranked[:3]] or available_agents[:2]

    def get_stats(self) -> Dict:
        """协同统计"""
        history = self._synergy.get("task_history", [])
        pair_stats = self._synergy.get("pair_stats", {})
        return {
            "total_tasks": len(history),
            "total_pairs": len(pair_stats),
            "unique_agents": len({a for e in history for a in e.get("agent_ids", [])}),
        }
