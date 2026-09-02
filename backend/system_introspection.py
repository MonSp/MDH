"""系统自省 — 让系统分析自己的架构健康度

功能利用率追踪 + 模块影响分析 + 回归检测 + 改进提案生成
"""

import json
import logging
import os
from collections import Counter, defaultdict
from typing import Any

logger = logging.getLogger("system_introspection")


class SystemIntrospection:
    """系统自省分析器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._experience_dir = os.path.join(data_dir, "experience")
        self._tracking_path = os.path.join(data_dir, "feature_tracking.json")
        self._tracking: dict[str, Any] = {}
        self._load_tracking()

    def _load_tracking(self):
        try:
            if os.path.isfile(self._tracking_path):
                with open(self._tracking_path, encoding="utf-8") as f:
                    self._tracking = json.load(f)
        except Exception:
            self._tracking = {"feature_calls": {}, "module_changes": {}, "regressions": []}

    def _save_tracking(self):
        try:
            tmp = self._tracking_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._tracking, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._tracking_path)
        except Exception:
            pass

    def track_feature_call(self, feature_name: str, success: bool = True):
        """记录一次功能调用"""
        calls = self._tracking.setdefault("feature_calls", {})
        entry = calls.setdefault(feature_name, {"calls": 0, "successes": 0, "first_call": self._now_iso(), "last_call": ""})
        entry["calls"] += 1
        if success:
            entry["successes"] += 1
        entry["last_call"] = self._now_iso()
        self._save_tracking()

    def track_regression(self, module: str, description: str):
        """记录回归"""
        regressions = self._tracking.setdefault("regressions", [])
        regressions.append({
            "module": module,
            "description": description,
            "timestamp": self._now_iso(),
        })
        # 只保留最近 100 条
        self._tracking["regressions"] = regressions[-100:]
        self._save_tracking()

    def get_feature_utilization(self) -> dict[str, Any]:
        """功能利用率分析

        分析 v1.5.x 新增功能的实际使用情况
        """
        # v1.5.x 新增功能清单
        v15_features = {
            "routing_aware": {"module": "dynamic_router.py", "api": "/api/agents/*/profile"},
            "promotion_driven": {"module": "meeting_coordinator.py", "api": "/api/agents/*/promotion"},
            "mentor_matching": {"module": "agent_profile_manager.py", "api": "/api/agents/knowledge-flow"},
            "knowledge_flow": {"module": "meeting_coordinator.py", "api": "/api/agents/knowledge-flow"},
            "triage_gate": {"module": "meeting_coordinator.py", "api": "internal"},
            "cost_tracking": {"module": "llm_cost_tracker.py", "api": "/api/llm/costs"},
            "performance_dashboard": {"module": "performance_dashboard.py", "api": "/api/dashboard/performance"},
            "rule_evolution": {"module": "experience_extractor.py", "api": "internal"},
            "linked_evolution": {"module": "knowledge_network.py", "api": "/api/knowledge/network-stats"},
            "reflection_priority": {"module": "reflection_priority.py", "api": "/api/reflection/priority-queue"},
            "anti_overfitting": {"module": "experience_extractor.py", "api": "internal"},
            "team_federation": {"module": "team_federation.py", "api": "/api/federation/stats"},
            "ci_evolution_guard": {"module": "scripts/evolution_guard.py", "api": "ci"},
            "capability_boundary": {"module": "capability_boundary.py", "api": "/api/capability/boundary"},
        }

        feature_calls = self._tracking.get("feature_calls", {})
        result = []

        for name, meta in v15_features.items():
            call_data = feature_calls.get(name, {"calls": 0, "successes": 0})
            calls = call_data.get("calls", 0)
            successes = call_data.get("successes", 0)
            success_rate = successes / calls if calls > 0 else 0

            # 检查模块是否存在
            module_path = os.path.join(os.path.dirname(self._data_dir), meta["module"])
            module_exists = os.path.isfile(module_path)

            utilization = "active" if calls >= 5 else "minimal" if calls > 0 else "unused"

            result.append({
                "feature": name,
                "module": meta["module"],
                "module_exists": module_exists,
                "api": meta["api"],
                "calls": calls,
                "success_rate": round(success_rate, 4),
                "utilization": utilization,
            })

        return {
            "features": result,
            "summary": {
                "total_features": len(result),
                "active": sum(1 for r in result if r["utilization"] == "active"),
                "minimal": sum(1 for r in result if r["utilization"] == "minimal"),
                "unused": sum(1 for r in result if r["utilization"] == "unused"),
            },
        }

    def get_module_health(self) -> dict[str, Any]:
        """模块健康度分析

        基于规则数据推断模块的使用情况
        """
        import yaml
        rules_dir = os.path.join(self._experience_dir, "rules")
        if not os.path.isdir(rules_dir):
            return {"modules": {}, "total_rules": 0}

        # 统计规则的类型分布和有效性
        rule_types = Counter()
        effectiveness_by_type = defaultdict(list)
        total_rules = 0

        for fname in os.listdir(rules_dir):
            if not fname.endswith(".yaml"):
                continue
            try:
                with open(os.path.join(rules_dir, fname), encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                for r in data.get("rules", []):
                    total_rules += 1
                    rt = r.get("rule_type", "unknown")
                    rule_types[rt] += 1
                    if r.get("usage_count", 0) > 0:
                        effectiveness_by_type[rt].append(r.get("effectiveness_score", 0))
            except Exception:
                pass

        modules = {}
        for rt, count in rule_types.items():
            scores = effectiveness_by_type.get(rt, [])
            avg_score = sum(scores) / len(scores) if scores else 0
            modules[rt] = {
                "rule_count": count,
                "avg_effectiveness": round(avg_score, 4),
                "health": "healthy" if avg_score >= 0.6 else "degraded" if avg_score >= 0.3 else "critical",
            }

        return {
            "modules": modules,
            "total_rules": total_rules,
            "healthiest": max(modules.items(), key=lambda x: x[1]["avg_effectiveness"])[0] if modules else None,
            "weakest": min(modules.items(), key=lambda x: x[1]["avg_effectiveness"])[0] if modules else None,
        }

    def get_regression_report(self) -> dict[str, Any]:
        """回归报告"""
        regressions = self._tracking.get("regressions", [])
        by_module = Counter(r.get("module", "unknown") for r in regressions)
        recent = [r for r in regressions if r.get("timestamp", "") >= self._hours_ago(24)]

        return {
            "total_regressions": len(regressions),
            "recent_24h": len(recent),
            "by_module": dict(by_module),
            "recent": recent[-10:],
        }

    def generate_improvement_proposals(self) -> list[dict[str, Any]]:
        """生成改进提案

        基于功能利用率、模块健康度、回归数据自动生成改进建议
        """
        proposals = []
        utilization = self.get_feature_utilization()
        health = self.get_module_health()
        regressions = self.get_regression_report()

        # 1. 未使用的功能
        for feat in utilization["features"]:
            if feat["utilization"] == "unused":
                proposals.append({
                    "type": "unused_feature",
                    "priority": "low",
                    "feature": feat["feature"],
                    "module": feat["module"],
                    "suggestion": f"功能 {feat['feature']} 未被使用，检查是否需要集成到工作流中",
                })

        # 2. 关键模块健康度低
        for module_name, data in health.get("modules", {}).items():
            if data["health"] == "critical":
                proposals.append({
                    "type": "critical_module",
                    "priority": "high",
                    "module": module_name,
                    "suggestion": f"模块 {module_name} 健康度 critical（有效性 {data['avg_effectiveness']:.0%}），需要重点改进",
                })

        # 3. 频繁回归的模块
        for module, count in regressions.get("by_module", {}).items():
            if count >= 3:
                proposals.append({
                    "type": "regression_hotspot",
                    "priority": "high",
                    "module": module,
                    "suggestion": f"模块 {module} 有 {count} 次回归记录，需要架构审查",
                })

        # 4. 高成功率功能可推广
        for feat in utilization["features"]:
            if feat["utilization"] == "active" and feat.get("success_rate", 0) >= 0.9:
                proposals.append({
                    "type": "success_feature",
                    "priority": "info",
                    "feature": feat["feature"],
                    "suggestion": f"功能 {feat['feature']} 成功率 {feat['success_rate']:.0%}，可考虑扩展使用场景",
                })

        # 按优先级排序
        priority_order = {"high": 0, "medium": 1, "low": 2, "info": 3}
        proposals.sort(key=lambda x: priority_order.get(x["priority"], 99))

        return proposals

    @staticmethod
    def _now_iso() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    def _hours_ago(self, hours: int) -> str:
        from datetime import datetime, timedelta, timezone
        return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
