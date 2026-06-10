---
name: whybuddy
description: Turn a vague idea into a closed-loop, reviewable, buildable WhyBuddy spec package. It grounds inputs in real code, clarifies gaps, compares routes, decides solo vs multi-agent, and runs an on-demand companion critic and grounding pair across the front stages. It builds a SPEC tree validated by RUNNING bundled deterministic scripts (not by eyeballing) that enforce success-criteria coverage, EARS acceptance, and evidence on every node; it records each gate result in a checks ledger and ships a landing-grade handoff with a traceability matrix, interface-contract drafts, test cases, an open-items register, and visual previews (generated mockups are labeled preview, structural diagrams are rendered deterministically). Use it for the full idea-to-spec loop, not a single-step answer.
---

# WhyBuddy Skill（闭环 · v2）

把一句话想法压成一条可回放、可回炉、可交付的闭环。本 skill 承载 **方法、规则、产物约定，以及由脚本强制执行的确定性校验**。

> **运行时不在本 skill 内。** 事件总线、Socket 推送、状态仓、回放 UI、工作台、容器编排属于宿主系统（见 `docs/architecture.mmd`）。本 skill 只产出结构化对象与文档，怎么存、怎么推、怎么显示由宿主决定。

> **诚实边界（贯穿全篇）：确定性脚本保下限，不保上限。** 脚本能查结构合法、来源诚实、成功标准被覆盖、验收是 EARS 句式、每个节点挂了证据；查不了「覆盖得够不够深、证据是不是真的、验收写得对不对」——那要靠**接地者读真仓库 + 人评审**。过了脚本 ≠ 规格做完了。

## 适用 / 不适用

- 适用：一句话目标走到规格、预览、交付；需求有歧义需先澄清再执行；任务简单或复杂需在单/多角色间切换；要把失败、回炉、失效、重算纳入流程。
- 不适用：单次问答、单文件改字、单步脚本；不需要规格树与评审闭环的极小任务；仅改宿主运行时。

## Skill 边界

- **Skill 内**：深度输入接地、澄清、路线规划、模式决策、伴随式审查/接地、规格树生成、文档派生、预览/交付产物约定、评审与重规划规则、**确定性校验脚本的调用与台账记录**。
- **Skill 外**：一切运行时与基础设施（Job Store、Event Bus、Socket、Realtime Store、回放 UI、工作台、容器编排、权限托管）。

## 输出目录规范

所有产物输出到 `.trae/specs/<spec-name>/` 目录，结构如下：

```text
.trae/specs/<spec-name>/
├── docs/
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
├── project_context.json
├── clarified_brief.json
├── spec_tree.json
├── checks_ledger.json
├── traceability_matrix.json
├── handoff_manifest.json
└── companion_log.json
```

**命名规范**：`<spec-name>` 使用小写字母和连字符，如 `parallel-agent-system`、`adaptive-collaboration`。

## 输入 / 输出契约

- 输入：必填用户想法；可选 GitHub 仓库、代码文件/目录片段、截图/日志、约束/预算/成功标准。
- 输出：`.trae/specs/<spec-name>/` 目录下的所有产物。

## 伴随式审查与接地（横切 · 按需触发）

不是某一道门，而是横在前段（输入→澄清→路线→规格）之上的两个角色，**按需触发，不常驻开会**：

- **挑刺者 / Critic**：找漏洞、证据不足处、被忽略的需求域、互相打架的约束。
- **接地者 / Grounding**：逼每条结论挂上真实出处；有仓库就读真代码（文件/符号/接口），把真东西变成 evidence 节点。
- **触发条件**：想法模糊、接到了真仓库、或风险高时才发力；简单一句话需求不触发，避免又慢又吵。
**留痕（硬性，没痕迹=没发力）：** 伴随层每次发力必须写进 `companion_log.json`，每条形如：

```json
[
  { "stage": "clarification", "role": "critic",    "ts": "...", "findings": ["挑出的问题", "被忽略的需求域"] },
  { "stage": "input",         "role": "grounding", "ts": "...", "sources":  ["repo://src/foo.ts#L10-L60", "clarified_brief:successCriteria"] }
]
```

