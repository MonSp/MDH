"""DynamicRouter - 动态路由器模块

多智能体协作系统中的路由组件，负责将用户需求路由到合适的部门。
支持基于规则的关键词匹配、语义相似度排序和综合评分决策。
路由表持久化为 JSON 文件，并追踪各部门的历史成功率。
"""

import json
import logging
import os
import re
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("dynamic_router")


# ---------------------------------------------------------------------------
# 数据类定义
# ---------------------------------------------------------------------------

@dataclass
class RouteEntry:
    """路由表条目"""
    dept_id: str
    dept_name: str
    capability_desc: str
    capability_keywords: list[str]
    tools: list[str]
    success_rate: float
    total_tasks: int
    successful_tasks: int
    last_active: str
    priority: int


@dataclass
class RoutingDecision:
    """路由决策结果"""
    selected_dept: str
    confidence: float
    reason: str
    candidate_depts: list[dict]
    matched_keywords: list[str]


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> set[str]:
    """将文本分词为小写词集合

    支持中英文混合文本：中文按字符拆分，英文按空格/标点拆分。
    """
    text = text.lower()
    # 提取英文单词
    en_words = set(re.findall(r'[a-z_][a-z0-9_]*', text))
    # 提取中文字符（单字）和中文词组（2-4字滑动窗口）
    cn_chars = re.findall(r'[\u4e00-\u9fff]', text)
    cn_words: set[str] = set()
    for ch in cn_chars:
        cn_words.add(ch)
    for n in (2, 3, 4):
        for i in range(len(cn_chars) - n + 1):
            cn_words.add("".join(cn_chars[i:i + n]))
    return en_words | cn_words


