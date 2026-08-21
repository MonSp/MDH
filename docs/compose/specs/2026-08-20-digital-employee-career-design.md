# 数字员工职业发展体系设计

> 日期：2026-08-20 | 版本：v1.0 | 状态：已批准

## [S1] 核心数据模型

当前 36 个技能是扁平字符串列表，没有等级、依赖、经验值。需要三个新数据结构。

### SkillDefinition（技能定义）

```yaml
skill_id: str                    # "frontend_dev"
name: str                        # "前端开发"
category: str                    # "engineering" / "design" / "content" / "data" / "management"
prerequisites: List[Prerequisite]  # 前置技能+最低等级
xp_thresholds: [int, int, int]   # 初级→中级→高级 所需 XP
```

### Prerequisite（前置条件）

```yaml
skill: str                       # 前置技能 ID
min_level: int                   # 最低等级要求（1=初级, 2=中级, 3=高级）
```

### AgentProfile（agent 持久档案）

跨项目持久化，存 `data/agent_profiles/{agent_id}.json`。

```python
@dataclass
class AgentProfile:
    agent_id: str                    # 跨项目持久 ID
    name: str
    created_at: str
    career_stage: str                # "junior" / "mid" / "senior" / "lead"
    total_xp: int
    skill_progress: Dict[str, SkillProgress]  # skill_id → 进度
```

### SkillProgress（技能进度）

```python
@dataclass
class SkillProgress:
    skill_id: str
    xp: int                          # 累计经验值
    level: int                       # 0=未解锁, 1=初级, 2=中级, 3=高级
    task_count: int                  # 使用该技能的任务数
    success_count: int               # 成功数
    avg_review_score: float          # 平均审查评分（0-10）
    last_used_at: str
```

**设计决策：**
- AgentProfile 是跨项目持久化的，不随项目结束消失
- XP 只增不减（降级保护），但 avg_review_score 会因失败而下降
- 技能树用 prerequisites 字段表达依赖，不需要单独的图结构

## [S2] XP 系统与升级机制

### XP 来源（每次任务完成后计算）

| 来源 | 公式 | 说明 |
|------|------|------|
| 基础 XP | `10 + task_complexity * 5` | task_complexity 由语义分析给出 (1-5) |
| 成功奖励 | `+100%` 基础 XP | 任务成功才获得，失败得 0 |
| 审查加成 | `review_score >= 8 → +50%` | reviewer 打分高时额外奖励 |
| 首次使用 | `+20 XP` | 首次使用某技能的额外奖励 |

### XP 衰减（Diminishing Returns）

当 agent 的技能等级远高于任务难度时，XP 收益递减：

| agent 技能等级 vs 任务难度 | XP 系数 |
|---------------------------|---------|
| agent 等级 ≤ 任务难度 | 100% |
| agent 等级 = 任务难度 + 1 | 50% |
| agent 等级 ≥ 任务难度 + 2 | 10% |

这样高级 agent 做简单任务不会完全没收益（10% 还是有），但无法通过刷简单任务快速升级。
必须做真正有挑战的任务才能高效升级。

### 等级阈值（可在 roles_config.yaml 中配置）

| 等级 | XP | 标签 |
|------|-----|------|
| 0 | 0 | 未解锁 |
| 1 | 100 | 初级 |
| 2 | 300 | 中级 |
| 3 | 600 | 高级 |

### 升级触发

每次 XP 更新后检查是否突破阈值，自动升级并记录事件。

### 降级保护

不会因为失败而降级（XP 只增不减），但连续失败会降低 avg_review_score，影响审查加成。

### 技能解锁

当 agent 的前置技能达到要求等级时，新技能自动解锁（level 从 0 变 1）。

## [S3] 角色自动晋升

### 晋升路径

```
Executor → Reviewer → Coordinator → Planner
```

### 晋升条件（在 roles_config.yaml 中定义 promotion_requirements）

| 目标角色 | 条件 |
|---------|------|
| Reviewer | 至少 2 个技能达到中级 + code_review 技能达到初级 |
| Coordinator | 至少 3 个技能达到中级 + task_decomposition 达到初级 |
| Planner | 至少 2 个技能达到高级 + architecture 达到中级 |

### 晋升流程

1. 每次任务完成后，检查 agent 是否满足更高角色的条件
2. 满足条件 → 自动晋升，记录晋升事件
3. 晋升后 agent 解锁新工具权限
4. 前端展示晋升通知

### 不自动降级

晋升是单向的，agent 晋升后不会因为技能退步而降级（但可以手动调整）。

## [S4] 技能树结构

### Engineering 路径

```
backend_dev ──→ fullstack_dev ──→ devops ──→ deployment
frontend_dev ↗       ↓
              architecture ←── api_design
testing ──→ code_review ──→ security_audit
task_decomposition
performance
```

### Data 路径

```
database ──→ data_engineering ──→ ml_engineering
data_analysis ──→ data_visualization
data_analysis ──→ data_presentation
```

### Content 路径

```
content_writing ──→ content_editing
content_writing ──→ copywriting
script_writing ──→ video_editing
graphic_design ──→ ppt_design
user_research ──→ usability_testing
```

### Design 路径

```
graphic_design ──→ image_generation
graphic_design ──→ brand_identity ──→ brand_strategy
persona_development
```

### roles_config.yaml 扩展示例

```yaml
skills:
  backend_dev:
    description: "后端开发"
    category: engineering
    prerequisites: []
    xp_thresholds: [100, 300, 600]
  fullstack_dev:
    description: "全栈开发"
    category: engineering
    prerequisites:
      - skill: backend_dev
        min_level: 1
      - skill: frontend_dev
        min_level: 1
    xp_thresholds: [100, 300, 600]
```

## [S5] 前端展示

### AgentProfile 面板

在 TechTowerView 的 agent 详情中新增：
- 职业阶段徽章：初级 / 中级 / 高级 / Lead
- 总 XP 和等级进度条
- 技能网格：每个技能显示当前等级 + XP 进度条 + 锁定/解锁状态
- 晋升条件面板：显示下一个角色的解锁条件和当前进度

### 技能树可视化

在 SkillEvolutionDashboard 新增 tab：
- 树状/网格布局，节点=技能，边=依赖
- 节点颜色：灰色=未解锁，蓝=初级，紫=中级，金=高级
- 节点大小：基于使用频率
- 点击节点显示详情（XP、任务数、成功率、平均审查分）

### 晋升通知

- 任务完成后如果发生晋升，在会议消息中展示
- 前端 toast 通知

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents/{id}/profile` | agent 档案+技能进度 |
| GET | `/api/skills/tree` | 技能树结构（含依赖） |
| POST | `/api/agents/{id}/grant-xp` | 授予 XP（任务完成后调用） |
| GET | `/api/agents/{id}/promotion` | 晋升条件检查 |

## [S6] 实现范围

### v1.4.0 — 核心数据层

1. 扩展 roles_config.yaml 的 skills 部分（category, prerequisites, xp_thresholds）
2. 新建 agent_profile_manager.py（AgentProfile CRUD + XP 计算 + 升级检查）
3. 新建 promotion_engine.py（角色晋升逻辑）
4. 集成到 process_user_message：任务完成后自动 grant-xp
5. API 端点实现
6. 测试覆盖

### v1.4.1 — 前端展示

1. AgentProfile 面板组件
2. 技能树可视化组件
3. 晋升通知集成
4. 组件测试
