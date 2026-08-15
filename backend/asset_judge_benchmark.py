"""LLM judge 评测基准：人工标注资产集评估 judge 准确率/校准/区分度。

设计 [S4]：仿 AIP Evals 指标——accuracy（判定一致率）、mae（分数校准）、
good_mean-bad_mean（区分度）。标注集为内置演示数据（试点部门真实标注集后续外部化）。
"""

from dataclasses import dataclass

_JUDGE_THRESHOLD = 0.5  # 与 AssetEvaluator._JUDGE_THRESHOLD 一致


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


def evaluate_judge(judge, items=None) -> BenchmarkResult:
    """逐条评测 judge（0-1 分数），输出准确率/校准/区分度指标。"""
    items = items if items is not None else BENCHMARK_ITEMS
    correct = 0
    abs_errors = []
    good_scores, bad_scores = [], []
    for item in items:
        score = float(judge(item.asset))
        if (score >= _JUDGE_THRESHOLD) == item.gold_pass:
            correct += 1
        abs_errors.append(abs(score - item.gold_score))
        (good_scores if item.gold_pass else bad_scores).append(score)
    good_mean = sum(good_scores) / len(good_scores) if good_scores else 0.0
    bad_mean = sum(bad_scores) / len(bad_scores) if bad_scores else 0.0
    return BenchmarkResult(
        accuracy=correct / len(items),
        mae=sum(abs_errors) / len(abs_errors),
        good_mean=good_mean,
        bad_mean=bad_mean,
    )
