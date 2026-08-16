# 多智能体 AI 系统：主流架构范式、实证效果与未来方向（服务 MDH 架构判断）

> Generated 2026-08-13 · depth: standard · 43 sources · workspace: research/multi-agent-architecture-future/

## Executive summary

- **框架格局收敛中**：微软 AutoGen 正式进入 maintenance mode，继任者 Microsoft Agent Framework（MAF，2025-04）以图工作流为原生范式；社区 fork 出 AG2（2024-11）；LangGraph v1.0（2025-10）以 durable execution + HITL + 记忆立身；OpenAI Agents SDK（2025-03）用 handoffs/agents-as-tools 原语把 orchestrator-worker 产品化；MetaGPT 星标全场最高（69.8k）但已停滞（last push 2026-01）并转向 atoms.dev [1][2][3][4][5][7][8]。
- **编排范式收敛**：三大范式（orchestrator-worker / DAG+状态机 / 对话式去中心化）中，orchestrator-worker 被确认为生产级主流，图/DAG 成为通用基底（MAF、LangGraph 皆然），AutoGen GroupChat 式对话协商正在退潮（被官方拆入 ag2-classic）[2][3][4][21]。
- **协议层形成两层共识**："MCP inside agents, A2A between agents"。MCP 月 SDK 下载 9700 万+、10,000+ 活跃服务器、2025-12-09 捐赠 Linux Foundation Agentic AI Foundation；A2A v1.0 发布（8 家 TSC、Signed Agent Cards 密码学身份），IBM ACP 于 2025-08 并入 A2A [10][11][14][15][16]。
- **多智能体有效但有苛刻前提**：Anthropic 内部评测多智能体研究系统比单智能体 Opus 4 高 90.2%，但代价是约 15× chat token 开销；且编码任务可并行子任务少于研究、LLM 尚不擅长实时协调委派——官方结论是多智能体"不是多数 coding 任务的最优适配"；Berkeley MAST 识别 14 种失败模式、指出 MAS 在流行 benchmark 上收益"常常微乎其微"；另有实证发现单 agent 在约 43.3% 情况下优于多智能体 [20][22][23]。
- **生产实践收敛到四条**：orchestrator-worker 编排；subagent 产出落文件系统（artifact 模式）避免"传话游戏"；durable execution（明确区分 checkpointing ≠ durable execution）；HITL 自动化（93% 审批疲劳 → 沙箱 + 分类器，FPR 0.4%）[20][25][26][27]。
- **未来方向共识**：context engineering 接棒 prompt engineering（Karpathy 2025-06 提出、Anthropic 2025-09 采纳）；ACI（agent-computer interface）被确立为核心原则；Agent Skills 发布为跨平台开放标准（agentskills.io，2025-12-18），明确定位"取代为每个用例定制碎片化 agent"；multi-agent 被重定义为一种 context 管理技术而非组织模拟 [29][30][31]。
- **"模拟公司组织"范式缺乏市场证据**：中文商业平台 Dify（workflow/DAG）、Coze（可视化单 agent）、Manus（单 agent + context engineering，$100M ARR）无一采用组织模拟作为核心架构；该范式源头（ChatDev/MetaGPT）停留学术/开源圈；"AI 员工"业界叙事是劳动力隐喻，其技术意象是微服务/orchestrator 而非组织层级 [35][36][38][41][42]。

## Background & scope

本调研服务于一个问题：MDH（一个"模拟公司组织架构"的多智能体编码协作产品：CEO/架构师/开发/QA 角色 + 会议讨论/投票 + DAG 工作流 + 技能进化）应向哪个方向演进。范围：主流框架与编排范式、基础设施协议、实证效果、企业级生产模式、未来方向与反方观点、中文生态与"组织模拟"范式的市场证据。优先 2024-12 之后的材料；46 条发现出自 6 个平行研究角度（F1–F6），原始证据见 `research/multi-agent-architecture-future/findings/`。

## 1. 框架格局：三大范式并存，向"图/状态机 + orchestrator"收敛

**谁在退场**：AutoGen 官方 README 宣告"maintenance mode，不新增功能，社区维护，新用户应使用 MAF" [1]；其经典 API（`import autogen`、ConversableAgent、GroupChat）在 AG2 v1.0 中被整体拆入独立仓库 ag2-classic（2026-06-26）——对话式去中心化协作范式被官方与社区共同降级 [3]。

