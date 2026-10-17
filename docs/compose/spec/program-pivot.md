---
feature: program-pivot
status: in-progress
updated: 2026-10-15
branch: feature/program-migrate
commits: bdb965b..dd60ade # T9 已交付（叠 T8 分支）；T10 进行中
---

# 产品转型：经验固化为可执行程序（Program Pivot）

## Report

**What was built** — 首期（分析阶段）交付转型分析 + 全景设计 spec（该阶段不含代码实现，按用户决策范围；实现自 T1 起在本分支推进，见下方"T1 交付"与后续追加）。先完成 5 角度业界 deep research（research/program-pivot/：brief + 70 条 findings + 41 源 REPORT），论证"经验固化为可执行程序 + LLM 审阅驱动迭代"的经济性（$150→<$0.10/500 迭代）、业界收敛（Anthropic Agent Skills / Devin orchestration-as-code / SkillWeaver）与风险边界（BOTTLED 48/60 低于零样本线、DGM 伪造测试日志）。据此产出 docs/compose/spec/program-pivot.md：5 个新组件（ProgramRegistry/Executor/Compiler/Reviewer/promotion_gate）+ 程序包契约 + 三分法路由 + 测试门禁自动晋升（带 lineage 血缘审计）+ M1–M4 彻底取代文本技能进化的迁移路径 + T1–T10 实施任务拆解。

