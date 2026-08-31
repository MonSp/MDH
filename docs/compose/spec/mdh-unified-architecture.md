---
feature: mdh-unified-architecture
status: delivered
updated: 2026-08-31
branch: main
commits: 5efdb6e..4f632e2 (Game) / 9ba96c7..773932c (Company)
---

# MDH 大荒界 — 统一智能体世界架构

## Report

**What was built** — 完整的 MDH 大荒界统一智能体世界架构：

1. **C++ ECS Agent Kernel** (`agent-kernel/`): 独立 CMake 项目，9 个通用 ECS 组件（Identity/Stats/Personality/MemoryRing/Lifecycle/Social/SkillTree/Career/Evolution），slot-based Registry 支持 100K+ entity，24 个 C++ 测试通过。

2. **IPC Bridge**: Unix Socket + JSON 协议层，C++ daemon 进程 + TypeScript 客户端库 + Python 客户端库，支持 10 个 IPC 方法（createAgent/getAgent/updateAgent/deleteAgent/listAgents/addSkillXp/addSkill/addCareerXp/getSkills/syncState）。

3. **Skill Mapping**: 42 个 Company 真实技能（5 大类别）映射到 Game 世界能力（backend_dev→阵法, testing→试炼, ml_engineering→炼丹 等），命名遵循 Game 世界观规范（功法/炼丹/阵法/符箓/禁制/机关），JSON 配置可热更新。

4. **Company Integration**: Python FastAPI 后端双写模式——SQLite 为主，kernel 为辅。新增 `/api/agents/kernel/state` 和 `/api/agents/kernel/sync` 端点。2089 测试通过，0 回归。

5. **Game Integration**: NPC 创建自动挂载通用组件，SkillMapper 根据角色/境界初始化技能树和职业阶段。743 测试通过。

6. **Brand Unification**: 双仓库 README/AGENTS.md 交叉引用，新增 `docs/BRAND.md` 品牌文档。

**Verification** — 命令及结果：
- `agent-kernel/build/kernel_tests` — 24/24 PASS
- `agent-kernel/ts-client npm test` — 15/15 PASS
- `agent-kernel/tests/e2e_test.py` — 6/6 PASS (Company↔Kernel↔Game 全链路)
- `MDH backend pytest` — 2089 PASS, 0 FAIL
- `MyGame npm test` — 743 PASS, 1 PRE-EXISTING (socket.io)

**Journey log**:
1. Registry 最初用 raw vector 存组件，改为 `std::optional<T>` 模式后更安全
2. LifecycleComponent 的 `DeathCause*` 裸指针改为 `std::optional` 消除了手动内存管理
3. E2E 测试暴露了 IPC 方法缺口（addSkill/addCareerXp）和 Python Unicode 编码问题（ensure_ascii=True→False），说明集成测试的价值
4. Company 的 entityId(int) vs agent_id(string) 映射需要 `_entity_map` 字典桥接
5. Game 和 agent-kernel 共享相同的 `ECS::ComponentBase<T>` CRTP 基类，组件复制只需调整 include 路径

## [S1] Problem

MDH 旗下有两个独立项目，各自发展但共享同一个愿景——智能体世界：

- **MDH-Company** (本仓库 `/home/test/MDH`)：数字员工操作系统，AI agent 团队协作执行任务
- **MDH-Game** (`/home/test/MyGame`)：太古纪元：霸业，2.5D 修仙 MMORPG，NPC 具有 AI 行为

两个项目各自维护独立的 agent profile、技能树、XP 系统、记忆系统。同一套"智能体"概念在两个代码库里被重复实现，数据无法互通。

**目标**：产品融合——Company 是管理后台，Game 是玩家前端，底层共享同一套 C++ ECS 智能体内核。同一个 agent 在 Company 里是「高级后端工程师」，在 Game 里是「元婴期阵法师」，记忆、技能、经验是同一份数据。

## [S2] Design

### 整体架构：三层结构

