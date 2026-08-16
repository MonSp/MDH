# MDH 多智能体协作机制 — 代码级取证报告

> 工作区：`/home/test/MDH/.worktrees/multi-agent-architecture-future`
> 取证方式：只读。所有证据均以 `file:line — 说明` 标注。
> 重要前提：本工作区 `AGENTS.md` 与仓库根 `AGENTS.md` 内容不同——工作区版本已删去"并行讨论/工作流路径/四维路由"等大量章节，是更简化的描述；因此本报告以实际代码为准，而非文档。

---

## 1. 三条执行路径（简单/工作流/会议）的真实接线

### 1.1 顶层只有两条路径，无独立的"工作流路径"
- `backend/ceo_agent.py:233` — 路径分叉点：`if complexity.level == "simple" and complexity.confidence >= 0.7` → `_execute_simple`，`else` → `_execute_complex`。即顶层只有 simple/complex 两叉。
- `backend/ceo_agent.py:234` — simple 分支 `_execute_simple(content, send_message)`。
- `backend/ceo_agent.py:236` — complex 分支 `_execute_complex(...)`。
- `backend/meeting_coordinator.py:813` — "工作流"是 complex 路径内部的子分支：`if analysis.is_workflow and analysis.workflow_definition:` 才走工作流；否则走串行会议流程（`meeting_coordinator.py:833`）。
- 结论：文档声称的"简单/工作流/会议"三路径，实为"简单 vs 复杂"两叉；工作流是复杂路径内由 SemanticAnalyzer 判定出的子模式，没有在 CEO 层独立接线。

### 1.2 触发条件与默认路径
- `backend/complexity_classifier.py:134` — 规则引擎判定 `confidence >= 0.7` 直接返回，否则进入 LLM。
- `backend/complexity_classifier.py:142-149` — 规则不足时调 `_llm_classify`（一次 LLM 调用）。
- `backend/complexity_classifier.py:154-161` — 规则+LLM 都失败时降级默认 `complex`（"宁重勿轻"）。
- `backend/complexity_classifier.py:33-62` — `SIMPLE_PATTERNS`（浏览器/文件/查询正则）。
- `backend/complexity_classifier.py:65-91` — `COMPLEX_PATTERNS`（多步骤连词、跨部门、工作流/流程/系统/架构等）。
- `backend/complexity_classifier.py:94-105` — `CROSS_DEPT_KEYWORDS`、`VERBS` 计数判定（>=2 部门关键词→complex:189，>=3 动词→complex:199）。

### 1.3 simple→complex 升级机制真实存在
- `backend/simple_executor.py:99` — `retry_with_complex = not review.passed`：轻量验收不通过即标记升级。
- `backend/simple_executor.py:164-208` — `_lightweight_review`：仅检查"工具调用有无 error"+"结果文本非空"，不涉及质量判断。
- `backend/ceo_agent.py:250-263` — 验收失败时发 `path_upgrade` 并调用 `upgrade_to_complex`。
- `backend/simple_executor.py:210-278` — `upgrade_to_complex`：重建正式项目 + `DEFAULT_MEETING_AGENTS` 多角色团队 + `MeetingCoordinator`，跑复杂路径。
- 结论：升级链路真实存在且接线完整。

---

## 2. 讨论机制的真实形态

### 2.1 三个讨论实现并存，实际只用一个
- `backend/parallel_discussion_manager.py:21` — `ParallelDiscussionManager`（asyncio.gather 并行）。
- `backend/discussion_manager.py:24` — `DiscussionManager`（串行 for 循环）。
- `backend/mixed_location_discussion.py:45` — `MixedLocationDiscussion`（并行 + location 感知）。
- `backend/meeting_coordinator.py:28-29` — 只 import 了 `DiscussionManager` 与 `MixedLocationDiscussion`（未 import ParallelDiscussionManager）。
- `backend/meeting_coordinator.py:126` — 实例化串行 `DiscussionManager`（作为回退）。
- `backend/meeting_coordinator.py:134` — `_mixed_discussion` 懒加载。
- `backend/meeting_coordinator.py:315-345` — `run_discussion`：有 Team 则用 `MixedLocationDiscussion`，否则回退串行 `DiscussionManager`。
- `backend/ceo_agent.py:478` — `coordinator._team = team`（复杂路径必然注入 Team）→ 实际运行时总是走 `MixedLocationDiscussion`。
- `backend/parallel_meeting_coordinator.py:75` — `ParallelDiscussionManager` 仅被 `ParallelMeetingCoordinator` 使用；`ParallelMeetingCoordinator` 仅被 `backend/tests/test_e2e_parallel.py` 引用（server.py/ceo_agent.py/meeting_coordinator.py 均不 import）。
- 结论：`ParallelDiscussionManager` + `ParallelMeetingCoordinator` 是"只进测试、未接入生产"的死代码；生产讨论 = `MixedLocationDiscussion`（并行），`DiscussionManager` 仅作为理论回退。

