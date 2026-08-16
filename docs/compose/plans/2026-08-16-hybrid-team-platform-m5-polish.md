# [M5 打磨] 资产面板完善 + 复用统计持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 M5 登记的 6 项后续（用户确认全做）：①前端面板展示项补全（approved_by/created_at/类型徽章）；②搜索参数化（task_type/keywords 用户输入参与）；③search 结果合并 artifacts/templates 过滤；④团队 select（自由输入 → 下拉）；⑤团队切换 fetch 失败清空旧列表；⑥复用统计持久化 + 线程安全（进程内 → 落盘 + 锁）。

**Architecture:** T1（前端）——新建 `src/services/apiFetch.ts`（`_ok` 解包 + success 守卫的共享 helper，沉淀 AssetBrowserPanel 的 apiGet 模式）+ `AssetBrowserPanel` 打磨（展示补全/搜索参数化/search 合并/团队 select/切换清空）；T2（后端）——`asset_injection.py` `_REUSE_STATS` 加 `threading.Lock`（并发安全）+ JSON 落盘（`data/reuse_stats.json`，gitignored——更新后原子写 tmp+rename，`get_reuse_stats` 读内存，构造/首次读时加载落盘）。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · TypeScript/Vitest 3.2.4 · @testing-library/react（已装）

## Global Constraints

- **测试环境**：后端 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）；前端 `npx vitest run <file>`（worktree 根）。
- **零新依赖**：前后端均零新包。
- **不要动**：`build_asset_context` 注入语义（M5-T1）——只加锁与落盘；`_REUSE_STATS` 返回结构（total/by_team/by_type/last_at）；`/api/assets/reuse-metrics` 端点。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；package-lock.json modified 为已知 churn（勿 add）。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING；`test_performance.py` flaky；前端 1647 基线。
- **worktree 前端环境**：`npm ci` 必失败 → `npm install --no-audit --no-fund --legacy-peer-deps --ignore-scripts`（~40s；T2 若后端-only 则 worktree 无 node_modules 也 OK）。

---

### Task 1: 共享 apiFetch + AssetBrowserPanel 打磨

**Covers:** M5 登记项 ①-⑤

**Files:**
- Create: `src/services/apiFetch.ts`（共享 helper）
- Create: `src/services/apiFetch.test.ts`
- Modify: `src/components/office-team/AssetBrowserPanel.tsx`（打磨）
- Modify: `src/components/office-team/AssetBrowserPanel.test.tsx`（追加/适配）

**Interfaces:**
- Produces: `apiFetch<T>(url: string, init?: RequestInit): Promise<T>`——fetch + `!res.ok` 抛错 + `_ok` 解包（`success === false` 抛 `error`；返回 `body.data`）；`AssetBrowserPanel` 改用共享 apiFetch。
- Produces（打磨）: ①展示补全——产出物/模板行显示 `approved_by`（有则"审批人"）+ `created_at` + 类型徽章（产出物/模板）；②搜索参数化——task_type/keywords 从用户输入（两个可选输入框，缺省空串不传参——后端空关键词返回空 rules 的语义：见下）；③search 合并——搜索命中时产出物/模板列表合并 search.artifacts/templates（补全挂载列表）；④团队 select——`<select>` 选项（team-x/team-y/team-z 等演示团队——读 employee/assets 既有演示团队名，以实际为准），替代自由输入；⑤团队切换 fetch 失败——effect 顶部 `setAssets([])`（清空旧列表再拉）。

**注意**：②后端 `/api/assets/search` 的 rules 仅当 `task_type` 与 `keywords` 均非空才返回（asset_search.py:48）——搜索参数化后：task_type/keywords 空 → 不发该参数 → rules 空列表（语义正确）；两输入框均有值 → 规则检索生效。测试覆盖两分支。

- [ ] **Step 1: 写失败测试**

`src/services/apiFetch.test.ts`（新建——2 用例：`_ok` 解包返回 data / `success===false` 抛 error / `!res.ok` 抛状态）：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiFetch } from './apiFetch'

