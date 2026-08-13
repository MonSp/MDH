---
feature: multi-agent-architecture-future-analysis
status: delivered
updated: 2026-08-13
branch: analysis/multi-agent-architecture-future
commits: 7982912..1748522
---

# MDH 多智能体架构：现状分析与未来方向

## Report

**What was built** — 一份约 250 行的分析规格文档，回答"MDH 多智能体协作机制现状 + 行业趋势 + 未来方向"三问：(1) 现状分析基于代码级取证，以 54 处 file:line 引用还原三路径真实接线、讨论/投票/DAG/技能进化/混合执行的真实形态，并给出 9 条按严重度排序的局限性清单；(2) 行业趋势基于 deep-research（6 个并行调研角度、43 个去重来源），覆盖框架格局收敛、MCP/A2A 协议分层、多智能体实证效果、企业级生产模式与"组织模拟"范式的市场检验；(3) 未来方向判断为"强单 agent 主轴 + 确定性轻协作 + 标准协议 + 可恢复执行"，含 4 条反方观点，并给出 MDH 三阶段演进路线图（收敛治理 → 范式转向 → 差异化能力），每阶段与现状局限逐一对应。

**Verification** —
- PASS 引用完整性：正文 40 个 [n] 全部在 43 条来源表中可解析，来源零冗余（脚本校验）
- PASS 代码引用：54 处 file:line 全部存在且行号在范围内（脚本校验）
- PASS 独立评审：三项结论（规格合规/事实正确/风格一致）全部通过，无 critical；3 处 minor 已修复
- PASS 无 TBD/占位符

**Journey log** —
- 文档口径 ≠ 代码现实：AGENTS.md 宣称的"三路径/四维路由"与代码取证结果差异显著（工作流是复杂路径子分支、路由学习断链），分析以代码为准，文档承诺需单独治理（L8）。
- 评审发现 `_evaluate_convergence` 返回值语义与函数名相反（True=继续讨论），文档描述行为而非返回值才能避免误读——后续引用该函数的文档以此为范本。
- 评审发现 "hybrid 未接线" 的原表述过头：cli.ts `--profile` 路径确实接线了 HybridToolkitRouter，准确表述是"未接入 per-agent location 路由"。
- deep-research 在本环境的 DDG/Bing 搜索不可靠（超时/本地化噪声），有效路径是 arXiv/GitHub/HN Algolia API + 直抓已知一手 URL，后续调研沿用。

## [S1] Problem

MDH 已实现一套复杂多智能体协作机制（6 层架构链、三执行路径、并行讨论+投票、DAG 工作流、技能进化、本地/远端混合执行）。团队需要回答：这套机制当前的真实形态与局限是什么？结合 2025-2026 智能体行业发展趋势，哪种多智能体架构才是真正值得投入的未来方向？以及 MDH 应如何分阶段演进。

## [S2] Design

交付一份持久化分析文档（本文档），正文包含四部分：

1. **现状分析**（S2.1）— 基于代码级取证（`file:line` 引用）描述 MDH 当前协作机制：6 层架构链、三执行路径（简单/工作流/会议）、复杂度判定、动态路由、并行讨论与投票、DAG 工作流、技能进化、本地/远端混合执行；并指出机制层面的优势与局限。
2. **行业趋势**（S2.2）— 基于 deep-research 多源调研：主流多智能体框架与编排范式、基础设施协议（MCP/A2A 等）、实证数据（benchmark/失败案例）、企业级生产架构模式、业界未来方向与反方观点。每条关键论断带 `[n]` 编号引用，来源表列于文末。
3. **未来方向判断**（S2.3）— 综合 1+2，给出多智能体架构未来方向的明确判断，必须呈现反方观点。
4. **MDH 演进路线图**（S2.4）— 3 个阶段，每阶段含目标/改动要点/优先级理由，且与现状局限性直接对应。

契约：

- 现状论断引用真实代码位置（`backend/*.py`、`orchestrator/src/*.ts`），交付前逐一核验；
- 趋势引用只能来自 `research/multi-agent-architecture-future/findings/*.md`，不得凭记忆构造 URL；
- 文档语言为中文，技术术语保留原文；
- 调研工作区文件（`research/`）不提交到特性分支，仅本文档提交。

## [S3] Out of Scope

- 不改动任何产品代码；
- 不产出具体技术选型/落地清单（仅到路线图粒度）；
- 不评估商业模式或竞品产品细节（仅关注架构范式）。

## Tasks

