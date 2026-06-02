# 多智能体技能进化系统 V4 Spec

## Why
经过 V1-V3 三轮迭代，多智能体协作系统在会议协议、任务分配基础设施、单元测试方面已具备坚实基础，但 `docs/design.md` 中定义的核心价值主张——**"项目内技能进化"**（技能注册中心、经验提炼器、技能打包器）和**项目生命周期管理**完全缺失。系统当前只能执行一次性任务，无法从项目执行中积累可复用的知识资产。本轮迭代聚焦于实现 skill evolution 闭环，使系统真正具备"每完成一个项目就变得更强"的能力。

## What Changes
- **SkillRegistry 后端服务**：新增技能注册中心，支持标准化技能包结构（manifest.yaml + system_prompt.md + tools/ + knowledge/ + examples/）、版本管理、per-project 克隆
- **ProjectManager 后端服务**：新增项目生命周期管理器，负责项目创建/实例化/归档，关联技能克隆和员工实例创建
- **ExperienceExtractor 后端服务**：新增经验提炼器，从任务执行日志中抽取条件-动作规则，生成技能增量
- **SkillPackager 后端服务**：新增技能打包器，项目结束时合并基础技能包与增量区，执行脱敏检查，输出可下载的 ZIP 技能包
- **DynamicRouter 增强**：为 CEO 智能体增加持久化路由表，包含部门能力描述、工具列表、历史成功率，支持规则匹配+语义相似度混合路由
- **结构化反馈协议**：领导智能体的验收反馈升级为结构化 JSON（含 issues 列表、max_iterations），支持员工迭代修正闭环
- **前端项目管理 UI**：新增项目列表面板、技能包预览面板、经验规则查看面板

## Impact
- Affected specs: production-multi-agent-evolution-v3 (测试基础设施复用)
- Affected code:
  - 新增后端: `backend/skill_registry.py`, `backend/project_manager.py`, `backend/experience_extractor.py`, `backend/skill_packager.py`, `backend/dynamic_router.py`
  - 新增前端: `src/components/skill-evolution/SkillRegistryPanel.tsx`, `src/components/skill-evolution/ProjectListPanel.tsx`, `src/components/skill-evolution/ExperienceRulePanel.tsx`
  - 新增前端模块: `src/modules/skillRegistry.ts`, `src/modules/projectManager.ts`, `src/modules/experienceExtractor.ts`, `src/modules/skillPackager.ts`
  - 修改后端: `backend/server.py` (新增 API 路由), `backend/collaboration/planner_agent.py` (增加验收标准), `backend/collaboration/executor_agent.py` (增加迭代修正循环)
  - 修改前端: `src/modules/agentTypes.ts` (新增类型), `src/modules/agentRegistry.ts` (关联技能包)

---

## ADDED Requirements

### Requirement: SkillRegistry 技能注册中心
系统 SHALL 提供标准化技能包的注册、克隆、版本管理服务。

#### Scenario: 技能包注册
- **WHEN** 开发者提交一个技能包目录（含 manifest.yaml）
- **THEN** SkillRegistry 解析 manifest，验证结构完整性，注册到基础技能库，分配唯一 ID 和版本号

#### Scenario: 技能包克隆
- **WHEN** 项目实例化时请求克隆指定技能包
- **THEN** SkillRegistry 创建该技能包的完整副本到项目专属目录，返回克隆后的技能包路径

#### Scenario: 技能包版本查询
- **WHEN** 查询某个技能包的历史版本
- **THEN** SkillRegistry 返回该技能包的所有版本列表及各版本的变更摘要

#### Scenario: 增量区挂载
- **WHEN** 员工实例被创建
- **THEN** 基础技能包以只读方式挂载，增量区以可写方式挂载到独立目录

---

### Requirement: ProjectManager 项目生命周期管理
系统 SHALL 管理项目从创建到归档的完整生命周期。

#### Scenario: 项目创建
- **WHEN** CEO 智能体下发项目简报
- **THEN** ProjectManager 生成唯一项目 ID，创建项目上下文（含用户偏好、约束条件），返回项目实例

#### Scenario: 项目实例化
- **WHEN** 部门领导提交任务依赖图（DAG）
- **THEN** ProjectManager 根据 DAG 中每个子任务所需的技能标签，从 SkillRegistry 克隆对应技能包，创建员工实例并挂载技能

#### Scenario: 项目归档
- **WHEN** 用户确认交付完成
- **THEN** ProjectManager 触发 SkillPackager 打包技能，清空员工短期记忆，保留项目执行日志，销毁员工实例

#### Scenario: 项目状态查询
- **WHEN** 查询项目进度
- **THEN** ProjectManager 返回项目当前阶段、各子任务状态、已完成的迭代次数、技能增量统计

---

### Requirement: ExperienceExtractor 经验提炼器
系统 SHALL 从任务执行日志中提炼可复用的经验规则，生成技能增量。

