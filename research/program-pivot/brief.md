# Research brief: 经验固化为可执行程序 —— MDH 技能进化转型方向的业界证据

- **refined question**: 业界与学术界是否已有"在 LLM 开放创造过程中总结经验，将能力/思考链/工作流固化为可执行的本地程序；后续相似任务免 LLM 直接执行程序，仅把结果交 LLM 审阅并驱动程序自动迭代升级"这一范式的实践与证据？其效果、失败教训与前提条件如何？
- **context**: MDH（多智能体协作系统，现有 skill packs / 经验规则 / CoW 增量区技能进化体系）判断产品转型方向：技能文本进化赶不上模型迭代、技能正被模型内化，拟彻底取代为"程序化沉淀 + LLM 审阅迭代"。受众：产品与架构团队；调研结论直接支撑 docs/compose/spec 转型设计 spec。
- **scope in**: 同类范式（agent workflow 编译/固化为代码、经验→程序、LLM 审阅驱动的程序自动迭代、test-gated 程序晋升）的学术论文与业界实践；效果量化（成本/延迟/质量）；失败案例与反方观点；相关术语谱系（amortization、compilation、distillation of agentic workflows）。
- **scope out**: MDH 内部代码分析（已另行完成）；纯 prompt caching / KV cache 等与"程序沉淀"无关的降本手段（仅作对照）；商业模式分析。
- **assumptions**: 优先 2024-12 之后材料（经典前置工作可更早）；报告中文，术语保留原文；每个来源注明发布日期。
- **depth**: standard（5 个角度，1 轮补查，每角度 ≤6 次搜索，目标 ≥15 个来源）
- **today**: 2026-10-15
- **workspace**: /home/test/MDH/.worktrees/program-pivot-spec/research/program-pivot

## Angles

1. **F1 范式谱系与学术证据（经验/CoT/workflow → 可执行程序）**: agent skill libraries that compile to code（如 Voyager skill library、agentskills.io scripts/ 传统）；workflow/CoT distillation into executable programs 的论文；"amortized inference / 把昂贵推理固化为廉价计算"的论述（如 speed demons、compilation claims）；相关术语与代表工作。
2. **F2 LLM 审阅驱动的程序自动迭代**: AlphaEvolve / FunSearch / Darwin Gödel Machine 一类"LLM 生成-测试门禁-程序进化"的实证效果与机制；program repair / self-evolving code 的 test-gated promotion 实践；LLM-as-reviewer 对程序结果审阅并驱动升级的生产案例。
3. **F3 业界生产实践**: 编码 agent 产品（Claude Code、Codex、Devin、Cursor 等）如何把重复工作流固化为可执行工件（skills+scripts、AGENTS.md、playbooks、自动修复 runbook）；LLM 应用公司把 workflow 编译成代码/确定性程序的工程实践与公开分享；有哪些公司明确主张"沉淀程序而非提示词"。
4. **F4 失败教训与反方观点**: 经验固化为程序的失败案例（程序过脆、分布漂移、维护成本、泛化差）；"模型迭代使固化资产贬值"的反向证据；何时该保留 LLM 而非固化（开放/创造性任务的边界）；业界对"distillation/固化 vs 持续调用大模型"的争论。
5. **F5 量化效果与经济学**: LLM 调用成本/延迟 vs 本地程序执行的量化对比数据；缓存/固化对 token 消耗与 p95 延迟的实测收益；评测基准上"固化程序 vs LLM 直调"的质量差异数据。