- [x] T1: 代码级取证 MDH 现有多智能体协作机制 — acceptance: 现状章节完成，每项机制论断带 `file:line` 引用（covers: S2.1）
- [x] T2: deep-research 行业趋势调研（标准深度，6 个角度，43 个来源）— acceptance: 产出 6 份 findings 证据文件，趋势章节关键论断均带 `[n]` 引用且可解析（covers: S2.2）
- [x] T3: 撰写未来方向判断 + MDH 演进路线图章节 — acceptance: 含未来方向判断（含反方观点）与 3 阶段路线图，每阶段与现状局限对应（covers: S2.3, S2.4）
- [x] T4: 文档完整性验证 — acceptance: 无 TBD/占位符，所有 `[n]` 与 `file:line` 引用可解析，任务勾选与状态一致（covers: S2）
- [x] T5: 独立子代理评审 — acceptance: 评审三项结论（规格合规/事实正确/风格一致）全部通过或差异已解决（covers: S2; depends: T4）

---

## 分析正文

> 现状部分依据代码级取证（`research/multi-agent-architecture-future/findings/codebase-evidence.md`，取证日期 2026-08-13，基线 7982912）；趋势部分依据 deep-research 调研（同目录 F1–F6 与 REPORT.md，43 个来源）。所有 `[n]` 引用见文末"来源"。

### 一、现状分析：MDH 多智能体协作机制的真实形态

#### 1.1 执行路径：文档口径与代码现实的差异

- 文档声称三条路径（简单/工作流/会议），实际顶层只有两叉：`backend/ceo_agent.py:233` 按 `complexity.level == "simple" and confidence >= 0.7` 分派 `_execute_simple`（:234）或 `_execute_complex`（:236）；"工作流"是复杂路径内部由 SemanticAnalyzer 判出的子分支（`backend/meeting_coordinator.py:813` 判 `is_workflow`），并非独立路径。
- 两层复杂度判定真实存在：规则引擎命中（confidence >= 0.7）即返回（`backend/complexity_classifier.py:134`），否则一次 LLM 判定（:142-149），两者皆失败默认 complex"宁重勿轻"（:154-161）。
- simple→complex 升级机制真实且接线完整：轻量验收（仅查工具 error + 结果非空，`backend/simple_executor.py:164-208`）失败即置 `retry_with_complex`（:99），CEO 侧发 `path_upgrade` 并重建多角色团队走复杂路径（`backend/ceo_agent.py:250-263`、`backend/simple_executor.py:210-278`）。

#### 1.2 讨论机制：真并行 + 结构化收敛，但三套实现并存

- 生产路径为 `MixedLocationDiscussion`：`asyncio.gather(..., return_exceptions=True)` 真并行（`backend/mixed_location_discussion.py:137-148`），`Semaphore(6)` 并发控制（:82），默认最多 2 轮（:129，`backend/meeting_coordinator.py:319`）。
- 收敛判定真实实现：最近一轮 stance 全部一致即收敛（`mixed_location_discussion.py:338-340`），或平均 confidence > 0.8 收敛（:347-349）；stance/confidence 从 LLM 响应正则解析 `[STANCE:...]`/`[CONFIDENCE:...]`（:278-288）。仅 Planner/Executor/Reviewer/Monitor 参与讨论，CEO/Coordinator 被排除（:114-118）。
- 债务：`ParallelDiscussionManager`（`backend/parallel_discussion_manager.py:21`）与 `ParallelMeetingCoordinator`（`backend/parallel_meeting_coordinator.py:75`）仅被测试引用，属未接线死代码；串行 `DiscussionManager`（`backend/discussion_manager.py:24`）作为回退存在（`backend/meeting_coordinator.py:126`），但因复杂路径必然注入 Team（`backend/ceo_agent.py:478`）实际永不触发——且其收敛语义（CEO LLM 判 `continue_discussion`，`discussion_manager.py:245-254`）与混合版不一致。

#### 1.3 投票：三种策略实现，但生产只跑一种

- `ConsensusStrategy` 三值齐全（`backend/negotiation.py:15-18`），weighted/argument_based 的加权计算也已实现（:163-195、:233-236）。
- 生产接线硬编码：`MeetingCoordinator` 以 `SIMPLE_MAJORITY` 构造引擎（`backend/meeting_coordinator.py:94`）；讨论后遍历投票时 oppose→否、modify/support→是、neutral 按 confidence >= 0.4 决定（:902-931），且 `evaluate_consensus` 调用不传 strategy（:933）——`add_argument` 提交的论据（:923-929）对结果零影响，weighted/argument_based 从未在会议流程被激活。

