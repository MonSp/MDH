# [M5] 资产可视化与复用可感知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补设计 [S5]"资产复用率可感知"验收——①后端复用率统计 + 演示端点（`GET /api/assets/reuse-metrics`，build_asset_context 注入计数）；②前端资产浏览 UI（AssetBrowserPanel 三块列表/检索/团队选择 + OfficeTeamMode 'assets' 标签）。

**Architecture:** T1（后端）——`asset_injection.py` 模块级 `_REUSE_STATS`（进程内计数：total/by_team/by_type/last_at）+ `get_reuse_stats()` + `build_asset_context` 资产非空时更新 + `server.py` 演示端点；T2/T3（前端）——`AssetBrowserPanel.tsx`（消费 `/api/assets` + `/api/assets/search` + `/api/employees`，fetch 惯例）+ `OfficeTeamMode` 'assets' 标签接线。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · TypeScript/Vitest 3.2.4 · @testing-library/react（已装）

## Global Constraints

- **测试环境**：后端 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）；前端 `npx vitest run <file>`（worktree 根）。
- **零新依赖**：前后端均零新包。
- **不要动**：`build_asset_context` 注入语义（M4-T1）——只加统计更新；`/api/assets/*` 既有端点；`asset_injection.py` 返回结构（空串零成本不变）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；package-lock.json modified 为已知 churn（worktree 前端 git add 具体路径）。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING；`test_performance.py` flaky；前端 1637 基线。
- **worktree 前端环境**：`npm ci` 必失败 → `npm install --no-audit --no-fund --legacy-peer-deps --ignore-scripts`（~40s）。

---

### Task 1: 复用统计 + 演示端点

**Covers:** [S4]

**Files:**
- Modify: `backend/asset_injection.py`（`_REUSE_STATS` + `get_reuse_stats` + build_asset_context 更新）
- Modify: `backend/server.py`（`GET /api/assets/reuse-metrics`）
- Test: `backend/tests/test_asset_injection.py`（追加）+ `backend/tests/test_asset_endpoints.py`（追加）

**Interfaces:**
- Produces: `get_reuse_stats() -> dict`（`{"total", "by_team", "by_type": {"templates","artifacts","rules"}, "last_at"}`）；`build_asset_context` 资产非空时更新统计（total/team/type 计数/last_at）；`GET /api/assets/reuse-metrics` → `_ok(get_reuse_stats())`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_asset_injection.py` 追加：

```python
def test_reuse_stats_updated_on_nonempty_context(tmp_path):
    from asset_injection import _REUSE_STATS, build_asset_context, get_reuse_stats
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["责任人", "行动项"], team_id="team-x")
    _REUSE_STATS.clear()
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要", "待办"])
    assert ctx != ""  # 有资产才计数
    stats = get_reuse_stats()
    assert stats["total"] == 1
    assert stats["by_team"].get("team-x") == 1
    assert stats["by_type"]["artifacts"] >= 1
    assert stats["last_at"]


def test_reuse_stats_untouched_on_empty_context(tmp_path):
    from asset_injection import _REUSE_STATS, build_asset_context, get_reuse_stats
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    _REUSE_STATS.clear()
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])
    assert ctx == ""  # 无资产
    assert get_reuse_stats()["total"] == 0  # 空资产不计数
```

（**注意**：`_REUSE_STATS` 是模块级 dict——测试前 `clear()` 避免跨测试污染。）

`backend/tests/test_asset_endpoints.py` 追加：

```python
def test_reuse_metrics_endpoint(tmp_path, monkeypatch):
    from asset_injection import get_reuse_stats
    stats = {"total": 3, "by_team": {"team-x": 2}, "by_type": {"templates": 1, "artifacts": 1, "rules": 1}, "last_at": "t"}
    monkeypatch.setattr("server._get_asset_store", lambda: AssetStore(str(tmp_path)))
    monkeypatch.setattr("asset_injection.get_reuse_stats", lambda: stats)  # 或以真实统计为准
    client = TestClient(server.app)
    resp = client.get("/api/assets/reuse-metrics")
    assert resp.status_code == 200 and resp.json()["data"]["total"] == 3
```

（monkeypatch 方式以实际为准——若 `api_asset_reuse_metrics` 内部 `from asset_injection import get_reuse_stats` 则 monkeypatch `asset_injection.get_reuse_stats`。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py::test_reuse_stats_updated_on_nonempty_context -v`
Expected: FAIL——`get_reuse_stats` 不存在（ImportError）。

- [ ] **Step 3: 实现**