收尾**必须经 gate 跑** `python scripts/gate.py checks_ledger.json -- python scripts/check_companion.py companion_log.json project_context.json`：
- critic 的 findings 不能空；grounding 的 sources 不能空；
- **若 `project_context.grounding.repoAvailable=true`，至少要有一条 grounding 留真实出处**（有真仓库却没接地 = 没读代码，判不通过）；
- greenfield / 低风险允许空 log（按需触发），但这就等于声明「这轮伴随层没发力」。

注：原「决策门 / 头脑风暴」（复杂任务升级成全套多角色）保留为**重型档**；伴随层是**随时可调的轻量档**，两档分工。

## project_context.json 格式

```json
{
  "goal": "一句话目标",
  "summary": "详细摘要",
  "sources": [
    {
      "type": "repo",
      "path": "d:\\trunk\\test-sidepanel-host\\backend",
      "files_read": [
        "file1.py (关键类/函数说明)",
        "file2.py (关键类/函数说明)"
      ]
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "source": "repo://backend/file.py#L10-L50",
      "fact": "从代码中提取的关键事实"
    }
  ],
  "grounding": {
    "repoAvailable": true,
    "repoPath": "d:\\trunk\\test-sidepanel-host\\backend",
    "accessMode": "direct_read"
  }
}
```

**关键字段说明**：
- `sources[].files_read`：列出所有读取的文件，附带关键类/函数说明
- `evidence[]`：从代码中提取的关键事实，使用 `repo://` 协议引用源码位置
- `grounding.repoAvailable`：是否有真实仓库可读
- `grounding.accessMode`：访问模式（`direct_read` 或 `api`）

## 规格树 Schema（生成器与校验器的唯一契约）

```json
{
  "rootNodeId": "n0",
  "version": 2,
  "successCriteria": [
    { "id": "sc1", "text": "可度量的成功标准1" },
    { "id": "sc2", "text": "可度量的成功标准2" }
  ],
  "nodes": [
    { "id": "n0", "parentId": null, "type": "requirement", "title": "顶层目标",
      "acceptance": "当<触发>时，系统应<可验证响应>。", "coversCriteria": ["sc1"], "evidenceRefs": ["nE1"] },
    { "id": "n1", "parentId": "n0", "type": "requirement", "title": "子需求",
      "acceptance": "若<条件>，系统应<响应>。", "coversCriteria": ["sc2"], "evidenceRefs": ["nE1"] },
    { "id": "n2", "parentId": "n1", "type": "design", "title": "...", "notes": "...", "evidenceRefs": ["nE2"] },
    { "id": "n3", "parentId": "n2", "type": "task", "title": "...", "verify": "..." },
    { "id": "nE1", "parentId": "n0", "type": "evidence", "title": "...", "source": "repo://backend/file.py#L10-L50" },
    { "id": "nE2", "parentId": "n0", "type": "evidence", "title": "...", "source": "repo://backend/file.py#L60-L100" }
  ],
  "provenance": { "generationSource": "llm", "promptId": "...", "model": "...", "fingerprint": "..." }
}
```

**证据来源格式**：使用 `repo://` 协议，格式为 `repo://<相对路径>#L<起始行>-L<结束行>`

硬约束（`scripts/validate_spec_tree.py` 逐条查）：

- 节点数 3–60；`id` 唯一非空；唯一根（`parentId=null`）且根 `type=requirement`；`type∈{requirement,design,task,evidence}`；父可达；无环；深度 ≤ 4。
- **来源诚实**：`generationSource` 必须在 `provenance` 里，取值 `llm`/`llm_fallback`/`template`；禁止给 LLM 内容手写 `template`。
- **（v2①）成功标准覆盖 · 不塌缩**：`successCriteria` 非空；每条标准必须被某个 requirement 的 `coversCriteria` 覆盖；requirement 节点数 ≥ min(标准数, 3)——别把多条标准全塞进根节点。
- **（v2②）EARS 验收**：每个 requirement 的 `acceptance` 必须是 EARS 句式（含触发条件「当/若/WHEN/IF…」+「应/SHALL」）。
- **（v2④）证据贯穿**：每个 requirement/design 必须有非空 `evidenceRefs`，指向 source 非空的 evidence 节点。