#### 1.4 DAG 工作流：引擎完整，接线残缺

- 引擎本身完整：三策略分发（`backend/workflow_engine.py:125-132`）、Kahn 拓扑顺序执行（:165-185）、BFS 并行（:187-233）、混合策略（:235-305）、条件分支 `field=value`/`field!=value`（:549-588）、跳过传播（:307-333）、暂停/恢复/取消/重试（:629-742），REST 全暴露（`backend/server.py:2194-2297`）。
- 四个实际缺陷：① server 全局引擎（`server.py:2191`）与会议引擎（`meeting_coordinator.py:106`）是两个实例，REST 无法管理会议内工作流；② 会议路径 `execute_workflow` 直接 await、不入 `_running_tasks`（`meeting_coordinator.py:1387`），暂停/取消"只改状态、不真正中断"；③ 生成的工作流是硬编码线性链——`dept_order = ["dept-frontend","dept-backend","dept-qa","dept-devops"]` 强制排序串行连边（`backend/semantic_analyzer.py:253-260`），固定 `mixed` 策略（:268）在线性链下退化为纯串行，"并行工作流"名存实亡；④ 节点执行只构造 prompt 让 LLM 输出文本，不调工具、不写文件（`backend/meeting_coordinator.py:156-202`），与串行路径会真实写文件的 TaskOrchestrator 形成能力断层。

#### 1.5 技能进化：半通闭环

- 会议结束自动提炼：`ExperienceExtractor.extract_from_meeting` 从讨论 stance/审查反馈/写入文件类型生成规则，状态固定 `pending_review`（`backend/meeting_coordinator.py:1097-1117`、`backend/experience_extractor.py:606-719`）；执行前经验注入真实存在（`meeting_coordinator.py:852-872`、`backend/task_orchestrator.py:488-513`）。
- 后半程断链：审核通过才写增量区（`experience_extractor.py:480-492`）、merge 与 zip 打包均已实现（`backend/skill_packager.py:174-258`、:591-640），但"审核→增量区→merge→打包"仅靠手工 REST（`backend/server.py:479-499` `/api/skills/package`）触发，项目结束不自动完成；`/api/skills/evolve`（:514-554）与会议内提取逻辑重复。

#### 1.6 本地/远端混合执行：展示层完备，执行层未接通

- Python 侧：`role_locations` 从 UI（`src/components/office-team/CeoChatPanel.tsx:145,395`）经 `server.py:1142` 写入 DAG task（`backend/ceo_agent.py:72-103`）、映射为 `AgentLocation`（`backend/team_assembler.py:78-90`），但 location 仅用于讨论统计与 💻/☁️ 图标（`backend/mixed_location_discussion.py:125-127,302-303`）；实际工具执行用本地 `AgentToolset` 直连（`backend/task_orchestrator.py:196-202`），不感知 location。
- TS 侧：`RouterFactory` 按 member.location 路由（`orchestrator/src/toolkit/router.ts:17-35`）、RemoteToolkitRouter（HTTP + 退避重试 + 熔断，`remote.ts:96-203`）、HybridToolkitRouter 按工具类型路由（`hybrid.ts:43-77`）均已实现；但 `TeamCoordinator.createTeam` 硬编码 `location: 'local'`（`orchestrator/src/team/coordinator.ts:413`）、不传 runtime（:125），`HybridToolkitRouter` 未接入 per-agent 路由路径（仅在 `cli.ts:59-65` 经 `--profile` 作为全局 defaultRouter 使用）——UI 的 per-agent 位置选择没有贯穿到 TS 编排器。

#### 1.7 机制层面的优势（应当保留）

- **架构完整度高**：三路径 + 升级机制、讨论/投票/DAG/技能进化全链路均有真实实现与测试，非 PPT 架构。
- **真并行讨论 + 结构化收敛**：asyncio.gather 并行与 stance/confidence 阈值收敛，是行业中"结构化多智能体交互"的少数真实实现之一。
- **技能进化（Copy-on-Write）设计超前**：只读基础包 + 可写增量区 + 项目结束合并打包，与 Anthropic Agent Skills 开放标准（2025-12-18）的"文件夹+指令+脚本+渐进披露"方向同构 [30]，是先发资产。
- **混合执行组件齐备**：local/remote/hybrid 三路由已实现待接线，具备演进基础。
- **近期演进方向健康**：Python→Electron TS 迁移（4 批次 P0-P3，`docs/compose/plans/2026-08-11-python-to-ts-migration.md`）与"反对意见转 avoid-constraints 而非过滤"（git `c3236d5`）均与行业"本地化 + 轻协作"方向一致。

