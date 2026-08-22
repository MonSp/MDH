"""主动式监控 — 让数字员工主动发现问题、预警风险

核心机制：
1. 健康巡检：定期检查任务状态、agent 表现、技能覆盖
2. 风险预警：基于历史数据预测可能失败的任务
3. 流程建议：分析团队协作模式，提出优化建议
4. 主动介入：发现卡住的任务自动请求帮助
"""

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("proactive_monitor")


class ProactiveMonitor:
    """主动式监控器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._profile_dir = os.path.join(data_dir, "agent_profiles")
        self._alerts_path = os.path.join(data_dir, "proactive_alerts.json")
        self._alerts: List[Dict] = []
        self._load_alerts()

    def _load_alerts(self):
        try:
            if os.path.isfile(self._alerts_path):
                with open(self._alerts_path, encoding="utf-8") as f:
                    self._alerts = json.load(f)
        except Exception:
            self._alerts = []

    def _save_alerts(self):
        try:
            tmp = self._alerts_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._alerts[-200:], f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._alerts_path)
        except Exception:
            pass

    def run_health_check(self) -> Dict[str, Any]:
        """运行健康巡检

        检查：
        1. Agent 状态：哪些 agent 表现下降？
        2. 技能覆盖：哪些领域缺少高技能 agent？
        3. 规则健康：哪些领域规则有效性低？
        """
        alerts = []

        # 1. Agent 表现检查
        agent_alerts = self._check_agent_performance()
        alerts.extend(agent_alerts)

        # 2. 技能覆盖检查
        coverage_alerts = self._check_skill_coverage()
        alerts.extend(coverage_alerts)

        # 3. 规则健康检查
        rule_alerts = self._check_rule_health()
        alerts.extend(rule_alerts)

        # 保存告警
        for alert in alerts:
            alert["timestamp"] = datetime.now(timezone.utc).isoformat()
            self._alerts.append(alert)
        self._save_alerts()

        return {
            "alerts": alerts,
            "summary": {
                "total": len(alerts),
                "critical": sum(1 for a in alerts if a.get("severity") == "critical"),
                "warning": sum(1 for a in alerts if a.get("severity") == "warning"),
                "info": sum(1 for a in alerts if a.get("severity") == "info"),
            },
        }

    def _check_agent_performance(self) -> List[Dict]:
        """检查 agent 表现下降"""
        alerts = []
        try:
            from agent_profile_manager import AgentProfileManager
            mgr = AgentProfileManager(self._profile_dir)
            profiles = mgr.list_profiles()
        except Exception:
            return alerts

        for profile in profiles:
            agent_id = profile.agent_id
            skills = profile.skill_progress

            for skill_id, sp in skills.items():
                if not isinstance(sp, dict):
                    continue
                usage = sp.get("usage_count", 0)
                success = sp.get("success_count", 0)
                if usage < 3:
                    continue
                rate = success / usage
                if rate < 0.3:
                    alerts.append({
                        "type": "low_success_rate",
                        "severity": "warning",
                        "agent_id": agent_id,
                        "skill_id": skill_id,
                        "message": f"Agent {agent_id} 技能 {skill_id} 成功率过低：{rate:.0%}（{success}/{usage}）",
                    })

        return alerts

    def _check_skill_coverage(self) -> List[Dict]:
        """检查技能覆盖缺口"""
        alerts = []
        try:
            from agent_profile_manager import AgentProfileManager
            mgr = AgentProfileManager(self._profile_dir)
            profiles = mgr.list_profiles()
        except Exception:
            return alerts

        dept_skills: Dict[str, set] = defaultdict(set)
        for profile in profiles:
            if not profile.department:
                continue
            for skill_id, sp in profile.skill_progress.items():
                if isinstance(sp, dict) and sp.get("level", 0) >= 2:
                    dept_skills[profile.department].add(skill_id)

        # 检查部门是否有足够的中级技能
        for dept, skills in dept_skills.items():
            if len(skills) < 2:
                alerts.append({
                    "type": "skill_gap",
                    "severity": "warning",
                    "department": dept,
                    "message": f"部门 {dept} 仅有 {len(skills)} 个中级技能，建议补充人才",
                })

        return alerts

    def _check_rule_health(self) -> List[Dict]:
        """检查规则健康度"""
        import yaml
        alerts = []
        rules_dir = os.path.join(self._data_dir, "experience", "rules")
        if not os.path.isdir(rules_dir):
            return alerts

        domain_scores: Dict[str, List[float]] = defaultdict(list)
        for fname in os.listdir(rules_dir):
            if not fname.endswith(".yaml"):
                continue
            try:
                with open(os.path.join(rules_dir, fname), encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                for r in data.get("rules", []):
                    if r.get("usage_count", 0) >= 3:
                        domain_scores[r.get("rule_type", "unknown")].append(r.get("effectiveness_score", 0))
            except Exception:
                pass

        for domain, scores in domain_scores.items():
            avg = sum(scores) / len(scores) if scores else 0
            if avg < 0.3 and len(scores) >= 2:
                alerts.append({
                    "type": "rule_health",
                    "severity": "critical",
                    "domain": domain,
                    "message": f"领域 {domain} 规则平均有效性 {avg:.0%}（{len(scores)} 条），需要重点改进",
                })

        return alerts

    def get_recent_alerts(self, limit: int = 20) -> List[Dict]:
        """获取最近的告警"""
        return list(reversed(self._alerts[-limit:]))

    def get_alert_stats(self) -> Dict:
        """告警统计"""
        total = len(self._alerts)
        by_type = Counter(a.get("type", "unknown") for a in self._alerts)
        by_severity = Counter(a.get("severity", "unknown") for a in self._alerts)
        recent_24h = sum(1 for a in self._alerts if a.get("timestamp", "") >= (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat())
        return {
            "total": total,
            "by_type": dict(by_type),
            "by_severity": dict(by_severity),
            "recent_24h": recent_24h,
        }