`backend/asset_injection.py`：

```python
# 模块级进程内统计（演示/试点级复用可感知；持久化留后续）
_REUSE_STATS: dict = {"total": 0, "by_team": {}, "by_type": {"templates": 0, "artifacts": 0, "rules": 0}, "last_at": ""}


def get_reuse_stats() -> dict:
    """资产复用统计（注入次数/按团队/按类型）——设计 [S5] 复用率可感知。"""
    return dict(_REUSE_STATS)
```

`build_asset_context` 内资产非空（lines 非空）时更新（返回前）：

```python
    if lines:
        _REUSE_STATS["total"] += 1
        _REUSE_STATS["by_team"][team_id] = _REUSE_STATS["by_team"].get(team_id, 0) + 1
        _REUSE_STATS["by_type"]["templates"] += len(result["templates"][:_MAX_TEMPLATES])
        _REUSE_STATS["by_type"]["artifacts"] += len(result["artifacts"][:_MAX_ARTIFACTS])
        _REUSE_STATS["by_type"]["rules"] += len(result["rules"][:_MAX_RULES])
        _REUSE_STATS["last_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        return "\n资产参考：\n" + "\n".join(lines)
    return ""
```

（`import time` 加文件头。）

`backend/server.py`（资产端点区）：

```python
@app.get("/api/assets/reuse-metrics")
async def api_asset_reuse_metrics():
    """演示：资产复用率统计（注入次数/按团队/按类型——设计 [S5] 复用率可感知）。"""
    from asset_injection import get_reuse_stats
    return _ok(get_reuse_stats())
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py tests/test_asset_endpoints.py -q`
Expected: 新用例 + 既有回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_injection.py backend/server.py backend/tests/test_asset_injection.py backend/tests/test_asset_endpoints.py
git commit -m "feat(hybrid): asset reuse metrics with injection counting and demo endpoint"
```

---

### Task 2: AssetBrowserPanel 组件

**Covers:** [S3]

**Files:**
- Create: `src/components/office-team/AssetBrowserPanel.tsx`
- Test: `src/components/office-team/AssetBrowserPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/assets?team_id=`（列表——资产 dict 含 asset_id/type/title/content/status/judge_score/approved_by/created_at）；`GET /api/assets/search?q=&team_id=&task_type=&keywords=`（检索）；`GET /api/employees`（员工名——可选，approverName 已在列表）。
- Produces: `AssetBrowserPanel` 组件——团队选择（默认 `team-x`）+ 检索输入 + 三块列表（产出物/模板/技能规则——模板显示状态徽章 proposed/approved + judge_score；产出物显示 content 摘要）；空态"暂无资产"。

- [ ] **Step 1: 写失败测试**（新建 `src/components/office-team/AssetBrowserPanel.test.tsx`）

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AssetBrowserPanel from './AssetBrowserPanel'

// mock 全局 fetch（组件用 fetch('/api/...')——测试注入返回）
// 资产列表 + 检索 + employees 的 fetch 响应按 URL 路由
// 用例：
// 1. 挂载拉取团队资产列表 → 渲染产出物/模板（标题可见，模板状态徽章/无 judge_score 时不显示）
// 2. 检索输入 → 提交 → search 端点结果渲染（技能规则 action 可见）
// 3. 空资产 → 空态"暂无资产"
```

（**实现者注意**：读 `OfficeTeamMode.approval.test.tsx`（T23-T2 先例）的 mock 模式——`vi.mock` + `vi.hoisted`；fetch mock 用 `vi.stubGlobal('fetch', ...)` 或全局 fetch spy 按 URL 路由返回；组件 API 调用与真实 `fetch('/api/...')` 对齐。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/office-team/AssetBrowserPanel.test.tsx`
Expected: FAIL——组件不存在。

- [ ] **Step 3: 实现**（新建 `src/components/office-team/AssetBrowserPanel.tsx`）

```tsx
import React, { useEffect, useState } from 'react'

interface AssetItem {
  asset_id?: string
  assetId?: string
  type: string
  title: string
  content?: string
  status?: string
  judge_score?: number | null
  approved_by?: string
  created_at?: string
}

interface SearchResult {
  artifacts: AssetItem[]
  templates: AssetItem[]
  rules: Array<{ rule_id: string; trigger_condition: string; action: string }>
}

const apiGet = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