#### 1.8 局限性清单（按严重度）

| # | 局限 | 证据 | 影响 |
|---|------|------|------|
| L1 | 单任务 LLM 调用放大至约 26+ 次 | 复杂度 1 + 语义 1 + 讨论 4×2+总结 9（`mixed_location_discussion.py:148,383`）+ 执行 ≤6（`task_orchestrator.py:244-245`）+ 审查 3×3（`review_pipeline.py:148,188,229`） | 在行业 15× token 均值 [20] 之上的额外放大，编码任务 ROI 差 |
| L2 | 工作流名不副实 | 线性链硬编码（`semantic_analyzer.py:253`）+ 节点不写文件（`meeting_coordinator.py:156-202`）+ 双引擎实例（`server.py:2191` vs `meeting_coordinator.py:106`） | 并行、产物、生命周期三个卖点均未兑现 |
| L3 | 自适应路由学习断链 | 会议写 `_task_routing`（`meeting_coordinator.py:730`），但 `update_stats` 只在 TaskOrchestrator 自己的 dict 上生效（`task_orchestrator.py:361-363`），会议流程从不调用 | "成功率自适应"是摆设 |
| L4 | 会议/投票机制与证据冲突 | 硬编码 SIMPLE_MAJORITY（`meeting_coordinator.py:94,933`）；会议式协商对编码任务收益低（43.3% 情况单 agent 更优 [23]；MAST 14 失败模式 [22]） | 高成本低增益；论据投票从未生效 |
| L5 | 技能闭环半通 | 审核→增量→打包仅手工 REST（`server.py:479-499`） | "项目结束产出进化技能包"的核心卖点未自动兑现 |
| L6 | 混合执行未接线 | `coordinator.ts:413` 硬编码 local；hybrid 未接入 per-agent 路由（仅 `cli.ts:59-65` 作全局 defaultRouter）；Python 侧 location 仅展示 | per-agent 位置选择是 UI 幻觉 |
| L7 | 名不副实的组件 | critic/grounding 是同步规则匹配非 LLM（`backend/collaboration/critic_agent.py:46`、`grounding_agent.py:45`）；审批"自动通过"（`meeting_coordinator.py:981-984`） | 审查与安全承诺高于实际 |
| L8 | 死代码与文档债务 | 两套 discussion 死代码；`mock-sso/` 镜像 `backend/`；AGENTS.md 描述与代码不符 | 维护负担、误导决策 |
| L9 | 单点故障 | 每会话单例 CeoAgent（`server.py:1145-1151`）、内存模型缓存（`meeting_coordinator.py:268-278`）、agent_pool 未注入（:63,87） | 无故障转移，与 durable execution 差距大 [25] |

### 二、行业趋势（2024-12 至今，deep-research 多源调研）

#### 2.1 框架格局：向"图/状态机 + orchestrator"收敛

- **谁在退场**：AutoGen 进入 maintenance mode、官方指向继任者 [1]；MAF（2025-04，Python + .NET）以图工作流为原生范式，内置 checkpointing/HITL/time-travel，跨运行时互操作走 A2A/MCP [2]；经典 AutoGen API（ConversableAgent/GroupChat）在 AG2 v1.0 被整体拆入 ag2-classic（2026-06）——对话式去中心化协作被官方与社区共同降级 [3]。
- **谁在崛起**：LangGraph v1.0（2025-10）以 durable execution + HITL + 记忆立身，代表 DAG/状态机范式 [4]；OpenAI Agents SDK（2025-03）用 handoffs/agents-as-tools 原语把 orchestrator-worker 产品化，provider-agnostic 支持 100+ LLM [5]；CrewAI（约 57k stars）仍是活跃维护的角色扮演式 orchestrator [6]。
- **停滞者**：MetaGPT（69.8k stars 全场最高）last push 2026-01，主页转向 atoms.dev——"软件公司装配线"学术范式（ICLR 2024）[7][8] 未转化为商业平台主架构；Magentic-One（2024-11）证明 orchestrator + 4 专家代理可达 GAIA/WebArena SOTA 级，但停留研究形态 [9]。

#### 2.2 协议层："MCP inside agents, A2A between agents"

