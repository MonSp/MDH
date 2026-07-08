# CEO-项目-团队-角色智能体-技能包-工具包 全链路重构设计

## [S1] 问题

当前系统的6层链路存在以下问题：

1. **Team层缺失** — 没有显式的 `Team` 抽象，团队组装逻辑散落在 `meeting_coordinator.py` 中
2. **Skills与Roles耦合** — 技能定义嵌入 `roles_config.yaml`，无法独立管理
3. **双重定义源** — `backend/roles_config.yaml` 和 `orchestrator/templates/roles.json` 定义相同角色
4. **Toolkit绑定不清晰** — Skills 定义了 `required_tools`，但没有机制将工具实际绑定到 Agent
5. **所有权链模糊** — CEO、Project、Team、RoleAgent 之间的创建/销毁关系不明确
6. **单机模型局限** — 当前架构假设单服务器运行，不支持去中心化的分布式智能体调度

## [S2] 解决方案概述

采用 Interface-first + Incremental 策略，定义清晰的6层接口和4个架构平面，逐步迁移现有代码。

### 6层模型

```
Layer 1: CEO (智能体实例，非单例)
  │  职责: 意图分析 → 复杂度判定 → 路由 → 交付
  │  创建: Project + Team
  ▼
Layer 2: Project (项目实例)
  │  职责: 生命周期管理、运行环境管理
  │  创建: Team Runtime + TeamAssembler
  ▼
Layer 3: Team (团队，共享运行环境)
  │  职责: 角色组装、内部会议协调、任务分配、审查
  │  管理: RoleAgent[] + 共享 Runtime
  ▼
Layer 4: RoleAgent (角色智能体实例)
  │  职责: 按角色配置执行任务、调用技能和工具
  │  携带: SkillPack (随agent迁移)
  │  使用: Toolkit (绑定到共享Runtime)
  ▼
Layer 5: SkillPack (技能包，可移植)
  │  职责: 提供领域知识、方法论、经验规则
  │  包含: manifest + system_prompt + knowledge + rules + examples
  ▼
Layer 6: Toolkit (工具包，运行时绑定)
     职责: 提供可执行的原子操作
     包含: 18个内置工具，6个类别
     注意: 工具执行在Team共享Runtime中进行
```

### 4个架构平面

| 平面 | 作用域 | 管理内容 | 是否随Agent迁移 |
|------|--------|----------|----------------|
| **Agent Instance** | Per-agent | 身份、状态、消息队列 | N/A (即agent本身) |
| **Capability** | Per-agent | SkillPack、prompt、rules | 是 |
| **Runtime** | Per-team | 文件系统、进程、网络 | 否 (共享) |
| **Communication** | System-wide | 消息总线、发现、路由 | N/A (基础设施) |

**核心分离原则**: Agent知道什么(Capability) ≠ Agent在哪里运行(Runtime)

### 去中心化调度模型

```
Web Frontend
 └── 创建 CEO Agent Instance (调度到本地或远端节点)
      └── 创建 Project + Team Runtime (共享 Docker/Pod)
           └── TeamAssembler 创建 RoleAgent 实例 (调度到同一Runtime)
                └── 每个Agent携带自己的 SkillPack
                └── 每个Agent在共享Runtime内获得过滤后的 Toolkit 权限
```

**调度策略**:
- 本地Agent: 在当前机器的Docker容器中运行
- 远端Agent: 调度到智能体集群中的可用节点
- 同一Team的Agent必须在同一Runtime中运行（共享文件系统）

## [S3] 接口设计

### Layer 1: CEO

```python
class ICeoAgent:
    """CEO是智能体实例，非单例。每个用户可创建独立的CEO实例。"""
    def process_message(self, content: str, selected_roles: list = None) -> TaskResult
    def handle_meeting_message(self, content: str) -> None
    def handle_workspace_confirm_response(self, response: dict) -> None
```

### Layer 2: Project