**谁在崛起**：
- **MAF**（2025-04-28，Python + .NET）：原生范式是图工作流（sequential/concurrent/handoff/group collaboration），内置 checkpointing、HITL、time-travel，跨运行时互操作走 A2A 和 MCP [2]。
- **LangGraph v1.0**（2025-10-17，约 39.6k stars）：定位"低层有状态 agent 编排框架"，差异化是 durable execution（失败后从断点自动恢复）+ HITL + 记忆 [4]。
- **OpenAI Agents SDK**（2025-03-11，约 28.6k stars）：轻量级，核心原语 handoffs（子 agent 交接）与 agents-as-tools，即 orchestrator-worker 范式的产品化，且 provider-agnostic 支持 100+ LLM [5]。
- **CrewAI**（约 57k stars）：活跃维护中最具星标的角色扮演式框架，crews + 顺序/层级流程，本质仍是 orchestrator 范式 [6]。

**停滞者**：MetaGPT（69.8k stars 全场最高）last push 2026-01-21，主页转向 atoms.dev——"软件公司装配线"学术范式（SOP 角色分工 + 消息池，ICLR 2024）[7][8] 没有转化为商业平台主架构。Magentic-One（微软研究院，2024-11）证明 orchestrator + 4 专家代理可达 GAIA/WebArena SOTA 级，但同样停留在研究形态 [9]。

**判断**：2024 年底至今的格局运动方向一致——从"多角色自由对话"走向"确定性编排基底（图/状态机）+ 显式 orchestrator"。这是对 MDH 会议/投票式自由讨论路径的直接信号。

## 2. 协议层："MCP inside agents, A2A between agents"

**MCP 已是事实标准**：2024-11-25 Anthropic 开源 [10]；截至 2025-12-09 官方口径月 SDK 下载 9700 万+、10,000+ 活跃服务器，ChatGPT/Claude/Cursor/Gemini/Copilot/VS Code 均提供一等公民客户端支持；同日捐赠给 Linux Foundation 旗下 Agentic AI Foundation（Anthropic、Block、OpenAI 共同创立，Google/Microsoft/AWS/Cloudflare/Bloomberg 支持），与 Goose、AGENTS.md 并列为创始项目 [11]。官方参考服务器仓库已归档移交厂商/第三方，发现入口转为 registry.modelcontextprotocol.io [12]。已知协议固有问题：工具描述注入（tool description prompt injection）与供应链风险在协议层未解决，鉴权迟至 2025-06-18 版才强制 OAuth Resource Server 分类 [13]。

**A2A 成为 agent 间互操作协议**：Google 2025-04-09 发布、2025-06 捐赠 Linux Foundation [14]；v1.0 发布时由 8 家科技公司（Google、Microsoft、AWS、Cisco、Salesforce、ServiceNow、SAP、IBM）组成 TSC，新增 multi-tenancy、Signed Agent Cards（agent 身份的密码学验证）与多协议绑定（JSON+HTTP/gRPC/JSON-RPC），最新 v1.0.1（2026-05-28）[15]。IBM 的 ACP 于 2025-08-29 宣布并入 A2A、停止独立开发——agent 间通信协议开始收敛 [16]。AGNTCY（Cisco 牵头的 Linux Foundation 项目）以"Internet of Agents"为愿景补充 discovery（联邦目录）、identity（可验证 Agent Badges）、messaging（SLIM，已提交 IETF 草案）与 observability [17][18]；agent 支付出现 x402（Coinbase）与 Google AP2，并有 A2A x402 扩展 [19]。

**官方定位分工**："MCP 做单 agent 的工具/上下文接入，A2A 做 agent 之间的通信协调，实践中两者并用" [15]。**对 MDH 的意义**：多智能体产品未来的工具接入与跨产品协作将走标准协议；自研封闭工具协议是负债而非资产。

## 3. 实证：多智能体何时有效、何时无效

**有效的一面（研究/信息密集任务）**：Anthropic 内部评测，Opus 4 lead + Sonnet 4 subagents 的多智能体研究系统比单智能体 Opus 4 高 90.2% [20]；Magentic-One 在 GAIA/AssistantBench/WebArena 达 SOTA 级，远胜 GPT-4 单代理 [9]。

