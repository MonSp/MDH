"""资产上下文构建：纪要 DAG 节点执行时注入团队资产（模板/知识/技能规则）。

设计 [S3]：AssetSearch 检索 → 摘要目录 + 按需加载（渐进披露 P-5.11）；
无资产返回空串（注入零成本）。注入是增强非必需——调用方异常可吞。
"""

from asset_search import AssetSearch

_MAX_TEMPLATES = 3
_MAX_ARTIFACTS = 3
_MAX_RULES = 3
_SNIPPET_LEN = 100


def build_asset_context(store, extractor, team_id: str, task_type: str = "", keywords: list | None = None) -> str:
    """检索团队资产并格式化为注入文本；无资产返回空串。"""
    result = AssetSearch(store, extractor).search(team_id, task_type=task_type, keywords=keywords)
    lines: list[str] = []
    for tpl in result["templates"][:_MAX_TEMPLATES]:
        head = "\n".join(tpl.get("content", "").splitlines()[:3])
        lines.append(f"- 模板「{tpl.get('title', '')}」：{head[:_SNIPPET_LEN]}")
    for art in result["artifacts"][:_MAX_ARTIFACTS]:
        lines.append(f"- 知识「{art.get('title', '')}」：{art.get('content', '')[:_SNIPPET_LEN]}")
    for rule in result["rules"][:_MAX_RULES]:
        lines.append(f"- 规则：{rule.get('trigger_condition', '')} → {rule.get('action', '')[:_SNIPPET_LEN]}")
    if not lines:
        return ""
    return "\n资产参考：\n" + "\n".join(lines)