```python
class IProjectManager:
    def create_project(self, name: str, brief: dict) -> Project
    def instantiate_project(self, project_id: str, dag: dict) -> Team  # 返回Team而非员工列表
    def archive_project(self, project_id: str) -> ArchiveResult
    def get_project_status(self, project_id: str) -> ProjectStatus
```

### Layer 3: Team

```python
class ITeam:
    """Team管理一组共享Runtime的RoleAgent实例"""
    id: str
    project_id: str
    runtime: TeamRuntime       # 共享运行环境 (Docker/Pod)
    members: list[RoleAgent]
    leader: RoleAgent          # Coordinator角色

    # 团队协调（内部通过会议实现）
    def discuss(self, topic: str, participants: list = None) -> DiscussionResult
    def assign_task(self, task: SubTask, agent: RoleAgent) -> None
    def review_output(self, agent_id: str, output: TaskOutput) -> ReviewResult
    def vote(self, proposal: str, voters: list = None) -> VoteResult

    # 生命周期
    def get_status(self) -> TeamStatus
    def dissolve(self) -> None  # 销毁所有Agent实例 + 回收Runtime


class ITeamRuntime:
    """Team共享的运行环境"""
    id: str
    type: RuntimeType           # LOCAL_DOCKER | REMOTE_POD
    root_path: str              # 共享文件系统根目录
    network: NetworkConfig      # 网络配置

    def create(self) -> None
    def destroy(self) -> None
    def get_agent_workspace(self, agent_id: str) -> str  # Agent在共享Runtime内的工作子目录


class ITeamMeeting:
    """Team的内部组件，负责团队讨论和通信"""
    id: str
    agenda: AgendaStateMachine
    participants: list[RoleAgent]

    def start(self, topic: str) -> None
    def add_speaker(self, agent: RoleAgent, message: str) -> None
    def get_transcript(self) -> list[MeetingMessage]
    def conclude(self) -> MeetingConclusion


class ITeamAssembler:
    def assemble_from_dag(self, dag: dict, project_id: str, runtime: TeamRuntime) -> Team
```

### Layer 4: RoleAgent

```python
class IRoleAgent:
    """RoleAgent是独立的智能体实例，可被调度到本地或远端"""
    id: str
    role_config: RoleConfig
    skill_pack: SkillPack       # 随agent迁移的可移植能力
    toolkit: AgentToolset       # 绑定到共享Runtime的工具子集
    status: AgentStatus
    location: AgentLocation     # LOCAL | REMOTE

    def execute(self, task: TaskDescription) -> TaskResult
    def receive_feedback(self, feedback: StructuredFeedback) -> TaskResult
```

### Layer 5: SkillPack

```python
class ISkillPack:
    """SkillPack是可移植的能力包，随Agent实例迁移"""
    skill_id: str
    name: str
    version: str
    manifest: dict
    system_prompt: str
    knowledge: list[str]        # RAG文档
    rules: list[Rule]           # 经验规则
    examples: list[Example]     # 成功案例

    def get_incremental_path(self) -> str
    def package_for_transfer(self) -> bytes  # 打包为可传输格式


class ISkillRegistry:
    def register(self, skill_dir: str) -> SkillPack
    def clone(self, skill_id: str, target_dir: str) -> str
    def get_skill(self, skill_id: str) -> SkillPack
    def list_skills(self) -> list[dict]
```

### Layer 6: Toolkit

```python
class IToolExecutor:
    """工具执行在Team共享Runtime中进行"""
    def execute(self, tool_call: ToolCall) -> ToolResult


class IToolRegistry:
    def register(self, definition: ToolDefinition, executor: Callable) -> None
    def get_tool(self, name: str) -> ToolDefinition
    def filter_by_permissions(self, allowed_tools: list[str]) -> ToolRegistry
```

## [S4] 所有权链

