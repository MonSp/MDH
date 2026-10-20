---
feature: agent-kernel-program-runtime
status: delivered
updated: 2026-10-19
branch: main
commits: agent-kernel@40e0e57; MDH@c381d0e
---

# agent-kernel Program Runtime

## Report

**What was built** — C++ agent-kernel 新增 `Program::ProgramLibrary`：磁盘程序包库（manifest.json）+ 组装编译（`compileProgram` 写 candidate 包）+ 关键词/TTL/模型新鲜度匹配 + `python -I` 子进程免 LLM 执行（`llm_calls=0`）+ promote/validation/lineage。8 个 IPC 方法接入 `AgentKernelBridge`；环境变量 `AGENT_KERNEL_PROGRAM_DIR` / `PROGRAM_PYTHON`。MDH `AgentKernelClient` 补齐对应 Python 封装。**边界**：LLM 代码生成与 pytest 门禁仍在 MDH Python；kernel 负责共享运行时与元数据（Game 可复用）。

**Verification** — agent-kernel `kernel_tests` 全绿（含 `test_program_library` 5 项：id/compile/list/promote+match+run/lineage）；MDH `tests/test_agent_kernel_program_client.py` 4 passed。daemon 可编译链接。

**Unverified** — daemon 实网 socket 冒烟（本机未起 daemon）；Game 侧接入未做（API 已就绪）。

**Journey log** —
1. C++ 无 YAML 依赖 → kernel 以 manifest.json 为主格式，与 Python registry 目录同构共存。
2. `compileProgram` = 组装写盘，不是 LLM 生成——避免在 C++ 重做 ProgramCompiler。
3. 单 kernel_tests 二进制：新测试导出 `runProgramLibraryTests()` 由 `test_ecs_core` main 调用。

## [S1] Problem

program-pivot 的程序库与免 LLM 执行完全在 MDH Python 侧（`program_registry` / `program_executor`）。C++ agent-kernel（MDH-Company 与 MDH-Game 共享）没有任何 ProgramPack 概念：无法在内核层列表/匹配/运行程序，Game 或其他宿主无法复用同一程序资产。

## [S2] Design

### 职责边界

| 层 | 职责 |
|----|------|
| **agent-kernel (C++)** | ProgramPack 磁盘库：编译组装（写盘+结构校验）、列表/读取、关键词匹配+新鲜度过滤、免 LLM 子进程执行、lineage 追加、验证记录 |
| **MDH Python** | LLM 轨迹编译（ProgramCompiler）、测试门禁 pytest（PromotionGate）、LLM 审阅/修订、三分法路由接线；编译产物经 IPC `compileProgram` 或直接共享目录注册进 kernel |

**不把** LLM 调用、pytest 门禁塞进 C++——与 Python 侧 T3/T4 契约重叠且难维护。

### 磁盘布局（与 Python registry 同构）

```
<base_dir>/<program_id>/
  manifest.json     # kernel 主格式（Python 可同步写入）
  manifest.yaml     # 可选，Python 原生格式；kernel 读 json 优先
  main.py
  tests/test_main.py
  lineage.json
```

### IPC 方法

| method | params | 返回 |
|--------|--------|------|
| `listPrograms` | `{status?}` | `{programs:[...]}` |
| `getProgram` | `{programId}` | manifest + 路径 |
| `compileProgram` | `{programId,version,description?,keywords?,mainPy,testPy,modelDependency?}` | 组装 candidate 包（写盘） |
| `matchProgram` | `{task,model?,maxAgeDays?}` | `{programId}` 或空 |
| `runProgram` | `{programId,payload,timeoutMs?}` | `{ok,stdoutJson,exitCode,timedOut,durationMs,llmCalls:0}` |
| `promoteProgram` | `{programId,validatedModel}` | 状态→promoted + lineage |
| `recordProgramValidation` | `{programId,model}` | 刷新 last_validated_* |
| `appendProgramLineage` | `{programId,event}` | 追加血缘 |

- `compileProgram` = **组装编译**：校验 program_id、写 main.py/tests/manifest.json（status=candidate）。LLM 生成源码仍在 Python。
- `runProgram`：`python3 -I`（或 `PROGRAM_PYTHON`）子进程，cwd=pack，stdin 一行 JSON，stdout 一行 JSON；超时 SIGKILL。
- `matchProgram`：仅 `status==promoted` 且新鲜（TTL 天数 + last_validated_model 与请求 model 一致，若双方都给了）。

### 错误码（error 字符串前缀）

`INVALID_ID` / `NOT_FOUND` / `ALREADY_EXISTS` / `NOT_CANDIDATE` / `RUN_FAILED` / `TIMED_OUT` / `BAD_REQUEST`

### 环境变量

- `AGENT_KERNEL_PROGRAM_DIR`：程序库根目录（默认 `./program_packs`）
- `PROGRAM_PYTHON`：执行解释器（默认 `python3`）

### 测试边界

- 单测：id 校验、compile 写盘、promote 状态、match 关键词/TTL/模型、run 成功/超时/非法输出、lineage 追加。
- 不测：LLM 编译质量、pytest 门禁（仍归 Python）。

## [S3] Out of Scope

- C++ 内嵌 LLM 代码生成
- C++ 跑 pytest 晋升门禁
- MDH 路由改走 kernel（Python executor 仍为默认；kernel 为共享运行时）
- manifest.yaml 完整 YAML 解析（kernel 以 manifest.json 为准）

## Tasks

- [x] T1: ProgramLibrary + ProgramRuntime C++ 模块 — acceptance: 单测覆盖 compile/list/get/promote/match/run/lineage（covers: S2）
- [x] T2: IPC 协议与 AgentKernelBridge 接线 — acceptance: 方法常量 + handler + library 链接；daemon 可编译（covers: S2; depends: T1）
- [x] T3: MDH Python 客户端扩展 — acceptance: `AgentKernelClient` program_* 方法 + 单测（covers: S2; depends: T2）
