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

- [x] T1: 主线 1 核心主轴深挖（turn/step、session log、tools 管线）— findings/01-core.md，12 条原理（covers: S2.2-1）
- [x] T2: 主线 2 subagent 委托深挖 — findings/02-subagent.md，10 条原理（covers: S2.2-2）
- [x] T3: 主线 3 配置层插件化深挖 — findings/03-composition.md，10 条原理（covers: S2.2-3）
- [x] T4: 主线 4 执行世界深挖 — findings/04-execution.md，12 条原理（covers: S2.2-4）
- [x] T5: 主线 5 模型层与上下文深挖 — findings/05-model-context.md，12 条原理（covers: S2.2-5）
- [x] T6: 主线 6 会话持久化与查询深挖 — findings/06-persistence.md，10 条原理（covers: S2.2-6）
- [x] T7: 主线 7 协议与宿主深挖 — findings/07-protocol-host.md，10 条原理（covers: S2.2-7）
- [x] T8: 主线 8 任务形态深挖 — findings/08-task-shapes.md，10 条原理（covers: S2.2-8）
- [x] T9: 主线 9 安全与交互深挖 — findings/09-safety-interaction.md，10 条原理（covers: S2.2-9）
- [x] T10: 主线 10 工程纪律与门禁深挖 — findings/10-engineering-discipline.md，8 条原理（covers: S2.2-10）
- [ ] T11: 综合撰写分析文档（S2.1/S2.3/S2.4 + 十组主线整合）— acceptance: 正文完成，每条论断带可解析 file:line，原理提炼与 P3 启示章节完整（covers: S2.1, S2.2, S2.3, S2.4; depends: T1-T10）
- [ ] T12: 引用完整性验证 — acceptance: 全部 file:line 引用存在且行号在范围内，无 TBD/占位符，任务勾选与状态一致（covers: S2; depends: T11）
- [ ] T13: 独立子代理评审 — acceptance: 评审三项结论（规格合规/事实正确/风格一致）全部通过或差异已解决（covers: S2; depends: T12）

---

## 分析正文

> 调研对象：`/home/test/deepseek-harness` @ `47f943859b`（release 0.1.0-rc.5），pnpm monorepo，约 130 个 `@deepseek-ai/dsh-*` 包、约 19 万行 TypeScript。调研日期 2026-08-14。所有 `packages/...` 引用均相对 dsh 仓库根。原始取证见 `research/dsh-code-principles/findings/*.md`（10 份，共 104 条原理，未提交）。

### 一、架构总览（S2.1）

dsh 是 DeepSeek 开源的 **agent 运行时平台（harness）**：以 vendored Cordis 为底座，把"整个产品"（模型适配器、工具注册表、session 日志、agent loop 本身）全部实现为可组合插件——slogan **"Everything is a Plugin"**。它不是又一个多智能体框架，而是"单个 agent 的执行基础设施 + 任意可替换能力"的宿主，subagent 只是其众多能力之一。以下四层形态是全部 104 条原理的骨架：

1. **组合层（配置即代码）**：运行中的 dsh 是一棵 boot 时从有序层叠合成的插件树——profile（命名组合）→ bundle（发布格式）→ patch（按行 id 替换）。根 `cordis.yml` 恒为空，boot 把各层 patch 扁平化后**一次调用**完成组合（`apps/cli/src/profile-boot.ts:60-64`）；任何一行都可被上层 patch 整行替换。详见主线 3。
2. **能力缝（capability seam）**：每个可替换能力（fs/shell/llm/skill/web/subagent/workflow/…）都按三角色分包——**Service Definition**（抽象类 + 类型词汇 + 事件槽）、**Service Provider**（实现，可多个并存）、**Consumer**（模型面工具）。"一个 provider swap 改变整个产品"是设计的直接目标（`packages/fs/fs-sandbox/src/index.ts:52-59`）。详见主线 4/5。
3. **事件三域**：session 事件（durable，追加进 log）、agent 事件（live，携带 Agent 句柄）、capability 事件（把策略挂到缝上）。session 事件与 agent 事件各带独立的**类型合并（declare module）**扩展机制。详见主线 1。
4. **turn/step 循环**：一个 turn = 0..n 个 step；一个 step = 一次模型请求 + 其工具调用。循环由 phase 状态机驱动（idle/maintenance/running），输入经 inbox 投递、经 `agent/pre-step` 等 waterfall 关卡协商。详见主线 1。

贯穿全局的四条不变量（均在代码中可证）：
- **model-visible ⟺ logged**：凡到达模型请求的内容必须能从 session log 重建，invariant 插件在 `llm/stream` 上抢占式断言 `messages === deriveMessages()`（`packages/core/agent-loop/src/invariant.ts:19`）。
- **Registrations are effects**：一切注册（服务/工具/监听器/prompt section）都是 fiber 上可逆 effect，卸载即逆序回滚（`docs/cordis-primer.md:13`）。
- **无特权核心**：核心只提供"注册表 + 事件流 + 统一 RPC 载体"三层原语，权限/业务/外部接入全部外置为可替换拦截器（`packages/client/connection/src/rpc-host.ts:71-92`）。
- **失败即数据**：跨缝边界的失败一律归一化为带码结果/终态（LLM finish chunk、subagent stopReason、工具 isError），不向上冒泡成裸异常（`packages/llm/llm/src/index.ts:843-900`）。

### 二、十组主线深挖（S2.2）

#### 主线 1：核心主轴——turn/step、session log、tools 管线（`packages/core/{agent-loop,agent,session,tools,system-prompt,scope,agent-default-model,agent-tool-presentation}`）

