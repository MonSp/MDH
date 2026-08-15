"""资产上下文构建：纪要 DAG 节点执行时注入团队资产（模板/知识/技能规则）。

设计 [S3]：AssetSearch 检索 → 摘要目录 + 按需加载（渐进披露 P-5.11）；
无资产返回空串（注入零成本）。注入是增强非必需——调用方异常可吞。
"""

from asset_search import AssetSearch

_MAX_TEMPLATES = 3
_MAX_ARTIFACTS = 3
_MAX_RULES = 3
_SNIPPET_LEN = 100
_TRUNCATION_MARK = "…"


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
    return "\n资产参考：\n" + "\n".join(lines)