## 文档章节契约

`scripts/check_content_quality.py` 按此查：

- `requirements.md`：`## 目标`、`## 范围`、`## 功能要求`、`## 验收标准`（验收标准段必须 EARS 句式）
- `design.md`：`## 设计目标`、`## 模块划分`、`## 失败处理策略`、`## 质量控制`
- `tasks.md`：`## 里程碑`、`## 任务清单`、`## 完成定义`
- 每份正文 ≥ 200 字。

## 主流程

### 1. 输入 / Input（深度接地）
- 归一化、去重、抽证据。**有仓库时由接地者读到文件/符号/接口契约**（不是只抓 repo 名/readme/目录骨架）；没有则归一化。
- 仓库不可访问 → 记降级、不阻塞。产出 `project_context`（目标·摘要·来源·**真实证据**）。

### 2. 澄清 / Clarification
- 分阻塞/非阻塞缺失，生成澄清问题，收答案判就绪度；**未就绪必须回去补，不带关键歧义进规划**。
- 挑刺者在此发力：主动拆出被忽略的需求域。产出 `clarified_brief`（目标·约束·**带 id 的 successCriteria**），后面规格树和验收都回链它。

### 3. 路线规划 / Route Planning
- 生成多路线（标准/深度/升级），比成本·风险·收益；先比再选，过轻量确认闸，允许退回。产出 `selected_route` 与备选引用。

### 4. 决策与协作 / Decision & Collaboration
- 路线确认后判简单/复杂：简单→单 Agent；复杂→头脑风暴（决策·规划·架构·执行·审计·UI），综合器出方案·信心分·分歧意见（不压平分歧）。决策超时/异常/工具不可达→降级回单 Agent。

### 5. 规格树生成核心 / SPEC Tree Generation Core
顺序：提示词构造 → 脱敏 → LLM 出 JSON → **经 gate 跑校验** → 通过即用 / 不过即兜底。

**校验是强制步骤，且必须经 `gate.py` 跑（自动记台账）：**
1. 生成 JSON 写入 `spec_tree.json`：把 `clarified_brief.successCriteria` 原样带入；每个 requirement 标 `coversCriteria` 与 EARS `acceptance`；每个 requirement/design 挂 `evidenceRefs`；`provenance.generationSource="llm"`。
2. **运行** `python scripts/gate.py checks_ledger.json -- python scripts/validate_spec_tree.py spec_tree.json`
   - 退出码 0 → 进第 6 步；非 0 → 读违规项，**据此重生成一次**（仅一次）。
3. 重试仍不过 → **运行** `python scripts/fallback_tree.py "<目标>" > spec_tree.json`（按构造合法、`generationSource="template"`、**不再回校验**，避免死循环）。
- 不许跳过校验直接用 LLM 输出；不许手填 `generationSource` 绕过来源追踪。

### 6. 规格文档 / SPEC Document
1. 从树派生三份文档，章节严格按契约；验收标准从 `successCriteria` 回链并写成 EARS。
2. **运行** `python scripts/gate.py checks_ledger.json -- python scripts/check_content_quality.py docs/requirements.md docs/design.md docs/tasks.md`；不过则补齐重跑。