- **P-1.1 驱动循环 = turn/step 双层 + phase 状态机**：输入投递（send/steer/inject）与执行解耦，`wakeDriver` 单驱动收敛 + wake latch，cancel 经 AbortSignal 在 step 边界退出（`packages/core/agent-loop/src/agent.ts:172,246,332`）。
- **P-1.2 inbox 是 session log 上的 durable 投影**：每次变更先 append `agent/inbox/spliced` 落库再改内存投影，构造时重放恢复——崩溃/重启不丢 pending 输入（`packages/core/agent/src/inbox.ts:28,71,158`）。
- **P-1.3 session log = append-only 事件溯源真相源**：`append()` 是唯一写路径（lossless-JSON 快照→校验→deepFreeze→seq=log.length 连续），持久化由插件订阅异步完成（`packages/core/session/src/index.ts:604,565,539`）。
- **P-1.4 SessionEventMap 是 merge-extensible 事件词汇表**：插件用 `declare module` 扩展事件类型；编译器约束只有三类消息事件能携带 surfaceOp（`packages/core/session/src/types.ts:236,336,422`）。
- **P-1.5 ignorable + SESSION_FORMAT_VERSION 前向兼容双保险**：未知事件无 ignorable 标记读端必须拒绝重构（宁可过度拒绝），bump 只由 writer 判定（`packages/core/session/src/types.ts:56,422`）。
- **P-1.6 surface + deriveMessages："model-visible ⟺ logged" 运行时断言**：只有三种消息事件能上 surface；模型请求必须 JSON 等于日志派生，invariant 抢占式断言（`packages/core/session/src/index.ts:726`、`packages/core/session/src/surface.ts:83`、`packages/core/agent-loop/src/invariant.ts:19`）。
- **P-1.7 pre-step 是请求协商单一关卡**：claim→systemPrompt.assemble→runtimeContext.project→`agent/pre-step` waterfall，插件可改写输入或 reject（`packages/core/agent-loop/src/agent.ts:225`）。
- **P-1.8 waterfall `next()` 委托 = around-middleware**：核心默认行为都是链最内层 next，可被插件替换；模型选择是"装配时快照 + agent/request 覆盖"两 waterfall 协作（`packages/core/agent/src/dispatch.ts:107`、`packages/core/agent-loop/src/agent.ts:407`）。
- **P-1.9 tools 注册与 per-agent 作用域隔离**：ScopedLayers 全局层 + per-scope 层，`agent.ctx` 注册即 per-agent，scoped 遮蔽全局，卸载随 fiber 自动拆除（`packages/core/tools/src/index.ts:1037,1204`、`packages/core/scope/src/store.ts:159`）。
- **P-1.10 工具执行管线 pre/execute/post 三段 waterfall + 单调 guard**：审批/超时/审计做插件层，guard 只可拒绝不可放行，wrapper 只替换 signal（`packages/core/tools/src/index.ts:1463,1569,1742`）。
- **P-1.11 工具调度器 exclusive barrier + parallel 有界池 + 模型序提交**：执行可重叠但 tool/call↔tool/result 按模型序落库，abort 补合成结果保重放有效（`packages/core/agent-loop/src/tool-calls.ts:62,116,30`）。
- **P-1.12 scope = per-agent 注册原语**：createScope（scope=fiber 生命周期）+ scopeTarget（祖先链 filter）+ bindScopeParent（环检测）（`packages/core/scope/src/index.ts:137,170,72`）。

#### 主线 2：subagent 委托（`packages/subagent/*`，11 包）

- **P-2.1 三角色分包 + 多 Provider 注册表**：Service（`ctx.subagents` 注册表 + 校验 + 生命周期）与各 Provider（spawn/fork/codex/claude-code/acp/dsh-sdk）物理隔离，按名共存（`packages/subagent/subagent/src/index.ts:171,369,414`）。
- **P-2.2 能力声明 + fail-loud 门禁**：Provider 声明 `SubagentCapabilities` 四旗标，缺失即 typed rejection，进程外一律 `NO_START_CAPABILITIES`（`packages/subagent/subagent/src/types.ts:86`、`packages/subagent/tool-subagent/src/index.ts:281`）。
- **P-2.3 spawn vs fork 唯一差异是 seed**：fork 以父已完成 turn 前缀做 seed，`inheritsParentContext` 驱动模型面如实措辞（`packages/subagent/subagent-fork-in-process/src/index.ts:48`、`packages/subagent/tool-subagent/src/index.ts:211`）。
- **P-2.4 one-shot run 契约**：发布即所有权转移；result 永不 reject（折叠成 stopReason），仅基础设施故障才 reject；dispose 幂等（`packages/subagent/subagent/src/types.ts:249`、`packages/subagent/subagent/src/out-of-process.ts:156`）。
- **P-2.5 进程外桥接三姿势 + 共享 dispose 阶梯**：codex（自研 JSON-RPC）、claude-code（Agent SDK + spawn 接管）、acp（ndjson）；共享 EOF→SIGTERM→SIGKILL 与结果选择（`packages/subagent/subagent-codex/src/run.ts:116`、`packages/subagent/subagent-acp/src/run.ts:199`）。
- **P-2.6 delegation depth 深度预算**：header 持久化 delegationDepth 为单调下限，resume 的父代理不能伪装顶层重新委托；超限抛 `SubagentDepthError`（`packages/subagent/subagent/src/depth.ts:28`）。
- **P-2.7 生命周期事件对 subagent/start→end**：成对、按父 scope 过滤、continuable epoch 切片只算本 epoch 输出（`packages/subagent/subagent/src/lifecycle.ts:100,133`）。
- **P-2.8 continuable 子代理**：持久化 descriptor + 冷恢复 + Activation 所有权图（父在子未清前不 settle）+ 结算 notice 回传（`packages/subagent/subagent/src/continuation.ts:403,476,883`）。
- **P-2.9 子代理是独立 Session**：fork 含父历史 seed；投影折叠为唯一分类权威 + seq 门（`>= seedLength` 才是子自身 descriptor）+ 三层读取阶梯（`packages/subagent/subagent/src/projection.ts:142`）。
- **P-2.10 tool 族三形态**：subagent（前台/后台/continuable）+ 全局 send_message/interrupt/list_agents + 子作用域 report 工具，模型面只碰稳定工具名（`packages/subagent/tool-subagent/src/index.ts:369`、`packages/subagent/tool-subagent-control/src/index.ts:27`）。

