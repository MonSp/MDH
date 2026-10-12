# MDH 真实任务评测 — 完成度 + 技能进化双维评审

> 日期：2026-09-24 | 评委：MiMoCode（独立第三方视角）| 评测对象：MDH v0.6.x main@6e406db

## 1. 评测目标

回答两个问题：
1. **完成度**：MDH 接到真实用户任务后，能否走完「意图识别 → 拆解 → 组队 → 执行 → 审查」链路并交付可用结果？
2. **技能进化**：任务执行后，领域智能体是否留下可复用的经验沉淀，且在**同类后续任务**中被检索注入、产生可测量的效果提升？

## 2. 任务集（5 个，覆盖两条执行路径 + 跨部门工作流）

| # | 任务 | 类型 | 预期路径 | 考察点 |
|---|------|------|----------|--------|
| E1 | 「写一个 Python 函数，把嵌套 JSON 拍平成 key.path=value 的字典，并写 3 个单元测试」 | 简单编码 | simple | 简单路径直达、工具执行、文件产出 |
| E2 | 「给 Flask 应用加一个 /api/users 端点：GET 返回用户列表（内存数据即可），含输入校验和错误处理，补 pytest 测试」 | 后端开发 | complex | 拆解、backend_dev 技能、审查介入 |
| E3 | 「前端 React 写一个倒计时组件（暂停/重置），并和 E2 的 API 对接说明」 | 前端开发 | complex | frontend_dev 技能、跨轮上下文 |
| E4 | 「开发+测试+部署准备：为 E2 的 API 加 Dockerfile 和 CI 配置说明」 | 跨部门 | workflow | DAG 生成、多部门并行、审查把关 |
| E5（进化验证） | 「写一个 Python 函数，把嵌套 TOML 配置拍平成 key.path=value，并写 3 个单元测试」 | 与 E1 同构 | simple | **技能进化**：E1 的经验是否被检索注入并提升 E5 质量 |

任务设计原则：
- E1/E5 同构不同料（JSON vs TOML）——直接测量「上一单的经验帮到下一单」
- E2→E3→E4 是自然的开发接力，考察跨会话上下文与部门协作
- 全部任务产出物可被独立验证（代码可运行、测试可通过）

## 3. 评分细则（每任务 10 分）

### A. 完成度（6 分）
| 分值 | 标准 |
|------|------|
| 0-1 | 无产出 / 链路中断（无 task_result 或 success=false） |
| 2-3 | 有产出但不可用：文件存在但代码无法运行、测试跑不过 |
| 4-5 | 基本可用：核心要求满足，次要项缺失（如缺测试/缺校验） |
| 6 | 完整交付：全部要求满足，代码可运行，测试可过 |

### B. 过程质量（4 分）
| 分值 | 标准 |
|------|------|
| 0-1 | 无拆解/无审查痕迹，单次裸执行 |
| 2 | 有拆解但无审查反馈，或审查意见未体现 |
| 3 | 拆解 + 审查意见产出，迭代 ≤3 轮 |
| 4 | 拆解合理 + 审查发现真实问题并修复 + 接地验证（GroundingAgent 有出处） |

**路径符合度**作为修正项：简单任务走 complex 或复杂任务误走 simple，过程分 -1。

## 4. 技能进化评分（E5 专项，独立 10 分）

| 维度 | 分值 | 证据 |
|------|------|------|
| E1 后有规则沉淀 | 0-3 | evolution.db `experience_rules` 新增与 E1 相关的 success_pattern（非模板兜底） |
| E5 执行时被检索注入 | 0-4 | E5 的任务上下文/state_sync 注入了 E1 的规则（execution trace 或 rule usage_count +1） |
| 效果可测量 | 0-3 | E5 完成度 ≥ E1，或审查轮次更少 / 产出质量更高 |

证据源：`data/evolution.db`（experience_rules / evolution_events / task_type_performance）、
`GET /api/experience/rules`、`GET /api/evolution/ab-quality`、规则 `source_task_id` 与 `usage_count`。

## 5. 总评矩阵

| 项 | 满分 |
|----|------|
| E1-E4 完成度+过程 | 40 |
| 技能进化（E5） | 10 |
| **合计** | **50** |

评级：≥40 优秀 / 30-39 良好 / 20-29 及格 / <20 未达标。

## 6. 执行与判定约定

- 评委不参与 MDH 内部决策，只喂任务原文、收结果、独立验证（跑测试）
- 每任务执行前后各拍一次 evolution.db 快照做 diff
- 判定写入本文件第 7 节，附逐任务证据