### 7. 效果预览与交付 / Preview & Handoff（落地）
产出一个**交付包**，每件产物都带来源/可信度标：
- **视觉预览 · 生成**：`scripts/gen_preview.py` 把每份规格文档转成生图提示词，按 `image_config.json` 里**你自己配置的生图模型**出 UI 草样；**强制标「预览·未验证」并把模型/提示词/时间记进 `previews/provenance.json`**；未配置或连不上则降级跳过。配置方式见下方「配置你自己的生图模型」。
- **真出图(可靠路径,推荐)**：用 `scripts/batch_images.py` —— 它**自带默认端点 + 模型(gpt-image-2)、默认就是真出图**，即使 `image_config.json` 被重置成 dry_run 空壳也照样出图：`python scripts/batch_images.py prompts.txt --out previews/batch`。
- **完成标准(硬性)**：视觉预览要算完成，`previews/` 里必须有真实 `.png`；**只有 `.prompt.txt` 占位 = 未完成**，不得当已交付。**不要把 `image_config.json` 重置成 dry_run**，直接用包内已配好的那份。
- **出图必跑(强制 gate,和校验同级)**：收尾前必须经 gate 跑出图核验——`python scripts/gate.py checks_ledger.json -- python scripts/finalize_previews.py`。它会**按 spec_tree 的模块(需求→页面)逐个出真图**;判定只认**本次真生成成功的张数**(不看目录里有没有文件)、对临时 503 自动重试、并识破「复制同一张充数」;没真出到图直接判不通过并记台账(passed=false)。这一步和规格树/文档/伴随层校验同级,是必跑项、不是可选。
- **结构图 · 渲染**：架构总图、规格树走 **Mermaid 确定性渲染**——**不交给生图模型**（它会糊框、编错字）。
- **可追溯矩阵** `traceability_matrix.json`：需求↔设计↔任务↔证据↔验收用例 的对应表。
- **接口/数据契约（草稿·待核）**：接口形状、字段、示例；只有接地者读了真仓库才算数，否则标「草稿·待核」。
- **验收用例**：每条需求一组「触发→期望结果」的可跑用例。
- **未决项登记表**：把非阻塞缺口升级成带责任人、「开工前必须定」的清单。
- **校验台账** `checks_ledger.json`：随包导出，证明各闸真跑过。
- 预览不满意走反馈与重规划，不直接视作完成。

### 8. 评审与反馈闭环 / Review & Feedback
- 通过→交付；不通过→收集反馈进重规划，**按问题层级回退**到澄清/路线/规格树/模式决策；维护预算与收敛阈值，**超预算或不收敛转人工**。

## 硬规则
- 每个判断闸必须同时定义通过支路与拦下支路。
- **不变量校验由脚本强制执行（第 5/6 步），经 `gate.py` 跑并记台账，不得跳过、不得用模型主观判代替。**
- **`generationSource` 必须如实填写，禁止给 LLM 内容写 `template`。**
- **成功标准必须带 id 并被需求覆盖；需求不许塌缩成一个；验收必须 EARS；每个 requirement/design 必须挂真实来源证据。**
- 伴随式挑刺者/接地者按需触发；**发力必须产出 `companion_log.json` 并经 `check_companion.py` 校验**；有真仓库时接地必跑且引真实出处。
- 生成的图必须标「预览·未验证」+ 生成模型；结构图走确定性渲染，不交给生图模型。
- 真出图用 `batch_images.py`（自带默认、默认真出图）；完成必须有真实 `.png`，不得只放 `.prompt.txt` 占位，也不要把 `image_config.json` 改回 dry_run。
- **收尾必跑 `finalize_previews.py`(经 gate)**:按模块逐页真出图;**只认本次真生成成功的张数,不认目录里有没有文件**(防复制/占位糊弄);临时 503 自动重试;端点真不可用就**如实判失败、不得用别的方式塞图过闸**。
- **禁止给出图加任何本地/确定性兜底**(超时/失败就画线框图、占位图冒充真生成,例如自加 `write_mockup_png` 之类)。端点失败、重试仍不行就**如实判失败**——假图比失败更糟。出图只能来自配置的真实生图端点。**任何一次产出都可用 `check_previews_real.py` 审计真假。**
- 状态只能由单一来源派生；回放与实时状态按会话隔离；失效不只标红，要驱动下游自动重算；规格树兜底必须天然合法。

## 随附脚本（含调用时机）
- `scripts/gate.py` —— **第 5/6 步用它包住校验命令**，跑一遍并把 {脚本·退出码·输出·时间} 记进 `checks_ledger.json`（台账=真跑的副产物，无法伪造）。
  `python scripts/gate.py checks_ledger.json -- python scripts/validate_spec_tree.py spec_tree.json`