### 2.2 收敛判定（stance + confidence 阈值）真实实现
- `backend/mixed_location_discussion.py:313-351` — `_evaluate_convergence`：最近一轮 stance 全部一致→收敛(338-340)；或平均 confidence > 0.8→收敛(347-349)；否则继续。
- `backend/mixed_location_discussion.py:278-288` — `_parse_stance`：正则解析 `[STANCE:...]` 与 `[CONFIDENCE:...]`，缺省 neutral/0.5。
- `backend/discussion_manager.py:233-272` — 串行版收敛判定不同：由 CEO LLM 判断 `continue_discussion`（`discussion_manager.py:245-254`），而非 stance 阈值。两者语义不一致。
- 注意：`mixed_location_discussion.py:114-118` 只让 `Planner/Executor/Reviewer/Monitor` 参与讨论，排除 CEO/Coordinator。

### 2.3 并行 vs 串行
- `backend/mixed_location_discussion.py:137-148` — 用 `asyncio.gather(*tasks, return_exceptions=True)` 真并行调用成员。
- `backend/mixed_location_discussion.py:82` — `asyncio.Semaphore(max_concurrent=6)` 并发控制。
- `backend/mixed_location_discussion.py:129` — 最多 `max_rounds=2` 轮（`meeting_coordinator.py:319` 默认 2）。
- `backend/discussion_manager.py:67-124` — 串行版为 `for role in [PLANNER,EXECUTOR,MONITOR,REVIEWER]` 单循环，无 gather。

---

## 3. 投票系统（negotiation.py）

### 3.1 三种策略均有实现
- `backend/negotiation.py:15-18` — `ConsensusStrategy` 枚举 `simple_majority/weighted_vote/argument_based` 三个值齐全。
- `backend/negotiation.py:233-236` — `evaluate_consensus`：`SIMPLE_MAJORITY` → `approve_count > oppose_count`；否则（weighted/argument_based）→ `weighted_approve > weighted_oppose`。
- `backend/negotiation.py:163-195` — `argument_based` 分支：按 stance 分桶取平均 confidence 加权。

### 3.2 实际接线：只用了 SIMPLE_MAJORITY
- `backend/meeting_coordinator.py:94` — `NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)` 默认策略。
- `backend/meeting_coordinator.py:889-893` — 讨论后 `create_proposal`。
- `backend/meeting_coordinator.py:902-931` — 遍历 meeting.agents 投票：oppose→否、modify/support→是、neutral→`confidence >= 0.4` 才赞成（919-920）。
- `backend/meeting_coordinator.py:923-929` — 同时 `add_argument`（本意"激活 argument_based"）。
- `backend/meeting_coordinator.py:933` — `evaluate_consensus(proposal.id)` **未传 strategy 参数** → 永远走默认 SIMPLE_MAJORITY。`add_argument` 提交的论据对结果无影响。
- 结论：三种策略实现完整，但生产流程硬编码 SIMPLE_MAJORITY，`weighted_vote`/`argument_based` 从未在会议流程被激活（仅单元测试覆盖）。
- 另：`backend/discussion_manager.py:177-200` 串行回退路径里也 cast_vote + add_argument，但同样不覆盖策略。
- 服务端还暴露了独立的投票 WS 消息：`backend/server.py:1526`（adjust_agent_weight）、`1539`（create_proposal）、`1592`（cast_vote）、`1685`（evaluate_consensus），与会议内投票是两套入口。

---

## 4. DAG 工作流引擎

### 4.1 三种执行策略均真实实现
- `backend/workflow_engine.py:125-132` — 按 `execution_strategy` 分发 `sequential/parallel/mixed`。
- `backend/workflow_engine.py:165-185` — `_execute_sequential`（Kahn 拓扑排序 `_topological_sort` 见 396-437）。
- `backend/workflow_engine.py:187-233` — `_execute_parallel`（入度为 0 的就绪节点 + `asyncio.gather`）。
- `backend/workflow_engine.py:235-305` — `_execute_mixed`（无条件节点并行 + 条件节点串行）。