- **MCP 已是事实标准**：2024-11-25 开源 [10]；截至 2025-12-09 官方口径月 SDK 下载 9700 万+、10,000+ 活跃服务器，ChatGPT/Claude/Cursor/Gemini/Copilot/VS Code 均一等公民支持；2025-12-09 捐赠 Linux Foundation Agentic AI Foundation（Anthropic/Block/OpenAI 共创）[11]；官方参考服务器已移交厂商/第三方维护，发现入口改为 registry.modelcontextprotocol.io [12]。已知协议固有问题：工具描述注入与供应链风险未在协议层解决 [13]。
- **A2A 成为 agent 间协议**：2025-04 发布、2025-06 捐赠 LF [14]；v1.0 由 8 家 TSC 治理，新增 Signed Agent Cards（密码学身份）与多协议绑定，v1.0.1（2026-05-28）[15]；IBM ACP 2025-08 宣布并入——agent 间通信协议收敛 [16]；AGNTCY（Cisco 牵头）以"Internet of Agents"补 discovery/identity（Agent Badges）/SLIM messaging/observability [17][18]；agent 支付出现 x402/Google AP2 并有 A2A x402 扩展 [19]。
- **官方分工**："MCP 做单 agent 的工具/上下文接入，A2A 做 agent 之间的通信协调，实践中两者并用" [15]。**含义**：多智能体产品的工具接入与跨产品协作将走标准协议，封闭自研协议是负债而非资产。

#### 2.3 实证：多智能体何时有效、何时无效

- **有效的一面**（研究/信息密集任务）：Anthropic 内部评测，Opus 4 lead + Sonnet 4 subagents 的多智能体研究系统比单智能体 Opus 4 高 90.2% [20]；Magentic-One 在 GAIA/AssistantBench/WebArena 达 SOTA 级 [9]。
- **无效/昂贵的一面**（编码任务）：agent 约 4×、多智能体约 15× chat token——"任务价值必须高到足以支付性能提升" [20]；BrowseComp 上 token 用量单独解释 80% 性能方差 [20]；"大多数编码任务可真正并行化的子任务少于研究，LLM agent 尚不擅长实时协调委派"——官方明言多智能体不是多数编码任务的最优适配 [20]；Berkeley MAST（1600+ traces、7 框架）识别 14 种失败模式（系统设计/agent 间失准/任务验证），MAS 在流行 benchmark 上收益"常常微乎其微" [22]；熵视角研究量化单 agent 在约 43.3% 情况下更优 [23]；2026-07 研究指出 agent 间"无法互相探索"、短视与极化交互导致次优协调 [34]；Magentic-One 曾失控发帖/邮件"招募人类" [9]；《More Agents Is All You Need》的收益来自集成投票而非协作 [24]。
- **反方立场源头**：Anthropic《Building effective agents》(2024-12-19)："从简单方案起步，仅在更简单方案不足时才引入多步 agentic 系统" [21]。

#### 2.4 企业级生产模式（以 Anthropic 工程博客为主）

1. **orchestrator-worker 是生产范式**：中心 LLM 动态拆解、委派、合成；与"预定义代码路径"的 workflow 明确区分 [21]。
2. **同步等待是当前瓶颈**：lead 同步等 subagent 集合完成、无法中途 steering；异步化带来协调/一致性/错误传播三类复杂度 [20]。
3. **artifact 模式**：subagent 产出直接落文件系统、只回传轻量引用，避免多级转发造成的信息损耗与 token 开销（"传话游戏"）[20]。
4. **durable execution**：生产 agent 有状态、错误会累积，需要断点 resume + rainbow 灰度 [20]；行业明确"框架 checkpointing ≠ durable execution"——失败检测、自动恢复、防重复执行、分布式协调全部留给开发者 [25]。
5. **HITL 自动化**：Claude Code 实测用户批准约 93% 权限弹窗（审批疲劳）；OS 级沙箱使提示降 84%，auto mode 分类器完整流水线 FPR 0.4%，委派/返回两端跑 handoff 分类器 [26][27]。
6. **安全教训**：egress allowlist 是"能力授权"而非"目的地过滤"——沙箱完美工作但数据仍经批准域名外泄 [26]；共享文件"陈旧读"（两个 agent 读同一 plan 文件，一个更新后另一个用旧版本）在真实生产中造成"看似合理但错误"的产出 [28]。

#### 2.5 未来方向共识

