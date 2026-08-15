# [M4] 沉淀闭环增强 Design

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> 2026-08-15 建立。承接 M3 沉淀闭环（main@db2904a 含 LLM judge 接入）的后续增强：设计 [S5] 第 42 行"资产复用：意图识别时检索知识库/模板/技能注入"的 DAG 节点级落地 + LLM judge 评测基准（仿 AIP Evals 指标）。经用户逐节确认（范围/接线点/形态）。

## [S1] Goal

让沉淀闭环"闭环"起来：
1. **资产复用注入**——纪要 DAG 节点执行时自动检索并注入团队资产（模板/知识/技能规则），指导 extract/draft 生成（设计 [S5] 第 42 行，M3 仅交付检索 API 未接线）。
2. **评测基准**——量化 LLM judge 质量（准确率/校准/区分度，仿 AIP Evals），使评测把关可验证。

**范围（用户确认）**：注入接线 + 评测基准两项。

## [S2] Solution overview

| 组件 | 文件 | 职责 |
|------|------|------|
| AssetContextBuilder | 新增 `backend/asset_injection.py` | `build_asset_context(store, extractor, team_id, task_type, keywords) -> str`——AssetSearch.search（M3）→ 格式化注入文本（模板标题+要点 / 知识节选 / 技能规则 trigger+action；摘要目录 + 按需加载——设计 [S5] 技能渐进披露 P-5.11）；无资产 → 空串 |
| 节点 prompt 注入 | 修改 `backend/meeting_coordinator.py` `_execute_workflow_node` | 节点 prompt 追加"资产参考"段（非空时）；**注入 seam**：coordinator 可选 `_asset_context_builder`（None=不注入，向后兼容） |
| 评测基准模块 | 新增 `backend/asset_judge_benchmark.py` | 内置标注集 + `evaluate_judge(judge, items=None) -> BenchmarkResult` |
| 试点脚本 | 扩展 `backend/pilot_judge.py`（--benchmark 或独立函数） | 真实 key 跑基准 → 打印指标 |

**关键决策（用户确认）**：
1. 范围：注入接线 + 评测基准（全做）
2. 接线点：DAG 节点 prompt 注入（产品价值最直接——下次任务自动用资产）；非意图识别层
3. 评测基准：内置标注集 + 准确率/校准/区分度指标；真实 key 试点脚本

## [S3] Asset injection (资产复用注入)

**AssetContextBuilder**（`backend/asset_injection.py`）：

```python
def build_asset_context(store, extractor, team_id, task_type="", keywords=None) -> str:
    """检索团队资产并格式化为注入文本；无资产返回空串（注入零成本）。"""
    result = AssetSearch(store, extractor).search(team_id, task_type=task_type, keywords=keywords)
    # 摘要目录 + 按需加载（渐进披露）：
    #   模板：最多 3 条，标题 + 要点前 3 行
    #   知识（产出物）：最多 3 条，标题 + 内容前 100 字符
    #   技能规则：最多 3 条，trigger_condition + action 前 100 字符
    # 格式："\n[资产参考]\n- 模板「标题」：要点\n- 知识「标题」：摘要\n- 规则：trigger → action"
    # 全部为空 → ""
```

- 消费 AssetSearch（M3 已交付）；`store`/`extractor` 注入（可测，零新依赖）。
- 团队隔离：team_id 传入 AssetSearch（资产 per-team 目录）。

**节点 prompt 注入**（`backend/meeting_coordinator.py` `_execute_workflow_node`）：

- MeetingCoordinator 新增可选属性 `_asset_context_builder: Callable[..., str] | None`（构造时可选注入；None=不注入——既有调用零变化）。
- `_execute_workflow_node` 的 prompt 构造处（:342-345 "输入数据"段后）：builder 存在且节点为 dept-docs（纪要类）时，检索注入：

```python
asset_context = ""
if self._asset_context_builder is not None:
    asset_context = self._asset_context_builder(
        team_id=<团队标识>, task_type="minutes", keywords=["纪要", "待办"],
    )
# prompt 追加（非空时）：
#   f"\n资产参考：\n{asset_context}"
```

- **team_id 来源**：优先节点 `input_spec` 中的 `team_id`（若演示/试点传入）；否则回落 session project_id 派生或空（空则不注入——团队隔离不跨团队泄漏）。以实际代码为准，读 `_execute_workflow_node` 可用的上下文（node/meeting/session）。
- **边界**：builder 抛异常 → 注入失败不影响节点执行（try/except 吞掉，资产参考是增强非必需）；无资产（空串）→ 不追加段。

## [S4] Judge benchmark (评测基准)

**内置标注集**（`backend/asset_judge_benchmark.py`）：

```python
@dataclass
class BenchmarkItem:
    asset: dict          # type/title/content/team_id（与 AssetEvaluator 消费一致）
    gold_score: float    # 期望分数（人工标注）
    gold_pass: bool      # 期望判定（judge_score >= 0.5 是否通过）

BENCHMARK_ITEMS = [
    # 好模板（结构化完整）→ 0.85 / True
    # 差模板（内容单薄）→ 0.3 / False
    # 好产出物（完整）→ 0.8 / True
    # 差产出物（一句话）→ 0.2 / False
    # 各 2 条共 8 条（扩展 pilot_judge 样例）
]
```

**评估**（`evaluate_judge(judge, items=None) -> BenchmarkResult`）：

```python
@dataclass
class BenchmarkResult:
    accuracy: float      # judge_score>=0.5 判定 vs gold_pass 一致率
    mae: float           # |judge_score - gold_score| 均值（校准）
    good_mean: float     # gold_pass=True 条目的 judge 均分
    bad_mean: float      # gold_pass=False 条目的 judge 均分
    sep: float           # good_mean - bad_mean（区分度，>0.2 可接受）
```

- `evaluate_judge` 直接调 judge 逐条评测（真实 key 时 LLM 调用；单测用 fake judge）。
- 判定阈值 0.5 与 AssetEvaluator `_JUDGE_THRESHOLD` 一致。

**试点脚本**：`pilot_judge.py` 扩展 `--benchmark` 参数（或独立函数）——构造 make_llm_judge（真实 key）→ `evaluate_judge` → 打印各指标 + 逐条分数（复用 asset_judge.make_llm_judge，M3 已产品化）。

## [S5] Implementation tasks & acceptance

**3 任务（每任务 TDD + 双评审闭环，计划另立）**：

| # | 任务 | 覆盖 |
|---|------|------|
| T1 | AssetContextBuilder（asset_injection.py + 测试） | [S3] |
| T2 | 节点 prompt 注入（meeting_coordinator seam + 测试） | [S3] |
| T3 | 评测基准（asset_judge_benchmark.py + pilot_judge 扩展 + 测试） | [S4] |

**里程碑验收**：T1-T3 双评审闭环 + 后端全量回归绿（1091 基线）+ 注入 seam 零影响既有调用（None 默认）+ 评测基准 fake judge 单测全绿。真实 key 评测基准试点 = 扩展 pilot_judge 直驱（与 M2/M3 试点模式一致）。

**边界与错误处理**：
- 注入是增强非必需：builder 异常吞掉、无资产空串、seam 默认 None——既有纪要链路零行为变化。
- team_id 隔离：无团队标识时不注入（不跨团队泄漏资产）。
- 评测基准标注集为内置演示数据（试点部门真实标注集后续可外部化）。
