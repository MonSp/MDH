# WhyBuddy Skill 设计说明

## 设计目标

把一张包含主流程、支撑链路、失效回路、质量门的架构图，转译为一个宿主可编排的 Skill 包，并保持以下特性：

- 方法论与基础设施解耦
- 主流程和反馈回路同等一等公民
- 结构校验与内容校验同时存在
- 降级、重试、兜底、重规划都可机器执行

## 设计原则

- **闭环优先**：不是只产出规格，而是从输入走到评审与回炉。
- **硬门先行**：Schema、不变量、质量门都要有可执行的判断。
- **支路显式**：所有 gate 都定义 yes-path 和 no-path。
- **宿主承载状态**：skill 不直接实现 runtime，但明确 runtime 接口语义。
- **单一真相**：节点状态统一派生，不允许多源竞争写状态。

## 模块划分

### 1. Input Module

- 输入：用户想法、仓库、文件、截图
- 输出：`project_context`
- 责任：
  - 检测 repo URL
  - 调用可选的仓库解析器
  - 归一化、去重、保留证据
  - 写入降级状态

### 2. Clarification Module

- 输入：`project_context`
- 输出：`clarified_brief`
- 责任：
  - 识别阻塞/非阻塞缺失信息
  - 生成澄清问题
  - 判断 readiness
  - 产出目标、约束、成功标准

### 3. Route Planning Module

- 输入：`clarified_brief`
- 输出：`route_options`、`selected_route`
- 责任：
  - 生成多路线候选
  - 比较风险、成本、收益
  - 选择路线并进入轻量确认闸

### 4. Decision and Collaboration Module

- 输入：`selected_route`
- 输出：`decision_mode`、`collaboration_result`
- 责任：
  - 根据复杂度选择单 Agent 或多角色
  - 调用工具代理收集额外证据
  - 对异常做降级兜底
  - 把分歧意见保留下来

### 5. SPEC Core Module

- 输入：`clarified_brief`、`selected_route`、`collaboration_result`
- 输出：`spec_tree.json`
- 责任：
  - 构造提示词
  - 脱敏
  - 请求 LLM JSON
  - 做 schema 检查
  - 做不变量校验
  - 做稳定 ID 归一化
  - 附加 provenance
  - 必要时执行 deterministic fallback

### 6. Document Generator Module

- 输入：`spec_tree.json`、`clarified_brief`
- 输出：`requirements.md`、`design.md`、`tasks.md`
- 责任：
  - 从树派生三类文档
  - 将成功标准映射到验收条目
  - 给出节点级产物引用

### 7. Preview and Handoff Module

- 输入：`spec_tree.json`、文档集合
- 输出：`prompt_pack.md`、`effect_preview.md`、`handoff_manifest.json`
- 责任：
  - 为宿主生成可展示的预览描述
  - 为工程交接生成导出清单

### 8. Review and Replan Module

- 输入：预览、交付产物、用户反馈
- 输出：`review_result`、`replan_target`
- 责任：
  - 判断交付还是回炉
  - 根据问题层级回退到正确阶段
  - 控制预算与转人工出口

## 关键数据对象

### `project_context`

```json
{
  "goal": "一句话目标",
  "summary": "归一化摘要",
  "sources": ["user_input", "repo_readme", "screenshot"],
  "evidence": [
    {
      "type": "repo",
      "ref": "https://github.com/example/repo",
      "status": "ok"
    }
  ],
  "degradations": []
}
```

### `clarified_brief`

```json
{
  "goal": "明确目标",
  "constraints": ["时间预算", "技术限制"],
  "successCriteria": ["生成规格树", "交付三份文档"],
  "blockingGaps": [],
  "nonBlockingGaps": []
}
```

### `spec_tree.json`

```json
{
  "rootNodeId": "n0",
  "version": 1,
  "status": "ready",
  "nodes": [
    {
      "id": "n0",
      "parentId": null,
      "type": "requirement",
      "title": "WhyBuddy 闭环目标"
    }
  ],
  "provenance": {
    "generationSource": "llm"
  }
}
```

## 流程映射

- 蓝色主流程映射为 skill 的阶段顺序。
- 橙色协作流程映射为模式决策和多角色执行策略。
- 紫色核心流程映射为结构化生成与校验器。
- 绿色流程映射为文档、预览、交付产物。
- 灰色虚线映射为宿主接口契约，不直接内置。
- 红色虚线映射为重试、回炉、失效传播与重规划策略。

## 失败处理策略

- **仓库解析失败**：记录降级状态，继续走归一化。
- **就绪度不足**：回到缺失信息收集。
- **路线确认拒绝**：回到路线选择。
- **模式决策异常**：降级回单 Agent。
- **LLM 超时或非 JSON**：允许一次自环重试。
- **Schema 或不变量失败**：直接走确定性兜底。
- **评审失败**：进入反馈和重规划。
- **重规划超预算**：转人工退出。

## 质量控制

- 结构质量由 `validate_spec_tree.py` 负责。
- 内容质量由 `check_content_quality.py` 负责。
- 宿主测试负责状态流、SSR、E2E、截图等系统层能力。
- 合并门由自动检查结果与人工目检共同决策。

## 宿主集成建议

- 把 `docs/architecture.mmd` 作为唯一权威流程图，避免多图漂移。
- 把每一阶段产物写入统一 artifact store，供回放与调试使用。
- `deriveNodeStatus` 只能在宿主侧实现一次，其他地方只读不写。
- 将失效引擎做成依赖图上的增量计算，而不是全量重跑。