- **context engineering** 接棒 prompt engineering（Karpathy 2025-06 提出、Anthropic 2025-09 采纳）：context 是 n² 注意力约束下的有限资源（context rot），三大长程技术是 compaction、structured note-taking、multi-agent architectures——multi-agent 被重定义为一种 context 管理技术而非组织模拟 [31]。
- **ACI（agent-computer interface）**：源于 SWE-agent（LM agent 是"一类新的终端用户"）[29]，被 Anthropic 确立为与 HCI 同等投入的原则 [21]。
- **Agent Skills 开放标准**（2025-10 发布、2025-12-18 开源标准 agentskills.io）：以"文件夹+指令+脚本"打包程序性知识、渐进披露按需加载，明确定位"取代为每个用例定制碎片化 agent" [30]。
- **学术前沿**：多 agent 系统可编译为"单 agent + 技能选择"（以技能库取代 agent 间通信，显著省 token/延迟、精度持平；技能库有容量相变，分层路由可缓解）[32]；反方主张基础模型需"原生多 agent 智能"（41 LLM/7 基准实证）[33]。

#### 2.6 "组织模拟"范式的市场检验（针对 MDH 核心设计）

- **中文商业平台无一采用**：Dify（152k stars）定位 workflow/DAG 平台 [35]；Coze Studio（2025-06 开源）是可视化单 agent 平台 [36]，扣子空间定位"智能办公平台"（人+多智能体协作工作台，而非组织模拟）[37]；Manus 联创明言"押注 context engineering、agent 框架重写了四次"、单任务约 50 次工具调用——单 agent 变强而非多 agent 分工 [38]；Manus 2025-12 达 $100M ARR、并入 Meta [39]。
- **组织模拟源头在中国学术/开源圈**：ChatDev（清华，虚拟软件公司）[41]、MetaGPT（"First AI Software Company"）[7] 均未商业落地。
- **"AI 员工"叙事是劳动力隐喻**：Altman"虚拟同事，想象 1000 个、100 万个" [43]；NVIDIA/Deloitte"IT 当 agent 的 HR" [42]——但其技术类比明确指向微服务式专业化拆分，而非组织角色层级模拟 [42]。
- **保留证据**：Manus 客户案例中单 agent 扮演"AI chief of staff"带来 90× 产出 [40]——组织角色的用户价值存在，但不需要"多 agent 模拟整个组织"。

### 三、未来方向判断

**核心判断：多智能体架构的未来不是"更复杂的组织模拟"，而是"强单 agent 主轴 + 确定性轻协作 + 标准协议 + 可恢复执行"。** 五条具体判断：

1. **主轴是强单 agent + context engineering + skills**：Manus 的商业验证（$100M ARR）[38][39]、Anthropic 的 context engineering 立场 [31] 与 Agent Skills 标准 [30]、以及"多 agent 编译为单 agent + 技能"的研究 [32] 指向同一方向——把投资放在单 agent 的上下文管理、工具接口与技能资产上，回报高于增加 agent 数量。
2. **多智能体以 orchestrator-worker / 确定性 DAG 保留，用于真正可并行的场景**：研究/信息密集任务已验证 +90.2% [20]；编排基底应是图/状态机（LangGraph/MAF 共识）[2][4]，而非自由对话协商；子任务产物走 artifact 模式 [20]。
3. **协作走标准协议**：MCP 已事实标准化 [11]；A2A 用于跨产品边界 [15]；封闭自研协议是负债。
4. **生产可靠性优先级高于流程复杂度**：durable execution [25]、确定性安全边界 [26]、HITL 自动化 [27] 是行业公认的生产门槛。
5. **"组织/角色"降级为用户界面与心智模型**："AI 员工"叙事有用户价值（Altman [43]、Manus James 案例 [40]），但它的技术实现应是微服务式 orchestrator [42]；会议/投票不应再承担编排核心职责。

**反方观点（必须呈现）**：① "原生多 agent 智能"研究主张扩展单 agent 不自动获得多 agent 智能，模型层走向未定 [33]；② Magentic-One 证明多 agent 系统可达 SOTA 级通用能力 [9]；③ MDH 的并行讨论 + 结构化收敛是稀缺的差异化实现，全部拆除可能失去产品叙事；④ 集成投票类多 agent 在部分 benchmark 上确有收益 [24]。**因此建议是"降权而非拆除"**：保留多 agent 形态与组织叙事（作为 UI 层与心智模型），把编排核心转移到确定性层（DAG/状态机 + orchestrator）。

### 四、MDH 演进路线图（3 阶段）

**阶段 1：收敛治理（止血与去重）— 优先级 P0，约 1-2 个迭代**

目标：让现有机制名副其实，消除死代码与断链，建立可度量基线。对应局限 L2/L3/L7/L8/L9。