---

## 7. 评审结果

> 评测执行 2026-10-08，两轮：R1 暴露 5 个链路缺陷（详见 §8），修复后 R2 重跑。
> 以下评分基于 **R2**（修复后状态）。证据：`research/eval-run-2026-09-24/`（R1）、
> `research/eval-run-r2-rerun-2026-10-10/`（⚠️ R2 原始证据已丢失，详见 §13）、服务日志 `/tmp/mdh_eval_server_r2.log`。
> 评委独立验证：亲自运行全部产出测试、抽查代码/文档质量、直查 rules.db 与检索复现。

### 7.1 逐任务评分

| 任务 | 完成度(/6) | 过程(/4) | 小计 | 评委依据 |
|------|-----------|---------|------|----------|
| **E1** JSON 拍平 | **6** | **2** | **8/10** | `flatten_json.py` 逻辑正确（dict/list/标量/自定义分隔符），3 个单测评委实跑 **3 passed**；过程：有拆解+审查（approved@iter1），但任务本属简单任务却走 complex（规则引擎 0.90 判复杂）→ 路径修正 -1；Grounding `grounded=False` |
| **E2** Flask /api/users | **6** | **3** | **9/10** | `app.py` 含校验/统一错误码/角色白名单，14 个 pytest 评委装 flask 后实跑 **14 passed**；过程：审查发现真实 test_failure（执行环境缺 flask）→ 触发 revision 迭代，拆解+审查齐全 → 3/4；`written_files=[]` 与磁盘不符（11 文件实际落盘） |
| **E3** React 倒计时 | **4** | **3** | **7/10** | 组件质量高（ref 防闭包、useEffect cleanup、暂停/重置、CSS/Demo/hook 齐全）；**但「与上一任务 API 对接说明」仅 126 字节残缺 README（止于标题行）** → 核心之一未交付 -2；过程：CriticAgent 给出全轮最锋利审查（critical：对接上下文缺失/暂停语义未定义/时间来源未定）但修订未落地闭环 |
| **E4** Dockerfile+CI | **4** | **2** | **6/10** | 交付完整且自洽：多阶段 Dockerfile（非 root+HEALTHCHECK）、GH Actions（build/test/docker 冒烟）、coverage 实际跑出；**但为 /api/users 新建了 Node 工程，未复用 E2 的 Flask 产物**（工作区互相隔离、无产物传递）→ 连续性缺失 -2；过程：DAG 六节点并行执行（节点已携带真实任务文本 ✅），但 workflow 路径 0 条审查消息 |
| **E5** TOML 拍平 | （计入进化） | — | — | `toml_flatten.py` 质量好（tomllib 兼容、嵌套列表展开），3 个单测 **3 passed**，完成度与 E1 持平 |

**E1–E4 合计：30 / 40**

### 7.2 技能进化（E5 专项）

| 维度 | 得分 | 证据 |
|------|------|------|
| E1 后规则沉淀 | **3/3** | rules 0→**20**（E1/E2/E3/E5 各 5 条，`source_task_id=llm_distill`），11 条 auto-approved；质量具体可执行（例：“基于时间戳计算剩余时间而非 setInterval 递减”——真洞见；“检测键冲突显式报错，禁止静默覆盖”），evolution_events 0→31 |
| E5 检索注入 | **0/4** | 5 个任务 **0 次注入**（全部消息无“已注入”，日志 0 条，规则 `usage_count` 全 0）。评委复现根因：`retrieve_relevant_rules` 对 E5 文本返回 0 —— ① FTS/关键词精确重叠不匹配（E5 查询词 vs 规则词零交集）② `source_task_type` 存的是 rule_type（llm_distill 写入），与 `task_type='general'` 永不相等，类型加分失效 |
| 效果可测量 | **1/3** | E5 完成度 6 = E1 6（字面 ≥ 达标），但无注入无法归因；`task_type_performance` 仍 0 行（AB Tracker 未接入 complex 路径），优化器维度层对真实流量仍休眠 |

**进化合计：4 / 10**

### 7.3 总评

| 项 | 得分 |
|----|------|
| E1–E4 完成度+过程 | 30 / 40 |
| 技能进化（E5） | 4 / 10 |
| **总分** | **34 / 50 → 良好** |