```
┌─────────────────────────────────────────────────────────────┐
│                  MDH 大荒界 · 智能体世界                      │
├──────────────────────────┬──────────────────────────────────┤
│      MDH-Company         │         MDH-Game                 │
│    (管理后台)             │       (玩家前端)                  │
│    ─────────────          │       ──────────                  │
│    · 任务派发/团队管理     │       · 修仙世界探索              │
│    · 技能树/XP 面板        │       · 宗门/国家经营             │
│    · 资产管理/进化追踪     │       · 战斗/剧情叙事            │
│    · 会议/审查系统         │       · NPC 交互/行为树          │
├──────────────────────────┴──────────────────────────────────┤
│              C++ ECS Agent Kernel (agent-kernel)             │
│    ─────────────────────────────────────────────────────    │
│    共享真相来源 (Single Source of Truth)                      │
│    AgentProfile · SkillTree · Memory · XP · Evolution        │
└─────────────────────────────────────────────────────────────┘
```

### C++ ECS Agent Kernel

将 Game 现有 ECS 引擎抽取为独立 CMake 项目 `agent-kernel/`，同时服务两个产品。

#### 核心层（复用 Game 现有代码）

- `Registry` — 实体注册表，slot-based 存储，支持 100K+ entity
- `Entity` — 轻量句柄 (uint64_t)
- `Component` — CRTP 基类，自动 TypeId 分配
- `System` — 遍历匹配组件的 entity 执行逻辑
- `Archetype` — 组件组合签名，快速查询

#### 通用组件（两个产品共享）

| 组件 | 来源 | 职责 |
|------|------|------|
| `IdentityComponent` | Game 现有，扩展 | 身份 ID/名称/部门/角色，新增 `department` 和 `companyRole` 字段 |
| `StatsComponent` | Game 现有，扩展 | 属性系统，新增通用属性维度 |
| `PersonalityComponent` | Game 现有，保留 | 6维性格模型（野心/谨慎/忠诚/贪婪/社交/勤勉），已完全通用 |
| `MemoryRingComponent` | Game 现有，保留 | 三级记忆系统（短期交互→中期摘要→长期里程碑+传闻），已高度成熟 |
| `LifecycleComponent` | Game 现有，保留 | 生命周期状态机 |
| `SocialComponent` | Game 现有，保留 | 关系网络 |
| `SkillTreeComponent` | **新建** | 42 个技能节点 + 依赖树 + 等级(初/中/高) + 5大类别 |
| `CareerComponent` | **新建** | XP 值/职级(初级→专家)/晋升路径/部门专属晋升标准 |
| `EvolutionComponent` | **新建** | 进化历史记录/规则有效性评分/自进化触发器 |

#### Game 专属组件（Game 加载时 attach）

| 组件 | 说明 |
|------|------|
| `CultivationComponent` | 修仙境界进度/突破/渡劫 |
| `PositionComponent` | 世界坐标 |
| `BehaviorTreeComponent` | NPC 行为树 + Blackboard |
| `CombatComponent` | 战斗属性/技能/状态 |
| `FactionComponent` | 宗门/国家归属 |
| `ResourcesComponent` | 游戏资源 |
| `LLMComponent` | LLM 规划请求 |

#### Company 专属组件（Company 加载时 attach）

| 组件 | 说明 |
|------|------|
| `TaskComponent` | 当前任务/执行状态/产出物 |
| `AssetComponent` | 资产出产/技能规则/复用率 |
| `MeetingComponent` | 会议参与/发言/投票 |
| `ExecutionComponent` | 本地/远端执行偏好/A2A 路由 |

#### 通用系统

| 系统 | 职责 |
|------|------|
| `SkillGrowthSystem` | 任务完成后计算 XP 增长、技能等级提升 |
| `EvolutionSystem` | 规则自进化(低分→生成改进版)、联动进化(规则→资产→技能级联) |
| `MemoryConsolidation` | 短期→中期→长期记忆压缩、老化清理 |
| `CareerProgression` | 自动晋升判定、XP 衰减（高级做简单任务） |
| `LLMIntegration` | 多模型路由(9提供商)、自动降级、规划请求 |

#### 桥接层

复用 Game 现有的 IPC 机制：

```
TypeScript Server ←→ Unix Socket ←→ C++ Agent Kernel
                   (JSON Protocol)
```