| 改动 | 对应局限 |
|------|----------|
| 删除未接线死代码：`parallel_discussion_manager.py` / `parallel_meeting_coordinator.py`；统一或删除串行 `DiscussionManager` 回退（两套收敛语义不一致） | L8 |
| 修复断链：会议流程接线 `update_stats`（路由学习）；合并两个 WorkflowEngine 实例，或让会议工作流入 `_running_tasks`（暂停/取消真正生效） | L3、L2 |
| 投票：激活 weighted/argument_based，或正式声明 SIMPLE_MAJORITY 为唯一策略并删除失效代码路径 | L4 |
| Critic/Grounding 诚实化：接入真实 LLM 审查，或在 UI/文档中明确定位为确定性规则检查 | L7 |
| 审批：实现真正阻塞等待，或修正"自动通过"文案 | L7 |

理由：L2-L9 是"名不副实"的债务，不清理将持续误导架构决策与用户预期；本阶段只删代码/改接线，成本低，是转向新范式前的必要基线。

**阶段 2：范式转向（从重流程到轻协作）— 优先级 P0/P1，约 2-4 周**

目标：编排核心从"会议/投票重流程"转为"orchestrator-worker + 确定性 DAG + artifact 输出"，组织叙事保留在 UI 层。对应局限 L1/L2/L4。

| 改动 | 对应局限 |
|------|----------|
| 会议瘦身：裁剪讨论轮数与参与者；讨论结果改为 orchestrator 聚合 + 反对意见转 avoid-constraints（延续 git `c3236d5` 方向），弱化全员投票 | L1、L4 |
| 工作流节点接线真实工具执行（写文件）；DAG 生成去硬编码 dept_order，由 planner 产出真实 DAG | L2 |
| artifact 模式：角色产出落文件系统、回传轻量引用，降低 LLM 调用放大 | L1 |
| 审查流水线对照 MAST 14 失败模式 [22] 做失效分析；审查重心从多角色讨论转向确定性验证（测试/lint）+ 单次 LLM 审查 | L4 |

理由：行业实证表明会议式协商对编码任务收益低、成本高（15× token [20]、43.3% 单 agent 更优 [23]）；MDH 的差异化应来自产出质量与可靠性，而非流程复杂度。

**阶段 3：差异化能力（协议化 + 技能资产 + 可恢复执行）— 优先级 P1/P2，约 4-8 周**

目标：把 MDH 独特资产（技能进化、工作区、混合执行）对齐行业标准并补齐生产级可靠性。对应局限 L5/L6/L7/L9。

| 改动 | 对应局限 |
|------|----------|
| 技能系统对齐 Agent Skills 开放标准 [30]：保持 CoW 增量设计，目录/加载语义与标准兼容；补全"审核→增量区→merge→打包"自动触发 | L5 |
| 工具接入 MCP client 兼容 [11]；跨产品边界需要时再引入 A2A | — |
| durable execution：检查点系统补自动失败检测 / 防重复执行 [25]，配合 Python→TS 迁移的本地持久化 | L9 |
| 混合执行真正接线：TS orchestrator 按 roleLocations 路由（解除 `coordinator.ts:413` 硬编码），hybrid 按工具类型路由 | L6 |
| HITL 重设计：分级审批 + 确定性白名单 + 参考 auto mode 分类器（FPR 0.4% [27]） | L7 |

理由：技能进化 vs Agent Skills 是对标机会窗口（MDH 已先发 CoW 设计）；durable execution 与混合执行是行业公认的下一层竞争力 [25]；完成本阶段后 MDH 形态与行业方向一致——强单 agent 主轴 + 轻协作多 agent + 标准协议 + 可恢复执行。

### 五、来源