**评委结论**：
1. **完成面**：修复后 5/5 任务 success=true 且产物真实落盘、测试可过（评委独立复跑）。代码质量整体在线（E3 组件、E4 Dockerfile、E5 兼容处理均超出及格线）。短板是**跨任务连续性**（E4 未复用 E2、工作区孤岛）与**次要要求烂尾**（E3 对接说明空壳）。
2. **过程面**：审查链路恢复（R1 的 signal 崩溃修复后 lint/test 门禁能优雅 `skipped`），CriticAgent 在 E3 表现出真实审查力，但 3/4 任务 findings 是模板化套话，Grounding 全部 `grounded=False`，workflow 路径（E4）完全没有审查环节。
3. **进化面**：**“沉淀”半环已通、“注入”半环断裂**——规则能生成且质量不错，但永远进不了下一个任务的上下文；AB 表 0 行使优化器维度层在生产 complex 路径上休眠。技能进化目前是**单向写入，未闭环**。
4. **对比 R1**（0 产物、0 规则、48 次 signal 崩溃、E4 节点拿假文本、600s 阻塞）：本轮 5 项修复全部经真实链路验证生效。

## 8. R1 暴露缺陷与修复状态（均已修复并经 R2 验证）

| # | 缺陷 | 根因 | 修复 | R2 验证 |
|---|------|------|------|---------|
| 1 | run_tests/run_linter 100% 崩溃（48× signal only works in main thread） | `tool_executor.py` 在 `asyncio.to_thread` 门禁线程装 SIGALRM | 非主线程改 ThreadPoolExecutor 超时 | signal 错误 **0** |
| 2 | 代码只进聊天、产物不落盘 | coordinator 角色无 write_file 权限，code_extractor 落盘被静默拒绝 | roles_config 加 write_file + 权限拒绝记日志 | E1/E3/E5 written_files 非空 |
| 3 | 5 个任务 0 经验规则/0 进化事件 | MeetingCoordinator 自建 extractor 无 llm_caller/event_store；无 Reviewer 时审查三连空 | 注入 server 共享 extractor（4 个构造点）+ 无 Reviewer 回退协调器 | 规则 0→20，事件 0→31，回退触发 6× |
| 4 | E4 节点拿到“后端开发任务”+`{}` | 确定性节点生成硬编码描述，真实 prompt 只存 WorkflowDefinition.description | 生成后把 user_message 注入每节点 task_description+input_spec | 6 节点全部携带真实任务文本 |
| 5 | complex 路径 600s 永久阻塞 | `workspace_confirm_event.wait()` 无超时 | 60s `asyncio.wait_for` + 按建议自动确认 | 本轮 driver 即时应答未触发（未实测） |

**新发现待修（评审过程中复现定位，尚未修）**：
- **经验检索注入断裂**（7.2 根因已定位）：`experience_extractor.retrieve_relevant_rules` 关键词精确重叠 + `source_task_type` 语义错位 → 注入恒为空。修法：① 融合度打分放宽（语义/子串匹配或字符 n-gram）② llm_distill 规则写入真实 task_type 或检索时改比对 `rule_type`
- AB Tracker 未接 complex 路径 → `task_type_performance` 恒 0，优化器维度层休眠
- E4 workflow 路径无审查环节；跨任务产物不传递（工作区隔离设计使然）
- E3 `revision_required` 状态与 overall_comment“验收通过”矛盾，且修订未落地

> **2026-10-09 更新**：检索注入断裂已修复（T29 → PR #4 `d75c806`），下述其余 4 项仍开放。

## 9. R3 复测（T29 修复后，2026-10-09）

> 代码 `d75c806`，证据 `research/eval-run-r3-2026-10-08/`，评委独立验证（实跑全部产出测试、直查注入消息与 usage_count）。

### 9.1 注入确认（T29 核心验证）✅

| 指标 | R2 | R3 |
|------|----|----|
| 客户端「已注入」消息 | 0（5 任务全无） | **4/5 任务**（E1:1, E2:1, E3:3, E5:1，共 6 条规则） |
| 规则 `usage_count` 总和 | 0 | **0 → 6**（success_count 0→3） |
| 规则总数 | 0 → 20 | 20 → **40**（本轮新提取 20，12 approved） |
| evolution_events | 0 → 31 | 31 → **63**（+32） |
| 效果回写 | 无 | `update_injected_rule_effectiveness` 触发 4 次，effectiveness 记录 1.0/1.0/0.5/0.0 |
| signal 错误 | 0 | 0 |
| E4 workflow 注入 | — | **0（仍未覆盖）**，仅 team-meeting 路径注入 |

