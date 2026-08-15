"""
LLM judge 真实 key 试点：验证 AssetEvaluator 的 judge seam 在真实 DeepSeek LLM 下的全链路。

设计 [S4]：judge 可注入（默认 None 跳过，试点接真实 key）。本脚本：
  1. 用标准库 urllib 直调 DeepSeek OpenAI 兼容 API（零新依赖，judge 是轻量单次调用）
  2. 构造 make_llm_judge(api_key, base_url, model) → Callable[[dict], float]
  3. AssetEvaluator(store, judge=llm_judge) 真实评测合成资产（好/差模板、好/差产出物）
  4. 验收清单：judge 调用成功（分数可解析）/ 好资产分数高于差资产（排序关系）/ 组合 evaluate 正确 / 无 judge 回退

运行方式：
  cd backend
  KEY=$(grep -E '^DEEPSEEK_API_KEY=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
  BASE=$(grep -E '^DEEPSEEK_BASE_URL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
  MODEL=$(grep -E '^DEEPSEEK_MODEL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
  /home/test/miniconda3/envs/agentscope/bin/python pilot_judge.py --api-key "$KEY" --base-url "$BASE" --model "$MODEL"

  --benchmark 模式：内置标注集跑 evaluate_judge，打印 accuracy/mae/区分度 与逐条分数
  /home/test/miniconda3/envs/agentscope/bin/python pilot_judge.py --api-key "$KEY" --base-url "$BASE" --model "$MODEL" --benchmark
"""

import argparse
import os
import tempfile

from asset_evaluator import AssetEvaluator
from asset_judge import make_llm_judge
from asset_judge_benchmark import BENCHMARK_ITEMS, evaluate_judge
from asset_store import AssetStore

JUDGE_THRESHOLD = 0.5  # 与 asset_evaluator._JUDGE_THRESHOLD 一致

# 合成资产样例（确定性检查全过，只让 judge 区分好坏）
GOOD_TEMPLATE = {
    "type": "template",
    "title": "会议纪要模板",
    "content": (
        "标题：会议纪要\n"
        "时间：2026-08-15\n"
        "参加人：市场部、研发部、销售部\n"
        "一、会议要点\n"
        "确定新产品 8 月 15 日上线，市场部负责宣传物料，研发部负责版本冻结。\n"
        "二、决策\n"
        "上线日期确定为 8 月 15 日，不做延期。\n"
        "三、待办\n"
        "市场部：完成宣传物料（责任人：李娜，截止 8 月 10 日）\n"
        "研发部：完成版本冻结（责任人：王强，截止 8 月 12 日）\n"
        "销售部：准备客户通知（责任人：张伟，截止 8 月 13 日）\n"
    ),
}
BAD_TEMPLATE = {
    "type": "template",
    "title": "会议纪要模板",
    "content": (
        "标题：会议纪要\n"
        "今天开会讨论了新产品发布的事情，大家同意 8 月 15 日上线。\n"
        "具体谁负责什么后面再说吧，先把日期定下来。\n"
    ),
}
GOOD_ARTIFACT = {
    "type": "artifact",
    "title": "会议纪要-0815",
    "content": (
        "会议确定新产品 8 月 15 日上线。\n"
        "市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。\n"
        "所有待办均指定了责任人与截止日期。\n"
    ),
}
BAD_ARTIFACT = {
    "type": "artifact",
    "title": "会议纪要-0815",
    "content": "开了个会，说了说发布的事。",
}


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


def run_benchmark(judge, model: str) -> None:
    """评测基准模式：evaluate_judge 打印各指标 + 逐条分数（资产标题 + judge 分数 + gold + 判定一致/不一致）。"""
    print("=" * 60)
    print("  LLM judge 评测基准（模型: %s）" % model)
    print("=" * 60)
    result = evaluate_judge(judge)
    for item in BENCHMARK_ITEMS:
        score = float(judge(item.asset))
        match = (score >= JUDGE_THRESHOLD) == item.gold_pass
        print(f"  [{'一致' if match else '不一致'}] {item.asset['title']}: "
              f"judge={score:.3f} gold={item.gold_score:.3f}")
    print("=" * 60)
    print(f"  accuracy={result.accuracy:.2f} mae={result.mae:.3f} "
          f"good_mean={result.good_mean:.3f} bad_mean={result.bad_mean:.3f} "
          f"sep={result.sep:.3f}")
    print("=" * 60)
    raise SystemExit(0)


