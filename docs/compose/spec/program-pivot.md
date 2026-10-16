---
feature: program-pivot
status: in-progress
updated: 2026-10-15
branch: feature/program-registry
commits: 9c75e7e..34b6c38 # T1 已交付；T2–T10 进行中
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
- [ ] T2: ProgramExecutor 免 LLM 沙箱执行 + 遥测 — acceptance: 对 promoted 程序包执行返回结构化结果与 telemetry（llm_calls=0、耗时），超时/异常按契约报错（covers: S2 程序包契约、错误行为； depends: T1）
- [ ] T3: ProgramCompiler 沉淀管线（任务轨迹→候选程序包含自带测试） — acceptance: 成功任务后触发产生 candidate 程序包草稿，tests/ 非空且 manifest 完整（covers: S2 架构总览； depends: T1）
- [ ] T4: promotion_gate 测试门禁自动晋升 + lineage — acceptance: 测试通过自动 promoted 并写 lineage.json；失败回滚保留上一版；tests/ 变更被标记（covers: S2 审阅—升级闭环、防作弊； depends: T1）
- [ ] T5: ProgramReviewer + program_evolver 审阅升级闭环 — acceptance: fail 审阅意见触发修订候选并经 T4 门禁晋升；连续 3 次失败自动降级 deprecated（covers: S2 审阅—升级闭环、错误行为； depends: T2, T4）
- [ ] T6: 三分法路由接线（program/simple/complex + 失败降级） — acceptance: 评测任务命中 promoted 新鲜程序走免 LLM 路径且 task_result 标注 path_used="program"；未命中/失效回退 LLM 路径（covers: S2 三分法路由； depends: T2）
- [ ] T7: 沉淀与注入切换（写侧关规则、读侧切 registry）+ 任务前注入改造 — acceptance: 新任务 0 条新经验规则写入；注入请求走 registry；旧读路径保留（covers: S2 迁移路径 M1–M2； depends: T3, T6）
- [ ] T8: 程序路径 vs LLM 直调 A/B 评测基线（成本/延迟/质量） — acceptance: 五任务评测产出对照 JSON（p50/p95、token 账单、得分）并写入 research/（covers: S2 迁移路径替换对照； depends: T6）
- [ ] T9: 前端 ProgramRegistry 面板（版本/血缘/晋升历史，替换经验规则写入口） — acceptance: 面板展示程序包列表与 lineage；经验规则面板无写操作（covers: S2 迁移路径 M3； depends: T4）
- [ ] T10: 迁移收尾 M4：删除规则写入/自进化/联动进化/共享池写路径与调度 — acceptance: 相关写路径代码与调度移除，全量 pytest/vitest/ruff/eslint 绿（covers: S2 迁移路径 M4； depends: T5, T7, T9）