### 4.2 条件分支与跳过传播
- `backend/workflow_engine.py:549-588` — `_evaluate_simple_condition`：仅支持 `field=value` / `field!=value` 字符串比较。
- `backend/workflow_engine.py:307-333` — `_propagate_skip`：节点跳过时递归跳过下游。
- `backend/workflow_engine.py:491-508` — `_has_condition`（检查入边是否带 condition）。

### 4.3 生命周期管理已实现并被 server 暴露
- `backend/workflow_engine.py:629-650` — `pause_workflow`；`652-672` `resume_workflow`；`674-700` `cancel_workflow`；`702-742` `retry_node`。
- `backend/server.py:2194-2297` — REST：`/api/workflow/create|execute|pause|resume|cancel|retry|status|visualization` 全部暴露。

### 4.4 关键问题：server 的引擎实例与会议引擎实例分离
- `backend/server.py:2191` — 模块级全局 `workflow_engine = WorkflowEngine()`（REST 用）。
- `backend/meeting_coordinator.py:106` — `MeetingCoordinator.__init__` 内另建 `self.workflow_engine = WorkflowEngine()`。
- 后果：会议内触发的工作流（`meeting_coordinator.py:1378-1387`）与 REST 接口操作的工作流不在同一实例，REST 无法暂停/取消会议中正在跑的工作流。
- `backend/meeting_coordinator.py:1387` — `await self.workflow_engine.execute_workflow(...)` 直接 await，未存入 `_running_tasks`；而 `pause_workflow`（workflow_engine.py:646-648）靠 `_running_tasks[execution_id].cancel()` 取消任务，会议路径从不填充该表 → 会议内工作流的暂停/取消实为"只改状态、不真正中断"。

### 4.5 生成的工作流实际是线性链，且节点不写文件
- `backend/semantic_analyzer.py:253` — 硬编码 `dept_order = ["dept-frontend","dept-backend","dept-qa","dept-devops"]`。
- `backend/semantic_analyzer.py:254-260` — 按该顺序排序节点并串行连边（每个节点依赖前一个）。
- `backend/semantic_analyzer.py:268` — 固定 `execution_strategy="mixed"`，但线性链下每层只有 1 个就绪节点 → mixed 退化为串行，并行分支形同虚设。
- `backend/meeting_coordinator.py:156-202` — `_execute_workflow_node` 只构造 prompt 调 `model.reply` 返回文本，不调用任何工具、不写文件（对比串行路径的 TaskOrchestrator 会实际写文件）。
- 结论：工作流路径的"执行"只是让各角色 LLM 输出一段方案文本，不落地产物。

---

## 5. 技能进化闭环

### 5.1 触发链路：提取在会议内自动跑，打包不自动
- `backend/meeting_coordinator.py:1097-1117` — 串行流程结尾调用 `ExperienceExtractor.extract_from_meeting(...)`，把讨论/审查/执行结果提炼为规则。
- `backend/experience_extractor.py:606-719` — `extract_from_meeting`：从讨论 stance、审查反馈、写入文件类型生成 `ExperienceRule`，status 固定为 `"pending_review"`，并 `_save_rule`（716）。
- `backend/meeting_coordinator.py:852-872` — 执行前"经验注入"：`retrieve_relevant_rules` 把历史规则注入任务描述。
- `backend/task_orchestrator.py:488-513` — `_get_experience_context`：执行提示词也注入经验规则。

### 5.2 增量区与打包是否真正运行
- `backend/experience_extractor.py:480-492` — `write_to_incremental_area`：审核通过的规则才写入 `incremental/approved/`（由 approve_rule 触发）。
- `backend/skill_packager.py:174-258` — `merge_skills`：基础包 + 增量合并。
- `backend/skill_packager.py:591-640`（`full_package`）— 合并 + 脱敏 + 打包 zip，完整实现。
- `backend/server.py:479-499` — `/api/skills/package`（手工触发打包）。
- `backend/server.py:514-554` — `/api/skills/evolve`（仅再次调用 `extract_from_meeting`，与会议内重复）。
- 结论：闭环"半通"——会议结束自动做了"经验提取（写 pending 规则）"，但"审核→写增量区→merge→zip 升级包"没有在项目结束时自动触发，只靠 REST 手工调用；`/api/skills/evolve` 与会议内提取逻辑重复。

---

## 6. 本地/远端混合执行

