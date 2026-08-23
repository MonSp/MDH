"""全局性能仪表盘 — 聚合所有数据源计算可行动洞察"""

import json
import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger("performance_dashboard")


class PerformanceDashboard:
    """聚合所有子系统数据，计算全局性能指标"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir

    def get_overview(self) -> Dict[str, Any]:
        """全局概览"""
        agent_stats = self._get_agent_stats()
        rule_stats = self._get_rule_stats()
        routing_stats = self._get_routing_stats()
        cost_stats = self._get_cost_stats()
        flow_stats = self._get_knowledge_flow_stats()
        evolution_stats = self._get_evolution_stats()
        system_health = self._get_system_health()
        session_stats = self._get_session_stats()

        return {
            "agents": agent_stats,
            "rules": rule_stats,
            "routing": routing_stats,
            "costs": cost_stats,
            "knowledge_flow": flow_stats,
            "evolution": evolution_stats,
            "system": system_health,
            "sessions": session_stats,
        }

    def _get_agent_stats(self) -> Dict[str, Any]:
        """Agent 统计"""
        try:
            from agent_profile_manager import AgentProfileManager
            mgr = AgentProfileManager(os.path.join(self._data_dir, "agent_profiles"))
            profiles = mgr.list_profiles()

            total_agents = len(profiles)
            total_xp = sum(p.total_xp for p in profiles)
            by_stage = {}
            by_dept = {}
            top_agents = []

            for p in profiles:
                stage = p.career_stage or "junior"
                dept = p.department or "(无部门)"
                by_stage[stage] = by_stage.get(stage, 0) + 1
                by_dept[dept] = by_dept.get(dept, 0) + 1

                max_skill = 0
                skill_count = 0
                for sp in p.skill_progress.values():
                    level = sp.get("level", 0) if isinstance(sp, dict) else 0
                    if level > max_skill:
                        max_skill = level
                    if level > 0:
                        skill_count += 1

                top_agents.append({
                    "agent_id": p.agent_id,
                    "name": p.name,
                    "department": dept,
                    "career_stage": stage,
                    "total_xp": p.total_xp,
                    "max_skill_level": max_skill,
                    "active_skills": skill_count,
                })

            top_agents.sort(key=lambda x: x["total_xp"], reverse=True)

            return {
                "total": total_agents,
                "total_xp": total_xp,
                "by_stage": by_stage,
                "by_department": by_dept,
                "top_agents": top_agents[:10],
            }
        except Exception as e:
            logger.debug("agent stats error: %s", e)
            return {"total": 0, "total_xp": 0, "by_stage": {}, "by_department": {}, "top_agents": []}

    def _get_rule_stats(self) -> Dict[str, Any]:
        """经验规则统计"""
        try:
            from experience_extractor import ExperienceExtractor
            extractor = ExperienceExtractor(incremental_dir=os.path.join(self._data_dir, "experience"))
            all_rules = extractor.get_all_rules()

            total = len(all_rules)
            by_status = {}
            effectiveness_scores = []
            high_performers = []
            low_performers = []

            for r in all_rules:
                by_status[r.status] = by_status.get(r.status, 0) + 1
                if r.usage_count > 0:
                    effectiveness_scores.append(r.effectiveness_score)
                    if r.effectiveness_score >= 0.7:
                        high_performers.append({
                            "rule_id": r.rule_id,
                            "trigger": r.trigger_condition[:50],
                            "score": r.effectiveness_score,
                            "usage": r.usage_count,
                        })
                    elif r.effectiveness_score < 0.4:
                        low_performers.append({
                            "rule_id": r.rule_id,
                            "trigger": r.trigger_condition[:50],
                            "score": r.effectiveness_score,
                            "usage": r.usage_count,
                        })

            avg_effectiveness = sum(effectiveness_scores) / len(effectiveness_scores) if effectiveness_scores else 0
            recommendations = extractor.get_share_recommendations()

            return {
                "total": total,
                "by_status": by_status,
                "avg_effectiveness": round(avg_effectiveness, 4),
                "rules_with_usage": len(effectiveness_scores),
                "high_performers": len(high_performers),
                "low_performers": len(low_performers),
                "share_recommendations": len(recommendations),
                "top_rules": high_performers[:5],
            }
        except Exception as e:
            logger.debug("rule stats error: %s", e)
            return {"total": 0, "by_status": {}, "avg_effectiveness": 0}

    def _get_routing_stats(self) -> Dict[str, Any]:
        """路由统计"""
        try:
            routing_path = os.path.join(self._data_dir, "routing_table.json")
            if not os.path.isfile(routing_path):
                return {"departments": 0, "depts": []}

            with open(routing_path, encoding="utf-8") as f:
                data = json.load(f)

            depts = []
            for dept in data.get("departments", []):
                depts.append({
                    "dept_id": dept["dept_id"],
                    "dept_name": dept["dept_name"],
                    "success_rate": dept.get("success_rate", 0),
                    "total_tasks": dept.get("total_tasks", 0),
                    "skill_level_boost": dept.get("skill_level_boost", 0),
                })

            depts.sort(key=lambda x: x["success_rate"], reverse=True)
            return {"departments": len(depts), "depts": depts}
        except Exception as e:
            logger.debug("routing stats error: %s", e)
            return {"departments": 0, "depts": []}

    def _get_cost_stats(self) -> Dict[str, Any]:
        """LLM 成本统计"""
        try:
            from llm_cost_tracker import get_tracker
            tracker = get_tracker(self._data_dir)
            return tracker.get_summary()
        except Exception as e:
            logger.debug("cost stats error: %s", e)
            return {"total_calls": 0, "total_cost_usd": 0}

    def _get_knowledge_flow_stats(self) -> Dict[str, Any]:
        """知识流动统计"""
        try:
            flow_path = os.path.join(self._data_dir, "knowledge_flow.json")
            if not os.path.isfile(flow_path):
                return {"total_flows": 0, "unique_mentors": 0, "unique_mentees": 0}

            with open(flow_path, encoding="utf-8") as f:
                flows = json.load(f)

            mentors = set()
            mentees = set()
            for flow in flows:
                mentors.add(flow.get("from_agent", ""))
                mentees.add(flow.get("to_agent", ""))

            return {
                "total_flows": len(flows),
                "unique_mentors": len(mentors - {""}),
                "unique_mentees": len(mentees - {""}),
                "recent_flows": flows[-5:] if flows else [],
            }
        except Exception as e:
            logger.debug("knowledge flow stats error: %s", e)
            return {"total_flows": 0, "unique_mentors": 0, "unique_mentees": 0}

    def _get_evolution_stats(self) -> Dict[str, Any]:
        """技能进化统计"""
        try:
            from db import get_db
            db_path = os.path.join(self._data_dir, "mdh.db")
            if not os.path.isfile(db_path):
                return {"total_evolutions": 0, "recent": []}
            conn = get_db(db_path)
            total = conn.execute("SELECT COUNT(*) FROM evolution_log").fetchone()[0]
            recent = conn.execute(
                "SELECT original_rule_id, trigger_condition, evolved_at FROM evolution_log ORDER BY id DESC LIMIT 5"
            ).fetchall()
            return {
                "total_evolutions": total,
                "recent": [dict(r) for r in recent],
            }
        except Exception as e:
            logger.debug("evolution stats error: %s", e)
            return {"total_evolutions": 0, "recent": []}

    def _get_system_health(self) -> Dict[str, Any]:
        """系统健康状态"""
        try:
            import shutil
            db_path = os.path.join(self._data_dir, "mdh.db")
            db_size = os.path.getsize(db_path) if os.path.isfile(db_path) else 0
            disk = shutil.disk_usage(self._data_dir)
            # 检查表记录数
            table_counts = {}
            if os.path.isfile(db_path):
                from db import get_db
                conn = get_db(db_path)
                for table in ("agent_profiles", "experience_rules", "agent_memories",
                              "evolution_log", "session_snapshots", "task_executions"):
                    try:
                        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                        table_counts[table] = count
                    except Exception:
                        pass
            return {
                "db_size_mb": round(db_size / 1024 / 1024, 2),
                "disk_total_gb": round(disk.total / 1024**3, 1),
                "disk_used_gb": round(disk.used / 1024**3, 1),
                "disk_free_gb": round(disk.free / 1024**3, 1),
                "disk_usage_pct": round(disk.used / disk.total * 100, 1),
                "table_counts": table_counts,
            }
        except Exception as e:
            logger.debug("system health error: %s", e)
            return {"db_size_mb": 0, "error": str(e)}

    def _get_session_stats(self) -> Dict[str, Any]:
        """会话统计"""
        try:
            from db import get_db
            db_path = os.path.join(self._data_dir, "mdh.db")
            if not os.path.isfile(db_path):
                return {"active_snapshots": 0, "total_task_executions": 0}
            conn = get_db(db_path)
            snapshots = conn.execute("SELECT COUNT(*) FROM session_snapshots").fetchone()[0]
            executions = conn.execute("SELECT COUNT(*) FROM task_executions").fetchone()[0]
            completed = conn.execute("SELECT COUNT(*) FROM task_executions WHERE status='completed'").fetchone()[0]
            failed = conn.execute("SELECT COUNT(*) FROM task_executions WHERE status='failed'").fetchone()[0]
            return {
                "active_snapshots": snapshots,
                "total_task_executions": executions,
                "completed": completed,
                "failed": failed,
                "success_rate": round(completed / executions * 100, 1) if executions > 0 else 0,
            }
        except Exception as e:
            logger.debug("session stats error: %s", e)
            return {"active_snapshots": 0, "total_task_executions": 0}
