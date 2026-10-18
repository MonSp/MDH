"""知识网络 — 规则/资产/技能联动进化

当一个知识节点（规则/资产/技能）发生变化时，
自动触发关联节点的级联更新。

知识网络结构：
  规则 ──关联──→ 技能包（规则属于哪个 skill_pack）
  技能包 ──依赖──→ 技能包（prerequisites）
  资产 ──来源──→ 规则（资产由哪些规则生成）
"""

import json
import logging
import os

logger = logging.getLogger("knowledge_network")


class KnowledgeNetwork:
    """知识网络管理器 — 节点间联动进化"""

    def __init__(self, data_dir: str, skill_packs_dir: str = ""):
        self._data_dir = data_dir
        self._skill_packs_dir = skill_packs_dir or os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skill_packs"
        )
        self._evolution_log_path = os.path.join(data_dir, "network_evolution_log.json")
        self._skill_index: dict[str, set[str]] | None = None  # skill_name → keywords

    def _get_skill_index(self) -> dict[str, set[str]]:
        """构建（或返回缓存的）技能包关键词索引"""
        if self._skill_index is not None:
            return self._skill_index
        index: dict[str, set[str]] = {}
        if os.path.isdir(self._skill_packs_dir):
            import yaml
            for skill_name in os.listdir(self._skill_packs_dir):
                skill_path = os.path.join(self._skill_packs_dir, skill_name)
                if not os.path.isdir(skill_path):
                    continue
                manifest_path = os.path.join(skill_path, "manifest.yaml")
                kw_set: set[str] = set()
                if os.path.isfile(manifest_path):
                    try:
                        with open(manifest_path, encoding="utf-8") as f:
                            manifest = yaml.safe_load(f)
                        kw_set = set(manifest.get("keywords", []))
                    except Exception:
                        pass
                index[skill_name] = kw_set
        self._skill_index = index
        return index

    def get_network_stats(self) -> dict:
        """知识网络统计"""
        skill_count = 0
        rule_count = 0
        asset_count = 0

        # 技能包数
        if os.path.isdir(self._skill_packs_dir):
            skill_count = sum(1 for d in os.listdir(self._skill_packs_dir)
                            if os.path.isdir(os.path.join(self._skill_packs_dir, d)))

        # 规则数
        rules_dir = os.path.join(self._data_dir, "experience", "rules")
        if os.path.isdir(rules_dir):
            rule_count = len([f for f in os.listdir(rules_dir) if f.endswith(".yaml")])

        # 资产数
        index_path = os.path.join(self._data_dir, "assets", "index.json")
        if os.path.isfile(index_path):
            try:
                with open(index_path, encoding="utf-8") as f:
                    asset_count = len(json.load(f))
            except Exception:
                pass

        # 联动进化日志
        evo_log = self.get_evolution_log()

        return {
            "skill_packs": skill_count,
            "rules": rule_count,
            "assets": asset_count,
            "total_evolutions": len(evo_log),
            "recent_evolutions": evo_log[:5],
        }

    def get_evolution_log(self) -> list[dict]:
        """获取联动进化日志"""
        try:
            if os.path.isfile(self._evolution_log_path):
                with open(self._evolution_log_path, encoding="utf-8") as f:
                    return list(reversed(json.load(f)))
        except Exception:
            pass
        return []

    def _log_network_evolution(self, rule_id: str, evolved_rule_id: str, result: dict) -> None:
        """记录联动进化事件"""
        from datetime import datetime, timezone
        entry = {
            "rule_id": rule_id,
            "evolved_rule_id": evolved_rule_id,
            "updated_skills": result["updated_skills"],
            "updated_assets": result["updated_assets"],
            "propagated": result["propagated"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            log = []
            if os.path.isfile(self._evolution_log_path):
                with open(self._evolution_log_path, encoding="utf-8") as f:
                    log = json.load(f)
            log.append(entry)
            tmp = self._evolution_log_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._evolution_log_path)
        except Exception:
            logger.exception("Failed to log network evolution")