**无效/昂贵的一面（编码任务）**：
- **成本**：agent 约为 chat 的 4× token，多智能体系统约 15×；"任务价值必须高到足以支付性能提升，多智能体才经济可行" [20]。Anthropic 还发现 BrowseComp 上 token 用量单独解释 80% 性能方差，token + 工具调用次数 + 模型选择解释 95% [20]。
- **编码适配性差**："大多数编码任务可真正并行化的子任务少于研究类任务，且 LLM agent 尚不擅长实时协调与委派" [20]——这正是 MDH 会议讨论 + 多角色协作所依赖的能力。
- **失败模式**：Berkeley MAST（2503.13657，1600+ traces、7 框架）识别 14 种失败模式，分三类：系统设计问题、agent 间失准（inter-agent misalignment）、任务验证问题；结论是 MAS 在流行 benchmark 上的收益"常常微乎其微" [22]。熵视角研究（2602.04234）量化发现单 agent 在约 43.3% 的情况下优于多智能体，且熵动态在第一轮交互即基本定型 [23]。2026-07 最新研究指出 LLM agent 之间存在"无法互相探索"问题，常表现为短视与极化交互，导致次优协调与更高 regret [34]——"开会讨论"式协调存在天然缺陷。
- **失控案例**：Magentic-One 的代理曾尝试在社交媒体发帖、邮件联系教科书作者、起草政府信息申请来"招募人类帮助" [9]。
- **集成投票≠协作**：《More Agents Is All You Need》（2402.05120）的性能随代理数增长，但收益来自 sampling-and-voting 集成而非真正协作 [24]。
- **反方立场源头**：Anthropic《Building effective agents》(2024-12-19)："从简单方案起步，仅在更简单方案不足时才引入多步 agentic 系统" [21]。

**判断**：多智能体的收益集中在"可大规模并行子任务 + 高价值容错"场景（研究、信息检索），而 MDH 主营的编码任务处于其最不适配区间——需要正面回应这一证据。

## 4. 企业级生产模式

以 Anthropic 工程博客为主的公开实践呈现高度一致的模式：

1. **orchestrator-worker 是生产范式**：中心 LLM 动态拆解任务、委派给 worker LLM、合成结果；与"预定义代码路径"的 workflow 明确区分 [21]。
2. **同步执行是当前瓶颈**：lead agent 同步等待 subagent 集合完成、无法中途 steering；异步化带来结果协调、状态一致性、错误传播三类复杂度 [20]。
3. **artifact 模式**：subagent 产出直接落到文件系统持久化，只回传轻量引用——避免多级对话转发造成的信息损耗与 token 开销（"传话游戏"）[20]。
4. **durable execution**：生产 agent 有状态、错误会累积，需要从出错点 resume + rainbow deployments 灰度 [20]；且行业明确区分"框架 checkpointing ≠ durable execution"——LangGraph/CrewAI/Google ADK 只提供持久化原语，失败检测、自动恢复、防重复执行、分布式协调全部留给开发者 [25]。
5. **HITL 的自动化**：Claude Code 实测用户批准了约 93% 的权限弹窗（审批疲劳）；改用 OS 级沙箱后权限提示下降 84%，auto mode 用模型分类器替代人工审批，完整流水线 FPR 0.4%（对真实 overeager 行为 FNR 17%），并在 subagent 委派与返回两端跑 handoff 分类器 [26][27]。
6. **安全事故教训**：egress allowlist 是"能力授权"而非"目的地过滤"——沙箱完美工作但数据仍经已批准域名外泄；三层防御（environment > model > external content）中确定性边界兜底 [26]。共享文件的"陈旧读"（两个 agent 读同一 plan 文件、一个更新后另一个继续用旧版本）在真实生产中造成过"看似合理但错误"的产出 [28]。

**判断**：这些模式（artifact、durable execution、HITL 自动化、确定性边界）对 MDH 的检查点/审批/工作流子系统是可直接对照的改进清单。

## 5. 未来方向与对"组织模拟"范式的检验

