"""参数注册表 — 自调优引擎的核心数据结构

将系统中散落的硬编码调优参数统一注册为结构化对象，
支持边界约束、变更追踪和版本化持久化。
"""

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("tuning_registry")


@dataclass
class TunableParam:
    """可调参数定义"""
    name: str                    # 全局唯一名，如 "experience.explore_ratio"
    current: float               # 当前值
    min_val: float               # 下界
    max_val: float               # 上界
    step: float                  # 建议搜索步长
    metric: str                  # 优化目标指标名
    direction: str = "maximize"  # maximize / minimize
    description: str = ""
    requires_approval: bool = False  # 高影响参数变更需人工确认

    def clamp(self, value: float) -> float:
        return max(self.min_val, min(self.max_val, value))


@dataclass
class ParamHistory:
    """参数变更历史条目"""
    param_name: str
    old_value: float
    new_value: float
    reason: str
    timestamp: str
    applied_by: str = "optimizer"  # optimizer / manual / rollback


class TuningRegistry:
    """参数注册表 — 管理所有可调参数的注册、读取、变更和持久化

    持久化到 JSON 文件，支持版本化和回滚。
    """

    def __init__(self, config_path: str):
        self._config_path = config_path
        self._history_path = config_path.replace(".json", "_history.json")
        self._lock = threading.Lock()
        self._params: dict[str, TunableParam] = {}
        self._history: list[ParamHistory] = []
        self._load()

    def register(self, param: TunableParam):
        """注册一个可调参数（已存在的保留当前值）"""
        with self._lock:
            if param.name in self._params:
                # 保留运行时值，只更新元数据
                existing = self._params[param.name]
                existing.min_val = param.min_val
                existing.max_val = param.max_val
                existing.step = param.step
                existing.metric = param.metric
                existing.direction = param.direction
                existing.description = param.description
                existing.requires_approval = param.requires_approval
            else:
                self._params[param.name] = param

    def get(self, name: str) -> float | None:
        """获取参数当前值"""
        with self._lock:
            p = self._params.get(name)
            return p.current if p else None

    def get_param(self, name: str) -> TunableParam | None:
        with self._lock:
            return self._params.get(name)

    def list_params(self) -> list[TunableParam]:
        with self._lock:
            return list(self._params.values())

    def set_value(self, name: str, value: float, reason: str = "", applied_by: str = "manual") -> bool:
        """设置参数值（自动 clamp 到边界），记录历史"""
        with self._lock:
            p = self._params.get(name)
            if p is None:
                logger.warning("参数 %s 未注册", name)
                return False
            old = p.current
            new = p.clamp(value)
            if abs(new - old) < 1e-9:
                return True  # 无变化
            p.current = new
            self._history.append(ParamHistory(
                param_name=name, old_value=old, new_value=new,
                reason=reason, timestamp=datetime.now(timezone.utc).isoformat(),
                applied_by=applied_by,
            ))
            self._save()
            logger.info("参数 %s: %.4f → %.4f (%s)", name, old, new, reason or applied_by)
            return True

    def get_history(self, name: str | None = None, limit: int = 50) -> list[dict]:
        with self._lock:
            entries = self._history
            if name:
                entries = [h for h in entries if h.param_name == name]
            return [asdict(h) for h in entries[-limit:]]

    def snapshot(self) -> dict[str, float]:
        """当前所有参数值的快照（用于配置版本化）"""
        with self._lock:
            return {name: p.current for name, p in self._params.items()}

    def _save(self):
        try:
            data = {
                "params": {name: asdict(p) for name, p in self._params.items()},
                "history": [asdict(h) for h in self._history[-200:]],  # 保留最近 200 条
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            tmp = self._config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._config_path)
        except Exception:
            logger.exception("参数注册表保存失败")

    def _load(self):
        if not os.path.isfile(self._config_path):
            return
        try:
            with open(self._config_path, encoding="utf-8") as f:
                data = json.load(f)
            for name, pd in data.get("params", {}).items():
                self._params[name] = TunableParam(**pd)
            for hd in data.get("history", []):
                self._history.append(ParamHistory(**hd))
            logger.info("参数注册表加载: %d 个参数, %d 条历史", len(self._params), len(self._history))
        except Exception:
            logger.exception("参数注册表加载失败")


