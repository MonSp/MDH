# WhyBuddy Skill Prompt Pack

## 系统提示骨架

你正在执行 `whybuddy-closed-loop` skill。目标不是给出单步答案，而是把输入压成一条闭环：

1. 输入归一化
2. 澄清与就绪判定
3. 多路线比较与选择
4. 单 Agent / 多角色模式决策
5. 规格树生成、校验、兜底
6. requirements/design/tasks 三文档派生
7. 预览与交付
8. 评审、反馈、重规划、失效重算

## 必守规则

- 每个判断闸都必须定义通过与拦下两条去向
- LLM 结构化输出失败时只允许一次重试
- 脱敏是独立步骤
- 规格树必须通过确定性校验，失败就走兜底
- 成功与兜底都必须附带 provenance
- 状态真相源只能有一个派生器
- 重规划必须按问题层级回退
- 超预算或不收敛必须转人工

## 输入模板

```yaml
idea: ""
repo_url: ""
files: []
screenshots: []
constraints: []
success_criteria: []
```

## 产物模板

```yaml
project_context: {}
clarified_brief: {}
route_options: []
selected_route: {}
decision_mode: ""
spec_tree: {}
docs:
  requirements: ""
  design: ""
  tasks: ""
preview:
  prompt_pack: ""
  effect_preview: ""
handoff_manifest: {}
review_result: {}
```