- `scripts/validate_spec_tree.py` —— **第 5 步必跑**。查结构 + 来源诚实 + 成功标准覆盖/不塌缩 + EARS 验收 + 证据贯穿。
- `scripts/fallback_tree.py` —— **第 5 步重试仍不过时跑**。产出天然合法、自带 successCriteria/证据/EARS 的兜底树。
- `scripts/check_content_quality.py` —— **第 6 步必跑**。查三份文档章节、篇幅、验收标准 EARS。
- `scripts/gen_preview.py` —— **第 7 步视觉预览用**。读 `image_config.json`，把规格文档转成生图提示词、调你配置的模型出图，全部标「预览·未验证」并记录模型；默认 `dry_run` 只出提示词不调用。
- `scripts/check_companion.py` —— **伴随层发力后必跑**（经 gate）。校验 `companion_log.json`：critic 有挑、grounding 有真实出处；有真仓库却没接地则判不通过。
- `scripts/batch_images.py` —— **独立批量生图(不依赖 agent)**。读 http 配置 + 环境变量 key，对一批 prompt 直连端点出图、记 provenance。`python scripts/batch_images.py image_config.json prompts.txt --out previews/batch`
- `scripts/check_previews_real.py` —— **你自己跑的出图审计**(agent 改不了你这一步)。查 provenance+图片,揪出兜底占位/假成功(ok 却带 error)/复制充数。`python scripts/check_previews_real.py`
- `scripts/finalize_previews.py` —— **完成前的出图 gate(必跑)**。自带默认端点/模型/key,**从 spec_tree.json 的每个需求(页面)各出一张不同的真图**(不是一份文档一张、避免重复);没出到 .png 退出非零。经 gate.py 跑、进台账。

## 配置你自己的生图模型

视觉预览默认 `dry_run`（只产出提示词、不调用）。要接你自己的模型，编辑 `image_config.json`：

1. 把 `mode` 改成 `http` / `command` / `mcp` 之一，`model` 填你的模型名。
2. `http` 模式：填 `url`、`headers`、`body_template`、`response.path`（图在响应 JSON 里的位置）；**密钥用 `${ENV_VAR}` 引用，运行前 export 到环境变量，不要写进文件**。`_examples` 里已给 OpenAI 风格、Gemini / Nano-Banana、本地 CLI、宿主 MCP 四种样板，复制改即可。
3. `command` 模式：填本地生图 CLI 的 `argv`，用 `${PROMPT}` / `${OUT}` 占位。
4. `mcp` 模式：填宿主端生图工具名，脚本只产出提示词 + 工具名，由宿主/agent 调。
5. 调用：`python scripts/gen_preview.py image_config.json docs/requirements.md docs/design.md`

无论哪种后端：生成图一律标「预览·未验证」并把模型/提示词/时间记进 `previews/provenance.json`；**架构总图 / 规格树永远走 Mermaid 确定性渲染，不交给生图模型**（它会糊框、编错字）。

## 使用方式

1. **确定 spec-name**：根据用户想法，生成一个简洁的 spec 名称（小写字母+连字符），如 `parallel-agent-system`。
2. **创建目录**：`.trae/specs/<spec-name>/` 和 `.trae/specs/<spec-name>/docs/`。
3. **深度接地**：有仓库就读真代码，提取文件列表和关键事实，写入 `project_context.json`。
4. **按 1→8 推进**：**第 5、6 步的脚本必须经 gate.py 真实运行，不能用文字描述代替执行。**
5. **规格树校验**：以 `validate_spec_tree.py` 退出码为准，文档以 `check_content_quality.py` 退出码为准；两者都进台账。
6. **运行时**（存储/推送/回放/自动重算）交给宿主。
7. **交付包**：把文档、可追溯矩阵、契约草稿、未决项、台账打成交付包，交评审闭环；每件产物带来源/可信度标。
