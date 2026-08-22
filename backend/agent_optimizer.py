"""Agent 自省优化 — 让数字员工能自我反思、自我优化

核心机制：
1. 表现分析：分析每个 agent 的任务成功率、速度、技能覆盖率
2. 弱项识别：自动识别 agent 的弱项技能
3. 策略调整：基于弱项生成优化策略
4. 进度追踪：记录 agent 的成长曲线
"""

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agent_optimizer")


class AgentOptimizer:
    """Agent 自省优化器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._profile_dir = os.path.join(data_dir, "agent_profiles")
        self._memory_dir = os.path.join(data_dir, "agent_memory")
        self._optimization_path = os.path.join(data_dir, "agent_optimizations.json")
        self._optimizations: Dict[str, Any] = {}
        self._load_optimizations()

    def _load_optimizations(self):
        try:
            if os.path.isfile(self._optimization_path):
                with open(self._optimization_path, encoding="utf-8") as f:
                    self._optimizations = json.load(f)
        except Exception:
            self._optimizations = {}

    def _save_optimizations(self):
        try:
            tmp = self._optimization_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._optimizations, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._optimization_path)
        except Exception:
            pass

    def analyze_agent(self, agent_id: str) -> Dict[str, Any]:
        """分析单个 agent 的表现

        Returns:
            {
                "agent_id": str,
                "performance": {...},
                "weak_skills": [...],
                "strong_skills": [...],
                "recommendations": [...],
                "growth_trend": {...},
            }
        """
        profile = self._load_profile(agent_id)
        if not profile:
            return {"agent_id": agent_id, "error": "profile not found"}

        skills = profile.get("skill_progress", {})
        total_xp = profile.get("total_xp", 0)
        career_stage = profile.get("career_stage", "junior")

        # 技能分析
        skill_analysis = []
        for skill_id, sp in skills.items():
            usage = sp.get("usage_count", 0) if isinstance(sp, dict) else 0
            success = sp.get("success_count", 0) if isinstance(sp, dict) else 0
            level = sp.get("level", 0) if isinstance(sp, dict) else 0
            xp = sp.get("xp", 0) if isinstance(sp, dict) else 0
            avg_score = sp.get("avg_review_score", 0) if isinstance(sp, dict) else 0

            success_rate = success / usage if usage > 0 else 0
            skill_analysis.append({
                "skill_id": skill_id,
                "level": level,
                "xp": xp,
                "usage_count": usage,
                "success_rate": round(success_rate, 4),
                "avg_review_score": round(avg_score, 2),
                "health": "strong" if success_rate >= 0.7 and usage >= 3 else "weak" if usage > 0 and success_rate < 0.4 else "developing",
            })

        # 分类
        strong_skills = [s for s in skill_analysis if s["health"] == "strong"]
        weak_skills = [s for s in skill_analysis if s["health"] == "weak"]
        developing = [s for s in skill_analysis if s["health"] == "developing"]

        # 性能指标
        total_tasks = sum(s["usage_count"] for s in skill_analysis)
        total_success = sum(s["usage_count"] * s["success_rate"] for s in skill_analysis)
        overall_success_rate = total_success / total_tasks if total_tasks > 0 else 0
        avg_review = sum(s["avg_review_score"] * s["usage_count"] for s in skill_analysis) / total_tasks if total_tasks > 0 else 0

        # 生成建议
        recommendations = self._generate_recommendations(
            agent_id, career_stage, skill_analysis, weak_skills, strong_skills, total_xp
        )

        result = {
            "agent_id": agent_id,
            "career_stage": career_stage,
            "total_xp": total_xp,
            "performance": {
                "total_tasks": total_tasks,
                "overall_success_rate": round(overall_success_rate, 4),
                "avg_review_score": round(avg_review, 2),
                "active_skills": len([s for s in skill_analysis if s["usage_count"] > 0]),
                "total_skills": len(skill_analysis),
            },
            "strong_skills": strong_skills,
            "weak_skills": weak_skills,
            "developing_skills": developing,
            "recommendations": recommendations,
        }

        # 保存优化记录
        self._optimizations[agent_id] = {
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }
        self._save_optimizations()

        return result

    def _generate_recommendations(self, agent_id, stage, skills, weak, strong, total_xp):
        """生成优化建议"""
        recs = []

        # 弱项技能建议
        for ws in weak[:3]:
            recs.append({
                "type": "weak_skill",
                "priority": "high",
                "skill": ws["skill_id"],
                "message": f"技能 {ws['skill_id']} 成功率仅 {ws['success_rate']:.0%}，建议重点练习或请求 mentor 帮助",
            })

        # 技能覆盖建议
        active_count = len([s for s in skills if s["usage_count"] > 0])
        if active_count < 3:
            recs.append({
                "type": "skill_coverage",
                "priority": "medium",
                "message": f"当前仅有 {active_count} 个活跃技能，建议拓展技能覆盖面",
            })

        # 晋升建议
        if stage == "junior" and total_xp >= 200:
            mid_skills = [s for s in skills if s["level"] >= 2]
            if len(mid_skills) >= 2:
                recs.append({
                    "type": "promotion_ready",
                    "priority": "info",
                    "message": f"已达晋升条件：{len(mid_skills)} 个技能达到中级，总 XP {total_xp}",
                })

        # 强项巩固建议
        for ss in strong[:2]:
            recs.append({
                "type": "strong_skill",
                "priority": "low",
                "skill": ss["skill_id"],
                "message": f"技能 {ss['skill_id']} 表现优秀（{ss['success_rate']:.0%}），可考虑挑战更高难度任务",
            })

        return recs

    def get_all_agents_summary(self) -> Dict[str, Any]:
        """所有 agent 汇总"""
        if not os.path.isdir(self._profile_dir):
            return {"total_agents": 0}

        summaries = []
        for fname in os.listdir(self._profile_dir):
            if not fname.endswith(".json"):
                continue
            agent_id = fname[:-5]
            analysis = self.analyze_agent(agent_id)
            if "error" not in analysis:
                summaries.append({
                    "agent_id": agent_id,
                    "career_stage": analysis["career_stage"],
                    "total_xp": analysis["total_xp"],
                    "success_rate": analysis["performance"]["overall_success_rate"],
                    "weak_count": len(analysis["weak_skills"]),
                    "strong_count": len(analysis["strong_skills"]),
                    "recommendations": len(analysis["recommendations"]),
                })

        return {
            "total_agents": len(summaries),
            "agents": summaries,
            "top_performer": max(summaries, key=lambda x: x["total_xp"]) if summaries else None,
            "needs_attention": [s for s in summaries if s["weak_count"] > 0],
        }

    def _load_profile(self, agent_id: str) -> Optional[Dict]:
        path = os.path.join(self._profile_dir, f"{agent_id}.json")
        if not os.path.isfile(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