### 6.1 UI → 后端（Python）链路（location 仅用于讨论展示，不路由工具）
- `src/components/office-team/CeoChatPanel.tsx:145` — `roleLocations` state（local/remote）。
- `src/components/office-team/CeoChatPanel.tsx:395` — 发送 `role_locations`。
- `backend/server.py:1142` — 收到 `role_locations`；`1156` — 传给 `ceo.process_message(role_locations=...)`。
- `backend/ceo_agent.py:72-103` — `_build_dag` 把 location 写入每个 task（`:93` `location=role_locations.get(role_id,"local")`）。
- `backend/team_assembler.py:78-90` — 按 skill→location 映射为 `AgentLocation.LOCAL/REMOTE`。
- `backend/mixed_location_discussion.py:125-127,302-303` — location 仅用于统计和 💻/☁️ 图标。
- `backend/task_orchestrator.py:196-202` — 实际执行用 `AgentToolset(workspace_root=...)` 本地直连，**不感知 location**。
- 结论：Python 后端的 local/remote 只是"讨论展示层"概念，工具执行仍在本地 Python 侧统一完成，不存在真正的远端路由。

### 6.2 Orchestrator（TS）侧：路由组件齐备但主流程未接入
- `orchestrator/src/toolkit/router.ts:17-35` — `RouterFactory.getRouterForMember`：按 `member.location` 返回 local/remote router，实现完整。
- `orchestrator/src/toolkit/remote.ts:96-203` — `RemoteToolkitRouter`：HTTP POST `/execute` + 指数退避重试 + 熔断器。
- `orchestrator/src/toolkit/hybrid.ts:43-77` — `HybridToolkitRouter`：按工具类型（FILE/CMD/GIT）路由 local/remote。
- `orchestrator/src/team/coordinator.ts:413` — `createTeam` 硬编码 `location: 'local'`。
- `orchestrator/src/team/coordinator.ts:125` — `createTeam(rolesToUse, userMessage)` **未传 runtime** → 成员 runtime 恒为 local。
- `orchestrator/src/team/coordinator.ts:428` — `getRouterForMember(member.location...)` 实际读到恒为 'local'。
- `orchestrator/src/team/coordinator.ts` 全文件未出现 `HybridToolkitRouter`（`execute()` 只用 RouterFactory + defaultRouter）。
- 结论：TS 侧 RouterFactory/local/remote/hybrid 均已实现且有测试，但 `TeamCoordinator.execute()` 主流程把所有成员钉死在 local，`HybridToolkitRouter` 未接线，UI 的 per-agent 位置选择未贯穿到 TS 编排器。

---

## 7. 局限与风险点（有代码证据）

### 7.1 硬编码
- `backend/semantic_analyzer.py:253` — 部门顺序硬编码，工作流节点被强制排成前端→后端→QA→DevOps 单链，无法表达真实 DAG 并行。
- `backend/meeting_coordinator.py:169-177` — dept→role 映射硬编码（前端/后端/数据都映射 EXECUTOR）。

### 7.2 LLM 调用放大（一次复杂任务上限约 26+ 次）
- 复杂度 LLM（仅规则 <0.7 时）：`complexity_classifier.py:142-149`（1）。
- 语义分析：`semantic_analyzer.py:104`（1）。
- 讨论：`mixed_location_discussion.py:148` 每轮 4 成员 ×2 轮（8）+ 协调者总结 `383`（1）= 9。
- 执行：`task_orchestrator.py:244-245` 每个任务最多 `max_tool_rounds+1`=6 次 `model.reply`（6）。
- 审查：`review_pipeline.py:148,188,229` 每轮 reviewer+monitor+coordinator 3 次 × `max_iterations=3`（9）。
- 合计约 26 次/任务；且 `planner.generate_review_feedback`（`review_pipeline.py:258-267`）为同步关键词匹配非 LLM。

### 7.3 串行回退 / 死代码 / 重复实现
- `backend/discussion_manager.py`（串行）与 `backend/parallel_discussion_manager.py`（并行）+ `backend/parallel_meeting_coordinator.py` 三套讨论实现，生产只走 `mixed_location_discussion`，其余两套近乎死代码（`parallel_meeting_coordinator.py` 仅测试引用）。
- `backend/meeting_coordinator.py:280`（`decompose_task`）与 `:594`（`assign_tasks`）在 `process_user_message` 中未被调用（实际走 `auto_assign_task`/`TaskOrchestrator.execute`）。
- `backend/server.py:2191` 与 `meeting_coordinator.py:106` — 两个 WorkflowEngine 实例分离，REST 无法管理会议工作流。
- `backend/skill_packager.py` 与 `backend/experience_extractor.py` 的提取逻辑被 `server.py:514 /api/skills/evolve` 与会议内（meeting_coordinator:1102）重复触发。
- 前端 `src/modules/` 存在成对重复：`dynamicRouter.ts` + `dynamicRouterLocal.ts`、`workflowEngine.ts` + `workflowEngineLocal.ts`（Python→TS 迁移产物）。