### 9.2 逐任务得分对比

| 任务 | R2 | R3 | 变化原因 |
|------|----|----|----------|
| E1 | 8 | **6** | 实现引入边界 bug：`flatten_json({})` 返回 `{'': {}}`，1/3 测试失败（评委实跑）；其自身门禁也抓到 `revision_required/test_failure` 但修订未落地 |
| E2 | 9 | **9** | 28 测试全过（比 R2 的 14 更全），注入 1 条 |
| E3 | 7 | **7** | 组件改用时间戳校准（疑似吸收注入规则），但 README 对接说明仍是 228 字节空壳 |
| E4 | 6 | **6** | 仍新建 Node 工程不复用 E2；workflow 路径无注入无审查 |
| **E1–E4** | 30/40 | **28/40** | E1 边界回归 −2 |

### 9.3 进化得分对比

| 维度 | R2 | R3 | 依据 |
|------|----|----|------|
| 沉淀 | 3/3 | **3/3** | 累计 40 规则、事件 63，质量维持 |
| 注入 | 0/4 | **4/4** | E5 注入 1 条 + usage_count 全链路 +1；4/5 任务覆盖（E4 是路径缺口非检索缺口） |
| 效果可测量 | 1/3 | **2/3** | effectiveness/success_count 实时回写已生效；AB 表仍 0 行、单轮样本小 |
| **合计** | 4/10 | **9/10** | |

### 9.4 总分变化

| 项 | R2 | R3 |
|----|----|----|
| E1–E4 完成度+过程 | 30 / 40 | 28 / 40 |
| 技能进化（E5） | 4 / 10 | **9 / 10** |
| **总分** | **34 / 50 良好** | **37 / 50 良好**（距优秀线 40 差 3 分） |

**R3 结论**：注入半环从 0/4 → 4/4，进化分 4→9，**总分 34→37**；总分未大涨是因为完成度侧出现 LLM 随机性回归（E1 边界 bug），E3 对接说明与 E4 连续性两个老缺口依旧。剩余开放项：workflow 路径注入与审查、AB Tracker 接入、跨任务产物传递、修订闭环落地率。

## 10. R4 复测（E1 修订环修复后，2026-10-09）

> 修复内容：审查输入 `[:1000]→[:8000]`、artifact 文件 `2000→6000` 字符（消除"源码截断"幻影审查）、门禁 test_failure 详情注入修复轮反馈、CEO 审查状态消息改为诚实三分支。
> 证据 `research/eval-run-r4-2026-10-09/`，评委独立验证（实跑产出测试 + 直查消息/DB）。

### 10.1 E1 回归修复确认 ✅

| 指标 | R3（回归） | R4（修复后） |
|------|-----------|-------------|
| 开发轮次 | 3（全部被幻影截断烧掉） | **1** |
| 「截断」抱怨 | 5 条消息 / 26 处 | **0** |
| 终态 | revision_required | **approved** |
| 产出测试（评委实跑） | 1/3 失败（边界 bug） | **3/3 通过** |
| CEO 状态消息 | 无条件"审查已通过" | 按状态三分支（E2 正确报"需人工复核"） |

### 10.2 逐任务得分

| 任务 | R3 | R4 | 依据 |
|------|----|----|------|
| E1 | 6 | **8** | 3/3 测试过、一轮过审（复原至 R2 水平）；过程仍受简单任务走 complex −1 |
| E2 | 9 | **8** | 15/16 测试过；`test_internal_error_500` 自身配置错（TESTING=True 使 500 handler 不触发，应用实现正确）→ 完成 5/6 |
| E3 | 7 | **7** | 组件一轮过审，但 README 对接说明仍 195 字节空壳 |
| E4 | 6 | **6** | 仍走 workflow 路径：无注入无审查，Node 工程不复用 E2 |
| **E1–E4** | 28/40 | **29/40** | |

### 10.3 进化（与 R3 持平 9/10）

| 维度 | 得分 | R4 证据（评委核对 sqlite） |
|------|------|---------------------------|
| 沉淀 | 3/3 | 规则 40→**60**，事件 63→98，**rule_demoted 0→2**（降级链路首次出现） |
| 注入 | 4/4 | 4/5 任务注入（E1/E2/E3/E5），usage_sum **6→13**，success_sum 3→8 |
| 可测量 | 2/3 | effectiveness 实时回写；AB 表仍 0 行 |

### 10.4 总分演进

