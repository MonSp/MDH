# [M3] 沉淀闭环 Design

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> 2026-08-14 建立。承接总设计 `2026-08-14-hybrid-team-platform-design.md` 的 [S5] M3 里程碑（9-12 周）：沉淀闭环。本设计经用户逐节确认（范围/存储/评测/触发/确认/复用 6 项决策）。

## [S1] Goal

让"沉淀"成为全链路第 6-7 步的落地点：三类资产（产出物/模板/经验技能）在平台内沉淀、评测把关、按需复用，实现 **"试点部门 50%+ 纪要任务走平台；资产复用率可感知"**（总设计 [S5] M3 验收）。

**范围（用户确认：全做）**：知识库入库 · 模板固化（员工确认 + 资产评测把关）· 技能进化（把关差异提炼）· 资产复用注入。

## [S2] Solution overview

| 组件 | 文件 | 职责 |
|------|------|------|
| AssetStore | 新增 `backend/asset_store.py` | 知识库（产出物）+ 模板库统一存储：团队级目录 + JSON 索引；`store_artifact` / `store_template`（需确认+评测）/ `search` / `list_assets` |
| AssetEvaluator | 新增 `backend/asset_evaluator.py` | 评测把关：确定性检查 + LLM judge seam（仿 AIP Evals）；`evaluate(asset) -> EvaluationResult` |
| 模板固化确认 | 复用 `ApprovalManager` | 评测通过 → `request_gate(approver)` → 员工批准 → 入库 approved；拒绝 → 不入库（审计成对） |
| 技能进化接线 | 复用 `ExperienceExtractor` | 把关差异 → `extract_from_meeting`（既有 :606）→ `write_to_incremental_area`（CoW 增量区） |
| 资产复用检索 | AssetStore.search + 复用 `retrieve_relevant_rules` | 知识库/模板新检索（类型+关键词）；技能复用既有检索（task_orchestrator:489 同款） |