### 7.4 未接线 / 名不副实
- 自适应路由学习断链：`meeting_coordinator.py:730` 把路由写入 `self._task_routing`，但真正调 `update_stats` 的是 `task_orchestrator.py:361-363,380-382` 读其**自己的** `_task_routing`（`task_orchestrator.py:50`），而会议流程从不调用 `TaskOrchestrator.assign()`（唯一 populate `_task_routing` 的地方，见 146 行）→ 实际会议流程从不更新部门成功率。
- Critic/Grounding 非 LLM：`backend/collaboration/critic_agent.py:46`、`grounding_agent.py:45` 均为同步方法（无 async、无 model.reply），审查流水线里的"CriticAgent+GroundingAgent"是规则匹配。
- 审批"自动通过"：`meeting_coordinator.py:981-984` 文本写"自动审批通过"，未真正等待人工审批（`human_approval_request` 发出后无阻塞等待）。
- 工作流节点不写文件：`meeting_coordinator.py:156-202`。

### 7.5 单点故障 / 无冗余
- `backend/server.py:1145-1151` — 每个会话单例 `CeoAgent`；`meeting_coordinator.py:268-278` `_get_model` 用内存 dict 缓存单实例模型；无 agent 池接管、无故障转移（`agent_pool.py` 存在但 `MeetingCoordinator` 构造不注入 `agent_pool`，见 `meeting_coordinator.py:63,87`）。
- `mock-sso/` 镜像：`mock-sso/roles_config.yaml` 与 `backend/roles_config.yaml` 逐字节相同（diff exit=0）；`mock-sso/server.py` 仅为登录 mock（端口 8766，`server.py:10-13`），其 `collaboration/` 目录在本工作区已不存在，但 AGENTS.md 仍描述该目录（文档滞后）。

---

## 8. 近期演进方向

### 8.1 git log（最近 20 条，2026-08-03 ~ 08-12）
- `6fc5040` feat(ts): migrate all Python backend modules to local TypeScript implementations
- `9833e11` feat(ts): migrate git integration, code extractor, and 6 collaboration agents
- `153f4d5` feat(orchestrator): extend local tools to 18 and add knowledge/rules injection
- `ae8b8c9` feat: intelligent context passing between meeting agents
- `c3236d5` feat: convert oppose opinions to avoid-constraints instead of filtering
- `1127ff8` test: add ExecutionSummary and discussion constraint tests
- `a59bf0c` chore: remove browser sidebar bridge protocol test pages and code
- `7982912` fix(App.tsx): add missing useEffect closing bracket from bridge cleanup
- 并行一条 Electron 离线文档线：`58e6694`(docx)、`5c0dcb4`(PPT)、`2c38866`(禁 python/pip bash)、`33076ed`(路径遍历 guard) 等。

### 8.2 迁移计划文档实质内容
- `docs/compose/plans/2026-08-11-python-to-ts-migration.md:1` — 标题"Python → Electron TS 功能迁移计划"。
- `docs/compose/plans/2026-08-11-python-to-ts-migration.md:5` — 目标：把 Python 后端缺失核心功能迁到 Electron TS，使 TS 端独立运行。
- `docs/compose/plans/2026-08-11-python-to-ts-migration.md:7` — 按 4 批次迁移（P0 核心/P1 重要/P2 增强/P3 低优先级），模块导出到 `src/modules/index.ts`。
- P0（`:21`）llmCache、complexityClassifier、workflowEngineLocal、projectManager；P1（`:936`）earsValidator、specTreeValidator、evidenceChain、gateManager、fallbackChain；P2（`:1701`）agentPool、deadLetterQueue；P3（`:1986`）messageQueue。
- 演进判断：主线是"把 Python 后端逻辑下沉到前端/Electron TS（src/modules），实现本地独立运行/离线能力"，与 git log 中 `feat(ts): migrate ...` 系列提交一致；orchestrator（Node.js）是另一条并行服务线。
