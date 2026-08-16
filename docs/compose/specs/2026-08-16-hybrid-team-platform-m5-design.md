# [M5] 资产可视化与复用可感知 Design

> 2026-08-16 建立。M5（未正式定义里程碑——承接 M1-M4 + 全部登记项清零后的增强阶段）：补设计 [S5] M3 验收"资产复用率可感知"的呈现层与量化——前端资产浏览 UI + 后端复用率指标。经用户逐节确认（范围/落点/指标形态）。

## [S1] Goal

让沉淀闭环"可感知"：
1. **资产浏览前端 UI**——办公团队面板中可视化浏览团队知识库/模板/技能规则（前端当前零资产代码；后端 `/api/assets/*` + `/api/employees` 齐备）。
2. **资产复用率指标**——量化资产注入的复用行为（后端计数 + 演示端点），补设计 [S5]"资产复用率可感知"验收。

**范围（用户确认）**：资产 UI + 复用率指标两项。

## [S2] Solution overview

| 组件 | 文件 | 职责 |
|------|------|------|
| AssetBrowserPanel | 新增 `src/components/office-team/AssetBrowserPanel.tsx` | 三块列表（产出物/模板/技能规则）+ 检索 + 团队选择（消费 REST） |
| 面板挂载 | 修改 `src/components/OfficeTeamMode.tsx` | 新增 'assets' 标签（`🧠 资产`）——标签栏数组 + 条件渲染 + meetingTab 类型扩展 |
| 复用统计 | 修改 `backend/asset_injection.py` | 模块级 `_REUSE_STATS`（进程内计数）+ `get_reuse_stats()` |
| 演示端点 | 修改 `backend/server.py` | `GET /api/assets/reuse-metrics` → 复用统计 |

**关键决策（用户确认）**：
1. 范围：资产 UI + 复用率指标（全做）
2. UI 落点：OfficeTeamMode 新 'assets' 标签 + AssetBrowserPanel（复用既有面板结构 + 组件内 fetch 惯例）
3. 指标形态：进程内计数（build_asset_context 注入时记录）+ 演示端点（演示/试点级可感知；持久化留后续）

## [S3] Asset browser UI (资产浏览)

**AssetBrowserPanel**（`src/components/office-team/AssetBrowserPanel.tsx`）：

- 挂载时 `apiFetch('/api/assets?team_id=<团队>')` 拉列表（产出物/模板）；`apiFetch('/api/assets/search?q=&team_id=&task_type=&keywords=')` 检索。
- 展示：标题 + 类型徽章（产出物/模板）+ 状态（模板 proposed/approved）+ 评测分数（`judge_score` 有则显示）+ 审批上下文（`approved_by`/`approverName`）+ 创建时间。
- 团队选择（默认演示团队，如 `team-x`——与后端演示数据一致；选择切换重新拉取——团队隔离）。
- 检索输入（标题/内容关键词 → search 端点；`task_type`/`keywords` 可选——技能规则检索依赖二者，面板提供简单关键词输入）。
- 空态：无资产时显示"暂无资产"（团队隔离）。

**面板挂载**（`src/components/OfficeTeamMode.tsx`）：

- `meetingTab` 类型扩展：`'chat' | 'files' | 'skills' | 'vote' | 'assets'`。
- 标签栏数组（:295）追加 `['assets', '🧠 资产']`。
- 条件渲染（:310+）追加 `meetingTab === 'assets' ? <AssetBrowserPanel ... />`。

## [S4] Reuse metrics (资产复用率指标)

**复用统计**（`backend/asset_injection.py`）：

```python
# 模块级进程内统计（演示/试点级可感知；持久化留后续）
_REUSE_STATS: dict = {"total": 0, "by_team": {}, "by_type": {"templates": 0, "artifacts": 0, "rules": 0}, "last_at": ""}


def get_reuse_stats() -> dict:
    return dict(_REUSE_STATS)
```

- `build_asset_context` 内资产非空时更新：`_REUSE_STATS["total"] += 1`、`by_team[team_id] += 1`、`by_type` 按注入的三类计数（templates/artifacts/rules 条数）、`last_at = 当前时间`。
- 空资产（零注入）不计数（仅真实复用才"可感知"）。
- **测试**：build_asset_context 带资产调用 → get_reuse_stats 反映（total/team/type）；空资产不计数。

**演示端点**（`backend/server.py`）：

```python
@app.get("/api/assets/reuse-metrics")
async def api_asset_reuse_metrics():
    """演示：资产复用率统计（注入次数/按团队/按类型——设计 [S5] 复用率可感知）。"""
    from asset_injection import get_reuse_stats
    return _ok(get_reuse_stats())
```

## [S5] Implementation tasks & acceptance

**3 任务（每任务 TDD + 双评审闭环，计划另立）**：

| # | 任务 | 覆盖 |
|---|------|------|
| T1 | 复用统计 + 演示端点（asset_injection 计数 + /api/assets/reuse-metrics + 测试） | [S4] |
| T2 | AssetBrowserPanel 组件（列表/检索/团队选择 + 组件测试） | [S3] |
| T3 | OfficeTeamMode 'assets' 标签接线（meetingTab 扩展 + 挂载 + 测试） | [S3] |

**里程碑验收**：T1-T3 双评审闭环 + 后端全量回归绿（1133 基线）+ 前端组件测试绿（1637 基线）；面板可浏览团队资产（列表/检索/状态），`/api/assets/reuse-metrics` 反映注入计数。

**边界与错误处理**：
- 复用统计为进程内（演示/试点级）——重启清零，持久化留后续。
- 前端团队选择默认演示团队（与后端演示数据一致）；面板无资产显示空态。
- 技能规则检索依赖 task_type+keywords（后端语义）——面板提供关键词输入，缺省空规则列表。