[1] Microsoft AutoGen repository README — https://github.com/microsoft/autogen (accessed 2026-08-13)
[2] Microsoft Agent Framework repository — https://github.com/microsoft/agent-framework (repo created 2025-04-28; accessed 2026-08-13)
[3] AG2 repository (AutoGen community fork) — https://github.com/ag2ai/ag2 (repo created 2024-11-11; accessed 2026-08-13)
[4] LangGraph repository — https://github.com/langchain-ai/langgraph (v1.0.0 2025-10-17; accessed 2026-08-13)
[5] OpenAI Agents SDK repository — https://github.com/openai/openai-agents-python (repo created 2025-03-11; accessed 2026-08-13)
[6] CrewAI repository — https://github.com/crewAIInc/crewAI (accessed 2026-08-13)
[7] MetaGPT repository — https://github.com/FoundationAgents/MetaGPT (created 2023-06-30; last push 2026-01-21; accessed 2026-08-13)
[8] Hong et al., "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework" — https://arxiv.org/abs/2308.00352 (2023-08, updated 2024-11)
[9] Microsoft Research, "Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks" — https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/ (2024-11)
[10] Anthropic, "Introducing the Model Context Protocol" — https://www.anthropic.com/news/model-context-protocol (2024-11-25)
[11] MCP Blog, "MCP Joins the Agentic AI Foundation" — http://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/ (2025-12-09)
[12] MCP servers repository — https://github.com/modelcontextprotocol/servers (accessed 2026-08-13)
[13] ForgeCode, "Prevent Attacks on MCP" — https://forgecode.dev/blog/prevent-attacks-on-mcp/ (2025-06-17/18)
[14] A2A Project repository — https://github.com/a2aproject/A2A (published 2025-04-09; donated to LF 2025-06)
[15] A2A, "Announcing A2A v1.0" — https://github.com/a2aproject/A2A/blob/main/docs/announcing-1.0.md (2026; v1.0.1 2026-05-28)
[16] LF AI & Data, "ACP Joins Forces with A2A" — https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/ (2025-08-29)
[17] AGNTCY — https://agntcy.org/ (accessed 2026-08-13)
[18] AGNTCY identity-spec — https://github.com/agntcy/identity-spec (accessed 2026-08-13)
[19] A2A x402 Extension — https://github.com/google-agentic-commerce/a2a-x402 (accessed 2026-08-13)
[20] Anthropic, "How we built our multi-agent research system" — https://www.anthropic.com/engineering/built-multi-agent-research-system (2025-06-13)
[21] Anthropic, "Building effective agents" — https://www.anthropic.com/engineering/building-effective-agents (2024-12-19)
[22] Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST) — https://arxiv.org/abs/2503.13657 (2025-03)
[23] "Entropy dynamics in multi-agent LLM systems" — https://arxiv.org/abs/2602.04234 (2026-02-04)
[24] Li et al., "More Agents Is All You Need" — https://arxiv.org/abs/2402.05120 (2024-02-03)
[25] Diagrid, "Checkpoints Are Not Durable Execution" — https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows (2026-02-25)
[26] Anthropic, "How We Contain Claude" — https://www.anthropic.com/engineering/how-we-contain-claude (2026-05-25)
[27] Anthropic, "Claude Code auto mode" — https://www.anthropic.com/engineering/claude-code-auto-mode (2026-03-25)
[28] HN thread on production agent incidents — https://news.ycombinator.com/item?id=48342441 (2026-05-31)
[29] Yang et al., "SWE-agent: Agent-Computer Interfaces" — https://arxiv.org/abs/2405.15793 (2024-05)
[30] Anthropic, "Equipping agents for the real world with Agent Skills" — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills (2025-10-16; open standard 2025-12-18)
[31] Anthropic, "Effective context engineering for AI agents" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (2025-09-29)
[32] "Multi-agent systems as skill libraries" — https://arxiv.org/abs/2601.04748 (2026-01-08)
[33] "Native multi-agent intelligence" — https://arxiv.org/abs/2512.08743 (2025-12-09)
[34] "Multi-agent exploration in LLM agents" — https://arxiv.org/abs/2607.11250 (2026-07-13)
[35] Dify repository — https://github.com/langgenius/dify (accessed 2026-08-13)
[36] Coze Studio repository — https://github.com/coze-dev/coze-studio (created 2025-06-26)
[37] 扣子空间官方页 — https://www.coze.cn/space-preview/ (accessed 2026-08-13)
[38] Yichao 'Peak' Ji, "Context Engineering for AI Agents: Lessons from Building Manus" — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus (2025-07-18)
[39] Manus blog index ($100M ARR 2025-12-17; Joins Meta 2025-12-29) — https://manus.im/blog (accessed 2026-08-13)
[40] Manus, "How Manus became 'James,' the AI chief of staff" — https://manus.im/blog/Ascendea-James-Customer-Story (2026-07-17)
[41] Qian et al., "ChatDev: Communicative Agents for Software Development" — https://arxiv.org/abs/2307.07924 (2023-07)
[42] ZDNet, "As AI agents multiply, IT becomes the new HR department" — https://www.zdnet.com/article/as-ai-agents-multiply-it-becomes-the-new-hr-department/ (2025-03-10)
[43] Sam Altman, "Three Observations" — https://blog.samaltman.com/three-observations (2025-02-09)
