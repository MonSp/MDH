#!/usr/bin/env python3
"""CI Guard: 进化系统健康度门禁

受 Cumora guard:big-brain 启发，把进化系统的健康度检查做成 CI 门禁。

检查项：
1. 反思优先级：是否有 critical 领域
2. 规则多样性：是否存在领域过度集中
3. 进化成功率：进化后的规则是否真的变好了
4. 联邦健康：团队信任评分是否过低

退出码：
  0 = 所有检查通过
  1 = 存在需要关注的问题（不阻塞合并，但报告）
  2 = 存在紧急问题（阻塞合并）
"""

import os
import sys

# 数据目录
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
_DATA_DIR = os.path.join(_BACKEND_DIR, "data")
sys.path.insert(0, _BACKEND_DIR)


def check_reflection_priority():
    """检查反思优先级队列"""
    # sys.path already set at module level
    try:
        from reflection_priority import ReflectionPriorityQueue
        queue = ReflectionPriorityQueue(_DATA_DIR)
        result = queue.compute_priorities()
        summary = result.get("summary", {})

        critical = summary.get("critical", 0)
        needs_attention = summary.get("needs_attention", 0)
        total = summary.get("total_domains", 0)
        no_data = summary.get("no_data", False)

        if no_data:
            print("  ℹ️ 无经验数据，跳过反思优先级检查")
            return 0, result

        print(f"  领域总数: {total}")
        print(f"  健康: {summary.get('healthy', 0)} | 需关注: {needs_attention} | 紧急: {critical}")

        if critical > 0:
            print(f"  ❌ {critical} 个领域处于紧急状态")
            return 2, result
        elif needs_attention > 0:
            print(f"  ⚠️ {needs_attention} 个领域需要关注")
            return 1, result
        else:
            print("  ✅ 所有领域健康")
            return 0, result
    except Exception as e:
        print(f"  ⚠️ 反思优先级检查失败: {e}")
        return 1, {}


def check_evolution_diversity():
    """检查进化多样性"""
    # sys.path already set at module level
    try:
        from experience_extractor import ExperienceExtractor
        extractor = ExperienceExtractor(incremental_dir=os.path.join(_DATA_DIR, "experience"))
        evolution_log = extractor.get_evolution_log()

        if not evolution_log:
            print("  进化日志为空，跳过多样性检查")
            return 0

        # 统计近期进化的 rule_type 分布
        recent = evolution_log[:20]
        type_counts = {}
        for entry in recent:
            rule_id = entry.get("original_rule_id", "")
            rule = extractor._load_rule(rule_id)
            if rule:
                rt = rule.rule_type
                type_counts[rt] = type_counts.get(rt, 0) + 1

        total = sum(type_counts.values())
        max_type = max(type_counts.values()) if type_counts else 0
        concentration = max_type / total if total > 0 else 0

        print(f"  近期进化 {total} 条，类型分布: {type_counts}")
        print(f"  最高集中度: {concentration:.0%}")

        if concentration > 0.7:
            print(f"  ❌ 进化过度集中在单一类型（{concentration:.0%} > 70%）")
            return 2
        elif concentration > 0.5:
            print(f"  ⚠️ 进化偏向单一类型（{concentration:.0%} > 50%）")
            return 1
        else:
            print("  ✅ 进化多样性良好")
            return 0
    except Exception as e:
        print(f"  ⚠️ 多样性检查失败: {e}")
        return 1


def check_evolution_success_rate():
    """检查进化成功率"""
    # sys.path already set at module level
    try:
        from reflection_priority import ReflectionPriorityQueue
        queue = ReflectionPriorityQueue(_DATA_DIR)
        result = queue.compute_priorities()
        evo_stats = result.get("evolution_stats", {})

        total = evo_stats.get("total", 0)
        success_rate = evo_stats.get("success_rate", 0)

        if total == 0:
            print("  无进化记录，跳过成功率检查")
            return 0

        print(f"  进化总数: {total}，成功率: {success_rate:.0%}")

        if success_rate < 0.3:
            print(f"  ❌ 进化成功率过低（{success_rate:.0%} < 30%）")
            return 2
        elif success_rate < 0.5:
            print(f"  ⚠️ 进化成功率偏低（{success_rate:.0%} < 50%）")
            return 1
        else:
            print("  ✅ 进化成功率健康")
            return 0
    except Exception as e:
        print(f"  ⚠️ 成功率检查失败: {e}")
        return 1


def check_federation_health():
    """检查联邦健康"""
    # sys.path already set at module level
    try:
        from team_federation import TeamFederation
        federation = TeamFederation(_DATA_DIR)
        stats = federation.get_federation_stats()

        total = stats.get("total_evolutions", 0)
        trust_scores = stats.get("team_trust_scores", {})

        if total == 0:
            print("  无联邦进化记录，跳过")
            return 0

        low_trust_teams = [t for t, s in trust_scores.items() if s < 0.3]

        print(f"  联邦进化: {total} 条，团队信任: {trust_scores}")

        if low_trust_teams:
            print(f"  ⚠️ 低信任团队: {', '.join(low_trust_teams)}")
            return 1
        else:
            print("  ✅ 联邦健康")
            return 0
    except Exception as e:
        print(f"  ⚠️ 联邦检查失败: {e}")
        return 1


def main():
    print("🔍 进化系统健康度门禁检查...\n")

    severity = 0

    print("[1/4] 反思优先级")
    code, _ = check_reflection_priority()
    severity = max(severity, code)

    print("\n[2/4] 进化多样性")
    code = check_evolution_diversity()
    severity = max(severity, code)

    print("\n[3/4] 进化成功率")
    code = check_evolution_success_rate()
    severity = max(severity, code)

    print("\n[4/4] 联邦健康")
    code = check_federation_health()
    severity = max(severity, code)

    print(f"\n{'='*50}")
    if severity == 0:
        print("✅ 进化系统健康度：全部通过")
    elif severity == 1:
        print("⚠️ 进化系统健康度：有需关注项（不阻塞合并）")
    else:
        print("❌ 进化系统健康度：有紧急问题（阻塞合并）")

    sys.exit(severity)


if __name__ == "__main__":
    main()