def create_default_registry(config_path: str) -> TuningRegistry:
    """创建包含 MDH 全部已知调优参数的注册表"""
    registry = TuningRegistry(config_path)

    params = [
        # ExperienceExtractor — 规则进化
        TunableParam("experience.explore_ratio", 0.2, 0.0, 0.5, 0.05,
                     "task_success_rate", "maximize", "探索/利用平衡：注入随机规则的概率"),
        TunableParam("experience.aging_days", 30, 7, 90, 7,
                     "task_success_rate", "maximize", "规则老化天数：超过后降权"),
        TunableParam("experience.evolution_min_usage", 5, 2, 20, 1,
                     "task_success_rate", "maximize", "规则进化触发的最小使用次数"),
        TunableParam("experience.evolution_min_score", 0.3, 0.1, 0.6, 0.05,
                     "task_success_rate", "maximize", "规则进化触发的有效性上限"),
        TunableParam("experience.demotion_threshold", 0.4, 0.2, 0.6, 0.05,
                     "task_success_rate", "maximize", "自动降级的有效性阈值"),
        TunableParam("experience.dedup_keyword_threshold", 0.8, 0.5, 0.95, 0.05,
                     "task_success_rate", "maximize", "去重的 Jaccard 阈值"),
        TunableParam("experience.auto_approve_min_confidence", 0.7, 0.5, 0.95, 0.05,
                     "task_success_rate", "maximize", "LLM 自动审批置信度门槛",
                     requires_approval=True),

        # AgentMemory — 记忆生命周期
        TunableParam("memory.consolidation_overlap_threshold", 0.7, 0.5, 0.95, 0.05,
                     "task_success_rate", "maximize", "记忆合并的 Jaccard 阈值"),
        TunableParam("memory.markdown_debounce_seconds", 60, 10, 300, 10,
                     "task_success_rate", "minimize", "Markdown 写入防抖秒数"),

        # DynamicRouter — 五维加权路由
        TunableParam("router.keyword_weight", 0.35, 0.1, 0.6, 0.05,
                     "task_success_rate", "maximize", "路由：关键词匹配权重",
                     requires_approval=True),
        TunableParam("router.semantic_weight", 0.25, 0.05, 0.5, 0.05,
                     "task_success_rate", "maximize", "路由：语义相似度权重",
                     requires_approval=True),
        TunableParam("router.success_rate_weight", 0.20, 0.05, 0.5, 0.05,
                     "task_success_rate", "maximize", "路由：历史成功率权重",
                     requires_approval=True),
        TunableParam("router.priority_weight", 0.10, 0.0, 0.3, 0.05,
                     "task_success_rate", "maximize", "路由：部门优先级权重"),
        TunableParam("router.skill_level_weight", 0.10, 0.0, 0.3, 0.05,
                     "task_success_rate", "maximize", "路由：技能等级权重"),
        TunableParam("router.skill_level_boost_max", 0.3, 0.1, 0.5, 0.05,
                     "task_success_rate", "maximize", "路由：技能加成上限"),

        # CapabilityBoundary — 能力边界
        TunableParam("boundary.confidence_high", 0.7, 0.5, 0.9, 0.05,
                     "task_success_rate", "maximize", "高置信阈值"),
        TunableParam("boundary.confidence_medium", 0.4, 0.2, 0.6, 0.05,
                     "task_success_rate", "maximize", "中置信阈值"),

        # TeamFederation — 跨团队信任
        TunableParam("federation.trust_decay_rate", 0.05, 0.01, 0.2, 0.01,
                     "task_success_rate", "minimize", "信任衰减速率"),
    ]

    for p in params:
        registry.register(p)

    return registry
