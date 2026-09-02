"""多团队进化联邦 — 让进化系统从单团队扩展到多团队协作

核心机制：
1. 进化发布：高分进化规则自动发布到共享进化池
2. 跨团队有效性：共享规则在不同团队使用后的 effectiveness 独立追踪
3. 智能订阅：团队根据技能领域自动订阅相关共享规则
4. 信任评分：来源团队的信任度影响共享规则的可见性
"""

import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger("team_federation")

# 发布门槛
PUBLISH_MIN_SCORE = 0.7
PUBLISH_MIN_USAGE = 5
TRUST_DECAY_RATE = 0.05  # 每次失败降低信任


@dataclass
class SharedEvolution:
    """共享进化规则"""
    evolution_id: str
    source_team: str
    source_rule_id: str
    trigger_condition: str
    action: str
    keywords: list[str]
    rule_type: str
    source_effectiveness: float  # 来源团队的有效性评分
    trust_score: float  # 来源团队的信任评分
    usage_by_team: dict[str, dict] = field(default_factory=dict)  # team_id -> {usage, success, effectiveness}
    created_at: str = ""
    status: str = "active"  # active / deprecated


class TeamFederation:
    """多团队进化联邦管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._federation_path = os.path.join(data_dir, "team_federation.json")
        self._trust_path = os.path.join(data_dir, "team_trust.json")
        self._evolutions: list[dict] = []
        self._trust_scores: dict[str, float] = {}
        self._load()

    def _load(self):
        try:
            if os.path.isfile(self._federation_path):
                with open(self._federation_path, encoding="utf-8") as f:
                    self._evolutions = json.load(f)
        except Exception:
            self._evolutions = []

        try:
            if os.path.isfile(self._trust_path):
                with open(self._trust_path, encoding="utf-8") as f:
                    self._trust_scores = json.load(f)
        except Exception:
            self._trust_scores = {}

    def _save(self):
        try:
            tmp = self._federation_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._evolutions, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._federation_path)
        except Exception:
            pass

        try:
            tmp = self._trust_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._trust_scores, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._trust_path)
        except Exception:
            pass

    def publish_evolution(self, team_id: str, rule_data: dict) -> dict | None:
        """发布进化规则到共享池

        条件：effectiveness_score ≥ 0.7 且 usage_count ≥ 5
        """
        score = rule_data.get("effectiveness_score", 0)
        usage = rule_data.get("usage_count", 0)

        if score < PUBLISH_MIN_SCORE or usage < PUBLISH_MIN_USAGE:
            return None

        trust = self._get_trust(team_id)
        evolution_id = f"evo-{team_id[:8]}-{int(time.time())}"

        evolution = {
            "evolution_id": evolution_id,
            "source_team": team_id,
            "source_rule_id": rule_data.get("rule_id", ""),
            "trigger_condition": rule_data.get("trigger_condition", ""),
            "action": rule_data.get("action", ""),
            "keywords": rule_data.get("keywords", []),
            "rule_type": rule_data.get("rule_type", ""),
            "source_effectiveness": score,
            "trust_score": trust,
            "usage_by_team": {},
            "created_at": self._now_iso(),
            "status": "active",
        }

        self._evolutions.append(evolution)
        self._save()
        logger.info("进化规则 %s 从团队 %s 发布到共享池 (score=%.2f, trust=%.2f)",
                     evolution_id, team_id, score, trust)
        return evolution

    def subscribe_team(self, team_id: str, team_keywords: list[str]) -> list[dict]:
        """智能订阅：返回与团队技能领域匹配的共享进化规则

        匹配逻辑：共享规则的 keywords 与团队关键词有交集，
        且来源团队的信任评分 ≥ 0.3
        """
        matches = []
        team_kw_set = set(k.lower() for k in team_keywords)

        for evo in self._evolutions:
            if evo["status"] != "active":
                continue
            if evo["source_team"] == team_id:
                continue  # 不订阅自己的规则
            # 使用当前信任评分（而非发布时的快照）
            current_trust = self._get_trust(evo.get("source_team", ""))
            if current_trust < 0.3:
                continue  # 低信任来源跳过

            evo_keywords = set(k.lower() for k in evo.get("keywords", []))
            if evo_keywords & team_kw_set:
                matches.append(evo)

        matches.sort(key=lambda x: x.get("source_effectiveness", 0) * x.get("trust_score", 0), reverse=True)
        return matches

    def report_usage(self, evolution_id: str, team_id: str, task_success: bool) -> bool:
        """报告跨团队使用结果

        更新该规则在该团队的 effectiveness，以及来源团队的信任评分
        """
        for evo in self._evolutions:
            if evo["evolution_id"] != evolution_id:
                continue

            team_usage = evo.setdefault("usage_by_team", {}).setdefault(team_id, {
                "usage": 0, "success": 0, "effectiveness": 0.0
            })
            team_usage["usage"] += 1
            if task_success:
                team_usage["success"] += 1
            team_usage["effectiveness"] = team_usage["success"] / team_usage["usage"]

            # 更新来源团队信任评分
            source_team = evo.get("source_team", "")
            if source_team:
                if task_success:
                    self._adjust_trust(source_team, 0.01)  # 成功小增
                else:
                    self._adjust_trust(source_team, -TRUST_DECAY_RATE)  # 失败降信任

            self._save()
            return True
        return False

    def _get_trust(self, team_id: str) -> float:
        """获取团队信任评分（默认 0.5）"""
        return self._trust_scores.get(team_id, 0.5)

    def _adjust_trust(self, team_id: str, delta: float):
        """调整团队信任评分（0.0-1.0）"""
        current = self._get_trust(team_id)
        self._trust_scores[team_id] = max(0.0, min(1.0, current + delta))

    def get_federation_stats(self) -> dict:
        """联邦统计"""
        total = len(self._evolutions)
        active = sum(1 for e in self._evolutions if e["status"] == "active")
        by_team = defaultdict(int)
        by_type = defaultdict(int)
        total_cross_team_usage = 0

        for evo in self._evolutions:
            by_team[evo.get("source_team", "?")] += 1
            by_type[evo.get("rule_type", "?")] += 1
            for team_usage in evo.get("usage_by_team", {}).values():
                total_cross_team_usage += team_usage.get("usage", 0)

        return {
            "total_evolutions": total,
            "active_evolutions": active,
            "by_source_team": dict(by_team),
            "by_rule_type": dict(by_type),
            "total_cross_team_usage": total_cross_team_usage,
            "team_trust_scores": dict(self._trust_scores),
        }

    def get_team_feed(self, team_id: str, team_keywords: list[str]) -> dict:
        """获取团队的个性化进化流

        返回：
        - subscribed: 订阅的共享进化规则
        - trust_score: 本团队的信任评分
        - recommendations: 推荐关注的领域
        """
        subscribed = self.subscribe_team(team_id, team_keywords)
        trust = self._get_trust(team_id)

        # 推荐关注的领域（高频关键词）
        all_keywords = defaultdict(int)
        for evo in self._evolutions:
            for kw in evo.get("keywords", []):
                all_keywords[kw] += 1
        recommendations = sorted(all_keywords.items(), key=lambda x: -x[1])[:5]

        return {
            "subscribed": subscribed[:10],
            "trust_score": trust,
            "recommendations": [{"keyword": k, "count": c} for k, c in recommendations],
        }

    @staticmethod
    def _now_iso() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()
