"""反思优先级队列 — 自驱动选择下一步反思目标

系统从自身的进化模式中学习：
- 哪些技能领域的规则进化最频繁？（频繁 = 知识不稳定）
- 进化后的规则 effectiveness 是否提升？（成功率低 = 策略有误）
- 哪些领域的平均 effectiveness 最低？（低 = 需要重点反思）
"""

import json
import logging
import os
from collections import defaultdict
from typing import Any

logger = logging.getLogger("reflection_priority")


class ReflectionPriorityQueue:
    """反思优先级队列 — 计算每个领域的健康度和反思优先级"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._experience_dir = os.path.join(data_dir, "experience")
        self._evolution_log_path = os.path.join(self._experience_dir, "evolution_log.json")
        self._queue_path = os.path.join(data_dir, "reflection_queue.json")

    def compute_priorities(self) -> dict[str, Any]:
        """计算反思优先级队列

        Returns:
            {
                "domains": [{"domain": str, "health_score": float, "priority": str, "reason": str}],
                "evolution_stats": {"total": int, "success_rate": float, "by_domain": {...}},
                "queue": [{"type": str, "target": str, "priority": int, "reason": str}],
                "summary": {"healthy": int, "needs_attention": int, "critical": int}
            }
        """
        # 1. 加载所有规则
        rules = self._load_all_rules()

        # 无经验数据时返回"无数据"状态，而非将所有领域标记为 critical
        if not rules:
            return {
                "domains": [],
                "evolution_stats": {"total": 0, "success_rate": 0.0, "by_domain": {}},
                "queue": [],
                "summary": {"healthy": 0, "needs_attention": 0, "critical": 0, "total_domains": 0, "no_data": True},
            }

        # 2. 按技能领域分组计算健康度
        domains = self._compute_domain_health(rules)

        # 3. 计算进化成功率
        evolution_stats = self._compute_evolution_stats(rules)

        # 4. 生成反思优先级队列
        queue = self._build_priority_queue(rules, domains, evolution_stats)

        # 5. 汇总
        healthy = sum(1 for d in domains if d["health_score"] >= 0.7)
        needs_attention = sum(1 for d in domains if 0.4 <= d["health_score"] < 0.7)
        critical = sum(1 for d in domains if d["health_score"] < 0.4)

        result = {
            "domains": domains,
            "evolution_stats": evolution_stats,
            "queue": queue[:20],  # Top 20
            "summary": {
                "healthy": healthy,
                "needs_attention": needs_attention,
                "critical": critical,
                "total_domains": len(domains),
            },
        }

        # 持久化队列
        self._save_queue(result)
        return result

    def _load_all_rules(self) -> list[dict]:
        """加载所有规则"""
        import yaml
        rules_dir = os.path.join(self._experience_dir, "rules")
        rules = []
        if not os.path.isdir(rules_dir):
            return rules
        for fname in os.listdir(rules_dir):
            if not fname.endswith(".yaml"):
                continue
            try:
                with open(os.path.join(rules_dir, fname), encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                for r in data.get("rules", []):
                    rules.append(r)
            except Exception:
                pass
        return rules

    def _compute_domain_health(self, rules: list[dict]) -> list[dict]:
        """按技能领域计算健康度

        健康度 = 该领域所有规则的平均 effectiveness_score
        """
        # 按 keywords 中的技能类别分组
        domain_scores = defaultdict(list)
        for r in rules:
            if r.get("status") not in ("approved", "evolved"):
                continue
            score = r.get("effectiveness_score", 0.0)
            usage = r.get("usage_count", 0)
            if usage == 0:
                continue
            # 按 rule_type 分类（最稳定的分类方式）
            domain = r.get("rule_type", "unknown")
            domain_scores[domain].append(score)

            # 也按 keywords 中的技能关键词分组
            for kw in r.get("keywords", []):
                domain_scores[kw].append(score)

        domains = []
        for domain, scores in domain_scores.items():
            if len(scores) < 2:  # 至少 2 条规则才有统计意义
                continue
            avg_score = sum(scores) / len(scores)
            priority = "healthy" if avg_score >= 0.7 else "needs_attention" if avg_score >= 0.4 else "critical"
            domains.append({
                "domain": domain,
                "rule_count": len(scores),
                "health_score": round(avg_score, 4),
                "priority": priority,
                "reason": self._health_reason(avg_score, len(scores)),
            })

        domains.sort(key=lambda x: x["health_score"])
        return domains

    @staticmethod
    def _health_reason(score: float, count: int) -> str:
        if score >= 0.7:
            return f"健康：{count} 条规则平均有效性 {score:.0%}"
        elif score >= 0.4:
            return f"需关注：{count} 条规则平均有效性 {score:.0%}，建议审查低分规则"
        else:
            return f"紧急：{count} 条规则平均有效性 {score:.0%}，需要重点改进"

    def _compute_evolution_stats(self, rules: list[dict]) -> dict:
        """计算进化成功率"""
        # 从进化日志中获取进化对
        evolution_log = self._get_evolution_log()
        if not evolution_log:
            return {"total": 0, "success_rate": 0, "by_domain": {}}

        total = len(evolution_log)
        success_count = 0
        by_domain: dict[str, dict] = defaultdict(lambda: {"total": 0, "success": 0})

        for entry in evolution_log:
            evolved_id = entry.get("evolved_rule_id", "")
            original_score = entry.get("original_score", 0)

            # 找到进化后的规则
            evolved_rule = self._find_rule(evolved_id)
            if evolved_rule:
                evolved_score = evolved_rule.get("effectiveness_score", 0)
                if evolved_score > original_score:
                    success_count += 1
                    # 按领域统计
                    for kw in entry.get("keywords", []):
                        by_domain[kw]["success"] += 1
                for kw in entry.get("keywords", []):
                    by_domain[kw]["total"] += 1

        return {
            "total": total,
            "success_rate": round(success_count / total, 4) if total > 0 else 0,
            "success_count": success_count,
            "by_domain": {k: {"total": v["total"], "success": v["success"],
                              "rate": round(v["success"] / v["total"], 4) if v["total"] > 0 else 0}
                          for k, v in by_domain.items()},
        }

    def _build_priority_queue(self, rules: list[dict], domains: list[dict], evo_stats: dict) -> list[dict]:
        """构建反思优先级队列

        优先级排序：
        1. 健康度为 critical 的领域（优先级最高）
        2. 进化成功率低的领域
        3. 低分规则（effectiveness < 0.3 且 usage >= 3）
        4. 进化失败的规则（evolved 后 effectiveness 未提升）
        """
        queue = []

        # 1. Critical 领域
        for d in domains:
            if d["priority"] == "critical":
                queue.append({
                    "type": "domain_critical",
                    "target": d["domain"],
                    "priority": 100,
                    "reason": f"领域健康度紧急：{d['health_score']:.0%}（{d['rule_count']} 条规则）",
                })

        # 2. 进化成功率低的领域
        for domain, stats in evo_stats.get("by_domain", {}).items():
            if stats["total"] >= 2 and stats["rate"] < 0.5:
                queue.append({
                    "type": "evolution_failure",
                    "target": domain,
                    "priority": 80,
                    "reason": f"进化成功率低：{stats['rate']:.0%}（{stats['success']}/{stats['total']}）",
                })

        # 3. 低分规则
        for r in rules:
            if (r.get("status") == "approved"
                    and r.get("effectiveness_score", 1.0) < 0.3
                    and r.get("usage_count", 0) >= 3):
                queue.append({
                    "type": "low_score_rule",
                    "target": r.get("rule_id", ""),
                    "priority": 60,
                    "reason": f"规则有效性低：{r['effectiveness_score']:.0%}（{r.get('success_count',0)}/{r['usage_count']}）",
                })

        # 4. 进化后未改善的规则
        for r in rules:
            if (r.get("status") == "evolved"
                    and r.get("parent_rule_id")):
                parent = self._find_rule(r["parent_rule_id"])
                if parent and r.get("effectiveness_score", 0) <= parent.get("effectiveness_score", 0):
                    queue.append({
                        "type": "evolution_ineffective",
                        "target": r.get("rule_id", ""),
                        "priority": 40,
                        "reason": f"进化未改善：原规则 {parent['effectiveness_score']:.0%} → 进化后 {r['effectiveness_score']:.0%}",
                    })

        queue.sort(key=lambda x: x["priority"], reverse=True)
        return queue

    def _find_rule(self, rule_id: str) -> dict:
        """查找规则"""
        import yaml
        rules_dir = os.path.join(self._experience_dir, "rules")
        path = os.path.join(rules_dir, f"{rule_id}.yaml")
        if not os.path.isfile(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            rules = data.get("rules", [])
            return rules[0] if rules else {}
        except Exception:
            return {}

    def _get_evolution_log(self) -> list[dict]:
        try:
            if os.path.isfile(self._evolution_log_path):
                with open(self._evolution_log_path, encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return []

    def _save_queue(self, data: dict) -> None:
        try:
            tmp = self._queue_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._queue_path)
        except Exception:
            pass

    def get_saved_queue(self) -> dict:
        """获取上次计算的队列"""
        try:
            if os.path.isfile(self._queue_path):
                with open(self._queue_path, encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return {"domains": [], "evolution_stats": {}, "queue": [], "summary": {}}