#### 主线 3：配置层插件化（`packages/{boot,bundle,preset,extensions}`）

- **P-3.1 空根 + 全 patch 单次组合**：根 cordis.yml 恒为 `[]`，boot 把各层 patch 扁平化后一次 `applyEntryPatches` 组合，`--dump-config` 与真实挂载看到同一棵树（`packages/boot/app-boot/src/profile.ts:413-420`、`apps/cli/src/profile-boot.ts:60-64`）。
- **P-3.2 分层后写赢 + structuredClone 隔离**：层序 bundle→profile→home→--patch；patch 按 id 整行替换 config 或 insert，reload 必须 clone 防用户 override 被烘焙进 bundle（`apps/cli/src/profile-boot.ts:122-129`）。
- **P-3.3 bundle 即 npm 包**：`dsh.bundle.patch` 指向包内 patch 文件，配置随版本发布；base bundle 的 src 是空壳（`packages/bundle/base/package.json:36-39`）。
- **P-3.4 profile 自动初始化 + HMR 热重载**：首次使用按模板生成、幂等不覆盖；用户 patch 层 watcher 变更即事务性重组（`packages/boot/app-boot/src/profile.ts:104-111`）。
- **P-3.5 flag 即 service**：启动器只解析少量 flag，其余参数经 `ctx.cmdlineArgs` 交给 app，行配置 `!!js` 延迟读取 service（`packages/boot/cmdline/src/index.ts:68-72`）。
- **P-3.6 preset 会话级 standing mount**：每 preset 单飞挂载一次，agent 经 `bindScopeParent` 加入，子 agent 继承同代实例；文件 mtime+size 作代际 stamp（`packages/preset/agent-presets/src/index.ts:252,316-325`）。
- **P-3.7 isolate realm 强制 + 挂载审计**：service 必须进 isolate realm；挂载后审计 inactive/leaked 行，任一非空整体回滚（`packages/preset/agent-presets/src/mount.ts:57-112`）。
- **P-3.8 Registrations are effects**：一切注册是 fiber 可逆 effect，动态插件 stop/undefine 只需 `fiber.dispose()`（`docs/cordis-primer.md:13`、`packages/extensions/cordis-host-runner/src/lifecycle.ts:22-45`）。
- **P-3.9 模型自修改运行时**：inspect→define→run 三段式，不可变 package 版本（append 不覆盖）、VM 沙箱求值、side effect 必须可逆——模型不改源码不重启就能扩展自己的工具与 UI（`packages/extensions/tool-cordis/src/index.ts:148-238`）。
- **P-3.10 双半部插件**：宿主空 apply + 浏览器半部经 `exports["./client"]` 发布，host/client 经 package-private JSON-RPC 通信（`packages/extensions/cordis-client-runner/src/index.ts:1-9`）。

#### 主线 4：执行世界（`packages/{fs,shell,subprocess,terminal,sandbox,e2b,code-runtime}`）

- **P-4.1 seam 三角色 + 不透明目标身份**：抽象类 `FileSystem extends Service` 定义缝；`FsTargetKey`/`FsVersion` branded 不透明，消费唯一入口 `resolve()`（`packages/fs/fs/src/index.ts:86`、`vendor/cosmokit/src/types.ts:16,35`）。
- **P-4.2 request/spec 分离**：`resolve(request): Spec` 把默认化/封顶收敛为单一显式步骤，"This seam applies no defaults"（`packages/shell/shell/src/index.ts:85-100`、`packages/subprocess/subprocess/src/types.ts:69-104`）。
- **P-4.3 事件门实现"读后写"策略**：fs-observation-policy 零服务，纯 `fs/*` 事件监听记录观察状态，未见/过期即拒绝写（`packages/fs/fs-observation-policy/src/index.ts:28,106-130`）。
- **P-4.4 原子写 + version CAS + 每键锁**：`dev:ino:size:mtimeNs` 版本令牌 + per-targetKey FIFO 尾链锁 + staging 独占写后 rename（`packages/fs/fs-local/src/fsio.ts:73-76,533-615`）。
- **P-4.5 沙箱 = 可信代码里的策略围栏**：fs-sandbox 继承 fs-local 只围变异操作、re-resolve 防 TOCTOU，明确"非内核边界"（`packages/fs/fs-sandbox/src/index.ts:10-18,126-148`）。
- **P-4.6 subprocess 进程树**：detached 进程组 + 树级 SIGTERM→SIGKILL + 全树退出观察，销毁 await 整树而非直接子进程（`packages/subprocess/subprocess-local/src/spawn.ts:350-361,439-453`）。
- **P-4.7 输出 tail+spill+偏移读**：有界内存尾 + 0700/O_EXCL spill 文件 + whole-stream 偏移读不互扰（`packages/subprocess/subprocess-local/src/spawn.ts:89-92,207-218`）。
- **P-4.8 sandbox `confine(argv)` 抽象**：只包装 argv、per-call policy、多 runner 链 fail-closed、按后端方言分类拒绝/runner 失败（`packages/sandbox/sandbox/src/index.ts:158-176`、`packages/shell/bash-sandbox/src/helpers.ts:67-116`）。
- **P-4.9 严格加宽升降级**：`WIDER_MODES` 表 + 执行时校验 + approval 前置 + 单次生效（`packages/sandbox/sandbox/src/escalation.ts:28-41,157-189`）。
- **P-4.10 策略单一源**：sandboxPolicy 折叠 session log 事件（`sandbox/mode` last-wins）+ writableRoots 共享防 fs/bash 漂移（`packages/sandbox/sandbox-policy/src/index.ts:91-142`、`packages/sandbox/sandbox-policy/src/session-mode.ts:52-58`）。
- **P-4.11 provider 互换 = 产品互换**：subclass swap 换沙箱；e2b 用 fs/subprocess 两个 provider 共享同一远端 Linux 世界（`packages/fs/fs-sandbox/src/index.ts:52-59`、`packages/e2b/e2b/src/index.ts:74,151-179`）。
- **P-4.12 code-runtime worker-thread**：hostile-peer 端口协议（伪造字段丢弃）+ 忙时预算（ELU 采样，不可骗）+ `worker.terminate()` 硬终止，失败即结果字段（`packages/code-runtime/code-runtime-worker-thread/src/index.ts:142-165,424-440`）。