export default function AssetBrowserPanel() {
  const [teamId, setTeamId] = useState('team-x')
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet<{ data: AssetItem[] }>(`/api/assets?team_id=${teamId}`)
      .then((r) => setAssets(r.data))
      .catch((e) => setError(String(e)))
  }, [teamId])

  const doSearch = async () => {
    try {
      const r = await apiGet<{ data: SearchResult }>(
        `/api/assets/search?q=${encodeURIComponent(query)}&team_id=${teamId}&task_type=minutes&keywords=纪要`
      )
      setSearch(r.data)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div data-testid="asset-browser">
      <div>
        <label>
          团队
          <input value={teamId} onChange={(e) => setTeamId(e.target.value)} />
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="检索资产"
        />
        <button onClick={doSearch}>检索</button>
      </div>
      {error && <div>{error}</div>}
      {assets.length === 0 && !search && <div>暂无资产</div>}
      <h4>产出物</h4>
      <ul>
        {assets.filter((a) => a.type === 'artifact').map((a) => (
          <li key={a.asset_id || a.assetId}>
            {a.title}
            {a.judge_score != null && <span>（评测 {a.judge_score}）</span>}
          </li>
        ))}
      </ul>
      <h4>模板</h4>
      <ul>
        {assets.filter((a) => a.type === 'template').map((a) => (
          <li key={a.asset_id || a.assetId}>
            {a.title}
            <span>{a.status === 'approved' ? '✓ 已固化' : '待确认'}</span>
          </li>
        ))}
      </ul>
      {search && (
        <>
          <h4>技能规则</h4>
          <ul>
            {search.rules.map((r) => (
              <li key={r.rule_id}>{r.trigger_condition} → {r.action}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

（**实现者注意**：以实际后端响应形状为准（`/api/assets` 返回 `_ok(data)` 即 `{data: [...]}`——按实际解包）；`apiGet` 泛型按实际；样式可简约内联——复用面板既有风格可选。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/office-team/AssetBrowserPanel.test.tsx`
Expected: 新用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/components/office-team/AssetBrowserPanel.tsx src/components/office-team/AssetBrowserPanel.test.tsx
git commit -m "feat(hybrid): asset browser panel with team-scoped lists and search"
```

---

### Task 3: OfficeTeamMode 'assets' 标签接线

**Covers:** [S3]

**Files:**
- Modify: `src/components/OfficeTeamMode.tsx`（meetingTab 类型扩展 + 标签栏 + 条件渲染）
- Test: `src/components/__tests__/OfficeTeamMode.approval.test.tsx`（追加或新建标签测试）

**Interfaces:**
- Consumes: Task 2 `AssetBrowserPanel`。
- Produces: OfficeTeamMode 新增 'assets' 标签（`🧠 资产`）——meetingTab 类型 `'chat' | 'files' | 'skills' | 'vote' | 'assets'`、标签栏数组追加、条件渲染 `meetingTab === 'assets' ? <AssetBrowserPanel /> : ...`。

- [ ] **Step 1: 写失败测试**（追加 `src/components/__tests__/OfficeTeamMode.approval.test.tsx`——既有 mock 模式，读文件复用）

```tsx
it('renders asset tab entry', () => {
  // render OfficeTeamMode（复用既有 mock——useMeetingSocket/useAgentSystem/TechTowerView）
  // 断言标签栏含 '🧠 资产'
  // （点击标签切换可选——断言标签存在即可，切换渲染 AssetBrowserPanel 需 mock fetch）
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx`
Expected: FAIL——标签不存在。

- [ ] **Step 3: 实现**

`src/components/OfficeTeamMode.tsx`：
- `meetingTab` 类型（:36）扩展 `| 'assets'`。
- 标签栏数组（:295）追加 `['assets', '🧠 资产']`。
- 条件渲染（:310+）追加 `) : meetingTab === 'assets' ? (<AssetBrowserPanel />)`。
- import `AssetBrowserPanel`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx src/components/office-team/AssetBrowserPanel.test.tsx`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/components/OfficeTeamMode.tsx src/components/__tests__/OfficeTeamMode.approval.test.tsx
git commit -m "feat(hybrid): wire asset browser into office team mode tabs"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→[S4]（复用率指标）；T2/T3→[S3]（资产 UI）。[S1]/[S2]/[S5] 为设计说明/验收。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及前端 mock 模式/后端响应形状给"以实际为准"指引。
- **类型一致性**：`get_reuse_stats() -> dict`（total/by_team/by_type/last_at）跨 T1 消费；AssetBrowserPanel props/API 与后端响应对齐。
- **范围**：asset_injection（只加统计——注入语义不变）+ server 端点 + 前端组件/接线；既有端点/组件零改动。