// vi.stubGlobal('fetch', ...) 按响应路由
// ① fetch 返回 {success:true, data:{...}, error:null} → apiFetch 返回 data
// ② fetch 返回 {success:false, data:null, error:'bad'} → apiFetch reject Error('bad')
// ③ fetch 返回 new Response('', {status:500}) → apiFetch reject Error('API 500')
// afterEach(vi.unstubAllGlobals())
```

`AssetBrowserPanel.test.tsx` 追加/适配：展示补全（approved_by/created_at 渲染断言）、搜索参数化（task_type/keywords 输入 → URL 带参断言 + 空关键词 rules 空）、search 合并（search.artifacts 并入列表）、团队 select（选项渲染/切换）、团队切换失败清空（fetch reject → 旧列表消失）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/services/apiFetch.test.ts src/components/office-team/AssetBrowserPanel.test.tsx`
Expected: FAIL——apiFetch 不存在 + 打磨断言未满足。

- [ ] **Step 3: 实现**

`src/services/apiFetch.ts`（新建——从 AssetBrowserPanel.apiGet 提炼）：

```ts
export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error?: string | null
}

export const apiFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const body = (await res.json()) as ApiEnvelope<T>
  if (body.success === false) throw new Error(body.error || 'API error')
  return body.data as T
}

export default apiFetch
```

（默认导出 + 具名导出——以组件 import 习惯为准。）

`AssetBrowserPanel.tsx` 打磨（读实际当前实现——1fd9385+482818e 后）：
- 删除本地 apiGet，改 `import { apiFetch } from '../../services/apiFetch'`（路径以实际为准——组件在 src/components/office-team/，services 在 src/services/——`../../services/apiFetch`）
- ① 行渲染补 `a.approved_by && <span>审批人 {a.approved_by}</span>`、`a.created_at && <span>{a.created_at}</span>`、类型徽章（`a.type === 'template' ? '模板' : '产出物'`——既有 section 已有，若行内无则补）
- ② 搜索区加 task_type/keywords 两个输入（state `taskType`/`keywords`，默认空串）；URL 构造：`const params = new URLSearchParams({ team_id: teamId, q: query }); if (taskType) params.set('task_type', taskType); if (keywords) params.set('keywords', keywords)`——空不发参（rules 空语义）
- ③ search 合并：`const merged = [...assets, ...(search?.artifacts ?? []), ...(search?.templates ?? [])]`——列表渲染用 merged（或 effect 直接并入 assets——以简单为准：渲染时合并）
- ④ 团队 select：`<select value={teamId} onChange={...}>{['team-x','team-y','team-z'].map(...)}</select>`（演示团队——读既有 assets 演示数据实际团队名，以实际为准）
- ⑤ effect 顶部 `setAssets([])`（fetch 前清空——失败时旧列表不残留）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/services/apiFetch.test.ts src/components/office-team/AssetBrowserPanel.test.tsx`
Expected: 新用例 + 既有全绿。

- [ ] **Step 5: 提交**

```bash
git add src/services/apiFetch.ts src/services/apiFetch.test.ts src/components/office-team/AssetBrowserPanel.tsx src/components/office-team/AssetBrowserPanel.test.tsx
git commit -m "feat(hybrid): shared api fetch helper and asset browser polish (display, search params, select)"
```

---

### Task 2: 复用统计线程安全 + 落盘持久化

**Covers:** M5 登记项 ⑥

**Files:**
- Modify: `backend/asset_injection.py`（`_REUSE_STATS` 加锁 + `_save_reuse_stats` 落盘 + 加载）
- Test: `backend/tests/test_asset_injection.py`（追加）

**Interfaces:**
- Produces: `_REUSE_STATS` 更新经 `threading.Lock`（`_REUSE_LOCK` 模块级）——`build_asset_context` 计数临界区加锁；更新后 `_save_reuse_stats()` 原子写 `data/reuse_stats.json`（tmp+rename，gitignored）；`get_reuse_stats()` 返回规范化 dict（缺键补默认——M5-T1 已确立）；模块首次读时若内存空从落盘加载（`_ensure_loaded()` 或构造时——以实际为准：惰性加载，仅当 `_REUSE_STATS["total"] == 0` 且文件存在时读）。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_asset_injection.py`）

