# 多Agent角色卡片界面 Spec

## Why
当前的Agent状态面板虽然功能完整，但缺乏视觉吸引力和个性化表达。用户需要一个更加生动活泼的界面来展示每个Agent的角色特点、个性形象和当前工作状态，以增强协作体验的沉浸感和可理解性。

## What Changes
- 创建全新的Agent角色卡片组件，采用卡片式设计
- 为每个Agent角色设计独特的视觉形象和个性特征
- 增强角色描述展示，包含详细的职责说明和能力标签
- 优化正在执行工作的展示，提供更直观的任务进度和状态反馈
- 添加动画效果和交互反馈，提升用户体验

## Impact
- Affected specs: multi-agent-collaboration-mode
- Affected code:
  - `src/components/AgentRoleCard.tsx` - 新增角色卡片组件
  - `src/components/AgentRoleCard.css` - 卡片样式和动画
  - `src/components/AgentStatusPanel.tsx` - 可能需要集成新卡片
  - `src/modules/agentTypes.ts` - 可能需要扩展Agent元数据

## ADDED Requirements
### Requirement: 生动角色形象
系统 SHALL 为每个Agent角色提供独特的视觉形象，包括角色头像、个性色彩和标志性图标，使每个Agent具有鲜明的个性特征。

#### Scenario: 角色形象展示
- **WHEN** 用户查看Agent角色卡片
- **THEN** 每个Agent显示独特的头像、个性色彩和角色标志性图标

### Requirement: 详细角色描述
系统 SHALL 展示每个Agent的详细角色描述，包括主要职责、专业能力和协作特点。

#### Scenario: 查看角色详情
- **WHEN** 用户查看Agent角色卡片
- **THEN** 卡片显示Agent的角色描述、主要职责和专业能力标签

### Requirement: 实时工作状态
系统 SHALL 实时展示Agent正在执行的工作，包括当前任务名称、任务进度、执行状态和预计完成时间。

#### Scenario: 监控工作进度
- **WHEN** Agent正在执行任务
- **THEN** 卡片显示当前任务名称、进度条、执行状态和预计剩余时间

### Requirement: 交互式卡片设计
系统 SHALL 提供交互式的卡片设计，支持悬停效果、点击展开和状态切换动画。

#### Scenario: 交互操作
- **WHEN** 用户悬停或点击Agent角色卡片
- **THEN** 卡片显示相应的动画效果和详细信息展开

## MODIFIED Requirements
### Requirement: Agent状态面板
现有的Agent状态面板需要集成新的角色卡片组件，提供更加丰富和生动的Agent展示方式。

## REMOVED Requirements
无

## Technical Implementation
### 核心组件
1. **AgentRoleCard** - 角色卡片主组件，负责渲染单个Agent的完整卡片
2. **RoleAvatar** - 角色头像组件，显示Agent的视觉形象
3. **TaskProgressIndicator** - 任务进度指示器，显示当前工作状态
4. **CapabilityTags** - 能力标签组件，展示Agent的专业能力

### 视觉设计
- 每个角色类型（规划者、执行者等）采用不同的主题色彩
- 卡片采用圆角设计，带有微妙的阴影和边框效果
- 头像使用风格化的图标或插画，体现角色特点
- 进度条采用渐变色彩，动态显示任务完成情况

### 数据结构扩展
```typescript
interface AgentRoleProfile {
  avatar: string;           // 头像URL或图标标识
  themeColor: string;       // 主题色彩
  personality: string;      // 个性描述
  motto: string;           // 角色座右铭
  specializations: string[]; // 专业领域
}
```

### 动画效果
- 卡片入场：淡入 + 轻微上浮
- 状态切换：平滑过渡动画
- 进度更新：进度条平滑增长
- 悬停效果：轻微放大 + 阴影增强