def run(args: argparse.Namespace) -> None:
    judge = make_llm_judge(args.api_key, args.base_url, args.model)

    if args.benchmark:
        run_benchmark(judge, args.model)
        return

    with tempfile.TemporaryDirectory() as tmp:
        store = AssetStore(tmp)
        evaluator = AssetEvaluator(store, judge=judge)

        samples = [
            ("好模板", dict(GOOD_TEMPLATE, team_id="team-x")),
            ("差模板", dict(BAD_TEMPLATE, team_id="team-x")),
            ("好产出物", dict(GOOD_ARTIFACT, team_id="team-x")),
            ("差产出物", dict(BAD_ARTIFACT, team_id="team-x")),
        ]

        print("=" * 60)
        print("  LLM judge 真实评测结果（模型: %s）" % args.model)
        print("=" * 60)
        results = {}
        for name, asset in samples:
            result = evaluator.evaluate(asset)
            results[name] = result
            print(f"  {name}: judge_score={result.judge_score} passed={result.passed} "
                  f"checks={result.checks} reason={result.reason!r}")

        checks = []
        # 验收 1: 所有 judge 调用成功（分数非 None 且 0-1）
        ok1 = all(r.judge_score is not None and 0.0 <= r.judge_score <= 1.0 for r in results.values())
        checks.append(check("judge 调用成功（分数可解析且在 0-1 区间）", ok1,
                             ", ".join(f"{k}={v.judge_score}" for k, v in results.items())))

        # 验收 2: 好资产分数高于差资产（排序关系，容忍 LLM 随机性）
        ok2 = results["好模板"].judge_score > results["差模板"].judge_score
        ok3 = results["好产出物"].judge_score > results["差产出物"].judge_score
        checks.append(check("好模板分数 > 差模板分数（排序关系）", ok2,
                             f"{results['好模板'].judge_score} vs {results['差模板'].judge_score}"))
        checks.append(check("好产出物分数 > 差产出物分数（排序关系）", ok3,
                             f"{results['好产出物'].judge_score} vs {results['差产出物'].judge_score}"))

        # 验收 3: judge 与确定性检查组合——好资产 passed（checks 全过 + judge>=阈值）
        ok4 = results["好模板"].passed and results["好产出物"].passed
        checks.append(check("好资产整体 passed（checks + judge 组合）", ok4))

        # 验收 4: 无 judge 回退（judge=None 时 judge_score=None 且仅确定性检查）
        plain = AssetEvaluator(store).evaluate(dict(GOOD_TEMPLATE, team_id="team-x"))
        ok5 = plain.judge_score is None and plain.passed
        checks.append(check("无 judge 回退（judge_score=None，仅确定性检查）", ok5))

        # 验收 5: 阈值行为——passed 与 judge_score>=0.5 一致
        ok6 = all(r.passed == (all(r.checks.values()) and (r.judge_score or 0) >= JUDGE_THRESHOLD)
                  for r in results.values())
        checks.append(check("passed 与 judge>=阈值语义一致", ok6))

    print(f"\n{'=' * 60}\n  LLM judge 试点结果: {'全部通过' if all(checks) else '存在未通过项'}\n{'=' * 60}")
    raise SystemExit(0 if all(checks) else 1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="LLM judge 真实 key 试点")
    p.add_argument("--api-key", required=True, help="DeepSeek API key")
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"))
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    p.add_argument("--benchmark", action="store_true",
                   help="评测基准模式：内置标注集跑 evaluate_judge，打印指标与逐条分数")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
