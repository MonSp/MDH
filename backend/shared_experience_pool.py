"""
SharedExperiencePool — 共享经验池管理器（技能市场 Stage 1）

管理跨项目共享的经验规则。规则从项目本地"发布"到共享池，
其他项目可检索和 fork 共享池中的规则。

存储结构：
    data/shared_experience/
    ├── rules/
    │   ├── rule_001.yaml
    │   └── rule_002.yaml
    └── index.json
"""

import json
import logging
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml

logger = logging.getLogger("shared_experience")


@dataclass
class SharedRule:
    """共享池中的经验规则"""
    rule_id: str
    source_project: str = ""      # 来源项目 ID
    source_team: str = ""         # 来源团队
    trigger_condition: str = ""
    action: str = ""
    note: str = ""
    keywords: List[str] = field(default_factory=list)
    rule_type: str = "success_pattern"
    usage_count: int = 0          # 被 fork 次数
    created_at: float = field(default_factory=time.time)
    status: str = "approved"      # pending / approved / rejected
    effectiveness_score: float = 0.0  # 发布时携带的有效性评分
    published_by: str = ""        # 发布者

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "SharedRule":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class SharedExperiencePool:
    """共享经验池管理器。

    用法：
        pool = SharedExperiencePool("data/shared_experience")

        # 发布规则到共享池（需满足质量门禁）
        pool.publish_rule(rule, source_project="proj-1", source_team="team-a")

        # 搜索共享池（仅返回已批准规则）
        results = pool.search(task_type="software-dev", keywords=["react", "typescript"])

        # Fork 到项目本地
        pool.fork_rule(rule_id, target_project="proj-2")
    """

    # 发布质量门禁
    PUBLISH_MIN_SCORE = 0.6
    PUBLISH_MIN_USAGE = 2

    def __init__(self, pool_dir: str):
        self._pool_dir = Path(pool_dir)
        self._rules_dir = self._pool_dir / "rules"
        self._index_path = self._pool_dir / "index.json"
        self._rules_dir.mkdir(parents=True, exist_ok=True)
        self._index: Dict[str, dict] = {}
        self._load_index()

    def _load_index(self) -> None:
        """加载索引"""
        if self._index_path.exists():
            try:
                self._index = json.loads(self._index_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning("加载共享池索引失败: %s", e)
                self._index = {}

    def _save_index(self) -> None:
        """保存索引"""
        try:
            self._index_path.write_text(
                json.dumps(self._index, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error("保存共享池索引失败: %s", e)

    def publish_rule(
        self,
        rule_data: dict,
        source_project: str = "",
        source_team: str = "",
    ) -> Optional[SharedRule]:
        """发布经验规则到共享池。

        质量门禁：effectiveness_score >= 0.6 且 usage_count >= 2 的规则自动批准，
        否则进入 pending 待人工审核。

        Args:
            rule_data: 规则数据（至少包含 trigger_condition 和 action）
            source_project: 来源项目 ID
            source_team: 来源团队

        Returns:
            发布的 SharedRule，失败返回 None
        """
        if not rule_data.get("trigger_condition") or not rule_data.get("action"):
            logger.warning("规则缺少 trigger_condition 或 action，跳过发布")
            return None

        score = float(rule_data.get("effectiveness_score", 0.0))
        usage = int(rule_data.get("usage_count", 0))
        passes_gate = score >= self.PUBLISH_MIN_SCORE and usage >= self.PUBLISH_MIN_USAGE

        rule_id = str(uuid.uuid4())[:12]
        shared_rule = SharedRule(
            rule_id=rule_id,
            source_project=source_project,
            source_team=source_team,
            trigger_condition=rule_data["trigger_condition"],
            action=rule_data["action"],
            note=rule_data.get("note", ""),
            keywords=rule_data.get("keywords", []),
            rule_type=rule_data.get("rule_type", "success_pattern"),
            created_at=time.time(),
            status="approved" if passes_gate else "pending",
            effectiveness_score=score,
            published_by=rule_data.get("published_by", ""),
        )

        # 写入规则文件
        rule_path = self._rules_dir / f"{rule_id}.yaml"
        rule_path.write_text(
            yaml.dump(shared_rule.to_dict(), default_flow_style=False, allow_unicode=True),
            encoding="utf-8",
        )

        # 更新索引
        self._index[rule_id] = {
            "keywords": shared_rule.keywords,
            "rule_type": shared_rule.rule_type,
            "source_project": source_project,
            "created_at": shared_rule.created_at,
            "status": shared_rule.status,
            "effectiveness_score": score,
        }
        self._save_index()

        logger.info("已发布规则到共享池: %s (from %s/%s, status=%s, score=%.2f)",
                     rule_id, source_project, source_team, shared_rule.status, score)
        return shared_rule

    def approve_rule(self, rule_id: str, approved_by: str = "admin") -> bool:
        """批准共享池中的待审核规则"""
        rule = self._load_rule(rule_id)
        if not rule or rule.status != "pending":
            return False
        rule.status = "approved"
        self._save_rule(rule)
        self._index[rule_id]["status"] = "approved"
        self._save_index()
        logger.info("共享规则 %s 已批准 (by %s)", rule_id, approved_by)
        return True

    def reject_rule(self, rule_id: str, reason: str = "") -> bool:
        """拒绝共享池中的待审核规则"""
        rule = self._load_rule(rule_id)
        if not rule or rule.status != "pending":
            return False
        rule.status = "rejected"
        self._save_rule(rule)
        self._index[rule_id]["status"] = "rejected"
        self._save_index()
        logger.info("共享规则 %s 已拒绝: %s", rule_id, reason)
        return True

    def get_pending_rules(self) -> List[SharedRule]:
        """获取待审核规则"""
        results = []
        for rule_id in self._index:
            if self._index[rule_id].get("status") == "pending":
                rule = self._load_rule(rule_id)
                if rule:
                    results.append(rule)
        return results

    def search(
        self,
        task_type: str = "",
        keywords: List[str] = None,
        rule_type: str = "",
        limit: int = 10,
        include_pending: bool = False,
    ) -> List[SharedRule]:
        """搜索共享池中的经验规则（默认仅返回已批准规则）。

        Args:
            task_type: 任务类型（用于关键词加分）
            keywords: 搜索关键词
            rule_type: 规则类型过滤
            limit: 返回数量限制
            include_pending: 是否包含待审核规则

        Returns:
            按相关度排序的 SharedRule 列表
        """
        keywords = keywords or []
        query_keywords = set(k.lower() for k in keywords)
        if task_type:
            query_keywords.add(task_type.lower())

        results = []
        for rule_id, meta in self._index.items():
            # 状态过滤：rejected 永不返回；pending 仅在 include_pending=True 时返回
            status = meta.get("status", "approved")
            if status == "rejected":
                continue
            if not include_pending and status != "approved":
                continue

            # 类型过滤
            if rule_type and meta.get("rule_type") != rule_type:
                continue

            # 关键词匹配
            rule_keywords = set(k.lower() for k in meta.get("keywords", []))
            overlap = len(rule_keywords & query_keywords)

            # 任务类型加分
            if task_type and meta.get("rule_type") == task_type:
                overlap += 2

            if overlap > 0 or not query_keywords:
                rule = self._load_rule(rule_id)
                if rule:
                    results.append((overlap, rule))

        results.sort(key=lambda x: -x[0])
        return [rule for _, rule in results[:limit]]

    def fork_rule(self, rule_id: str, target_project: str) -> Optional[dict]:
        """Fork 共享池规则到项目本地。

        Args:
            rule_id: 共享池中的规则 ID
            target_project: 目标项目 ID

        Returns:
            fork 后的规则数据，失败返回 None
        """
        rule = self._load_rule(rule_id)
        if not rule or rule.status != "approved":
            return None

        # 增加使用计数
        rule.usage_count += 1
        rule_path = self._rules_dir / f"{rule_id}.yaml"
        rule_path.write_text(
            yaml.dump(rule.to_dict(), default_flow_style=False, allow_unicode=True),
            encoding="utf-8",
        )
        self._index[rule_id]["usage_count"] = rule.usage_count
        self._save_index()

        # 返回可写入项目本地的规则数据
        return {
            "trigger_condition": rule.trigger_condition,
            "action": rule.action,
            "note": rule.note,
            "keywords": rule.keywords,
            "rule_type": rule.rule_type,
            "source": f"shared_pool:{rule_id}",
            "source_project": rule.source_project,
        }

    def get_stats(self) -> dict:
        """获取共享池统计"""
        status_counts = {}
        for meta in self._index.values():
            s = meta.get("status", "approved")
            status_counts[s] = status_counts.get(s, 0) + 1
        return {
            "total_rules": len(self._index),
            "total_usage": sum(m.get("usage_count", 0) for m in self._index.values()),
            "rule_types": self._count_by_type(),
            "by_status": status_counts,
            "pending_count": status_counts.get("pending", 0),
        }

    def _save_rule(self, rule: SharedRule) -> None:
        """保存单个规则"""
        rule_path = self._rules_dir / f"{rule.rule_id}.yaml"
        rule_path.write_text(
            yaml.dump(rule.to_dict(), default_flow_style=False, allow_unicode=True),
            encoding="utf-8",
        )

    def _load_rule(self, rule_id: str) -> Optional[SharedRule]:
        """加载单个规则"""
        rule_path = self._rules_dir / f"{rule_id}.yaml"
        if not rule_path.exists():
            return None
        try:
            data = yaml.safe_load(rule_path.read_text(encoding="utf-8"))
            return SharedRule.from_dict(data)
        except Exception as e:
            logger.warning("加载共享规则失败 %s: %s", rule_id, e)
            return None

    def _count_by_type(self) -> Dict[str, int]:
        """按类型统计"""
        counts: Dict[str, int] = {}
        for meta in self._index.values():
            t = meta.get("rule_type", "unknown")
            counts[t] = counts.get(t, 0) + 1
        return counts
