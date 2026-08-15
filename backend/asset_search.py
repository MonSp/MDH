"""资产复用检索：知识库/模板（AssetStore.search）+ 技能规则（ExperienceExtractor）合并。

设计 [S6]：下次同类任务注入候选——演示端点合并返回三类资产。
纯新增模块；检索规则复用 ExperienceExtractor.retrieve_relevant_rules
（experience_extractor.py:523，关键词交集 + 类型匹配 +2 bonus）。
"""

from asset_store import AssetStore
from experience_extractor import ExperienceExtractor


class AssetSearch:
    """三类资产合并检索：artifacts（知识库产出物）+ templates（模板）+ rules（技能规则）。"""

    def __init__(self, store: AssetStore, extractor: ExperienceExtractor):
        self._store = store
        self._extractor = extractor

    def search(
        self,
        team_id: str,
        query: str = "",
        asset_type: str = "",
        task_type: str = "",
        keywords: list | None = None,
    ) -> dict:
        """合并检索三类资产，供下次同类任务注入候选。

        Args:
            team_id: 团队 ID（AssetStore 团队隔离）
            query: 标题/内容关键词
            asset_type: 可选过滤（"" / "artifact" / "template"）；传入具体类型时
                只检索该类型，返回 dict 结构不变（其余键为空列表）
            task_type: 任务类型（与 keywords 均非空时才检索技能规则）
            keywords: 关键词标签列表

        Returns:
            {"artifacts": [...], "templates": [...], "rules": [{"rule_id","trigger_condition","action"}]}
        """
        artifacts = []
        templates = []
        if not asset_type or asset_type == "artifact":
            artifacts = self._store.search(team_id, query=query, asset_type="artifact")
        if not asset_type or asset_type == "template":
            templates = self._store.search(team_id, query=query, asset_type="template")

        rules = []
        if task_type and keywords:
            for rule in self._extractor.retrieve_relevant_rules(task_type, keywords, team_id=team_id):
                rules.append(
                    {
                        "rule_id": rule.rule_id,
                        "trigger_condition": rule.trigger_condition,
                        "action": rule.action,
                    }
                )
        return {"artifacts": artifacts, "templates": templates, "rules": rules}