#### 主线 5：模型层与上下文工程（`packages/{llm,compaction,context,skill,web,lsp,mcp}`）

- **P-5.1 LLM 适配器 seam = 统一词汇 + 抽象服务**：`LlmRuntime extends Service`，`LlmAdapter` 只强制实现一个 `stream()`；下游只消费 Provider-neutral 词汇（Message/ContentBlockMap/StreamChunk），"Adapters alone translate provider wire messages"（`packages/llm/llm/src/types.ts:2-4`、`packages/llm/llm/src/index.ts:180-233`）。
- **P-5.2 失败即数据**：adapter 的 throw 归一化为终态 finish chunk（kind: error|aborted + 快照 failure），消费者只处理一种结束形态；retry 按稳定 code 路由（`packages/llm/llm/src/index.ts:843-900`、`packages/llm/llm/src/adapter-failure.ts:16-28`）。
- **P-5.3 消息/块词汇 merge-extensible**：`MessageSourceMap`/`ContentBlockMap` 是字面量键 map，插件 declare-module 追加领域 kind（skill-catalog 等），核心 switch 后 fall-through 未知值（`packages/llm/llm/src/types.ts:99-110`、`packages/skill/tool-skill/src/index.ts:43-47`）。
- **P-5.4 adapter 注册全有或全无 + 原子 replace + 策略随注册捕获**：`registerAdapter` 整体校验一次提交，`replace()` 无观察间隙，retry policy 注册时快照，`llm/adapters-updated` 通知（`packages/llm/llm/src/index.ts:338-367,374-413`）。
- **P-5.5 llm-retry = 策略属 provider、执行挂 agent 失败扩展点、"先落盘再等待"**：重试次数从 durable session 事件统计，先 append `llm/retry` 再进入可取消等待（`packages/llm/llm-retry/src/index.ts:150-153,156-208`）。
- **P-5.6 token-meter = 重放式折叠 + 固定密度启发式**：CHARS_PER_TOKEN=4 等常量估算，provider usage 仅在同 header 且不小于启发式锚时作 baseline（`packages/llm/token-meter/src/estimate.ts:13-19`、`packages/llm/token-meter/src/index.ts:116-147`）。
- **P-5.7 compaction = 服务定义与后端分离，durable 事件当锁**：append `compaction/start`（锁）→ LLM 总结 → 稳定性复核（deepStrictEqual）→ `summary` + surfaceOp replace → `end`；失败恰好一次 end（`packages/compaction/compaction/src/index.ts:96-170`、`packages/compaction/compaction-basic/src/region.ts:98-134,426-478`）。
- **P-5.8 压缩调用复用会话前缀做 KV 缓存对齐**：COMPACTION_INSTRUCTION 作为最后一条 user 消息（真前缀）；`purpose='compaction'` 映射 header；"摘要必须小于被遮蔽内容"防回环（`packages/compaction/compaction-basic/src/summarizer.ts:31-66`、`packages/compaction/compaction-basic/src/region.ts:369-378`）。
- **P-5.9 tool-result-pruner 无模型确定性修剪**：head+marker+tail（按 code point 不劈代理对）+ shadow-price 记账事件（`compaction/prune`），先于 LLM 总结执行（`packages/compaction/compaction-tool-result-pruner/src/index.ts:83-122,136-184`）。
- **P-5.10 上下文注入 = 带 source 的 user 消息 + pre-step enter**：所有 context 包统一 createUserMessage + 富 MessageSource（kind+form），注入顺序确定（背景在前、指令在后）（`packages/llm/llm/src/message.ts:48-94`、`packages/context/agent-instructions/src/index.ts:322-348`）。
- **P-5.11 skill = provider 注册表 + 分层作用域 + 渐进披露**：catalog 只列摘要（`<available_skills>`）、加载才给全文；rank 层内决胜、collect 缓存按 revision 失效（`packages/skill/skill/src/index.ts:482-549`、`packages/skill/tool-skill/src/index.ts:254-276`）。
- **P-5.12 web/lsp/mcp 同一 seam 模式**：注册表 + 执行期选择（configured>唯一可用>报错）+ 归一化输出 + 确定性命名（`mcp__<server>__<raw>`）（`packages/web/web/src/index.ts:140-163`、`packages/mcp/mcp-client/src/tools.ts:96-102`）。

#### 主线 6：会话持久化与查询（`packages/{session,storage,session-query}`）

