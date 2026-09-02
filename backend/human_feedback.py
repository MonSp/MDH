"""人机协作反馈回路 — 让人的反馈直接驱动 agent 进化

核心机制：
1. 结构化反馈：人在审查 agent 产出时给出结构化的评价
2. 反馈→规则转化：人的建议自动转化为经验规则
3. 技能方向指导：人指定 agent 重点发展的技能方向
4. 信任度调节：人直接调高/调低 agent 信任评分
"""

import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("human_feedback")


@dataclass
class HumanFeedback:
    """结构化人类反馈"""
    feedback_id: str
    agent_id: str
    task_id: str
    task_description: str
    rating: str  # "excellent" / "good" / "needs_improvement" / "poor"
    strengths: list[str]  # 做得好的方面
    improvements: list[str]  # 需要改进的方面
    specific_suggestions: list[str]  # 具体建议（可直接转化为规则）
    skill_directions: list[str]  # 建议 agent 重点发展的技能
    reviewer: str  # 审查者
    created_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class HumanFeedbackManager:
    """人类反馈管理器"""

    def __init__(self, data_dir: str, experience_extractor=None):
        self._data_dir = data_dir
        self._feedback_path = os.path.join(data_dir, "human_feedback.json")
        self._guidance_path = os.path.join(data_dir, "skill_guidance.json")
        self._feedbacks: list[dict] = []
        self._guidance: dict[str, Any] = {}
        self._experience = experience_extractor
        self._load()

    def _load(self):
        try:
            if os.path.isfile(self._feedback_path):
                with open(self._feedback_path, encoding="utf-8") as f:
                    self._feedbacks = json.load(f)
        except Exception:
            self._feedbacks = []
        try:
            if os.path.isfile(self._guidance_path):
                with open(self._guidance_path, encoding="utf-8") as f:
                    self._guidance = json.load(f)
        except Exception:
            self._guidance = {}

    def _save_feedback(self):
        try:
            tmp = self._feedback_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._feedbacks, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._feedback_path)
        except Exception:
            pass

    def _save_guidance(self):
        try:
            tmp = self._guidance_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._guidance, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._guidance_path)
        except Exception:
            pass

    def submit_feedback(self, feedback: dict) -> dict:
        """提交结构化反馈

        Args:
            feedback: {
                "agent_id": str,
                "task_id": str,
                "task_description": str,
                "rating": "excellent"|"good"|"needs_improvement"|"poor",
                "strengths": [str],
                "improvements": [str],
                "specific_suggestions": [str],
                "skill_directions": [str],
                "reviewer": str,
            }
        Returns:
            提交结果
        """
        entry = {
            "feedback_id": str(uuid.uuid4())[:8],
            "agent_id": feedback.get("agent_id", ""),
            "task_id": feedback.get("task_id", ""),
            "task_description": feedback.get("task_description", ""),
            "rating": feedback.get("rating", "good"),
            "strengths": feedback.get("strengths", []),
            "improvements": feedback.get("improvements", []),
            "specific_suggestions": feedback.get("specific_suggestions", []),
            "skill_directions": feedback.get("skill_directions", []),
            "reviewer": feedback.get("reviewer", "human"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        self._feedbacks.append(entry)
        self._save_feedback()

        # 自动转化：将 specific_suggestions 转化为经验规则
        rules_created = self._convert_suggestions_to_rules(entry)

        # 更新技能方向指导
        if entry["skill_directions"]:
            self._update_skill_guidance(entry["agent_id"], entry["skill_directions"])

        logger.info("反馈已提交: agent=%s rating=%s rules_created=%d",
                     entry["agent_id"], entry["rating"], rules_created)

        return {
            "feedback_id": entry["feedback_id"],
            "rules_created": rules_created,
            "guidance_updated": bool(entry["skill_directions"]),
        }

    def _convert_suggestions_to_rules(self, feedback: dict) -> int:
        """将具体建议转化为经验规则

        优先写入 SQLite（通过 ExperienceExtractor），回退到 JSON 文件。
        """
        created = 0
        for suggestion in feedback.get("specific_suggestions", []):
            if not suggestion.strip():
                continue

            rule_id = str(uuid.uuid4())[:8]
            rule_type = "correction_tip" if feedback.get("rating") in ("needs_improvement", "poor") else "success_pattern"

            if self._experience:
                try:
                    from experience_extractor import ExperienceRule
                    rule = ExperienceRule(
                        rule_id=rule_id,
                        trigger_condition=f"human_feedback for task type: {feedback.get('task_description', '')[:50]}",
                        action=suggestion.strip(),
                        note=f"来自人类反馈 ({feedback.get('reviewer', 'human')})，评分: {feedback.get('rating', 'good')}",
                        source_task_id=feedback.get("task_id", ""),
                        source_task_type="human_feedback",
                        rule_type=rule_type,
                        status="approved",
                        keywords=["human_feedback"],
                        created_at=datetime.now(timezone.utc).isoformat(),
                        effectiveness_score=0.5,
                    )
                    self._experience._save_rule(rule)
                    created += 1
                    continue
                except Exception as e:
                    logger.debug("SQLite 规则写入失败，回退 JSON: %s", e)

            # 回退：写入 JSON 文件
            try:
                experience_dir = os.path.join(self._data_dir, "experience", "rules")
                os.makedirs(experience_dir, exist_ok=True)
                rule_data = {
                    "rules": [{
                        "rule_id": rule_id,
                        "trigger_condition": f"human_feedback for task type: {feedback.get('task_description', '')[:50]}",
                        "action": suggestion.strip(),
                        "note": f"来自人类反馈 ({feedback.get('reviewer', 'human')})，评分: {feedback.get('rating', 'good')}",
                        "source_task_id": feedback.get("task_id", ""),
                        "source_task_type": "human_feedback",
                        "rule_type": rule_type,
                        "status": "approved",
                        "keywords": ["human_feedback"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "team_id": "",
                        "source_agent_id": "",
                        "effectiveness_score": 0.5,
                        "usage_count": 0,
                        "success_count": 0,
                    }]
                }
                path = os.path.join(experience_dir, f"{rule_id}.json")
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(rule_data, f, ensure_ascii=False, indent=2)
                os.replace(tmp, path)
                created += 1
            except Exception as e:
                logger.debug("JSON 规则写入失败: %s", e)

        return created

    def _update_skill_guidance(self, agent_id: str, skill_directions: list[str]):
        """更新技能方向指导"""
        agent_guidance = self._guidance.setdefault(agent_id, {
            "directions": [],
            "updated_at": "",
        })
        # 合并新方向（去重）
        existing = set(agent_guidance.get("directions", []))
        for direction in skill_directions:
            existing.add(direction)
        agent_guidance["directions"] = sorted(existing)
        agent_guidance["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._save_guidance()

    def get_skill_guidance(self, agent_id: str) -> list[str]:
        """获取 agent 的技能发展方向指导"""
        return self._guidance.get(agent_id, {}).get("directions", [])

    def get_feedback_summary(self) -> dict:
        """反馈汇总"""
        if not self._feedbacks:
            return {"total": 0, "by_rating": {}, "top_improvements": [], "top_strengths": []}

        by_rating = {}
        all_strengths = []
        all_improvements = []

        for f in self._feedbacks:
            rating = f.get("rating", "good")
            by_rating[rating] = by_rating.get(rating, 0) + 1
            all_strengths.extend(f.get("strengths", []))
            all_improvements.extend(f.get("improvements", []))

        # 高频改进点
        from collections import Counter
        top_improvements = Counter(all_improvements).most_common(5)
        top_strengths = Counter(all_strengths).most_common(5)

        return {
            "total": len(self._feedbacks),
            "by_rating": by_rating,
            "top_improvements": [{"item": k, "count": c} for k, c in top_improvements],
            "top_strengths": [{"item": k, "count": c} for k, c in top_strengths],
        }

    def get_recent_feedback(self, limit: int = 10) -> list[dict]:
        """获取最近的反馈"""
        return list(reversed(self._feedbacks[-limit:]))