def _now_iso() -> str:
    """返回当前 UTC 时间的 ISO-8601 字符串"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# DynamicRouter
# ---------------------------------------------------------------------------

class DynamicRouter:
    """动态路由器

    负责根据用户输入和任务类型，从路由表中选择最合适的部门。
    支持规则匹配、语义排序和综合评分三种策略的组合。

    路由表以 JSON 文件形式持久化，所有读写操作通过线程锁保证安全。
    """

    # 综合评分权重
    WEIGHT_KEYWORD = 0.4
    WEIGHT_SEMANTIC = 0.3
    WEIGHT_SUCCESS_RATE = 0.2
    WEIGHT_PRIORITY = 0.1

    def __init__(self, routing_table_path: str):
        """初始化动态路由器

        Args:
            routing_table_path: 路由表 JSON 文件路径
        """
        self._path = routing_table_path
        self._lock = threading.Lock()
        self._table: dict[str, RouteEntry] = {}
        self.load_routing_table()

    # ------------------------------------------------------------------
    # 路由表持久化
    # ------------------------------------------------------------------

    def load_routing_table(self) -> dict[str, RouteEntry]:
        """从 JSON 文件加载路由表

        如果文件不存在或解析失败，返回空表。

        Returns:
            部门 ID -> RouteEntry 的映射
        """
        with self._lock:
            if not os.path.isfile(self._path):
                logger.warning("路由表文件不存在: %s，使用空表", self._path)
                self._table = {}
                return dict(self._table)

            try:
                with open(self._path, "r", encoding="utf-8") as fh:
                    raw = json.load(fh)
            except (json.JSONDecodeError, OSError) as exc:
                logger.error("加载路由表失败: %s", exc)
                self._table = {}
                return dict(self._table)

            table: dict[str, RouteEntry] = {}
            for dept in raw.get("departments", []):
                entry = RouteEntry(
                    dept_id=dept["dept_id"],
                    dept_name=dept["dept_name"],
                    capability_desc=dept.get("capability_desc", ""),
                    capability_keywords=dept.get("capability_keywords", []),
                    tools=dept.get("tools", []),
                    success_rate=dept.get("success_rate", 0.0),
                    total_tasks=dept.get("total_tasks", 0),
                    successful_tasks=dept.get("successful_tasks", 0),
                    last_active=dept.get("last_active", ""),
                    priority=dept.get("priority", 0),
                )
                table[entry.dept_id] = entry

            self._table = table
            logger.info("已加载 %d 个部门路由条目", len(table))
            return dict(table)

    def save_routing_table(self) -> bool:
        """将当前路由表保存到 JSON 文件

        Returns:
            保存是否成功
        """
        with self._lock:
            departments = [asdict(e) for e in self._table.values()]
            payload = {"departments": departments}
            try:
                dir_name = os.path.dirname(self._path)
                if dir_name:
                    os.makedirs(dir_name, exist_ok=True)
                tmp_path = self._path + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as fh:
                    json.dump(payload, fh, ensure_ascii=False, indent=2)
                # 原子替换
                if os.path.exists(self._path):
                    os.replace(tmp_path, self._path)
                else:
                    os.rename(tmp_path, self._path)
                logger.info("路由表已保存: %s", self._path)
                return True
            except OSError as exc:
                logger.error("保存路由表失败: %s", exc)
                return False

    # ------------------------------------------------------------------
    # 规则匹配
    # ------------------------------------------------------------------

    def rule_match(self, user_input: str, task_type: str = None) -> list[RouteEntry]:
        """基于规则匹配过滤候选部门

        流程：
        1. 提取用户输入中的关键词（分词后与各部门 capability_keywords 比对）
        2. 计算匹配度 = 匹配关键词数 / 该部门总关键词数
        3. 过滤掉匹配度过低（< 0.1）的部门；若无任何匹配则返回全部部门

        Args:
            user_input: 用户输入文本
            task_type: 任务类型（可选，暂未启用，预留扩展）

        Returns:
            匹配的候选部门列表
        """
        with self._lock:
            entries = list(self._table.values())

        if not entries:
            return []

        if not user_input or not user_input.strip():
            return entries

        input_lower = user_input.lower()
        input_tokens = _tokenize(user_input)

        scored: list[tuple[RouteEntry, float]] = []
        for entry in entries:
            if not entry.capability_keywords:
                scored.append((entry, 0.0))
                continue

            # 计算有多少关键词出现在用户输入中
            matched = 0
            for kw in entry.capability_keywords:
                kw_lower = kw.lower()
                # 直接子串匹配 或 分词交集
                if kw_lower in input_lower or kw_lower in input_tokens:
                    matched += 1

            match_ratio = matched / len(entry.capability_keywords)
            scored.append((entry, match_ratio))

        # 如果没有任何部门有关键词命中，返回全部
        if all(score == 0.0 for _, score in scored):
            return entries

        # 过滤掉匹配度过低的
        threshold = 0.1
        candidates = [entry for entry, score in scored if score >= threshold]
        return candidates if candidates else entries

    # ------------------------------------------------------------------
    # 语义相似度排序
    # ------------------------------------------------------------------

    def semantic_rank(
        self, candidates: list[RouteEntry], user_input: str
    ) -> list[tuple[RouteEntry, float]]:
        """语义相似度排序

        简单实现：计算用户输入与各部门 capability_desc 的词重叠度
        （Jaccard 相似系数），并结合关键词权重加成。

        Args:
            candidates: 候选部门列表
            user_input: 用户输入文本

        Returns:
            (部门, 相似度得分) 的排序列表，得分范围 0-1
        """
        if not candidates:
            return []

        input_tokens = _tokenize(user_input)
        if not input_tokens:
            return [(e, 0.0) for e in candidates]

        results: list[tuple[RouteEntry, float]] = []
        for entry in candidates:
            desc_tokens = _tokenize(entry.capability_desc)
            if not desc_tokens:
                results.append((entry, 0.0))
                continue

            # Jaccard 相似系数
            intersection = input_tokens & desc_tokens
            union = input_tokens | desc_tokens
            jaccard = len(intersection) / len(union) if union else 0.0

            # 关键词加成：命中的关键词越多，加成越高
            input_lower = user_input.lower()
            kw_hits = sum(
                1 for kw in entry.capability_keywords
                if kw.lower() in input_lower or kw.lower() in input_tokens
            )
            kw_bonus = kw_hits / max(len(entry.capability_keywords), 1)
            kw_bonus = min(kw_bonus, 1.0)

            # 综合：70% Jaccard + 30% 关键词加成
            score = jaccard * 0.7 + kw_bonus * 0.3
            score = min(score, 1.0)
            results.append((entry, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    # ------------------------------------------------------------------
    # 综合路由决策
    # ------------------------------------------------------------------

    def route(self, user_input: str, task_type: str = None) -> RoutingDecision:
        """综合路由决策

        评分公式：
            final_score = keyword_match_score * 0.4
                        + semantic_score * 0.3
                        + success_rate * 0.2
                        + priority_weight * 0.1

        Args:
            user_input: 用户输入文本
            task_type: 任务类型（可选）

        Returns:
            路由决策结果
        """
        with self._lock:
            all_entries = list(self._table.values())

        if not all_entries:
            return RoutingDecision(
                selected_dept="",
                confidence=0.0,
                reason="路由表为空，无可用部门",
                candidate_depts=[],
                matched_keywords=[],
            )

        # 第一步：规则匹配筛选候选
        candidates = self.rule_match(user_input, task_type)

        # 第二步：语义排序
        semantic_results = self.semantic_rank(candidates, user_input)
        semantic_map = {entry.dept_id: score for entry, score in semantic_results}

        # 计算关键词匹配得分
        input_lower = user_input.lower()
        input_tokens = _tokenize(user_input)
        kw_score_map: dict[str, float] = {}
        matched_kw_map: dict[str, list[str]] = {}
        for entry in candidates:
            matched_kws: list[str] = []
            for kw in entry.capability_keywords:
                kw_lower = kw.lower()
                if kw_lower in input_lower or kw_lower in input_tokens:
                    matched_kws.append(kw)
            kw_score = len(matched_kws) / max(len(entry.capability_keywords), 1)
            kw_score_map[entry.dept_id] = kw_score
            matched_kw_map[entry.dept_id] = matched_kws

        # 最大优先级用于归一化
        max_priority = max((e.priority for e in all_entries), default=1)
        if max_priority == 0:
            max_priority = 1

        # 第三步：综合评分
        candidate_scores: list[tuple[RouteEntry, float, list[str]]] = []
        for entry in candidates:
            kw_score = kw_score_map.get(entry.dept_id, 0.0)
            sem_score = semantic_map.get(entry.dept_id, 0.0)
            sr = entry.success_rate
            pri = entry.priority / max_priority

            final_score = (
                kw_score * self.WEIGHT_KEYWORD
                + sem_score * self.WEIGHT_SEMANTIC
                + sr * self.WEIGHT_SUCCESS_RATE
                + pri * self.WEIGHT_PRIORITY
            )
            candidate_scores.append((entry, final_score, matched_kw_map.get(entry.dept_id, [])))

        # 按得分降序排序
        candidate_scores.sort(key=lambda x: x[1], reverse=True)

        best_entry, best_score, best_kw = candidate_scores[0]

        # 构建候选列表
        candidate_depts = [
            {
                "dept_id": entry.dept_id,
                "dept_name": entry.dept_name,
                "score": round(score, 4),
                "matched_keywords": kw,
            }
            for entry, score, kw in candidate_scores
        ]

        # 置信度 = 最高分与次高分的差距 + 基础分
        if len(candidate_scores) > 1:
            second_score = candidate_scores[1][1]
            gap = best_score - second_score
            confidence = min(1.0, best_score * 0.6 + gap * 0.4 + 0.1)
        else:
            confidence = min(1.0, best_score + 0.2)

        confidence = round(max(0.0, min(1.0, confidence)), 4)

        reason = (
            f"部门「{best_entry.dept_name}」综合得分最高({best_score:.4f})，"
            f"匹配关键词: {best_kw or '无'}"
        )

        return RoutingDecision(
            selected_dept=best_entry.dept_id,
            confidence=confidence,
            reason=reason,
            candidate_depts=candidate_depts,
            matched_keywords=best_kw,
        )

    # ------------------------------------------------------------------
    # 统计更新
    # ------------------------------------------------------------------

    def update_stats(self, dept_id: str, success: bool) -> bool:
        """更新部门的任务统计数据

        Args:
            dept_id: 部门 ID
            success: 任务是否成功

        Returns:
            更新是否成功
        """
        with self._lock:
            entry = self._table.get(dept_id)
            if entry is None:
                logger.warning("更新统计失败: 部门 %s 不存在", dept_id)
                return False

            entry.total_tasks += 1
            if success:
                entry.successful_tasks += 1
            entry.success_rate = (
                entry.successful_tasks / entry.total_tasks
                if entry.total_tasks > 0
                else 0.0
            )
            entry.last_active = _now_iso()

        # 持久化
        return self.save_routing_table()

    # ------------------------------------------------------------------
    # 路由条目增删
    # ------------------------------------------------------------------

    def add_route_entry(self, entry: RouteEntry) -> bool:
        """添加新的路由条目

        如果已存在相同 dept_id 的条目，将被覆盖。

        Args:
            entry: 路由条目

        Returns:
            添加是否成功
        """
        with self._lock:
            self._table[entry.dept_id] = entry

        return self.save_routing_table()

    def remove_route_entry(self, dept_id: str) -> bool:
        """移除路由条目

        Args:
            dept_id: 部门 ID

        Returns:
            移除是否成功
        """
        with self._lock:
            if dept_id not in self._table:
                logger.warning("移除失败: 部门 %s 不存在", dept_id)
                return False
            del self._table[dept_id]

        return self.save_routing_table()

    # ------------------------------------------------------------------
    # 查询接口
    # ------------------------------------------------------------------

    def get_route_table(self) -> list[dict]:
        """获取路由表（用于 API 返回）

        Returns:
            路由表字典列表
        """
        with self._lock:
            return [asdict(e) for e in self._table.values()]