- **P-6.1 三层写路径**：live Session（内存权威）/PersistenceCoordinator（编排）/Backend（最小原语，薄实现委托回 coordinator）（`packages/session/session-persistence/src/coordinator.ts:127,1086`）。
- **P-6.2 有界 write-behind**：固定 deadline（200ms）合并 + `flush()` quiescence barrier + 写失败 batch 保留并暂停自动重试（`packages/session/session-persistence/src/write-behind.ts:45,63,139`）。
- **P-6.3 双版本机制**：`SESSION_FORMAT_VERSION`（事件词汇，随 header 落库）与 SQLite `SCHEMA_VERSION=15`（表布局，`user_version`）正交；老格式 fail-loud 拒绝、绝不迁移（`packages/session/session-persistence-sqlite/src/schema.ts:20,105`、`packages/session/session-persistence/src/coordinator.ts:1046`）。
- **P-6.4 append-only + torn-tail 恢复**：JSONL link+unlink 原子发布（防并发覆盖）、写失败 truncate 回滚；崩溃 turn 补合成 `turn/end{interrupted}` 而非删大 turn（`packages/session/session-persistence-jsonl/src/index.ts:543,651`、`packages/session/session-persistence/src/coordinator.ts:903`）。
- **P-6.5 durable facts/live state 分界**：SessionPreparations 冷读共享 + 独占预留 + revision 校验 + seed 匹配（`packages/session/session-persistence/src/preparations.ts:75,53,266`）。
- **P-6.6 投影 = 纯函数 fold + eager drive + 可重建可缓存**：`init/apply/view` + `stateVersion`；缓存只是 fold shortcut（ver/越界即丢弃重折），写缓存前先 flush 日志（`packages/session/session-projection/src/index.ts:405,271,355`、`packages/session/session-projection-cache/src/index.ts:140,166`）。
- **P-6.7 标题 = 日志普通事件**：`session/title` log-only 事件 + foldSessionTitle 重建 + 多 provider（first-prompt/all-prompts/user-pin 钉住）（`packages/session/session-title/src/index.ts:191,363`）。
- **P-6.8 session-query**：live-preferred 逻辑语料 + 可整体重建的 FTS5 derived read model（schema 不匹配即重建）+ 5 个模型工具（cwd 作用域、当前会话截断到 step 前防自窥）（`packages/session-query/session-query/src/corpus.ts:88`、`packages/session-query/session-query-sqlite/src/schema.ts:96,127`、`packages/session-query/tool-session-query/src/index.ts:66`）。
- **P-6.9 storage 三层 + durable-first 单写链**：先落盘后改内存再发 `domain/changed`；JSON 整文件原子替换 vs SQLite 行级写共用 domain 契约（`packages/storage/storage-domain/src/domain.ts:263,307,251`、`packages/storage/storage-json/src/atomic.ts:24`）。
- **P-6.10 语义检查点 + 遥测投影**：llm/stream、tools/execute、agent/pre-step 边界前强制 flush（fail-closed）；chunk 固定投影（每 turn:step 只发首个 chunk）+ handoff cursor at-most-once + 脱敏 waterfall（`packages/session/session-checkpoint-policy/src/index.ts:63`、`packages/session/session-telemetry/src/coordinator.ts:43,180`）。

#### 主线 7：协议与宿主（`packages/{api,sdk,acp,typert,hooks,client/connection,client/runtime,host}`）

- **P-7.1 编译期类型图 → 跨进程协议**：Typert generator 从 Host `ts.Program` 严格分析 `@Remote` 方法，渲染 Zod schema + descriptor + 双向类型声明，两端异 Program 仍类型同步（`packages/typert/generator/src/analyzer.ts:953-1018`、`packages/typert/generator/src/emitter.ts:331-394`）。
- **P-7.2 双描述符调度**：Gateway 优先严格 descriptor，开发期（tsx 源码）走 SRC 弱回退；已注册又撤回的 endpoint 禁止降级（`packages/api/gateway/src/index.ts:224-234`）。
- **P-7.3 lookup/context 依赖倒置**：参数名决定 wire 身份，宿主 `configure()` 注入 resolver 覆盖默认 provider，卸载即恢复（`packages/typert/registry/src/service.ts:216-334`、`packages/api/remotes/src/agent-lookup.ts:121-211`）。
- **P-7.4 无特权核心**：Connection 是唯一 RPC 载体，Gateway/ApiProxy 只是 `intercept('/api')` 拦截器，认领不到就回落；载体可整体替换（`packages/client/connection/src/rpc-host.ts:71-92`、`packages/api/gateway/src/index.ts:105-142`）。
- **P-7.5 四象限 RPC 消息模型**：`client-request/server-response/server-request/client-response` 判别联合 + 发起方铸造 rpcId 应答回显，一套线格式覆盖单呼/下行流/应答式交互（`packages/host/apiproxy/src/api/rpc.ts:151-187`）。
- **P-7.6 浏览器信任围栏**：Host 头绑定（DNS-rebinding）+ `sec-fetch-site` + Origin 三道防线；`PRIVILEGED_METHODS` 钉 loopback，明示"不是认证层"（`packages/client/connection/src/api-request-trust.ts:96-123`）。
- **P-7.7 hooks 桥 = 中立协议 + 方言适配器**：hook-protocol 归一化 HookOutput/matcher/merge（deny>ask>allow），CC/Codex 桥只做 payload 映射（`packages/hooks/hook-protocol/src/codec.ts:59-95`、`packages/hooks/hook-protocol/src/merge.ts:62-100`）。
- **P-7.8 只提交已确认事实**：ACP/SDK 只转发 committed assistant text；prompt 经 messageId→turn→whenIdle 三阶结算；权限只给一次性选项（`packages/acp/acp/src/index.ts:155-213,277-336`）。
- **P-7.9 UI 纯从 session/event 渲染**：事件窗口 + liveBuffer 拼接 + Host 计算投影（higher-seq-wins 缓存）+ Notifier 微任务批处理，客户端零领域折叠（`packages/client/runtime/src/client/sessions/session.ts:67-108`、`packages/client/runtime/src/client/sessions/notifier.ts:14-98`）。
- **P-7.10 进程边界即协议边界**：SDK 用 NDJSON JSON-RPC（3 请求 + 4 通知），Client 走 EOF→SIGTERM→SIGKILL 退出阶梯，整个 harness 可被子进程驱动（`packages/sdk/protocol/src/transport.ts:62-279`、`packages/sdk/client/src/dispose.ts:1-66`）。

#### 主线 8：任务形态（`packages/{workflow,goal,plan,todo,schedule,jobs}`）

