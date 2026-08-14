---
feature: deepseek-harness-code-principles
status: designed
updated: 2026-08-14
branch: analysis/dsh-code-principles
commits: <base-sha>..<head-sha> # filled at delivery
---

# DeepSeek Harness 深层代码原理挖掘

## Report

（交付时填写）

## [S1] Problem

MDH 的 P3 方向已吸收 5 项 dsh 理念（session log 上下文真相源、subagent 委托、配置层插件化、快照/评测门禁、守卫/沙箱系统化），但该吸收基于 dsh 的 README/架构文档层，未落到实际代码取证。用户要求对 `/home/test/deepseek-harness`（0.1.0-rc.5，pnpm monorepo，约 130 个 `@deepseek-ai/dsh-*` 包、约 19 万行 TypeScript）做**全库原理挖掘**，还原其深层代码机制，为 MDH P3 的落地实施提供代码级依据（只借鉴原理，不依赖其 API）。

## [S2] Design

交付一份持久化分析文档（本文档），正文含四部分：

1. **架构总览**（S2.1）— 基于代码取证描述 dsh 的插件化运行时形态：Cordis 组合（profile/bundle/patch 分层）、capability seam 三角色（Service Definition / Service Provider / Consumer）、事件三类域（session/agent/capability）、turn/step 循环。
2. **十组主线深挖**（S2.2）— 每组一个章节，全部论断带真实 `file:line` 引用：
   - 主线 1 核心主轴：turn/step 循环、session log 真相源、tools 管线（`packages/core/*`）
   - 主线 2 subagent 委托：委托模型、provider 族、进程外代理（`packages/subagent/*`）
   - 主线 3 配置层插件化：boot/组合、bundle/patch、preset、Cordis 自修改（`packages/boot|bundle|preset|extensions/*`）
   - 主线 4 执行世界：fs/shell/subprocess/terminal 本地执行 + sandbox/e2b/code-runtime 隔离（`packages/fs|shell|subprocess|terminal|sandbox|e2b|code-runtime/*`）
   - 主线 5 模型层与上下文：llm 适配器族、compaction、context 注入、skill 注册、web/lsp/mcp 工具（`packages/llm|compaction|context|skill|web|lsp|mcp/*`）
   - 主线 6 会话持久化与查询：session 事件持久化/投影/标题/遥测、storage、session-query（`packages/session|storage|session-query/*`）
   - 主线 7 协议与宿主：api gateway/remotes、sdk JSON-RPC、acp、typert 类型图、hooks 桥、client 连接/运行时（`packages/api|sdk|acp|typert|hooks|client/connection|client/runtime|host/*`）
   - 主线 8 任务形态：workflow、goal、plan、todo、schedule、jobs（`packages/workflow|goal|plan|todo|schedule|jobs/*`）
   - 主线 9 安全与交互：interaction（approval/permission/commands/ask-user）、guard、identity、credentials、settings、feedback、spill（`packages/interaction|guard|identity|credentials|settings|feedback|spill/*`）
   - 主线 10 工程纪律与门禁：keyless snapshot 基础设施、100% 覆盖率门禁、doc-sync gates、`.agents` Agent Notes、BENCHMARK（`packages/test-support/*`、`scripts/`、`docs/`、`.agents/`）
3. **深层原理提炼**（S2.3）— 每条原理 = 名称 + 机制描述 + 关键 `file:line` + 与 MDH 的关系（借鉴/对照/警示）。原理按主题聚合（如：真相源单一化、效果可逆组合、seam 互换、确定性验证优先、上下文工程等），不按包罗列。
4. **对 MDH P3 实施的启示**（S2.4）— 将 5 项已定方向 + 新发现原理映射到具体可借鉴机制（如：MDH 会议/执行记录如何升级为 append-only log；TS orchestrator 如何引入 subagent 委托；roles_config + CoW 增量如何对齐 bundle/patch 分层；loop-engineering 如何引入 keyless snapshot 回放）。

契约：

- 所有论断引用 dsh 真实代码路径（`packages/<group>/<pkg>/src/...`），交付前逐一核验存在性；
- 文档语言为中文，技术术语保留原文；
- 调研工作区文件（`research/dsh-code-principles/findings/*.md`）不提交到特性分支，仅本文档提交；
- 每条主线找到的"深层原理"必须给出机制层面的解释（为什么这样设计、解决什么问题），而非文件内容罗列。

## [S3] Out of Scope

- 不修改 dsh 代码；不评估其 API 兼容性/迁移路径（developer preview，只借鉴原理）；
- 不产出 P3 实施代码或实施计划（仅到"可借鉴机制"粒度）；
- `client/ui-*` React 组件与 `website/` 仅提取架构相关原理，不逐组件穷举表现层细节；
- `vendor/`（Cordis 上游源码）与 `python/`（Python SDK）不作为主线，仅在影响主架构理解时引用。

## Tasks

- [ ] T1: 主线 1 核心主轴深挖（turn/step、session log、tools 管线）— acceptance: findings 覆盖 agent-loop/session/tools/system-prompt/scope 的机制与不变量，带 file:line（covers: S2.2-1）
- [ ] T2: 主线 2 subagent 委托深挖 — acceptance: findings 覆盖委托模型/生命周期/进程外代理/多 provider 差异，带 file:line（covers: S2.2-2）
- [ ] T3: 主线 3 配置层插件化深挖 — acceptance: findings 覆盖 boot 组合/bundle patch/preset/Cordis 自修改机制，带 file:line（covers: S2.2-3）
- [ ] T4: 主线 4 执行世界深挖（本地 + 沙箱/远端）— acceptance: findings 覆盖 fs 策略/shell/subprocess/terminal/sandbox/e2b/code-runtime 的执行与隔离机制，带 file:line（covers: S2.2-4）
- [ ] T5: 主线 5 模型层与上下文深挖 — acceptance: findings 覆盖 llm 适配器/compaction/context/skill/web/lsp/mcp，带 file:line（covers: S2.2-5）
- [ ] T6: 主线 6 会话持久化与查询深挖 — acceptance: findings 覆盖事件持久化/投影/标题/遥测/storage/查询，带 file:line（covers: S2.2-6）
- [ ] T7: 主线 7 协议与宿主深挖 — acceptance: findings 覆盖 api/sdk/acp/typert/hooks/client 连接与运行时，带 file:line（covers: S2.2-7）
- [ ] T8: 主线 8 任务形态深挖 — acceptance: findings 覆盖 workflow/goal/plan/todo/schedule/jobs，带 file:line（covers: S2.2-8）
- [ ] T9: 主线 9 安全与交互深挖 — acceptance: findings 覆盖 approval/permission/guard/credentials/settings/spill 等，带 file:line（covers: S2.2-9）
- [ ] T10: 主线 10 工程纪律与门禁深挖 — acceptance: findings 覆盖 snapshot/覆盖率门禁/doc-sync/Agent Notes/BENCHMARK，带 file:line（covers: S2.2-10）
- [ ] T11: 综合撰写分析文档（S2.1/S2.3/S2.4 + 十组主线整合）— acceptance: 正文完成，每条论断带可解析 file:line，原理提炼与 P3 启示章节完整（covers: S2.1, S2.2, S2.3, S2.4; depends: T1-T10）
- [ ] T12: 引用完整性验证 — acceptance: 全部 file:line 引用存在且行号在范围内，无 TBD/占位符，任务勾选与状态一致（covers: S2; depends: T11）
- [ ] T13: 独立子代理评审 — acceptance: 评审三项结论（规格合规/事实正确/风格一致）全部通过或差异已解决（covers: S2; depends: T12）
