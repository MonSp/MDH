"""能力边界感知 — 让系统知道自己"不知道什么"

核心机制：
1. 置信度地图：每个技能领域的置信度分数
2. 未知领域检测：任务落在低置信领域时主动标记
3. 求助机制：低置信领域自动触发跨团队知识请求
"""

import json
import logging
import math
import os
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("capability_boundary")

# 置信度阈值
CONFIDENCE_HIGH = 0.7
CONFIDENCE_MEDIUM = 0.4
CONFIDENCE_LOW = 0.2


class CapabilityBoundary:
    """能力边界感知器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._experience_dir = os.path.join(data_dir, "experience")

    def compute_confidence_map(self) -> Dict[str, Any]:
        """计算每个技能领域的置信度地图

        置信度 = f(规则数量, 平均有效性, 使用频率, 进化成功率)
        """
        import yaml
        rules_dir = os.path.join(self._experience_dir, "rules")
        if not os.path.isdir(rules_dir):
            return {"domains": {}, "overall_confidence": 0.0}

        # 按 rule_type 和 keywords 分组
        domain_data: Dict[str, List[Dict]] = defaultdict(list)

        for fname in os.listdir(rules_dir):
            if not fname.endswith(".yaml"):
                continue
            try:
                with open(os.path.join(rules_dir, fname), encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                for r in data.get("rules", []):
                    if r.get("status") not in ("approved", "evolved"):
                        continue
                    # 按 rule_type 分组
                    rt = r.get("rule_type", "unknown")
                    domain_data[rt].append(r)
                    # 按 keywords 分组
                    for kw in r.get("keywords", []):
                        domain_data[kw].append(r)
            except Exception:
                pass

        domains = {}
        for domain, rules in domain_data.items():
            if len(rules) < 1:
                continue
            scores = [r.get("effectiveness_score", 0) for r in rules if r.get("usage_count", 0) > 0]
            usages = [r.get("usage_count", 0) for r in rules]

            rule_count = len(rules)
            avg_effectiveness = sum(scores) / len(scores) if scores else 0.0
            total_usage = sum(usages)
            active_rules = sum(1 for r in rules if r.get("usage_count", 0) > 0)

            # 置信度计算
            # 规则数量贡献（log 平滑，上限 1.0）
            count_factor = min(1.0, math.log2(max(rule_count, 1) + 1) / 5)
            # 有效性贡献
            effectiveness_factor = avg_effectiveness
            # 使用频率贡献（log 平滑）
            usage_factor = min(1.0, math.log2(max(total_usage, 1) + 1) / 8)
            # 活跃率贡献
            active_rate = active_rules / rule_count if rule_count > 0 else 0

            confidence = (
                count_factor * 0.3
                + effectiveness_factor * 0.35
                + usage_factor * 0.2
                + active_rate * 0.15
            )
            confidence = min(1.0, max(0.0, confidence))

            if confidence >= CONFIDENCE_HIGH:
                level = "high"
            elif confidence >= CONFIDENCE_MEDIUM:
                level = "medium"
            elif confidence >= CONFIDENCE_LOW:
                level = "low"
            else:
                level = "unknown"

            domains[domain] = {
                "domain": domain,
                "confidence": round(confidence, 4),
                "level": level,
                "rule_count": rule_count,
                "avg_effectiveness": round(avg_effectiveness, 4),
                "total_usage": total_usage,
                "active_rate": round(active_rate, 4),
            }

        overall = sum(d["confidence"] for d in domains.values()) / len(domains) if domains else 0

        return {
            "domains": domains,
            "overall_confidence": round(overall, 4),
            "total_domains": len(domains),
            "high_confidence": sum(1 for d in domains.values() if d["level"] == "high"),
            "medium_confidence": sum(1 for d in domains.values() if d["level"] == "medium"),
            "low_confidence": sum(1 for d in domains.values() if d["level"] == "low"),
            "unknown_domains": sum(1 for d in domains.values() if d["level"] == "unknown"),
        }

    def detect_unknown_domain(self, task_keywords: List[str]) -> Dict[str, Any]:
        """检测任务是否落在未知/低置信领域

        Args:
            task_keywords: 任务关键词列表

        Returns:
            {
                "is_unknown": bool,
                "matched_domains": [...],
                "best_confidence": float,
                "recommendation": str,
            }
        """
        conf_map = self.compute_confidence_map()
        domains = conf_map.get("domains", {})

        matched = []
        for kw in task_keywords:
            kw_lower = kw.lower()
            for domain_name, domain_data in domains.items():
                if kw_lower in domain_name.lower() or domain_name.lower() in kw_lower:
                    matched.append(domain_data)

        if not matched:
            return {
                "is_unknown": True,
                "matched_domains": [],
                "best_confidence": 0.0,
                "recommendation": "完全未知领域：建议使用默认规则或请求外部帮助",
            }

        best = max(m["confidence"] for m in matched)
        best_domains = [m["domain"] for m in matched if m["confidence"] == best]

        if best < CONFIDENCE_LOW:
            return {
                "is_unknown": True,
                "matched_domains": best_domains,
                "best_confidence": best,
                "recommendation": f"低置信领域（{best:.0%}）：建议额外审查或请求专家协助",
            }
        elif best < CONFIDENCE_MEDIUM:
            return {
                "is_unknown": False,
                "matched_domains": best_domains,
                "best_confidence": best,
                "recommendation": f"中等置信（{best:.0%}）：可以执行但建议轻量审查",
            }
        else:
            return {
                "is_unknown": False,
                "matched_domains": best_domains,
                "best_confidence": best,
                "recommendation": f"高置信领域（{best:.0%}）：正常执行",
            }

    def request_help(self, domain: str, team_id: str = "") -> Optional[Dict]:
        """低置信领域自动触发跨团队求助

        向共享进化池查询该领域的高置信规则
        """
        try:
            from team_federation import TeamFederation
            federation = TeamFederation(self._data_dir)
            matches = federation.subscribe_team(team_id, [domain])
            if matches:
                return {
                    "domain": domain,
                    "help_available": True,
                    "shared_rules": len(matches),
                    "top_rule": matches[0] if matches else None,
                }
        except Exception as e:
            logger.debug("求助失败: %s", e)

        return {
            "domain": domain,
            "help_available": False,
            "shared_rules": 0,
            "top_rule": None,
        }

    def get_boundary_report(self) -> Dict[str, Any]:
        """能力边界报告"""
        conf_map = self.compute_confidence_map()
        domains = conf_map.get("domains", {})

        # 按置信度排序
        sorted_domains = sorted(domains.values(), key=lambda x: x["confidence"], reverse=True)

        # 识别边界区域（置信度从高到低的转折点）
        boundaries = []
        for i, d in enumerate(sorted_domains):
            if i > 0:
                prev_conf = sorted_domains[i-1]["confidence"]
                if prev_conf - d["confidence"] > 0.2:
                    boundaries.append({
                        "position": d["domain"],
                        "drop": round(prev_conf - d["confidence"], 4),
                        "from_domain": sorted_domains[i-1]["domain"],
                        "to_domain": d["domain"],
                    })

        return {
            "confidence_map": conf_map,
            "sorted_domains": sorted_domains,
            "boundaries": boundaries,
            "recommendations": self._generate_recommendations(sorted_domains),
        }

    @staticmethod
    def _generate_recommendations(sorted_domains: List[Dict]) -> List[str]:
        """生成改进建议"""
        recs = []
        for d in sorted_domains:
            if d["level"] == "unknown":
                recs.append(f"紧急：{d['domain']} 领域完全无经验，建议引入外部知识或规则")
            elif d["level"] == "low":
                recs.append(f"关注：{d['domain']} 领域置信度低（{d['confidence']:.0%}），建议增加该领域的任务实践")
            elif d["level"] == "medium" and d["active_rate"] < 0.5:
                recs.append(f"优化：{d['domain']} 领域有规则但使用率低，建议检查规则是否适用")
        return recs