- **P-8.1 workflow 能力 seam 三角色**：抽象 `WorkflowEngine` + worker-thread provider + tool-workflow consumer，一个实现即插即用（`packages/workflow/workflow/src/index.ts:157,168`）。
- **P-8.2 模型脚本在 escapable vm + worker thread 执行**：注入 5 个 hook（agent/parallel/pipeline/phase/log/args），`agent()` 经 MessagePort RPC 由 host `subagents.start()` 起真 subagent，值出 realm 前强制 plain JSON（`packages/workflow/workflow-worker-thread/src/runtime.ts:90-101`、`packages/workflow/workflow-worker-thread/src/host.ts:349`）。
- **P-8.3 脚本即数据**：tool-workflow 把脚本契约嵌进工具描述（模型写脚本）；tool-ralph 把固定 RALPH_SCRIPT 作部署常量（模型只供数据）——同一 seam 两种所有权（`packages/workflow/tool-workflow/src/index.ts:138`、`packages/workflow/tool-ralph/src/index.ts:90`）。
- **P-8.4 耐用记录走 session log**：workflow 投影为 `tool-workflow/*` 事件、goal 为 event-sourced 完整快照 `goal/change` + CAS 修订，读取 = 纯 replay fold、读侧 fail-loud（`packages/workflow/tool-workflow/src/index.ts:73`、`packages/goal/goal/src/index.ts:542`、`packages/goal/goal/src/fold.ts:339`）。
- **P-8.5 耐用 phase 与进程内 activation 分离**：phase 持久、'armed/disarmed' 永不持久化，session-start 强制 disarm——重启后自动续跑资格不复活（`packages/goal/goal/src/index.ts:198,236,311`）。
- **P-8.6 goal-round-driver 续跑 = 事件驱动 + pre-step 保留校验**：向 agent-loop 注入带 goal source 的 user message，`agent/pre-step` 做 reservation 校验（内容+revision+round）（`packages/goal/goal-round-driver/src/index.ts:138,349,334`）。
- **P-8.7 plan mode as logged state**：`plan/mode` 事件 last-wins 折叠，仅切换 `plan:policy` prompt section + 常驻 exit 工具；模式切换为待定意图、下一 accepted pre-step 才 append（`packages/plan/plan-mode/src/index.ts:129,205,425`）。
- **P-8.8 todo/schedule 状态形形态**：append + fold + 事件驱动唤醒；todo 整表 last-write-wins，schedule 规则落 log、分段 timer 只做投影驱动（`packages/todo/tool-todo/src/index.ts:213,140`、`packages/schedule/schedule/src/runtime.ts:231,256,178`）。
- **P-8.9 jobs 执行形形态（对照）**：唯一不落 log 的任务形态——进程内 Map registry + first-wins settle + owner scope 隔离，完成经通知消息回流会话（`packages/jobs/jobs-local/src/index.ts:131,416,338`、`packages/jobs/tool-jobs/src/index.ts:279`）。
- **P-8.10 共同地基**：六族任务都长在 agent-loop + session log 上（无独立任务引擎）；log-only 事件从不进模型 transcript，模型可见面仅为带来源 user message 或工具结果（`packages/plan/plan-mode/src/index.ts:49`、`packages/goal/goal-round-driver/src/index.ts:176`）。

#### 主线 9：安全与交互（`packages/{interaction,guard,identity,credentials,settings,feedback,spill}`）

- **P-9.1 审批策略 = 会话日志折叠**：`approval/policy` 为 durable 事件，生效值 = 日志 last-wins 折叠，replay 即状态、无 catch-up（`packages/interaction/user-approval/src/index.ts:112,142`）。
- **P-9.2 审批请求 = turn 包围的审计配对**：asked/decided 成对落库、answerer 结果闭环归一（异常→unavailable）、`'never'` 在服务内 dispatch 前确定性裁决（`packages/interaction/user-approval/src/index.ts:257,312,317`）。
- **P-9.3 权限 preset = 双旋钮整束**：sandbox+approval 捆成命名束一键切换（HITL 分级），意图事件 + 逐旋钮 setter 写穿分离（`packages/interaction/permission-presets/src/index.ts:167,379,400`）。
- **P-9.4 命令分发不经模型 turn**：注册表直接执行 handler，command/run↔done 配对日志留痕，`recordInput:false` 去重载荷（`packages/interaction/commands/src/index.ts:296,311`）。
- **P-9.5 HITL 以工具语义实现**：`ask_user_question` 作为会阻塞的普通 tool 暂停 loop，CALLER_NOT_LIVE/DELEGATED_CALLER 防死锁（`packages/interaction/user-questions/src/index.ts:92,99`、`packages/interaction/tool-ask-user/src/index.ts:80`）。
- **P-9.6 guard 系于 tools 管线 waterfall**：timeout 前置包装（deadline+signal 交换/恢复）、repeat 后置观察（计数提醒从不否决、deny 也计、用户插话重置）（`packages/guard/timeout-policy/src/index.ts:55,61`、`packages/guard/repeat-tool-reminder/src/index.ts:213,229`）。
- **P-9.7 凭据引用语义 + 可见性边界**：配置持引用/值不过模型、每操作解析、空值即缺失、环境遮蔽拒绝写、0600/wx 排他 + 热重载（`packages/credentials/credentials/src/index.ts:23,73,55`、`packages/credentials/credentials-local/src/index.ts:309,410,103`）。
- **P-9.8 settings 三层解析 + 结构化脱敏 + revision 乐观并发**：schema 默认 > base > 用户文档；`role('secret')` 跨 wire 前移除 + sidecar 枚举；mutate 路径写防覆盖未见图（`packages/settings/settings/src/index.ts:697,622,564`、`packages/settings/settings/src/redact.ts:50`）。
- **P-9.9 spill 上下文溢出**：超限纯文本存 session-scoped 私密文件，模型面换 head/tail 预览 + locator；best-effort 绝不让工具失败（`packages/spill/spill-policy/src/index.ts:190,154,163`、`packages/spill/spill-local/src/store.ts:73`）。
- **P-9.10 反馈闭环**：`/feedback` 写 log-only 事件 + message-feedback 旁路 sidecar（CAS + 生命周期围栏 + durability barrier）+ 匿名身份（`packages/feedback/command-feedback/src/index.ts:72`、`packages/feedback/message-feedback/src/index.ts:328,236`）。

#### 主线 10：工程纪律与门禁（`packages/test-support/*`、`scripts/`、`docs/`、`.agents/`）

