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

    def propagate_rule_evolution(self, rule_id: str, evolved_rule_id: str, keywords: list[str]) -> dict:
        """规则进化后的联动传播

        Args:
            rule_id: 原规则 ID
            evolved_rule_id: 进化后的规则 ID
            keywords: 规则关键词（用于匹配技能包）

        Returns:
            {"updated_skills": [...], "updated_assets": [...], "propagated": int}
        """
        result = {"updated_skills": [], "updated_assets": [], "propagated": 0}

        # 1. 找到关联的技能包
        related_skills = self._find_related_skills(keywords)
        result["updated_skills"] = related_skills

        # 2. 更新技能包中的规则
        for skill_name in related_skills:
            updated = self._update_skill_pack_rules(skill_name, rule_id, evolved_rule_id)
            if updated:
                result["propagated"] += 1

        # 3. 找到关联的资产
        related_assets = self._find_related_assets(keywords)
        result["updated_assets"] = related_assets

        # 4. 标记关联资产需要重新评估
        for asset_id in related_assets:
            self._flag_asset_for_reeval(asset_id)

        # 5. 记录联动进化日志
        self._log_network_evolution(rule_id, evolved_rule_id, result)

        logger.info("规则 %s 联动进化: 更新 %d 个技能包, 标记 %d 个资产",
                     rule_id, len(related_skills), len(related_assets))
        return result

    def _find_related_skills(self, keywords: list[str]) -> list[str]:
        """根据关键词找到相关的技能包"""
        related = []
        if not os.path.isdir(self._skill_packs_dir):
            return related

        for skill_name in os.listdir(self._skill_packs_dir):
            skill_path = os.path.join(self._skill_packs_dir, skill_name)
            if not os.path.isdir(skill_path):
                continue

            # 检查 manifest.yaml 中的 keywords
            manifest_path = os.path.join(skill_path, "manifest.yaml")
            if os.path.isfile(manifest_path):
                try:
                    import yaml
                    with open(manifest_path, encoding="utf-8") as f:
                        manifest = yaml.safe_load(f)
                    skill_keywords = set(manifest.get("keywords", []))
                    if skill_name in keywords or skill_keywords & set(keywords):
                        related.append(skill_name)
                except Exception:
                    pass

            # 也检查技能包名称是否在关键词中
            if skill_name in keywords:
                related.append(skill_name)

        return list(set(related))

    def _find_related_assets(self, keywords: list[str]) -> list[str]:
        """根据关键词找到相关的资产"""
        related = []
        assets_dir = os.path.join(self._data_dir, "assets")
        if not os.path.isdir(assets_dir):
            return related

        index_path = os.path.join(assets_dir, "index.json")
        if not os.path.isfile(index_path):
            return related

        try:
            with open(index_path, encoding="utf-8") as f:
                index = json.load(f)
            for asset in index:
                asset_keywords = set(asset.get("keywords", []) if isinstance(asset.get("keywords"), list) else [])
                title = asset.get("title", "")
                if asset_keywords & set(keywords) or any(kw in title for kw in keywords):
                    related.append(asset.get("asset_id", ""))
        except Exception:
            pass

        return [a for a in related if a]

    def _update_skill_pack_rules(self, skill_name: str, old_rule_id: str, new_rule_id: str) -> bool:
        """更新技能包中的规则引用"""
        rules_dir = os.path.join(self._skill_packs_dir, skill_name, "rules")
        if not os.path.isdir(rules_dir):
            return False

        updated = False
        for fname in os.listdir(rules_dir):
            if not fname.endswith((".yaml", ".yml")):
                continue
            fpath = os.path.join(rules_dir, fname)
            try:
                import yaml
                with open(fpath, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                rules_list = data.get("rules", [])
                for rule_data in rules_list:
                    if rule_data.get("rule_id") == old_rule_id:
                        rule_data["rule_id"] = new_rule_id
                        rule_data["evolved"] = True
                        with open(fpath, "w", encoding="utf-8") as f:
                            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
                        updated = True
                        logger.info("技能包 %s 规则 %s 已更新为 %s", skill_name, old_rule_id[:8], new_rule_id[:8])
            except Exception:
                pass

        return updated

    def _flag_asset_for_reeval(self, asset_id: str) -> None:
        """标记资产需要重新评估"""
        assets_dir = os.path.join(self._data_dir, "assets")
        index_path = os.path.join(assets_dir, "index.json")
        if not os.path.isfile(index_path):
            return

        try:
            with open(index_path, encoding="utf-8") as f:
                index = json.load(f)
            for asset in index:
                if asset.get("asset_id") == asset_id:
                    asset["needs_reeval"] = True
                    asset["reeval_reason"] = "related_rule_evolved"
                    break
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(index, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

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