- 请求格式：`{ "method": "createAgent", "params": { ... } }`
- 响应格式：`{ "ok": true, "data": { ... } }`
- 推送格式：`{ "event": "agentUpdated", "agentId": "...", "changes": { ... } }`

### 技能映射

Company 的 42 个真实技能通过配置映射表翻译为 Game 世界能力：

| Company 技能 | Game 能力 | 类别 |
|---|---|---|
| `backend_dev` | `阵法` | 工程 |
| `frontend_dev` | `符箓` | 工程 |
| `testing` | `试炼` | 工程 |
| `code_review` | `炼器` | 工程 |
| `architecture` | `阵法` | 工程 |
| `devops` | `机关` | 工程 |
| `security_audit` | `禁制` | 工程 |
| `monitoring` | `观气术` | 工程 |
| `data_analysis` | `推演术` | 数据 |
| `ml_engineering` | `炼丹` | 数据 |
| `database` | `藏经阁` | 数据 |
| `graphic_design` | `铭文` | 设计 |
| `brand_identity` | `炼器` | 设计 |
| `content_writing` | `经文` | 内容 |
| `copywriting` | `咒文` | 内容 |
| `competitive_analysis` | `天机术` | 管理 |
| `risk_management` | `化劫术` | 管理 |
| ... | ... | 42个技能全部映射，见 `skill-mapping.json` |

映射存储为 JSON 配置文件，可在不修改代码的情况下调整。

### 数据流

```
用户操作 → Company UI (任务派发/管理)
    ↓
Company TS Server → IPC → C++ Agent Kernel
    ↓                          ↓
    ↓              Agent 实体状态更新
    ↓              (Profile/Skill/Memory/XP)
    ↓                          ↓
    ↓              IPC → Game TS Server
    ↓                          ↓
Company UI ←── 同步 ←── Game UI (NPC 以新状态出现)
```

**双向同步机制**：
- **Company → Game**：agent 完成任务 → XP/技能提升 → Game NPC 自动变强
- **Game → Company**：NPC 经历战斗/事件 → 记忆/性格微调 → Company 看到新经验记录
- **冲突解决**：以 C++ kernel 为权威来源，TS 层通过增量同步保持一致

## [S3] Out of Scope

- Company 的 Python FastAPI 后端迁移到 TypeScript（Phase 2 另行规划）
- Game 的 C++ ECS 非 agent 相关系统（地图生成、物理引擎）
- 完整的品牌视觉设计（仅含命名规范）
- 多租户/多实例部署方案

## Tasks

- [x] T1: 从 Game 抽取 agent-kernel CMake 项目 — acceptance: 独立编译通过，包含 ECS 核心 + 9 个通用组件 (covers: S2)
- [x] T2: 新建 SkillTreeComponent + CareerComponent + EvolutionComponent — acceptance: 组件可实例化、通过 Registry 查询，14测试通过 (covers: S2; depends: T1)
- [x] T3: 建立 IPC 协议规范 + 桥接层 — acceptance: C++ daemon + TS/Python 客户端，24测试通过 (covers: S2; depends: T1)
- [x] T4: 建立技能映射配置 + TS客户端库 — acceptance: 42 个 Company 技能全部映射到 Game 能力，15测试通过 (covers: S2; depends: T2)
- [x] T5: Game NPC 迁移到通用组件 — acceptance: 现有 NPC 通过通用组件正常运行，743测试通过 (covers: S2; depends: T3)
- [x] T6: Company Python IPC 客户端 — acceptance: Python 客户端连接 kernel daemon，15测试通过 (covers: S2; depends: T3)
- [x] T7: Company 接入 agent-kernel — acceptance: 双写模式(agent CRUD 走 SQLite + kernel)，2089测试通过 (covers: S2; depends: T6)
- [x] T8: MDH-Company 品牌统一 + 文档更新 — acceptance: 双仓库 README/AGENTS.md/BRAND.md 更新 (covers: S2)
- [x] T9: 端到端集成测试 — acceptance: Company↔Kernel↔Game 全链路验证通过 (covers: S2; depends: T5, T7)
- [x] T10: E2E 暴露的 IPC 缺口修复 — acceptance: addSkill/addCareerXp 方法补齐，Unicode 编码修复 (covers: S2; depends: T9)
