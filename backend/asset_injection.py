"""资产上下文构建：纪要 DAG 节点执行时注入团队资产（模板/知识/技能规则）。

设计 [S3]：AssetSearch 检索 → 摘要目录 + 按需加载（渐进披露 P-5.11）；
无资产返回空串（注入零成本）。注入是增强非必需——调用方异常可吞。
"""

import json
import logging
import os
import threading
import time

from asset_search import AssetSearch

logger = logging.getLogger("asset_injection")

_MAX_TEMPLATES = 3
_MAX_ARTIFACTS = 3
_MAX_RULES = 3
_SNIPPET_LEN = 100
_TRUNCATION_MARK = "…"

# 模块级进程内统计 + 锁 + 落盘持久化（M5-T2 ⑥：跨线程安全 + 进程重启恢复）
_REUSE_STATS: dict = {"total": 0, "by_team": {}, "by_type": {"templates": 0, "artifacts": 0, "rules": 0}, "last_at": ""}
_REUSE_LOCK = threading.Lock()
_REUSE_STATS_PATH = os.path.join(os.path.dirname(__file__), "data", "reuse_stats.json")  # gitignored


def _save_reuse_stats() -> None:
    """原子写复用统计到磁盘（tmp+rename）——进程重启保留。

    落盘是增强非必需（评审 Minor）：I/O 失败（磁盘满/权限）在源头吞掉，
    不向上传播破坏注入主流程——pilot_asset_injection 直调 build_asset_context 无守卫。
    """
    # 锁覆盖写全程：并发线程共享同一 .tmp 文件名，若仅保护计数而放写，
    # 线程 A 的 os.replace 可能移走线程 B 尚在写入的 tmp → FileNotFoundError。
    with _REUSE_LOCK:
        snapshot = {
            "total": _REUSE_STATS.get("total", 0),
            "by_team": dict(_REUSE_STATS.get("by_team", {})),
            "by_type": {
                "templates": _REUSE_STATS.get("by_type", {}).get("templates", 0),
                "artifacts": _REUSE_STATS.get("by_type", {}).get("artifacts", 0),
                "rules": _REUSE_STATS.get("by_type", {}).get("rules", 0),
            },
            "last_at": _REUSE_STATS.get("last_at", ""),
        }
        try:
            os.makedirs(os.path.dirname(_REUSE_STATS_PATH), exist_ok=True)
            tmp = _REUSE_STATS_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, ensure_ascii=False)
            os.replace(tmp, _REUSE_STATS_PATH)
        except OSError:
            pass  # 落盘失败不破坏注入（增强非必需）


def _ensure_loaded() -> None:
    """内存空时从磁盘加载（进程重启恢复）。

    容错置空语义完整（评审 Minor）：坏 JSON / I/O 错误 / 可解析但畸形
    （非 dict，或 by_type/by_team 为 null）一律不落内存——避免后续
    by_type.get/by_team[..] 抛 AttributeError/TypeError。
    """
    with _REUSE_LOCK:
        if _REUSE_STATS.get("total"):
            return
        if os.path.exists(_REUSE_STATS_PATH):
            try:
                with open(_REUSE_STATS_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if not isinstance(data, dict):
                    return  # 可解析但非对象（list/str）——容错置空
                for key in ("by_team", "by_type"):
                    if not isinstance(data.get(key), dict):
                        data[key] = {}  # 畸形子结构（如 null）归一置空
                _REUSE_STATS.update(data)
            except Exception as e:
                logger.warning("加载复用统计失败: %s", e)


def get_reuse_stats() -> dict:
    """资产复用统计（注入次数/按团队/按类型）——设计 [S5] 复用率可感知。

    返回规范化结构（缺键补默认），使统计在 `_REUSE_STATS.clear()`（测试隔离）
    后仍可安全读取——演示端点只需按此契约消费。首次读取时从落盘加载（进程重启恢复）。
    """
    _ensure_loaded()
    with _REUSE_LOCK:
        by_type = _REUSE_STATS.get("by_type", {})
        return {
            "total": _REUSE_STATS.get("total", 0),
            "by_team": dict(_REUSE_STATS.get("by_team", {})),
            "by_type": {
                "templates": by_type.get("templates", 0),
                "artifacts": by_type.get("artifacts", 0),
                "rules": by_type.get("rules", 0),
            },
            "last_at": _REUSE_STATS.get("last_at", ""),
        }


def _snippet(text: str, limit: int = _SNIPPET_LEN) -> str:
    """节选字符串；仅在实际截断时追加省略号标记。"""
    if len(text) <= limit:
        return text
    return text[:limit] + _TRUNCATION_MARK


def build_asset_context(store, extractor, team_id: str, task_type: str = "", keywords: list | None = None) -> str:
    """检索团队资产并格式化为注入文本；无资产返回空串。"""
    result = AssetSearch(store, extractor).search(team_id, task_type=task_type, keywords=keywords)
    lines: list[str] = []
    for tpl in result["templates"][:_MAX_TEMPLATES]:
        head = "\n".join(tpl.get("content", "").splitlines()[:3])
        if not head:
            continue  # 空内容跳过，避免悬空 bullet
        lines.append(f"- 模板「{tpl.get('title', '')}」：{_snippet(head)}")
    for art in result["artifacts"][:_MAX_ARTIFACTS]:
        content = art.get("content", "")
        if not content:
            continue  # 空内容跳过，避免悬空 bullet
        lines.append(f"- 知识「{art.get('title', '')}」：{_snippet(content)}")
    for rule in result["rules"][:_MAX_RULES]:
        trigger = rule.get("trigger_condition", "")
        action = rule.get("action", "")
        if not trigger and not action:
            continue  # 空规则跳过，避免悬空 bullet
        lines.append(f"- 规则：{_snippet(trigger)} → {_snippet(action)}")
    if not lines:
        return ""
    # 资产非空才算一次复用注入（注入语义不变：仅追加统计更新）——设计 [S5]
    # 重启后首次 build 前加载落盘值（评审 Important）：主流程前端从不轮询
    # /api/assets/reuse-metrics，重启后几乎总是先 build——若不加载会从 0 重计
    # 覆盖落盘累计值。锁外调用（threading.Lock 非重入，_ensure_loaded 内部持锁）。
    _ensure_loaded()
    # 锁内计数：跨线程（FastAPI 线程池 + meeting 循环）并发下不丢自增；更新后原子落盘（进程重启恢复）——M5-T2 ⑥
    with _REUSE_LOCK:
        _REUSE_STATS["total"] = _REUSE_STATS.get("total", 0) + 1
        by_team = _REUSE_STATS.setdefault("by_team", {})
        by_team[team_id] = by_team.get(team_id, 0) + 1
        by_type = _REUSE_STATS.setdefault("by_type", {})
        by_type["templates"] = by_type.get("templates", 0) + len(result["templates"][:_MAX_TEMPLATES])
        by_type["artifacts"] = by_type.get("artifacts", 0) + len(result["artifacts"][:_MAX_ARTIFACTS])
        by_type["rules"] = by_type.get("rules", 0) + len(result["rules"][:_MAX_RULES])
        _REUSE_STATS["last_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    _save_reuse_stats()
    return "\n资产参考：\n" + "\n".join(lines)