**Verification** — 文件存在与 findings 计数（12/12/13/22/11=70）PASS；REPORT.md 引用双向核对（cited∖sourced 与 sourced∖cited 均空、无 [x- 占位）PASS；spec 无 TBD/占位符、10 tasks 均有 covers: PASS；源数统一为 41（spec/REPORT 头/Sources 条目三方一致）PASS。docs-only 变更，pytest/vitest 不适用。独立 review 子代理结论：A1–A7 全 PASS、无 Critical；2 Major（审阅 fail 当次交付语义、源数不一致）+ 3 Minor 已全部修复并复验。

**Journey log** —
1. F1/F4 两轮子代理曾被系统取消/挂起，实际稍后完成并覆盖了已读 findings：靠上下文留存恢复旧 F4 全文并与新产出合并（F4.md 头部注明两段来源），教训——并行调研子代理的状态不可尽信，落盘文件以 diff 复核为准。
2. `docs/compose/` 在 .gitignore 中但历史 spec 均为 tracked：新 spec 需 `git add -f`，与仓库惯例一致。
3. WebSearch 插件本环境不可用：全部子代理改走 OpenAlex API / 直取 arXiv / HN Algolia，"speed demons" 经 OpenAlex 题名+全文检索确认无学术出处，报告已弃用该引用。
4. 用户对 spec 审批题选择 dismiss：按 Never-Ask 规则采用推荐项（批准继续）并记录在案。
5. Review 指出"审阅 fail 与执行异常的当次任务交付不对称"——设计补语义：审阅 fail 作废程序结果、降级 LLM 重执行，与异常路径统一。

### T1 交付（2026-10-15，9c75e7e..34b6c38）

**What was built** — `backend/program_registry.py`：ProgramPack manifest（Pydantic 校验含 program_id 防路径遍历）、candidate→promoted→deprecated 状态机（非法迁移拒绝 + append-only lineage.json）、新鲜度（TTL 过期 + 模型换代/未记录验证模型 → 不新鲜，宁重勿轻）、触发关键词匹配（仅 promoted 且新鲜，按命中数排序）、skill_packs legacy 只读登记（幂等/不可晋升/不参与匹配/不可记录验证）。`backend/routers/programs.py`：`/api/programs` CRUD + `/match` + `/promote` + `/deprecate` + `/legacy/import`，非法 id 返回 INVALID_ID（非 500），响应遵循仓内 ok/fail 惯例。server.py 接线注册。

**Verification** — T1 套件 29 passed（状态机/TTL/模型换代/匹配/只读/脏目录/非法 id 回归）；全量 `pytest tests/ --ignore=tests/legacy` 2170 passed, 0 failed；ruff（CI 同参数）PASS。独立 review：A1–A7 PASS，2 Major（非法 id 500、脏目录 list/match 崩溃）+ 4 Minor 全部修复；修复后原审阅者逐项复核 5/5 VERIFIED、无新问题。

**Journey log (T1)** —
1. `match()` 持非重入 Lock 再调 `list()` 会死锁——实现期自查发现，改 RLock；路由/存储双层锁设计需警惕嵌套获取。
2. CI ruff 参数为 `--select=E,F,W --ignore=...`（ci.yml:41），与本地默认全规则集不同——本地"30 errors"多为 CI 不检的 BLE/I 规则，以 CI 参数为准。
3. pydantic 请求体非法时 FastAPI 原生 422（先于 handler），与业务 fail 双轨并存，测试需分别覆盖。

### T2 交付（2026-10-15，随 PR #20 合入 main）

**What was built** — `backend/program_executor.py`：asyncio 子进程沙箱（`python -I`、最小 env、cwd=包目录）、stdin/stdout JSON 契约、超时强杀 + 显式 reap、8 类结构化错误码；遥测恒定 `llm_calls=0` + `duration_ms` + `timed_out`；`POST /api/programs/{id}/execute`（成功/失败 telemetry 同在 `data`）。仅标准库依赖边界成文入契约。

**Verification** — T2 套件 11 passed（成功/超时/崩溃/非法输出/超限/四守卫）；全量 2183 passed；ruff PASS。独立 review A1–A7 PASS、1 Major（失败响应双轨 telemetry）+ 3 Minor 已修复并复测。

### T3 交付（2026-10-15，b4a1ffe..ef2a8f7）

**What was built** — `backend/program_compiler.py`：`TaskTrajectory`（仅成功轨迹可沉淀）→ `build_prompt`（标准库/确定性/stdin-stdout 硬性要求 + desc/step/样例定界）→ `raw_decode` JSON 解析 + `GeneratedProgram` 强校验（program_id/`def run(`/非空/≤50KB）→ registry 登记 candidate + 原子写 `main.py` + `tests/test_generated.py`；**写盘失败经 `registry.delete()`（仅 candidate 可删）回滚，不留半成品**。`llm_generate_fn` 复用 skill_generator 同款 model_factory 编排（生成器可注入）。`POST /api/programs/compile`，错误码 `INVALID_TRAJECTORY/NO_GENERATOR/GENERATION_FAILED/ALREADY_EXISTS/COMPILE_FAILED`（已入 spec 错误行为枚举）。

**Verification** — T3 套件 13 passed（含草稿被 T2 执行器真跑的自洽性、回滚、删除守卫、噪声 JSON、50KB 强校验）；program 全套 51+；全量 2196 passed；ruff PASS。独立 review A1–A7 全 PASS；1 Major（写盘半成品窗口）+ 3 Minor 已修复，复核 **4/4 VERIFIED**；复核尾项 2 Minor（回滚异常范围、50KB 强校验）亦已修复。

**Journey log (T2–T3)** —
1. `asyncio.Process.communicate()` 不接受 timeout kwarg——timeout 只能挂 `wait_for` 外层。
2. 回滚/只读守卫类修复必须配回归测试进套件，复核者两次"实测复现"都指向缺测路径。
3. 生成器注入（`(prompt) -> str`）让 LLM 组件的单测完全不碰网络，是后续 T5 Reviewer/Evolver 应沿用的模式。


### T4 交付（2026-10-16，b4a1ffe..fd736c6）

**What was built** — `backend/promotion_gate.py`：candidate 测试门禁——pytest 子进程（`start_new_session` + 最小 env + `PYTHONPATH` 注入 pack 根、超时 `killpg` 整组强杀）；通过 → `promote(validated_model)` **自动晋升**（无人工前置）；失败 → 状态不变（candidate 保持 = 保留上一版语义）。lineage 审计：`gate_passed/failed/timeout` 事件含 `test_hashes`/`main_sha256`/`output_tail`(≤2000)/`at`/`tests_modified`；**时序为 gate 事件先于 promote**。防作弊：与上次门禁哈希对比标记 `tests_modified`（DGM 伪造测试实证对策）；TOCTOU 竞态（pytest 运行中状态被改）→ `GATE_RACE` + `gate_aborted`（结构化，非 500）。`llm_calls` 恒 0。`Dockerfile.backend` 补装 pytest/pytest-timeout（生产镜像门禁可用）。`registry.append_lineage()` 公共方法。`POST /api/programs/{id}/gate`。

**Verification** — T4 套件 11 passed（真跑 pytest 子进程/真改测试触发标记/超时/GATE_RACE/时序与审计字段断言）；全量 2194 passed；ruff PASS。独立 review A1–A7 全 PASS；3 Major（promote 竞态 500、生产镜像缺 pytest、审计字段缺失）+ 4 Minor 已修复，复核 **4/4 VERIFIED**；复核尾项 2 Minor（GATE_RACE 顶层码、超时 tests_modified）亦已修复。

**Journey log (T4)** —
1. 门禁子进程不能用 `python -I`（需要 pytest/站点包），与 T2 执行器 `-I` 约定相反——隔离边界按场景取舍，需在代码注释写明。
2. "读状态→await→写状态"的长窗口 TOCTOU 必须把竞态异常转为结构化错误，否则违反仓内 fail 惯例（reviewer 实测复现 500）。
3. 生产镜像（Dockerfile）缺测试依赖会让"依赖 pytest 的运行时功能"静默全挂——此类门禁功能必须同步改镜像。

### T5 交付（2026-10-16，9afe4c7..ed482bb，叠在 T4 分支）

**What was built** — `program_reviewer.py`：LLM 只审阅执行结果（`llm_calls=1`、不执行任务）→ `verdict/issue` 结构化 JSON，fail 必带可执行意见；生成器可注入。`program_evolver.py`：审阅 fail 意见 → 快照（`.revisions/` 原子占位防撞号）→ `registry.revise`（promoted→candidate，match 不命中、任务回退 LLM 路径）→ 修订落盘（版本**强制**严格递增，不信任 LLM；tests 整目录重建）→ T4 门禁 → **通过=升级+清零计数+刷新新鲜度 / 失败=回滚保留上一版（文件+version+status 一致还原，`tests_restored` 基线防误报）/ 连续 3 败=恢复快照后 deprecate（终态）**。防作弊血缘：`upgrade_requested`（issues+快照路径+前后版本）、`gate_*`（test_hashes/output_tail）、`rollback/version_restored`。竞态全结构化：revise/rollback/deprecate/gate/记账 → `UPGRADE_RACE`（非 500）。registry 扩展：`promoted→candidate` 转换、`consecutive_gate_failures` 字段、`revise/record_gate_failure/reset_gate_failures/restore_version`、`promote(event=)`。`POST /{id}/review`、`POST /{id}/upgrade`。

**Verification** — T5 套件 19 passed（三连败降级、快照/版本回滚一致、路由停用、版本强制、竞态、基线防误报、端点级 NO_ISSUES/REVIEW_INVALID）；全量 2213 passed；ruff PASS。独立 review A2/A3/A4/A7 PASS、A1/A6 部分不合规——4 Major + 5 Minor 全修复，复核 **5/5 VERIFIED**；复核尾项 1 Minor（并发删除包记账）亦已修复。

**Journey log (T5)** —
1. 状态机扩展（promoted→candidate）让"修订期间路由停用"免费获得宁重勿轻的 LLM 回退——比显式维护"修订中"状态更简单。
2. 快照回滚会污染门禁的 tests_modified 基线（比较对象是被换掉的新测试）——回滚后必须把恢复出的旧哈希重新写为基线，否则防作弊信号系统性误报。
3. 版本递增这类"LLM 应当遵守"的约束必须在代码层强制校验+自动纠正，prompt 要求不可信（reviewer probe 实证）。

### T6 交付（2026-10-16，3e07bd1..c2f0618，叠在 T5 分支）

**What was built** — `program_router.py`：`try_program_path` 三分法的 program 支路——registry 命中（promoted+新鲜含模型校验+关键词）→ `ProgramExecutor` 免 LLM 执行 → `ProgramReviewer` 审阅 pass → `task_result(path_used="program")` **且 wire 上线发送**（前端复位依赖）；任何不确定（NO_MATCH/陈旧/执行异常/审阅 fail/审阅器不可用/match 或段级异常）→ `handled=False` fail-open 回退 LLM 路径（宁重勿轻），fail 意见随 outcome 带出（接 T5 升级闭环），非 NO_MATCH 回退给出降级提示。CeoAgent `process_message` 在复杂度判定**之前**优先尝试 program 路径（命中不触发 LLM 复杂度判定），`REVIEW_FAIL` 推送 `program_review_failed(issues)`。server `_program_route_fn` 按会话 `api_key` 构建审阅生成器、传 `model_name` 做新鲜度模型校验，经 `WSContext.program_route_fn` 注入两处 CeoAgent 构造。

**Verification** — T6 套件 12 passed（命中 wire 断言/回退各码/陈旧/候选/Ceo 集成两路径/server 接线无 key/降级提示语义）；全量 2225 passed；ruff PASS。独立 review A1–A7 全 PASS；1 Major（命中结果未上线发送）+ 4 Minor 已修复，复核 **5/5 VERIFIED**。

**Journey log (T6)** —
1. 前端完成态只认 wire `task_result`——`process_message` 的返回值只被日志消费；命中路径必须显式 `send_message`，否则 UI 永不复位（reviewer 实测发现）。
2. `_ws_ctx` 是先构建后补属性的单例：任何后置赋值必须位于 `_init_ws_ctx()` 之后（server 执行顺序敏感）。
3. "回退"必须给用户可感知的降级提示（非 NO_MATCH 静默会让"为什么没走程序路径"不可观测），但 NO_MATCH 应静默——它是常态。

### T7 交付（2026-10-16，29e0322..7362c25，合并 T3+T6 栈）

**What was built** — **M1 写侧**：`PROGRAM_PIVOT_DISABLE_RULE_WRITES` 开关（config 默认 False；server 启动按 env 翻 True，生产默认关写、`=0` 可回退）；`_save_new_rule` / 规则自进化（LLM 生成**前**拦截）/ human-feedback 建规则（含纯 JSON 回退）三处关停——新任务 0 条新经验规则写入；存量 approve/demote 状态更新与读保留。**M2 读侧**：`program_injection.build_program_context`（registry 命中→**参考语义**程序上下文，明示本次已进 LLM 路径，不与 T6 回退矛盾；相对 data_dir 按 backend/ 归一；异常→`""` 绝不抛）；四处注入 registry 优先 + 旧规则路径回退：coordinator_experience / coordinator_workflow / task_orchestrator / state_sync（server 接线共享 `_program_registry`）。本分支同时合并 T3 compiler 栈（programs.py 三生成器注入共存）。

**Verification** — T7 套件 12 passed（写关停/启用/进化早拦/反馈双路径/注入 advisory 文案/相对路径归一/workflow/state_sync/orchestrator）；ruff PASS；server import OK。修复前全量 2247 passed（修复后全量交 CI）。独立 review A1–A7 全 PASS；2 Major（注入与 T6 回退语义冲突、coordinator 相对 data_dir 分叉）+ 2 Minor 已修复。

**Journey log (T7)** —
1. 注入点位于 LLM 路径（T6 未采用时才走到）——注入文案必须是"参考"而非"复用指令"，否则对回退任务是误导；"命中"≠"将走程序路径"。
2. 关停类开关默认 False（测试直连）+ server 启动翻 True（生产）——比默认 True 破2000+ 存量测试更稳；env=0 回退保命。
3. 组件默认相对路径（`data_dir="data"`）在被注入新依赖时风险放大——归一化应放在使用方而非各调用点。

### T8 交付（2026-10-17，8aa1e91..2481105）

**What was built** — `research/program-pivot-ab/`：五任务双臂 A/B harness（`ws_driver.py` 参数化 `EVAL_WS_URL` + `run_ab.py` 自动 seed/双臂运行/对比聚合）+ 产物 `arm_llm.json`/`arm_program.json`/`compare.json` + 逐任务 summary/messages 证据 + README 结论。**实测**：LLM 臂 2/5、p50 37.7s/p95 45.5s、token 代理 266；程序臂 3/5、p50 24.3s/p95 50.9s、token 代理 263，E1/E5 程序命中 2 次——策略型程序输出未落盘，**LLM 审阅如实 fail→回退**（`path_used=program`=0，契约正确），印证 io_schema/workspace payload 缺口（产出文件的程序暂无法闭环）。**评测挖出并修复生产级 bug**：`llm_review_fn`/`llm_generate_fn` 误用旧 agentscope `agent.model`（自建 ChatAgent 无此属性）→ 实网审阅/编译必炸；改为直接 `create_agent().reply()`。server 端口 `MDH_PORT` 可配置（并行评测实例）。

**Verification** — program 全套 109 passed；ruff PASS；实网双臂 10 任务全部完成（无 timeout/connection_error）；compare.json 双臂字段齐全（p50/p95/得分/路径/程序事件/token 代理）。

**Journey log (T8)** —
1. 单轮五任务方差大（E3 两臂成功翻转）——A/B 量化收益需多轮重复，单轮只做机制验证；README 已注明。
2. 实网评测比单测更能挖出真 bug：生成器注入式单测全绿但实网必炸（`agent.model` 属性不存在）——LLM 组件需要至少一条实网冒烟。
3. 评测驱动无返回值（只落盘）是既有约定——harness 回读 summary 文件而非依赖返回值。

### T9 交付（2026-10-17，bdb965b..12c871d+fix）

**What was built** — `ProgramRegistryPanel.tsx`：程序包只读面板——列表（状态筛选、验证时间、连续失败角标）+ 行展开 **lineage 时间线**（16 类事件中文标签、版本迁移、快照路径、审阅意见）；`SkillEvolutionDashboard` 新增「程序库 🧩」tab；`ExperienceRulePanel` **只读化**（移除批准/拒绝写操作与导入，副标题标注 M1 关停）。健壮性：详情竞态守卫（请求序号）、非数组 lineage 防护、fail envelope 错误态。vitest 6 passed（列表/筛选/lineage/错误/无写按钮，StrictMode URL 路由 mock）。

**Verification** — vitest 2 文件 6 passed；独立 review A1–A5 全 PASS、无 Critical/Major；3 Minor（死样式、竞态/非数组、act 警告）已修复。

**Journey log (T9)** —
1. 经验规则"管理"面板的写按钮是 M1 关停后的 UI 残留——只读化必须连 handler/导入/死样式一起清，否则 eslint/审计还会看见"写路径"。
2. 测试里 `getByText(/批准/)` 会误伤过滤按钮"已批准"——断言写操作消失要精确到按钮角色+完整文案。
3. React18 StrictMode 双跑 effect：fetch mock 必须按 URL 路由而非调用次序（Once 链）。

## [S1] Problem

MDH 的"技能随用随进化"体系沉淀物全部是**文本**（skill packs 的 rules/、experience_rules 表、CoW 增量区），存在三个用户可感知的问题：

1. **成本与延迟**：每个相似任务都重新走 LLM 推理。仓内实证：Q4 路线图记录 LLM 调用 26× 放大（目标 8–12×）；五任务评测单任务耗时 24.5–97.2s。业界对照（预印本口径，置信度中等）：5 步工作流 × 500 次迭代，持续 LLM 循环约 $150、激进缓存仍约 $15，而一次性编译+本地执行 <$0.10（research/program-pivot/REPORT.md §一，源 [1]）。
2. **文本规则进化追不上模型迭代**：技能正被模型内化，规则文本既无确定性保证，又随模型换代贬值（Model Drifting 实证，源 [21]）；LLM 自撰文本技能在 SkillsBench 上收益 0pp（源 [17]）。文本层投入的进化机制（自进化/联动进化/共享门禁）维护的是一个正在贬值的资产类别。
3. **无"经验→程序"链路**：仓内摸底确认——workflow 节点执行仍走 LLM（coordinator_workflow），自调优引擎只调 18 个标量参数，不存在任何把 LLM 工作流固化为本地可执行程序的机制；最接近的只是 gate_engine 的 lint/test 确定性检查。

**转型主张**：大模型只负责开放、创造型工作；执行过程中的经验总结不再产出文本规则，而是**沉淀为带测试的真实代码程序**。相似任务直接本地执行程序（零 LLM 调用），仅将结果交 LLM 审阅并指出问题，驱动程序自动迭代升级。业界证据（research/program-pivot/REPORT.md，41 源）支持该方向：SkillWeaver 闭环（自主发现→练习→蒸馏为 API 库，+31.8%）、Anthropic 官方"capture successes into code"迭代法、Devin "orchestration itself is code"、测试门禁程序进化（DGM SWE-bench 20→50%）均已落地；同时风险明确——BOTTLED 48/60 次固化低于零样本线、DGM 有伪造测试日志记录，故门禁必须带血缘审计。

## [S2] Design

### 架构总览

```
开放创造任务 ──→ LLM 执行（现有复杂路径） ──→ 结果
                     │ 沉淀候选（ProgramCompiler）
                     ▼
              ProgramRegistry（程序包库，只读归档旧技能资产）
                     │ 触发条件命中 + 版本新鲜
                     ▼
相似任务 ──→ 三分法路由 ──→ ProgramExecutor 免 LLM 执行 ──→ 结果
                     │                            │
                     │ 未命中 → 现有 LLM 路径      ▼
                     │                    ProgramReviewer（LLM 只审阅）
                     │                            │ 意见 → ProgramEvolver（LLM 改程序）
                     │                            ▼
                     └◄──── 测试门禁 + lineage 自动晋升 ◄──┘（失败回滚）
```

五个新组件 + 三处接线，全部复用现有基础设施（gate_engine 确定性门禁、tuning 影子验证/回滚模式、executor_server 沙箱与超时、trace.py 血缘日志）：

| 组件 | 职责 | 新建/复用 |
|---|---|---|
| `program_registry.py` | 程序包 CRUD、索引、触发条件匹配、版本与新鲜度状态 | 新建 |
| `program_executor.py` | 免 LLM 沙箱执行、结构化结果 + 遥测（耗时/调用数=0/输出） | 新建（沙箱/超时复用 executor_server 约定） |
| `program_compiler.py` | 从成功任务轨迹沉淀候选程序包（LLM 生成 main.py + 自带测试） | 新建（LLM 调用复用 model_manager） |
| `program_reviewer.py` | 只审阅执行结果与 diff，不执行任务；输出结构化意见 | 新建（审阅提示词复用 review_pipeline 模式） |
| `promotion_gate.py` | 测试门禁自动晋升：候选 → 跑 tests → 通过晋升/失败回滚；写 lineage | 新建（校验复用 gate_engine，回滚模式复用 tuning_deployment） |
| 三分法路由接线 | complexity/路由层新增 program_path 分支 | 接 ComplexityClassifier / dynamicRouter 现有路径选择 |
| 沉淀触发接线 | LLM 路径（simple/complex）成功后沉淀钩子替代经验规则提取 | 接 state_sync / 任务后处理链 |
| 注入切换 | 任务前上下文注入由经验规则检索改为 registry 命中查询 | 改 state_sync.retrieve 一侧 |

### 程序包契约（ProgramPack）

```
program_packs/<program_id>/
├── manifest.yaml      # program_id, version, description(供路由匹配),
│                      # trigger(适用条件), io_schema(Pydantic 输入输出),
│                      # model_dependency(编译时模型), tests_path, status
├── main.py            # 确定性入口：def run(input: IO) -> IO，禁止依赖
│                      # 时间/随机数/环境变量/网络（对齐 Devin 确定性约束）；
│                      # 仅依赖 Python 标准库（执行环境为 python -I + 最小 env）
├── tests/             # 必备：验收测试（晋升唯一门禁）
└── lineage.json       # 版本链：每版的 review 意见、测试结果、晋升/回滚记录
```

- **status 状态机**：`candidate → promoted → deprecated`；`promoted` 在升级闭环连续失败时降为 `deprecated`（终态，由新 candidate 重新晋升）。**新鲜度失效不自动改状态**——仅在路由匹配层过滤为不命中（宁重勿轻），由沉淀钩子重验证（record_validation）刷新；避免"匹配时隐式写状态"与 deprecated 终态语义冲突。
- **新鲜度**：manifest 记录 `last_validated_model` 与 `last_validated_at`；路由命中前校验（模型换代或超过 TTL → 视为不命中，走 LLM 路径；该任务成功后由沉淀钩子产出重验证候选，走 T3→T4 门禁重新晋升）。对应 STALE/新鲜度实证（源 [19][33]）。
- **旧资产只读兼容**：skill_packs/ 与 experience_rules 停止新增，作为 ProgramCompiler 的沉淀素材与 ProgramReviewer 的审阅上下文只读引用；43 个 skill packs 逐步对齐 agentskills.io 的 SKILL.md + `scripts/` 结构（源 [12]）。

### 三分法路由

在现有 `path_selected`（simple/complex）之上增加 `program` 路径：

| 路径 | 触发条件 | 流程 |
|---|---|---|
| program | registry 触发条件匹配 **且** status=promoted **且** 新鲜度通过 | ProgramExecutor 免 LLM 执行 → 结果交 ProgramReviewer 审阅 → task_result(`path_used="program"`) |
| simple | 现有条件不变，且无 program 命中 | 现有简单路径 |
| complex | 其余 | 现有复杂路径；simple/complex 任一 LLM 路径成功后触发沉淀钩子 |

- 程序执行结果**总是**交 LLM 审阅（审阅是轻量单次调用，成本远低于原执行）；审阅仅 pass/fail + 结构化意见，不重做任务。
- **审阅 fail 的当次任务交付**：作废程序结果，自动降级 LLM 路径重执行本次任务（与执行异常同一降级语义），审阅意见并入升级闭环。不把未过审的结果交付给用户。
- 程序执行异常/测试回归 → 同上自动降级 LLM 路径执行本次任务，同时把失败喂给升级闭环。

### 审阅—升级闭环（自动迭代）

1. 触发：ProgramReviewer 给出 fail 或程序执行失败/回归。
2. `program_evolver`（LLM）按意见产出新候选版（diff 到 `candidate`）。
3. 候选跑该程序包自带 tests + 全量相关回归 → 通过则 `promotion_gate` **自动晋升**并写 lineage；失败自动回滚，保留上一 promoted 版。
4. 连续 3 次晋升失败 → 程序降级 `deprecated`，该类任务回退 LLM 路径，等待下一轮沉淀。
5. **防作弊（血缘审计，非前置人工）**：lineage 完整记录每版 diff、测试输出、审阅意见与晋升判定；测试断言不得由被测程序自身修改（tests/ 变更单独标记，evolver 改测试必须同步给出理由，供事后抽查）。依据 DGM 伪造测试日志实证（源 [4]）——晋升保持全自动，审计事后进行。

### 迁移路径（彻底取代文本技能进化）

| 阶段 | 动作 | 退出条件 |
|---|---|---|
| M1 并轨 | 新沉淀一律走 ProgramCompiler；experience_extractor 的规则写入路径全部关闭（读保留）；skill_evolution/CoW 增量停止写入 | 新任务 0 条新经验规则 |
| M2 切换 | state_sync 任务前注入改为 registry 命中；命中走 program 路径 | program 路径在评测集上端到端跑通 |
| M3 归档 | skill packs 只读归档并对齐 SKILL.md+scripts 格式；SkillEvolution/ExperienceRule 面板改为 ProgramRegistry 面板（版本/血缘/晋升历史可视化） | 前端无经验规则写入口 |
| M4 清场 | 删除规则写入/自进化/联动进化/共享池审批的写路径代码与后台调度 | 全量测试绿、ruff/eslint 绿 |

- **保留**：XP/职业发展技能树（绩效系统，非知识沉淀）；自调优 RSI（标量参数）；规则**只读**检索作为审阅上下文，直至存量规则被程序包完全替代。
- **替换对照**：程序路径 vs LLM 直调在五任务评测体系上跑 A/B，产出成本/延迟/质量对照（补业界 p95 空白，见 Open question 2）。

### 错误行为

- 程序执行超时/异常 → 记录 telemetry → 本次降级 LLM 路径 → 失败进入升级闭环（不阻塞用户任务）。
- 晋升门禁异常（测试框架崩溃）→ fail-closed：不晋升，留 candidate（复用 gate_engine "工具缺失 fail-open / 真实失败 fail-closed" 的区分）。
- registry 匹配异常 → 按未命中处理（宁重勿轻，走 LLM 路径）。
- 沉淀（compile）错误码：`INVALID_TRAJECTORY`（非成功轨迹/空描述）、`NO_GENERATOR`（无注入生成器且无 api_key）、`GENERATION_FAILED`（LLM 输出非合法程序草稿）、`ALREADY_EXISTS`（program_id 撞名）、`COMPILE_FAILED`（兜底，含写盘失败——已回滚 registry 登记不留半成品）。

### 测试边界

- 单测：registry 匹配与新鲜度、executor 结构化输出、promotion_gate 晋升/回滚/血缘、evolver 改测试的标记逻辑。
- 集成：沉淀→晋升→路由命中→免 LLM 执行→审阅→升级 全闭环；失败降级链路。
- E2E：五任务评测集上 program 路径端到端 + 成本/延迟 A/B 基线 JSON（对照 research/eval-* 口径）。

## [S3] Out of Scope

- XP/职业发展技能树与角色晋升（绩效系统，不属知识沉淀）。
- 自调优引擎 RSI 的标量参数调优（维持现状）。
- 提示词/答案缓存类降本（业界对照已表明缓存≠固化）。
- 多团队技能市场/共享池的产品重塑（随 M3 归档仅做只读降级，不重设计）。
- 对 MDH 之外系统（Claude Code/Devin 等）沉淀物的互操作导入。
- 商业化定价与成本转嫁设计。

## Tasks

- [x] T1: ProgramPack 格式与 ProgramRegistry（CRUD/索引/触发匹配/新鲜度状态机/旧资产只读登记） — acceptance: `POST /api/programs` 创建通过 manifest 校验，查询返回匹配候选与 status；单测覆盖状态机与新鲜度失效（covers: S2 程序包契约、架构总览）
- [x] T2: ProgramExecutor 免 LLM 沙箱执行 + 遥测 — acceptance: 对 promoted 程序包执行返回结构化结果与 telemetry（llm_calls=0、耗时），超时/异常按契约报错（covers: S2 程序包契约、错误行为； depends: T1）
- [x] T3: ProgramCompiler 沉淀管线（任务轨迹→候选程序包含自带测试） — acceptance: 成功任务后触发产生 candidate 程序包草稿，tests/ 非空且 manifest 完整（covers: S2 架构总览； depends: T1）
- [x] T4: promotion_gate 测试门禁自动晋升 + lineage — acceptance: 测试通过自动 promoted 并写 lineage.json；失败回滚保留上一版；tests/ 变更被标记（covers: S2 审阅—升级闭环、防作弊； depends: T1）
- [x] T5: ProgramReviewer + program_evolver 审阅升级闭环 — acceptance: fail 审阅意见触发修订候选并经 T4 门禁晋升；连续 3 次失败自动降级 deprecated（covers: S2 审阅—升级闭环、错误行为； depends: T2, T4）
- [x] T6: 三分法路由接线（program/simple/complex + 失败降级） — acceptance: 评测任务命中 promoted 新鲜程序走免 LLM 路径且 task_result 标注 path_used="program"；未命中/失效回退 LLM 路径（covers: S2 三分法路由； depends: T2）
- [x] T7: 沉淀与注入切换（写侧关规则、读侧切 registry）+ 任务前注入改造 — acceptance: 新任务 0 条新经验规则写入；注入请求走 registry；旧读路径保留（covers: S2 迁移路径 M1–M2； depends: T3, T6）
- [x] T8: 程序路径 vs LLM 直调 A/B 评测基线（成本/延迟/质量） — acceptance: 五任务评测产出对照 JSON（p50/p95、token 账单、得分）并写入 research/（covers: S2 迁移路径替换对照； depends: T6）
- [x] T9: 前端 ProgramRegistry 面板（版本/血缘/晋升历史，替换经验规则写入口） — acceptance: 面板展示程序包列表与 lineage；经验规则面板无写操作（covers: S2 迁移路径 M3； depends: T4）
- [ ] T10: 迁移收尾 M4：删除规则写入/自进化/联动进化/共享池写路径与调度 — acceptance: 相关写路径代码与调度移除，全量 pytest/vitest/ruff/eslint 绿（covers: S2 迁移路径 M4； depends: T5, T7, T9）