| 轮次 | E1–E4 | 进化 | 总分 |
|------|-------|------|------|
| R2 | 30 | 4 | 34 良好 |
| R3 | 28 | 9 | 37 良好 |
| **R4** | **29** | **9** | **38 / 50 良好** ✅ ≥36 |

**R4 结论**：E1 回归修复生效（幻影截断清零、一轮过审、测试全过，8/10 复原），总分 **38 ≥ 36** 达标。
剩余开放项不变：E3 对接说明烂尾、E4 工作流路径注入与审查、跨任务产物传递、AB Tracker 接入、E2 测试类配置瑕疵（TESTING 模式）。

## 11. R5 冲刺轮（2026-10-09，目标 ≥40）

> 三项新修复：① complex+workflow 路径接入 AB Tracker（`task_type_performance` 恒 0 → 终于有数据）② 工作流路径补合并审查（E4 此前零审查）③ 写入环同名文件保长弃短 + 文档完整性提示硬约束。
> 证据 `research/eval-run-r5-2026-10-09/`，评委独立验证（sqlite 直查、测试实跑、README/api.js 实读）。

### 11.1 修复验证

| 修复 | 验证结果 |
|------|----------|
| AB Tracker 接入 | ✅ `task_type_performance` **0 → 3 行**（general×3 / software-dev×1 / data-analysis×1），AB 记录失败 0 次——优化器维度层首次吃到真实数据 |
| E4 工作流审查 | ✅ E4 出现 `structured_feedback`（revision_required, critic critical：节点宣称全过但 QA bash 实际失败——真问题）+ `review_completed`；CEO 诚实播报"仍有未闭环问题" |
| 文档截断 | ✅ E3 README 195B→**1289B**、E2 151B→894B；E3 新增完整「与上一任务 API 的对接」章节 + **`src/api.js` 对接层实现**（含契约文档）；⚠️ README 对接章节正文仍被切（1 处遗留） |

### 11.2 逐任务得分

| 任务 | R4 | R5 | 依据 |
|------|----|----|------|
| E1 | 8 | **8** | 3/3 测试、1 轮 approved（稳态保持） |
| E2 | 8 | **9** | **29/29 测试全过**（R4 15/16）；3 轮真实审查迭代；终态 revision_required 仅因 README（非任务要求） |
| E3 | 7 | **8** | 组件 4.6KB 高质量 + `api.js` 对接层落地（对接说明首次有实质内容）；README 对接正文仍缺 → 完成 5/6 |
| E4 | 6 | **7** | 审查落地（+1）：critical findings 抓到节点结果造假类真问题；仍不复用 E2 → 完成 4/6 |
| **E1–E4** | 29/40 | **32/40** | |

### 11.3 进化：9 → **10/10**

| 维度 | 得分 | 证据 |
|------|------|------|
| 沉淀 | 3/3 | 规则 60→**79**（+19），事件 98→**127**（+29） |
| 注入 | 4/4 | E1/E2/E3/E5 全注入（usage 13→**27**，success 8→16） |
| 可测量 | **3/3** | AB 表 3 行实数据 + effectiveness 实时回写 + E5 3/3 = E1 3/3 |

### 11.4 总分

| 轮次 | E1–E4 | 进化 | 总分 | 等级 |
|------|-------|------|------|------|
| R2 | 30 | 4 | 34 | 良好 |
| R3 | 28 | 9 | 37 | 良好 |
| R4 | 29 | 9 | 38 | 良好 |
| **R5** | **32** | **10** | **42 / 50** | **优秀** ✅ |

**R5 结论**：**42 ≥ 40，达成优秀线**。三缺口两修复一收窄：AB/E4 审查完全修复，E3 对接从空壳升到 api.js 实现层（README 正文一切仍遗留）。

## 12. 补测记录：E3 的 8 条 vitest 与组件 bug 修复（2026-10-09）

> R5 五个工作区中唯一没有测试套件的是 E3（E1 3 / E2 29 / E4 7 / E5 3 均已有）。为 R5 的 E3 产物补齐 **8 条 vitest 用例**，并借此捕获并修复一个组件真 bug。

### 12.1 新增用例（`~/.agent-workspaces/6420ed57/src/__tests__/CountdownTimer.test.jsx`）

