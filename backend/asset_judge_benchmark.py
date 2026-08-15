"""LLM judge 评测基准：人工标注资产集评估 judge 准确率/校准/区分度。

设计 [S4]：仿 AIP Evals 指标——accuracy（判定一致率）、mae（分数校准）、
good_mean-bad_mean（区分度）。标注集为内置演示数据 + JSON 文件外部加载
（load_benchmark_items）；试点部门真实标注集可放 data/benchmark_items.json。
"""

import json
from dataclasses import dataclass, field

from asset_evaluator import _JUDGE_THRESHOLD


@dataclass
class BenchmarkItem:
    asset: dict
    gold_score: float
    gold_pass: bool


@dataclass
class BenchmarkResult:
    accuracy: float
    mae: float
    good_mean: float
    bad_mean: float
    per_item: list = field(default_factory=list)  # 逐条 {title, judge_score, gold_score, gold_pass, correct}

    @property
    def sep(self) -> float:
        return self.good_mean - self.bad_mean


BENCHMARK_ITEMS = [
    # 好模板：结构化完整（标题/要点/决策/待办含责任人）
    BenchmarkItem(asset={"type": "template", "title": "发布计划模板-结构化",
                         "content": "标题：发布计划\n要点：确定 8 月 15 日上线\n决策：不做延期\n待办：市场部宣传物料（李娜，8/10）\n待办：研发部版本冻结（王强，8/12）"},
                  gold_score=0.85, gold_pass=True),
    BenchmarkItem(asset={"type": "template", "title": "会议纪要模板-完整",
                         "content": "标题：会议纪要\n参加人：市场部、研发部\n要点：新产品 8 月 15 日上线\n决策：日期确定\n待办：宣传物料（李娜，8/10）\n待办：客户通知（张伟，8/13）"},
                  gold_score=0.85, gold_pass=True),
    # 差模板：内容单薄、无待办责任人
    BenchmarkItem(asset={"type": "template", "title": "会议纪要模板-单薄",
                         "content": "标题：会议纪要\n今天开会讨论了发布的事情，大家同意 8 月 15 日上线。\n具体谁负责后面再说。"},
                  gold_score=0.3, gold_pass=False),
    BenchmarkItem(asset={"type": "template", "title": "发布计划模板-草率",
                         "content": "标题：发布计划\n定了 8 月 15 日上线。"},
                  gold_score=0.2, gold_pass=False),
    # 好产出物：完整纪要
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0815-完整",
                         "content": "会议确定新产品 8 月 15 日上线。\n市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。\n所有待办均指定责任人与截止日期。"},
                  gold_score=0.8, gold_pass=True),
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0814-完整",
                         "content": "会议讨论预算调整。\n财务部负责更新预算表（张伟，8/20），市场部确认宣传预算（李娜，8/18）。\n下次评审定于 8 月 25 日。"},
                  gold_score=0.8, gold_pass=True),
    # 差产出物：一句话/无结构
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0815-简略", "content": "开了个会，说了说发布的事。"},
                  gold_score=0.2, gold_pass=False),
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0814-简略", "content": "讨论了预算。"},
                  gold_score=0.15, gold_pass=False),
]


def load_benchmark_items(path: str) -> list[BenchmarkItem]:
    """从 JSON 文件加载标注集（外部化：试点部门真实标注集可注入）。

    格式：`[{"asset": {"type","title","content","team_id"}, "gold_score": 0-1, "gold_pass": bool}]`；
    校验 gold_pass 与 gold_score 阈值一致（不一致抛 ValueError）；文件缺失/非法 JSON 抛清晰异常。
    """
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise ValueError(f"标注集 {path} 应为 JSON 数组，实际: {type(raw).__name__}")
    items = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError(f"标注集 {path} 条目应为对象: {entry!r}")
        asset = entry.get("asset")
        if not isinstance(asset, dict):
            raise ValueError(f"标注集 {path} 条目缺 asset dict: {entry!r}")
        gold_score = entry.get("gold_score")
        gold_pass = entry.get("gold_pass")
        if (not isinstance(gold_score, (int, float)) or isinstance(gold_score, bool)
                or not 0.0 <= gold_score <= 1.0):
            raise ValueError(f"gold_score 非法: {gold_score!r}")
        if not isinstance(gold_pass, bool):
            raise ValueError(f"gold_pass 非法: {gold_pass!r}")
        if gold_pass != (gold_score >= _JUDGE_THRESHOLD):
            raise ValueError(f"gold_pass 与 gold_score 阈值不一致: {entry!r}")
        items.append(BenchmarkItem(asset=asset, gold_score=float(gold_score), gold_pass=gold_pass))
    return items


def evaluate_judge(judge, items=None) -> BenchmarkResult:
    """逐条评测 judge（0-1 分数），输出准确率/校准/区分度指标与逐条结果（单遍调用，per_item 与汇总同源）。"""
    items = items if items is not None else BENCHMARK_ITEMS
    if not items:
        return BenchmarkResult(0.0, 0.0, 0.0, 0.0)
    correct = 0
    abs_errors = []
    good_scores, bad_scores = [], []
    per_item = []
    for item in items:
        score = float(judge(item.asset))
        is_correct = (score >= _JUDGE_THRESHOLD) == item.gold_pass
        if is_correct:
            correct += 1
        abs_errors.append(abs(score - item.gold_score))
        (good_scores if item.gold_pass else bad_scores).append(score)
        per_item.append({
            "title": item.asset.get("title", ""),
            "judge_score": score,
            "gold_score": item.gold_score,
            "gold_pass": item.gold_pass,
            "correct": is_correct,
        })
    good_mean = sum(good_scores) / len(good_scores) if good_scores else 0.0
    bad_mean = sum(bad_scores) / len(bad_scores) if bad_scores else 0.0
    return BenchmarkResult(
        accuracy=correct / len(items),
        mae=sum(abs_errors) / len(abs_errors),
        good_mean=good_mean,
        bad_mean=bad_mean,
        per_item=per_item,
    )