**关键决策（用户确认）**：
1. 范围：M3 全做（5 子系统一次覆盖）
2. 存储：文件系统 + JSON 索引（与 skill_packs/experience_extractor 增量区同构，零新依赖，`data/assets/` gitignore）
3. 评测：确定性检查为主 + LLM judge 可注入 seam（judge 默认 None 跳过，试点接真实 key；单测用 fake judge）
4. 触发：演示端点（/api/assets/*）+ 程序化 API（后端模块直接调用）
5. 员工确认：复用 ApprovalManager（模板固化 = 一个 gate 请求，把关决定即入库许可）
6. 复用注入：知识库/模板用新 AssetStore.search，技能复用既有 ExperienceExtractor 检索；演示端点合并返回

## [S3] Data model & storage

**目录布局**（团队级隔离）：

```
data/assets/<team_id>/
├── index.json              # 资产索引（团队级，单一事实源）
├── artifacts/<asset_id>.json   # 产出物
└── templates/<asset_id>.json   # 模板
```

**资产记录**（JSON）：

```json
{
  "asset_id": "art-<ts>-<hex8>",
  "type": "artifact | template",
  "title": "...",
  "content": "...",
  "source_task_id": "minutes-<sha>",
  "team_id": "...",
  "status": "proposed | approved",
  "approved_by": "emp-001",
  "created_at": "ISO",
  "checks": {"completeness": true, "structure": true, "duplicate": false, "quality": true},
  "judge_score": null
}
```

**AssetStore 接口**：

```python
class AssetStore:
    def __init__(self, base_dir: str): ...          # 默认 data/assets
    def store_artifact(self, team_id, title, content, source_task_id="") -> dict   # 直接入库（status=approved）
    def propose_template(self, team_id, title, content, source_task_id="", approver="") -> str  # → asset_id（status=proposed）
    def approve_template(self, asset_id, approver) -> bool    # 员工批准 → status=approved
    def reject_template(self, asset_id, reason) -> bool       # 拒绝 → 删除资产文件并从索引移除（不入库语义，审计由 gate 层记录）
    def search(self, team_id, query="", asset_type="") -> list[dict]   # 类型 + 标题/内容关键词匹配
    def list_assets(self, team_id, status=None) -> list[dict]
    def get(self, asset_id) -> dict | None
```

- 去重：同团队同类型同标题（规范化后）hash 检测，`checks.duplicate` 为 False 时评测不过。
- 团队级隔离：目录 per team；跨团队搜索不返回。
- 索引写：每次变更原子写 `index.json`（先写临时文件再 rename）；加载时容错（缺索引重建）。

## [S4] Asset evaluator (评测把关)

仿 AIP Evals：确定性检查 + LLM judge。

```python
@dataclass
class EvaluationResult:
    passed: bool
    checks: dict            # completeness/structure/duplicate/quality → bool
    judge_score: float | None
    reason: str = ""

class AssetEvaluator:
    def __init__(self, judge: Callable[[dict], float] | None = None): ...  # judge seam：输入资产 dict，返回 0-1 分数；None=跳过
    def evaluate(self, asset: dict) -> EvaluationResult:
        # 确定性检查（全部过才 passed）：
        #   completeness: title/content 非空
        #   structure: 模板含必需节（标题/要点/待办/分发 关键词启发式——content 含 ≥2 个标题行或关键节标记）
        #   duplicate: 团队内同类型同标题不重复（AssetStore 提供）
        #   quality: content 长度 ≥ 阈值（产出物 20 字，模板 50 字）
        # judge: judge 存在时 judge_score >= 0.5 才算过（judge 默认 None → 跳过）
```

- 确定性检查是主门槛（纯代码可测）；judge seam 与 mailer/doc_tools seam 同模式（注入可测、缺省降级）。
- 评测结果（checks/judge_score）写入资产记录，审计可见。

## [S5] Template confirmation flow (模板固化)

```
POST /api/assets/templates {team_id, title, content, source_task_id, approver}
  → AssetStore.propose_template (status=proposed)
  → AssetEvaluator.evaluate (确定性 + judge)
  → 通过 → ApprovalManager.request_gate(approver=approver, operation="template_confirm", task_id=asset_id, gate_id="template:<asset_id>")
  → 员工批准 (handle_gate_response) → AssetStore.approve_template
  → 拒绝 → AssetStore.reject_template（不入库）
```

- 复用 ApprovalManager（M2 把关点引擎）：request_gate / handle_gate_response / 审计成对（gate/requested + gate/decided）。
- 评测不过 → 直接拒绝（不入库，不发起 gate）；评测过但 gate 超时 → 沿用把关超时语义（超时默认通过 + 记录）。
- 审计链：评测结果（checks/judge_score）+ 把关决定（approved_by）均入资产记录，可追溯。

## [S6] Skill evolution & asset retrieval (技能进化 + 复用检索)

**技能进化（把关差异提炼）**：`POST /api/assets/experience {team_id, task_type, transcript, feedback, keywords}` → 复用 `ExperienceExtractor.extract_from_meeting`（既有 :606，会议/把关差异提炼规则）→ `write_to_incremental_area`（CoW 增量区，source_task_id 项目隔离防污染——总设计 [S5] 第 49 行）。

**资产复用检索**：`GET /api/assets/search?q=&type=&team_id=` →
- 知识库/模板：`AssetStore.search(team_id, q, type)`
- 技能规则：`ExperienceExtractor.retrieve_relevant_rules(task_type, keywords)`（task_orchestrator:489 同款机制）
- 合并返回 `{"artifacts": [...], "templates": [...], "rules": [...]}`——下次同类任务注入候选（DAG 注入接线属后续）。

## [S7] Demo endpoints (演示端点)

| 端点 | 流程 |
|------|------|
| `POST /api/assets/artifacts` | 产出物直接入库 → asset_id |
| `POST /api/assets/templates` | 评测 → gate 确认 → 返回 pending request id（批准后入库；评测不过直接返回失败） |
| `GET /api/assets/search?q=&type=&team_id=` | 三类资产合并检索结果 |
| `POST /api/assets/experience` | 把关差异 → 技能增量区 → rule_id |
| `GET /api/assets?team_id=&status=` | 资产列表（per team） |

- 演示端点模式沿用 M2（TestClient 测试、`server.BACKEND_TOKEN = ""`、`_ok`/`_fail` 包装）。
- 既有惯例：端点内函数级 import（避免循环依赖）；`get_asset_store()` 惰性单例（data/assets）。

## [S8] Implementation tasks & acceptance

**6 任务（每任务 TDD + 双评审闭环，计划另立）**：

| # | 任务 | 覆盖 |
|---|------|------|
| T1 | AssetStore 数据层 | [S3] |
| T2 | AssetEvaluator 评测 | [S4] |
| T3 | 模板固化流程（评测→gate→入库/拒绝） | [S5] |
| T4 | 技能进化接线（把关差异→增量区） | [S6] |
| T5 | 资产复用检索（三类资产合并） | [S6] |
| T6 | 演示端点 /api/assets/* | [S7] |

**里程碑验收**：T1-T6 双评审闭环 + 后端全量回归绿（1030+ 基线）+ 演示端点 TestClient 全链路（入库/固化含确认/评测/技能增量/检索）。LLM judge 真实 key 试点 = 后续独立试点（与 M2 直驱/WS 试点模式一致）。

**边界与错误处理**：
- 资产去重/权限：知识库团队级隔离（[S3] 目录 per team）；模板沉淀必须员工确认（[S5]）；技能增量 source_task_id 项目隔离（[S6]）。
- 评测不过/拒绝：不入库，返回失败原因（`_fail`）。
- 索引损坏：加载容错重建（[S3]）。