| # | 用例 | 覆盖点 |
|---|------|--------|
| 1 | 初始渲染 | 秒数显示 + 暂停/重置按钮（data-testid） |
| 2 | tick 递减 | 时间戳校准，每秒剩余下降 |
| 3 | 暂停冻结 | 暂停后推进时间剩余不变 |
| 4 | 恢复续算 | 从冻结值继续倒计时 |
| 5 | 重置恢复初始 | 回到初始时长并重新开始 |
| 6 | 归零回调 | `onComplete` 恰好触发一次 |
| 7 | 非法入参 | `durationMs ≤0` / 非数字直接抛错 |
| 8 | 对接层 api.js | `deadlineToDurationMs`（有效/过期/非法）、`fetchTask` 成功/HTTP 500、`notifyCountdownComplete` |

**结果：8/8 passed**（vitest + jsdom + @testing-library/react，环境就绪于该工作区 `package.json`）。

### 12.2 测试捕获的组件真 bug（已修复）

- **现象**：用例 5 失败——运行中点「重置」后，显示停在 5s 不再 tick
- **根因**：`reset()` 先 `clearTimer()` 杀掉 interval，再 `setIsRunning(true)`；当 `isRunning` 本已为 true 时 state 无变化，启动 effect 不重跑 → **定时器死亡**
- **修复**：`reset` 内按 `isRunning` 分支——运行中则手动 `tick()` + 重启 `setInterval`；否则走 `setIsRunning(true)` 由 effect 启动
- 修复后 8/8 全绿

### 12.3 R5 测试全景（补齐后）

| 工作区 | 套件 | 结果 |
|--------|------|------|
| E1 | pytest × 3 | ✅ |
| E2 | pytest × 29 | ✅（原生运行需 `-o addopts=` 绕过 pytest.ini 的 `--cov`，本机缺 pytest-cov） |
| E3 | **vitest × 8** | ✅（本节新增 + 组件修复） |
| E4 | jest × 7 | ✅（`npm install` 后） |
| E5 | pytest × 3 | ✅ |
| **合计** | **50** | **全绿** |

注：E3 测试文件、`package.json` 依赖与组件修复均位于评测工作区（`~/.agent-workspaces/6420ed57/`），不改动 MDH 仓库代码。

## 13. 证据覆盖事故与两个新缺陷（2026-10-10）

### 13.1 事故：R2 原始证据被延迟执行的旧代理覆盖

- 早期被取消的 R2 执行代理实际恢复运行，于 2026-10-10 14:16–14:29 完成一整轮重跑，
  **覆盖了 `eval-run-r2-2026-09-24/` 中 E1–E5 的原始 JSON**（仅 `rules_after_raw.json` 等少数文件幸存）
- 处置：目录改名归档为 **`eval-run-r2-rerun-2026-10-10/`**（现内容为 10-10 重跑证据）
- 影响评估：§7 的 R2 评分数据在覆盖前已完整提取进本报告，**评分结论不受影响**；原始逐消息溯源对 R2 不可再得
- 该重跑顺带复验：5/5 success、signal 0、E4 节点文本修复保持、规则 79→99、AB 3→6 行

### 13.2 缺陷一：notify 双参导致全部状态/产物通知静默失败（已修复）

- **现象**：单轮 15 次 `send() got multiple values for argument 'agent_id'`（`coordinator_effects.notify_agent_status` / `notify_artifact_created`，DEBUG 级静默）
- **根因**：`send(agent_id, text, delta, **kwargs)` 第一个位置参数即 `agent_id`，notify 又传了 `agent_id=agent_id` 关键字 → TypeError，3D 可视化所需的 agent 状态/产物通知从未送达前端
- **修复**：删除重复 kwarg（agent_id 已随位置参数进入 payload 的 `agentId` 字段）
- **回归**：`tests/test_coordinator_effects.py`（3 例，断言 kwarg 中不再出现 agent_id）

### 13.3 缺陷二：`task_result.written_files` 跨轮丢失（已修复）

- **现象**：E2 磁盘 13 个文件、聊天有「第1轮 已写入 11 个文件」，但 `task_result.written_files=[]`
- **根因**：`run_dev_loop` 每轮 `execution_results = exec_results` 整体覆盖；修复轮常只回聊天说明不重写文件（`written_files=[]`），最后一轮把前几轮产出冲掉
- **修复**：循环内按 task_id 跨轮累计 written_files，返回前去重合并进最终 `execution_results`
- **回归**：`tests/test_coordinator_execution.py::test_written_files_cumulative_across_rounds`
  （第1轮写2文件 → 修复轮空 → 断言最终仍保留2文件，2轮审查闭环）

### 13.4 回归结果

- Python 后端：**2120 passed, 1 skipped**（2116 + 新增4），ruff 全绿