#### Scenario: 成功经验提炼
- **WHEN** 员工完成一个子任务且通过验收
- **THEN** ExperienceExtractor 解析执行日志，提取关键步骤和成功模式，生成条件-动作规则，写入技能增量区的 `rules/` 目录

#### Scenario: 失败经验提炼
- **WHEN** 员工迭代修正后最终通过验收
- **THEN** ExperienceExtractor 提取错误→修正的交互对，生成"当遇到 X 问题时执行 Y 修正"的规则

#### Scenario: 经验审核
- **WHEN** 新规则被提炼出来
- **THEN** 领导智能体审核规则的合理性和通用性，可批准/拒绝/修改后纳入增量区

#### Scenario: 经验注入
- **WHEN** 员工开始执行新任务
- **THEN** 系统根据任务特征检索技能增量区的相关经验规则，自动注入到员工的提示上下文中

---

### Requirement: SkillPackager 技能打包器
系统 SHALL 在项目结束时将基础技能包与项目增量合并，输出可下载的技能包。

#### Scenario: 技能合并
- **WHEN** 项目归档触发打包
- **THEN** SkillPackager 读取每个员工的基础技能包和增量区，按策略合并：system_prompt 追加、工具文件替换/新增、规则直接合并

#### Scenario: 脱敏检查
- **WHEN** 合并完成后的技能包
- **THEN** SkillPackager 自动扫描并移除硬编码的 API 密钥、内部路径、用户隐私数据，生成脱敏报告

#### Scenario: ZIP 打包
- **WHEN** 脱敏检查通过
- **THEN** SkillPackager 生成自动 README（含进化点说明和适用场景），压缩为 `{project_id}_skills_v2.0.zip`，提供下载

#### Scenario: 技能包预览
- **WHEN** 用户请求查看技能包内容
- **THEN** 系统展示技能包的结构树、变更摘要（相对于基础版的 diff）、新增规则列表

---

### Requirement: DynamicRouter 动态路由器
系统 SHALL 为 CEO 智能体提供基于持久化路由表的任务路由能力。

#### Scenario: 路由表初始化
- **WHEN** 系统启动
- **THEN** DynamicRouter 加载路由表，每条记录包含：部门 ID、能力描述、工具列表、历史成功率、最近活跃时间

#### Scenario: 混合路由决策
- **WHEN** CEO 收到用户需求
- **THEN** DynamicRouter 先用规则匹配过滤候选部门，再用语义相似度排序，综合历史成功率选出最佳路由目标

#### Scenario: 路由表更新
- **WHEN** 项目完成或失败
- **THEN** DynamicRouter 更新对应部门的历史成功率和最近活跃时间

---

### Requirement: 结构化反馈与迭代闭环
领导智能体的验收反馈 SHALL 升级为结构化 JSON 格式，驱动员工迭代修正。

#### Scenario: 验收反馈生成
- **WHEN** 领导智能体审查员工作品
- **THEN** 输出结构化 JSON：`{ status, issues: [{ type, location, detail, suggestion }], max_iterations }`

#### Scenario: 员工迭代修正
- **WHEN** 员工收到 `revision_required` 反馈
- **THEN** 根据 issues 列表逐项定位并修正，更新短期记忆，再次提交验收，直到通过或达到 max_iterations

#### Scenario: 迭代终止
- **WHEN** 达到最大迭代次数仍未通过
- **THEN** 领导介入处理：可选择返回当前最好版本并标记已知缺陷，或重新规划子任务

---

## MODIFIED Requirements

### Requirement: PlannerAgent 任务规划增强
现有 `planner_agent.py` 的 `PlannerAgent` SHALL 增强 DAG 节点结构：
- 每个 SubTask 增加 `acceptance_criteria`（验收标准）、`required_skills`（所需技能标签）、`input_spec`/`output_spec`（输入输出规格）字段
- 任务分配时关联 SkillRegistry 查询匹配技能

### Requirement: ExecutorAgent 员工执行增强
现有 `executor_agent.py` 的 `ExecutorAgent` SHALL 增强：
- 构造时接收技能包路径（基础包 + 增量区）
- 执行前自动检索增量区的相关经验规则并注入提示
- 支持迭代修正循环：接收结构化反馈后逐项修正并重新提交
- 每轮迭代后调用 ExperienceExtractor 提炼经验

### Requirement: MeetingCoordinator CEO 路由增强
现有 `meeting_coordinator.py` 的 `MeetingCoordinator` SHALL 集成 DynamicRouter：
- `semantic_analyze()` 方法使用 DynamicRouter 进行路由决策，替代当前的纯 LLM 路由
- 路由决策结果持久化到路由表

---

## REMOVED Requirements
无移除需求。所有现有功能保持兼容。

## 范围排除说明
以下组件在 design.md 中有定义但本轮**不实现**：
- **SandboxManager（Docker 容器化工作区）**：需要容器运行时环境，属于基础设施层变更，建议在独立迭代中实现。本轮使用文件系统目录隔离作为轻量替代。
- **完整的企业级安全审计**：当前 security.py 已满足基本安全需求，企业级审计留待后续。
