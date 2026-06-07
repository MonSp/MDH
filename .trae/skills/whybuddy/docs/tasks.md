# WhyBuddy Skill 落地任务

## 里程碑

### M1 技能骨架

- 建立 `SKILL.md`
- 固化 `docs/architecture.mmd`
- 明确输入、输出、边界与宿主接口

### M2 规格树确定性能力

- 实现 `validate_spec_tree.py`
- 实现 `fallback_tree.py`
- 定义规格树 JSON 契约
- 补充 provenance 字段约定

### M3 文档与内容质量

- 产出 `requirements.md`
- 产出 `design.md`
- 产出 `tasks.md`
- 实现 `check_content_quality.py`

### M4 交付与宿主集成

- 产出 `prompt_pack.md`
- 产出 `effect_preview.md`
- 产出 `handoff_manifest.json`
- 说明 runtime 接口语义与失效传播要求

## 任务清单

### T1 输入层

- 定义原始输入对象结构
- 定义 repo 解析成功与失败状态
- 约定证据对象格式

### T2 澄清层

- 定义阻塞/非阻塞缺失的分类规则
- 定义 readiness 判定输出
- 定义澄清简报结构

### T3 路线规划

- 约定三类路线模板
- 定义路线比较维度
- 定义确认闸的输入与退回动作

### T4 决策与协作

- 定义复杂度判定条件
- 定义多角色职责矩阵
- 定义工具代理接口
- 定义降级回单 Agent 的触发条件

### T5 规格树核心

- 定义 Prompt Builder 输入拼装规则
- 定义脱敏字段与替换策略
- 定义 Schema 校验契约
- 定义不变量守卫脚本与错误信息格式
- 定义确定性兜底树模板

### T6 文档派生

- 约定 requirements/design/tasks 的节结构
- 将 success criteria 映射到 acceptance
- 明确文档与规格树节点之间的回链关系

### T7 预览与交付

- 约定 prompt pack 内容结构
- 约定 effect preview 呈现格式
- 约定 handoff manifest 导出字段

### T8 评审与重规划

- 定义 review 结果枚举
- 定义 replan budget 字段
- 定义分层回退策略
- 定义 escalate 条件

### T9 质量门

- 约定 tests 与 content check 的最小通过标准
- 约定 merge gate 的自动/人工输入
- 约定失败后的反馈对象格式

## 完成定义

- 所有阶段都有明确输入、输出、yes-path、no-path
- 规格树有可执行校验器与合法兜底
- 三份文档可从规格树稳定派生
- 内容质量检查不再只验证管道打通
- 宿主知道哪些能力需要外接，哪些已经封装进 skill
