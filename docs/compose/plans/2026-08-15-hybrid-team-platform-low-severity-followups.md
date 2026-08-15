# [低严重度后续] 试点健壮性 + env 文档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收尾 T34 评审登记的 3 条低严重度建议（judge 端点试点脚本健壮性 + runbook 口径）+ `ASSET_JUDGE_ENABLED` env 文档（M4 评审登记）。

**Architecture:** 纯收尾修复——`pilot_judge_endpoint.py` 加 `--verbose`（server 日志可见）与端口预检（防命中旧实例）；`.env.example` 补 `ASSET_JUDGE_ENABLED` 说明；试点手册 §10 已知边界口径修正（端点试点实际 1 次 judge 调用）。

**Tech Stack:** Python 3.11 · 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：server.py / asset_* / 既有产品代码；试点脚本的验收断言与退出码语义。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: 试点脚本健壮性 + runbook 口径修正

**Files:**
- Modify: `backend/pilot_judge_endpoint.py`
- Modify: `docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md`（§10 已知边界口径）

**Interfaces:**
- Produces: `--verbose` 参数（置位时 server stdout/stderr 继承当前终端——启动失败日志可见；默认 DEVNULL 不变）；启动前端口预检（`http://localhost:8765/health` 已有响应 → 打印错误退出（非零），避免命中旧实例——注意：脚本自身启动 server 前检查；若端口被占则提示先清理）；§10 已知边界"4 次 judge 调用"改为"端点试点 1 次 judge 调用（模板评测）"。

- [ ] **Step 1: 验证当前状态**

Run: `grep -n "DEVNULL\|localhost:8765/health" backend/pilot_judge_endpoint.py`
Expected: :80 DEVNULL（server 日志丢弃）；health 等待循环在 server 启动后（无启动前预检）。

- [ ] **Step 2: 实现**

`backend/pilot_judge_endpoint.py`：
- `parse_args` 加 `--verbose`（`action="store_true"`，help "server 日志输出到终端（默认丢弃）"）。
- `run` 内 server 启动改：

```python
    server_stdout = None if args.verbose else subprocess.DEVNULL
    server_stderr = None if args.verbose else subprocess.DEVNULL
    server = subprocess.Popen(
        [sys.executable, os.path.join(args.backend_dir, "server.py")],
        env=server_env, stdout=server_stdout, stderr=server_stderr,
    )
```

- health 等待循环**前**加端口预检（在 Popen 之前或之后均可——建议 Popen 后先探测当前占用，若 health 已有响应且非本脚本 server 则报错退出）：

```python
    # 端口预检：8765 已被占用（旧实例）→ 报错退出，避免命中旧 server
    try:
        with urllib.request.urlopen(f"{BASE_URL}/health", timeout=2):
            raise RuntimeError("端口 8765 已有服务在运行（health 有响应）——请先停止旧 server 再运行试点")
    except RuntimeError:
        raise
    except Exception:
        pass  # 无响应 → 端口可用
```

（放在 Popen 后、等待循环前；注意本脚本自身 Popen 的 server 启动需要时间，预检探测的是启动前的存量。）

- docstring 运行方式补 `--verbose` 说明。

`docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md` §10 已知边界更新：`试点消耗真实 API token（4 次 judge 调用，~10s）` → 端点试点实际 **1 次 judge 调用**（模板评测；pilot_judge.py 的 4 次为 seam 级验收口径）。

- [ ] **Step 3: 验证**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m py_compile backend/pilot_judge_endpoint.py`（语法正确）
Run: `/home/test/miniconda3/envs/agentscope/bin/python backend/pilot_judge_endpoint.py --help | grep verbose`（参数存在）

- [ ] **Step 4: 提交**

```bash
git add backend/pilot_judge_endpoint.py docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md
git commit -m "fix(pilot): verbose server logs and port pre-check in judge endpoint pilot"
```

---

### Task 2: ASSET_JUDGE_ENABLED env 文档

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces: `.env.example` 补 `ASSET_JUDGE_ENABLED`（注释说明：LLM judge 启用开关，默认关——演示端点无 judge 快路径；`=1` 且 `DEEPSEEK_API_KEY` 存在时 `/api/assets/templates` 启用真实 LLM 评测（fail-closed））。

- [ ] **Step 1: 读当前 .env.example**

读 `.env.example`（254 字节，含 DEEPSEEK_API_KEY/BASE_URL/MODEL）。

- [ ] **Step 2: 实现**

在 `.env.example` 的 DEEPSEEK_* 之后追加：

```env
# LLM judge 启用开关（默认关）：=1 且 DEEPSEEK_API_KEY 存在时，
# /api/assets/templates 模板固化启用真实 LLM 评测（fail-closed：judge 异常 → 拒绝）
ASSET_JUDGE_ENABLED=0
```

- [ ] **Step 3: 验证**

Run: `grep -n "ASSET_JUDGE_ENABLED" .env.example`（存在且注释正确）

- [ ] **Step 4: 提交**

```bash
git add .env.example
git commit -m "docs(hybrid): document ASSET_JUDGE_ENABLED switch in env example"
```

---

## Self-Review 结论

- **覆盖**：T34 评审 3 条低严重度（server 日志可见性/端口预检/runbook 口径）+ M4 评审 env 文档登记全部落地。
- **无占位符**：全部步骤含可运行代码/命令与预期输出。
- **范围**：试点脚本（验收断言与退出码语义不变）+ 手册口径 + .env.example，无产品代码改动。