- **P-10.1 录制一次、无 key 重放**：record 收割真实 session JSONL → llm-replay 从 assistant/chunk 按 finish 切模型脚本位置式绑定，回放后 `assertConsumed()` 防"录多跑少"（`packages/test-support/llm-replay/src/index.ts:206,697`、`packages/test-support/acp-snapshot/src/harness.ts:225`）。
- **P-10.2 fixture 即产品日志**：session.jsonl 同源双用（replay 输入 = 期望输出）；normalize 只替换 volatile，prompt/tool-schema 用 header-pin sidecar 去重（`packages/test-support/acp-snapshot/src/harness.ts:742`、`packages/test-support/acp-snapshot/src/suite.ts:66`）。
- **P-10.3 每文件 100% 覆盖率门禁**：`perFile:true` + 四项 100% 阈值 + 精确 path:line:col reporter；豁免带成员资格契约（`vitest.config.ts:269-280`、`scripts/coverage-exempt.ts:1-13`）。
- **P-10.4 run-gates 门禁即 DAG**：`gatesForMode` 聚合 + 环/重复 id 校验 + 有界并发调度 + 失败依赖 skip 级联 + allowFailure（`scripts/run-gates.ts:192,649,709`）。
- **P-10.5 doc-sync 文档即代码门禁**：doc-budgets `wc -w` 上限（提高需 justify）、type-equiv 围栏与源码逐字一致、catalog 生成物 `--check` 比对（`scripts/verify-doc-budgets.ts:14-42`、`scripts/run-gates.ts:571`）。
- **P-10.6 Agent Notes 制度**：路径即元数据 `{lifecycle}/{class}/date-title.md`、格式机械强制（Status/Alternatives）、archived 追加式 manifest 永久冻结（`.agents/notes/README.md`、`scripts/verify-agent-note-format.ts:40`）。
- **P-10.7 defensive-patterns bug-class 清单**：正交结果独立上报、公开契约两侧归一、dispose 达 quiescence、回调异常收 dispatcher、scrub 环境、lstat+unlink 防 link 递归（`docs/defensive-patterns.md:5-33`）。
- **P-10.8 分层门禁链 + 极简基准**：lefthook 只做快检查点（staged lint/whitespace/notice 重生成）、pre-push 只 typecheck、CI 全量矩阵；BENCHMARK.md 是独立工作区可复现冒烟基准（`lefthook.yml:7-55`、`.gitlab-ci.yml:14-129`）。

### 三、深层原理提炼（S2.3）

十组主线共 104 条原理，跨主线归并为以下 12 个主题。每条标注来源（P-x.y）与对 MDH 的关系判定。

| # | 主题 | 代表原理 | 机制内核 | MDH 关系 |
|---|------|---------|---------|---------|
| 1 | **真相源单一化**：日志是唯一事实，一切状态可重放重建 | P-1.3/1.6、P-6.4/6.6、P-8.4/8.7/8.10、P-9.1 | append-only 事件日志 + 纯 fold 投影；"model-visible ⟺ logged" 运行时断言；派生状态一律可从头重建（缓存只是 shortcut） | **借鉴（P3 最高优先）**——会议/任务状态升级为 append-only log + 折叠投影 |
| 2 | **无特权核心**：注册表 + 事件流 + 统一载体三层原语 | P-3.8/3.9、P-7.4/7.9、P-1.8 | 一切注册是可逆 effect；核心默认行为都是可替换的 waterfall next；RPC 载体与业务分发分离 | **借鉴**——MDH 可逐步把硬编码协调逻辑改为可注入链 |
| 3 | **capability seam 三角色**：定义/提供/消费分包 | P-4.1、P-5.1/5.12、P-8.1、P-2.1 | 抽象类定义缝 + 多 provider 并存 + consumer 只依赖声明包；provider 互换 = 产品互换 | **借鉴**——本地/远端/混合执行升级为多 provider 并列（对应 L6 残余） |
| 4 | **模型-可见与 logged 严格分界** | P-8.10、P-5.10、P-9.1 | log-only 事件永不进 transcript；模型可见面 = 带来源 user message 或工具结果；注入即 durable 事件 | **借鉴**——P3 session log 化的直接设计约束 |
| 5 | **上下文工程：渐进披露 + 压缩 + 溢出** | P-5.7/5.8/5.9/5.11、P-9.9、P-4.7 | catalog 只给摘要按需加载；compaction = durable 事务 + KV 缓存对齐 + 无模型修剪先行；输出 tail+spill；技能全文按需进入 | **借鉴**——MDH 技能/经验注入改渐进披露；长输出 spill |
| 6 | **确定性优先的验证纪律** | P-10.1/10.3/10.5、P-4.3 | keyless snapshot 录制/重放双断言；per-file 100% 覆盖；doc-sync 机械门禁；"读后写"事件门 | **借鉴**——loop-engineering 引入快照回放；MDH 覆盖率转 per-file |
| 7 | **失败即数据 + fail-closed** | P-5.2、P-2.4、P-1.5、P-4.8/4.9、P-6.3 | 失败归一化为带码结果/终态；能力缺失 typed rejection 不静默降级；未知格式宁可拒绝；沙箱 fail-closed | **借鉴 + 警示**——MDH 审查/审批/路由的失败路径归一化 |
| 8 | **安全 = 横切插件 + 日志即状态** | P-1.10、P-9.1/9.2/9.6、P-4.5/4.12 | 审批/超时/提醒挂在工具管线瀑布而非 loop；审批策略是日志折叠；两档威胁模型（围栏 vs 隔离）明确标注 | **借鉴**——MDH 审批/门禁改事件折叠 + 管线守卫（对应评审遗留） |
| 9 | **HITL 两范式**：会阻塞的工具 vs 不经模型的分发 | P-9.5、P-9.4 | ask_user_question 是普通 tool（复用超时/取消/日志）；命令注册表不经模型 turn 直接执行 | **借鉴**——MDH 审批/前端操控分通道 |
| 10 | **持久化工程**：版本双轨 + 原子写 + 有界 write-behind | P-6.2/6.3/6.4/6.9、P-4.4 | 事件词汇版本与存储 schema 版本分离；link+unlink 原子发布；合并窗口 + flush barrier；版本 CAS | **借鉴**——MDH durable execution 读侧/加锁（T1 残余） |
| 11 | **委托预算与生命周期** | P-2.6/2.8、P-1.1/1.12 | 持久化委托深度单调下限防递归失控；continuable 持久化 descriptor + 所有权图；scope = 生命周期边界 | **借鉴**——MDH CEO→PM→Team 多层委托加深度预算 |
| 12 | **工程纪律机械化为门禁** | P-10.4/10.6/10.8、P-7.8 | 门禁即 DAG（本地/CI 同一入口）；Agent Notes 格式门禁 + 归档冻结；只提交已确认事实 | **借鉴**——MDH 引入 run-gates 同构 + 决策笔记制度 |