```
Web Frontend (用户操作)
 └── 创建 CEO Agent Instance (调度到本地或远端)
      └── 创建 Project
           └── 创建 TeamRuntime (Docker/Pod)
                └── TeamAssembler 创建 Team
                     └── 创建 RoleAgent[] (调度到同一Runtime)
                          └── 携带 SkillPack (从SkillRegistry克隆)
                          └── 获得 Toolkit 子集 (在Runtime内过滤)
```

**所有权规则**:
- `Web Frontend` 创建 `CEO Agent Instance`（用户操作触发）
- `CEO` 拥有 `Project` 的生命周期
- `Project` 拥有 `TeamRuntime` 的生命周期
- `Team` 拥有 `RoleAgent[]` 的生命周期（通过 `TeamAssembler`）
- `RoleAgent` 携带 `SkillPack`（可移植能力），使用 `Toolkit`（运行时绑定）
- `SkillPack` 和 `Toolkit` 是全局只读资源，由注册中心管理
- `TeamRuntime` 是共享资源，Team解散时回收

## [S5] 技能包独立化

### 当前 (耦合):
```yaml
roles_config.yaml:
  base_roles:
    executor:
      skills: [frontend_dev, backend_dev]
  skills:
    frontend_dev:
      category: software_development
      methodology: [...]
```

### 目标 (解耦):
```
skill_packs/
  frontend_dev/
    manifest.yaml              # name, version, description, required_tools
    system_prompt.md           # 角色专属提示词
    knowledge/                 # RAG文档
    rules/                     # 经验规则
    examples/                  # 成功案例
  backend_dev/
    manifest.yaml
    ...

roles_config.yaml:
  base_roles:
    executor:
      skills: [frontend_dev, backend_dev]  # 只保留引用
```

### 迁移步骤:
1. 在 `skill_packs/` 目录下为每个技能创建标准结构
2. `roles_config.yaml` 的 `skills:` 字段只保留名称引用
3. `SkillRegistry` 扫描 `skill_packs/` 目录加载
4. `RoleAgent` 创建时通过 `SkillRegistry.get_skill()` 获取完整技能包
5. 远程Agent调度时，SkillPack通过 `package_for_transfer()` 打包传输

## [S6] 统一数据源

### 数据流向:
```
roles_config.yaml (唯一源)
    │
    ├── Python Backend: 直接读取 (load_roles_config())
    │
    └── Orchestrator (TS): 通过 HTTP API 获取
         GET /api/roles          → 返回所有角色定义
         GET /api/roles/{name}   → 返回单个角色
         GET /api/skills         → 返回所有技能包
         GET /api/tools          → 返回所有工具定义
```

### 实施步骤:
1. 在 FastAPI 后端添加 `/api/roles`, `/api/skills`, `/api/tools` 端点
2. Orchestrator 启动时通过 HTTP 获取角色配置
3. 删除 `orchestrator/templates/roles.json`
4. 角色变更只需修改 `roles_config.yaml` 一处

## [S7] 工具包绑定

### RoleAgent 创建流程:
1. 从 roles_config.yaml 获取角色配置 (tools, dangerous_tools, skills)
2. 从 SkillRegistry 克隆 SkillPack
3. 创建 AgentToolset:
   - 输入: role_config.tools + skill_pack.required_tools
   - 合并: 取并集，去重
   - 过滤: ToolRegistry.filter_by_permissions(merged_tools)
   - 输出: 该角色专属的工具子集
4. RoleAgent 挂载: skill_pack + agent_toolset

### 工具权限模型:
```
RoleConfig.tools        → 角色级权限 (基础)
SkillPack.required_tools → 技能级权限 (补充)
合并策略: 取并集
安全限制: dangerous_tools 需要显式授权
执行环境: 所有工具在Team共享Runtime中执行
```

### 去中心化场景下的工具执行:
- 本地Agent: 工具直接在本地Docker中执行
- 远端Agent: 工具调用通过消息总线转发到远端Runtime执行
- 工具执行结果通过消息总线返回给Agent