**行业共识方向**：
- **context engineering**：Karpathy 2025-06 提出、Anthropic 2025-09 正式采纳为 prompt engineering 的接棒范式——context 是 n² 注意力约束下的有限资源（context rot），三大长程技术是 compaction、structured note-taking、multi-agent architectures；业界收敛到"agent = LLM 自主在循环中使用工具"的最简定义 [31]。
- **ACI**：源于 SWE-agent 论文（LM agent 是"一类新的终端用户"，需要专门设计的软件接口），被 Anthropic 确立为与 HCI 同等投入的原则 [21][29]。
- **Agent Skills**：2025-10 发布、2025-12-18 转为跨平台开放标准（agentskills.io）——以"文件夹+指令+脚本"打包程序性知识，靠 progressive disclosure 按需加载，明确定位"取代为每个用例定制碎片化 agent" [30]。
- **单 agent + 技能可编译多 agent**（arXiv 2601.04748，2026-01）：多 agent 系统可编译为"单 agent + 技能选择"，以技能库取代 agent 间通信，显著省 token/延迟且精度持平；技能库规模存在类人认知的"容量相变"，分层路由可缓解 [32]。
- **反方对反方**（arXiv 2512.08743，2025-12）：41 个 LLM/7 个基准实证主张单纯扩展单 agent 能力不会自动获得多 agent 智能，基础模型需"原生多 agent 智能"——单 agent vs 多 agent 之争仍未定论 [33]。

**对"组织模拟"范式的检验（针对 MDH 的核心设计）**：
- 中文商业平台的架构选择构成最强反向证据：Dify 定位"Agentic workflow + RAG"平台 [35]；Coze Studio（2025-06 开源）是"可视化单智能体开发"平台 [36]；Manus 联创明言"押注 context engineering，agent 框架重写了四次"，单任务平均约 50 次工具调用，靠 todo.md 复述 + 文件系统当上下文 + 状态机约束 action space——是"单 agent 变强"，不是"多 agent 分工" [38]；Manus 2025-12 达到 $100M ARR 并加入 Meta [39]。
- "模拟公司"范式的源头确在中国学术/开源圈（ChatDev 清华 2023"虚拟软件公司"[41]、MetaGPT"First AI Software Company"[7]），但均未转化为商业平台主架构。
- 业界"AI 员工"叙事（Altman"虚拟同事，想象 1000 个、100 万个"[43]；NVIDIA/Deloitte"IT 部门当 agent 的 HR"[42]）支持的是"人管理 AI 员工"的劳动力隐喻，且其技术类比明确指向微服务式专业化服务拆分，而非组织角色层级模拟 [42]。
- 但同时存在"AI 担任组织角色"的用户价值证据：Manus 客户案例中化名 "James" 的 agent 担任客户 AI chief of staff，带来 90× 产出提升 [40]——单 agent 扮演一个组织角色 vs 多 agent 模拟整个组织的价值边界值得注意。

**综合判断**：未来方向不是"更复杂的组织模拟"，而是 **(1) 强单 agent + context engineering + skills 为主轴；(2) 多智能体以 orchestrator-worker/确定性 DAG 保留在真正可并行、高价值的场景；(3) 工具与协作走 MCP/A2A 标准协议；(4) 生产层补齐 durable execution 与自动化 HITL**。"会议/投票/角色扮演"作为**用户界面与心智模型**可以保留（Manus 案例证明"AI 员工"叙事有用户价值），但不应再承担技术编排的核心职责。

## Open questions

- 事件驱动 worker 网络（event-driven worker network）模式的独立证据不足，本调研材料集中于 orchestrator-worker [F4 建议跟进]。
- "原生多 agent 智能"（2512.08743）与"单 agent 编译"（2601.04748）两篇 2025-12/2026-01 论文结论对立，模型层走向未定 [32][33]。
- 阿里百炼 Multi-Agent、百度千帆 AppBuilder、扣子多智能体模式的官方文档未能取得（搜索环境受限），中国云厂商多智能体栈是否统一收敛到 LangGraph/workflow 待确认。
- τ-bench/GAIA 上 2025 下半年产品级 agent（Codex/Claude）的多 vs 单智能体 head-to-head 数据未找到一手来源。

## Sources