### 四、对 MDH P3 实施的启示（S2.4）

> 承接 `multi-agent-architecture-future-analysis.md` 的 P3 小节（5 项 dsh 借鉴 + 评审遗留）。本节的"可借鉴机制"全部可直接映射到上述 P-x.y 原理。

**已定 5 项 dsh 借鉴方向的代码级落地：**

1. **session log 作为上下文真相源（最高优先级）** → 机制：append-only `SessionEvent` 日志 + surface 投影 + `deriveMessages()` + 运行时断言（P-1.3/1.6）。MDH 落点：会议/执行记录升级为 append-only log；`meeting.add_message` 与审计合并为单一事件流；模型上下文一律从 log 投影；引入"model-visible ⟺ logged"断言防漂移。任务状态（P-8.4/8.10）、审批策略（P-9.1）、sandbox 模式（P-4.10）等派生状态一律从 log 折叠——先做"状态是 logged event、模型只见注入消息"。
2. **subagent 委托** → 机制：三角色分包 + 多 Provider 注册表 + one-shot/continuable 双路径 + 持久化深度预算（P-2.1/2.4/2.8/2.6）。MDH 落点：TS orchestrator 增加"agent transport 注册表"（in-process/fork/外部 CLI），模型面只暴露稳定委派/控制/汇报工具；后台子任务按"独立 Session + descriptor 持久化 + 所有权图 + 结算通知"实现断点续跑。
3. **配置层插件化** → 机制：空根 + 分层 patch 单次组合 + bundle 即 npm 包 + structuredClone 隔离（P-3.1/3.2/3.3）。MDH 落点：`roles_config.yaml` + 技能 CoW 增量升级为"空 DAG + 增量 patch 分层合成"；技能包对齐 bundle 发布格式（manifest 指向 patch）；preset 对齐 standing mount + isolate 审计（P-3.6/3.7）防多会话污染。
4. **快照/评测门禁** → 机制：录制一次/无 key 重放 + fixture 即产品日志 + assertConsumed（P-10.1/10.2）。MDH 落点：loop-engineering 引入 keyless snapshot 回放（录制真实 meeting/审查会话 JSONL → 无 key 回放双断言）；配合每文件覆盖率（P-10.3）与门禁 DAG（P-10.4）。
5. **守卫/沙箱系统化** → 机制：confine(argv) 抽象 + 严格加宽升降级 + 策略单一源（P-4.8/4.9/4.10）+ guard 挂工具管线瀑布（P-9.6）。MDH 落点：ToolExecutor 拆 pre/execute/post 三段 waterfall；工具超时/重复提醒/审计做成可插拔 guard；沙箱模式（read-only/workspace-write/full）单一源 + session 事件折叠；远程 Executor 引入进程树信号升级（P-4.6）。

**全库挖掘新发现、值得加入 P3 候选的机制：**

- **capability seam 三角色分包**（P-4.1/5.1）——MDH 的 local/remote/hybrid 工具路由可升级为"同一接口多 provider 并列"（e2b 式：fs 与 shell 共享同一远端世界，P-4.11），解决"文件在 A 机、命令在 B 机"。
- **compaction = durable 事务 + KV 缓存对齐 + 无模型修剪先行**（P-5.7/5.8/5.9）——MDH 长会话/大工具结果可先确定性 head/tail 修剪 + shadow-price 记账，再考虑 LLM 总结；会议摘要复用主对话前缀做缓存对齐、强制"摘要 < 原文"。
- **渐进披露技能目录**（P-5.11）——技能 catalog 只列摘要、加载才给全文，避免把整套技能塞进每次 prompt（对应支柱 5 差异化深化）。
- **HITL 两范式**（P-9.4/9.5）——审批建模为会阻塞的工具（复用超时/取消/日志）+ 前端操控走不经模型 turn 的命令通道。
- **persisted delegation depth**（P-2.6）——CEO→PM→Team 多层委托加持久化深度预算 + 封顶，防递归失控。
- **模型自修改运行时**（P-3.9）——"技能随用随进化"可借鉴 inspect→define→run 三段式 + 不可变版本 + 可回滚（VM 沙箱仅演示、非安全边界）。
- **UI 纯从 session/event 渲染**（P-7.9）——前端 3D 办公室/审批/审计面板从事件窗口 + 投影缓存渲染，消除多来源状态漂移。
- **只提交已确认事实**（P-7.8）——对外 API/审批回调只暴露 committed 事实 + 一次性授权，防协议通道被当信任升级路径。

**对照/警示（不宜直接照搬）：**

- 进程外 agent 桥接（codex/claude-code/acp）成本极高（每产品一套协议+握手+异常形态，P-2.5）——MDH 若要接外部 agent 应只接"已完成对话继承"场景并锁定版本。
- 隔离威胁模型必须两档明确（P-4.5/4.12）：对"模型控制的路径/命令"用 in-process 围栏；对"模型写的代码"用独立 worker + 预算 + 硬终止；从不把前者吹成后者。MDH 的 bash 白名单属前者，不得宣称是安全边界。
- 格式版本策略（P-1.5/6.3）：未知事件/老格式"宁可拒绝不静默读错"——MDH 持久化格式演进须默认 fail-loud，迁移路径显式设计。
- 100% 覆盖率是 dsh 的选择（pre-release 零外部消费者支撑），MDH 量产路径不必一步到位，但可转 per-file 门槛 + 豁免契约逐步逼近。
