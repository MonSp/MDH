# Research brief: 多智能体架构趋势调研（服务 MDH 架构方向判断）

- **refined question**: 截至 2026-08，多智能体 AI 系统的主流架构范式、基础设施协议与实证效果如何？哪些模式有证据表明是未来方向？
- **context**: 为一款"模拟公司组织架构"的多智能体编码协作产品 MDH（CEO/架构师/开发/QA 等角色 + 会议讨论/投票 + DAG 工作流 + 技能进化）判断未来演进方向。受众：产品与架构团队。
- **scope in**: 主流多智能体框架与编排范式；MCP/A2A/AGNTCY 等基础设施协议进展；benchmark 与"多智能体 vs 单智能体"实证对比；企业级生产架构与失败教训；业界未来方向与反方观点。
- **scope out**: 具体竞品产品细节对比；商业分析；MDH 内部代码分析（另行处理）。
- **assumptions**: 优先 2024-12 之后的材料；最终报告为中文（技术术语保留原文）；每个来源需注明发布日期。
- **depth**: standard（5 个角度，1 轮补查，每角度 ≤6 次搜索，目标 ≥15 个来源）
- **today**: 2026-08-13
- **workspace**: /home/test/MDH/research/multi-agent-architecture-future

## Angles

1. **F1 主流多智能体框架与编排范式**：AutoGen/Agno、LangGraph、CrewAI、OpenAI Agents SDK、MetaGPT/ChatDev、Magentic-One 等的当前地位；设计范式（orchestrator-worker / 去中心化 / DAG+状态机）；格局收敛趋势（谁在退场、谁在崛起）。
2. **F2 基础设施协议与互操作**：MCP 采用现状（服务器/客户端生态、缺陷）、Google A2A 与 AGNTCY 进展、agent 身份/审计/支付；协议层对多智能体架构选择的影响。
3. **F3 实证与学术证据**：多智能体 vs 单智能体效果对比研究（Anthropic、Meta、微软等）；SWE-bench/GAIA/τ-bench 等 benchmark 表现；失败案例与成本/延迟问题（orchestration tax、上下文放大）。
4. **F4 企业级生产架构实践**：编码/通用 agent 产品（Claude Code、OpenAI Codex、Cognition、Manus 等）的架构披露；durable execution、事件驱动、HITL、共享上下文/记忆、context engineering 等生产模式。
5. **F5 未来方向与反方观点**：context engineering、agent-computer interface、技能/环境设计等新范式主张；对"模拟人类组织架构"范式的质疑与替代方案（单智能体增强、事件驱动 worker 网络等）。