```python
def test_reuse_stats_persists_to_disk(tmp_path, monkeypatch):
    from asset_injection import _REUSE_STATS, _REUSE_LOCK, build_asset_context, get_reuse_stats
    # 构造 store/extractor（M5-T1 测试同模式——team_id="team-x" 一致）
    # monkeypatch data 路径：读 _save_reuse_stats 实际落盘路径变量（若模块级 DATA_DIR/REUSE_STATS_PATH 常量——monkeypatch 之；或 get_reuse_stats 传参——以实际为准）
    # ① 有资产 build_asset_context → total==1
    # ② 落盘文件存在（data/reuse_stats.json 路径下）且 json 含 total==1
    # ③ 清内存（_REUSE_STATS.clear()）→ get_reuse_stats() 从落盘加载（total==1）


def test_reuse_stats_thread_safety(tmp_path):
    from asset_injection import build_asset_context, get_reuse_stats
    # 构造 store/extractor（同团队）
    # 多线程并发 build_asset_context × 20（ThreadPoolExecutor）→ total == 20（锁下无丢失自增）
    # （若测试环境线程+tmp_path 数据共享有冲突——store 用同实例；build_asset_context 并发对同一 store 只读 assets——安全）
```

（**注意**：`_REUSE_STATS`/`_REUSE_LOCK` 模块级——测试前 `clear()` 锁下清理；落盘路径默认 `backend/data/reuse_stats.json`（gitignored）——测试须 monkeypatch 到 tmp 路径（读实际实现——可能模块级 `_REUSE_STATS_PATH` 常量或函数参数，以实际为准）。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py::test_reuse_stats_persists_to_disk -v`
Expected: FAIL——落盘不存在。

- [ ] **Step 3: 实现**

`backend/asset_injection.py`（M5-T1 `_REUSE_STATS`/`get_reuse_stats` 基础上）：

```python
import json
import os
import threading

_REUSE_LOCK = threading.Lock()
_REUSE_STATS_PATH = os.path.join(os.path.dirname(__file__), "data", "reuse_stats.json")  # gitignored


def _save_reuse_stats() -> None:
    """原子写复用统计到磁盘（tmp+rename）——进程重启保留。"""
    os.makedirs(os.path.dirname(_REUSE_STATS_PATH), exist_ok=True)
    tmp = _REUSE_STATS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_REUSE_STATS, f, ensure_ascii=False)
    os.replace(tmp, _REUSE_STATS_PATH)


def _ensure_loaded() -> None:
    """内存空时从磁盘加载（进程重启恢复）。"""
    if _REUSE_STATS.get("total"):
        return
    if os.path.exists(_REUSE_STATS_PATH):
        try:
            with open(_REUSE_STATS_PATH, "r", encoding="utf-8") as f:
                _REUSE_STATS.update(json.load(f))
        except (ValueError, OSError):
            pass  # 损坏/缺失容错置空
```

`build_asset_context` 非空分支（M5-T1 更新处）——加锁 + 落盘：

```python
        with _REUSE_LOCK:
            _REUSE_STATS["total"] = _REUSE_STATS.get("total", 0) + 1
            _REUSE_STATS["by_team"][team_id] = _REUSE_STATS["by_team"].get(team_id, 0) + 1
            _REUSE_STATS["by_type"]["templates"] += len(result["templates"][:_MAX_TEMPLATES])
            _REUSE_STATS["by_type"]["artifacts"] += len(result["artifacts"][:_MAX_ARTIFACTS])
            _REUSE_STATS["by_type"]["rules"] += len(result["rules"][:_MAX_RULES])
            _REUSE_STATS["last_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        _save_reuse_stats()
```

`get_reuse_stats()`——开头 `_ensure_loaded()`（返回规范化 dict 不变）。

（**以实际为准**：读 M5-T1 实际实现——`_REUSE_STATS.get`/`setdefault` 模式（评审适配）；测试 monkeypatch `_REUSE_STATS_PATH` 或调用参数化——保持测试可 tmp 化。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py tests/test_asset_endpoints.py -q`
Expected: 新用例 + 既有（M5-T1 计数/端点）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_injection.py backend/tests/test_asset_injection.py
git commit -m "feat(hybrid): thread-safe and persisted asset reuse stats"
```

---

## Self-Review 结论

- **覆盖**：M5 登记 6 项——T1 ①-⑤（展示补全/搜索参数化/search 合并/团队 select/切换清空 + 共享 apiFetch 沉淀）；T2 ⑥（锁 + 落盘持久化）。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及实际实现细节给"以实际为准"指引（apiFetch 路径/演示团队名/落盘路径 monkeypatch）。
- **类型一致性**：`apiFetch<T>` 返回 `body.data`（_ok 解包）跨组件消费；`_REUSE_STATS` 结构（total/by_team/by_type/last_at）跨 T2 生产/落盘/端点一致。
- **范围**：前端组件+新 helper/后端统计层；注入语义/端点/既有组件零改动。