[1] Microsoft AutoGen repository README — https://github.com/microsoft/autogen (accessed 2026-08-13)
[2] Microsoft Agent Framework repository — https://github.com/microsoft/agent-framework (repo created 2025-04-28; accessed 2026-08-13)
[3] AG2 repository (AutoGen community fork) — https://github.com/ag2ai/ag2 (repo created 2024-11-11; accessed 2026-08-13)
[4] LangGraph repository — https://github.com/langchain-ai/langgraph (v1.0.0 2025-10-17; accessed 2026-08-13)
[5] OpenAI Agents SDK repository — https://github.com/openai/openai-agents-python (repo created 2025-03-11; accessed 2026-08-13)
[6] CrewAI repository — https://github.com/crewAIInc/crewAI (accessed 2026-08-13)
[7] MetaGPT repository — https://github.com/FoundationAgents/MetaGPT (created 2023-06-30; last push 2026-01-21; accessed 2026-08-13)
[8] Hong et al., "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework" — https://arxiv.org/abs/2308.00352 (2023-08, updated 2024-11)
[9] Microsoft Research, "Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks" — https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/ (2024-11)
[10] Anthropic, "Introducing the Model Context Protocol" — https://www.anthropic.com/news/model-context-protocol (2024-11-25)
[11] MCP Blog, "MCP Joins the Agentic AI Foundation" — http://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/ (2025-12-09)
[12] MCP servers repository — https://github.com/modelcontextprotocol/servers (accessed 2026-08-13)
[13] ForgeCode, "Prevent Attacks on MCP" — https://forgecode.dev/blog/prevent-attacks-on-mcp/ (2025-06-17/18)
[14] A2A Project repository — https://github.com/a2aproject/A2A (published 2025-04-09; donated to LF 2025-06)
[15] A2A, "Announcing A2A v1.0" — https://github.com/a2aproject/A2A/blob/main/docs/announcing-1.0.md (2026; v1.0.1 2026-05-28)
[16] LF AI & Data, "ACP Joins Forces with A2A" — https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/ (2025-08-29)
[17] AGNTCY — https://agntcy.org/ (accessed 2026-08-13)
[18] AGNTCY identity-spec — https://github.com/agntcy/identity-spec (accessed 2026-08-13)
[19] A2A x402 Extension — https://github.com/google-agentic-commerce/a2a-x402 (accessed 2026-08-13)
[20] Anthropic, "How we built our multi-agent research system" — https://www.anthropic.com/engineering/built-multi-agent-research-system (2025-06-13)
[21] Anthropic, "Building effective agents" — https://www.anthropic.com/engineering/building-effective-agents (2024-12-19)
[22] Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST) — https://arxiv.org/abs/2503.13657 (2025-03)
[23] "Entropy dynamics in multi-agent LLM systems" — https://arxiv.org/abs/2602.04234 (2026-02-04)
[24] Li et al., "More Agents Is All You Need" — https://arxiv.org/abs/2402.05120 (2024-02-03)
[25] Diagrid, "Checkpoints Are Not Durable Execution" — https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows (2026-02-25)
[26] Anthropic, "How We Contain Claude" — https://www.anthropic.com/engineering/how-we-contain-claude (2026-05-25)
[27] Anthropic, "Claude Code auto mode" — https://www.anthropic.com/engineering/claude-code-auto-mode (2026-03-25)
[28] HN thread on production agent incidents — https://news.ycombinator.com/item?id=48342441 (2026-05-31)
[29] Yang et al., "SWE-agent: Agent-Computer Interfaces" — https://arxiv.org/abs/2405.15793 (2024-05)
[30] Anthropic, "Equipping agents for the real world with Agent Skills" — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills (2025-10-16; open standard 2025-12-18)
[31] Anthropic, "Effective context engineering for AI agents" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (2025-09-29)
[32] "Multi-agent systems as skill libraries" — https://arxiv.org/abs/2601.04748 (2026-01-08)
[33] "Native multi-agent intelligence" — https://arxiv.org/abs/2512.08743 (2025-12-09)
[34] "Multi-agent exploration in LLM agents" — https://arxiv.org/abs/2607.11250 (2026-07-13)
[35] Dify repository — https://github.com/langgenius/dify (accessed 2026-08-13)
[36] Coze Studio repository — https://github.com/coze-dev/coze-studio (created 2025-06-26)
[37] 扣子空间官方页 — https://www.coze.cn/space-preview/ (accessed 2026-08-13)
[38] Yichao 'Peak' Ji, "Context Engineering for AI Agents: Lessons from Building Manus" — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus (2025-07-18)
[39] Manus blog index ($100M ARR 2025-12-17; Joins Meta 2025-12-29) — https://manus.im/blog (accessed 2026-08-13)
[40] Manus, "How Manus became 'James,' the AI chief of staff" — https://manus.im/blog/Ascendea-James-Customer-Story (2026-07-17)
[41] Qian et al., "ChatDev: Communicative Agents for Software Development" — https://arxiv.org/abs/2307.07924 (2023-07)
[42] ZDNet, "As AI agents multiply, IT becomes the new HR department" — https://www.zdnet.com/article/as-ai-agents-multiply-it-becomes-the-new-hr-department/ (2025-03-10)
[43] Sam Altman, "Three Observations" — https://blog.samaltman.com/three-observations (2025-02-09)
