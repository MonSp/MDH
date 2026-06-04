# TechTowerView 视觉与交互体验升级 Spec

## Why
当前 TechTowerView 3D 大楼看板已具备楼层分区、部门矩阵、可点选项目等基础能力，但视觉层级混乱（五色循环、多光源叠加）、交互反馈单一（点击仅开侧边面板）、信息密度高但缺乏呼吸感、性能存在隐患（96+ 独立几何体 + 大量 Text 组件）。需要通过系统性的视觉重塑、空间交互增强、信息降噪和性能优化，让大楼从"能用"升级为"令人印象深刻"。

## What Changes

### 视觉层级与氛围重塑
- 改用**垂直渐变分区**：底层(1-3层)科技蓝、中层(4-6层)紫蓝过渡、顶层(7-8层+CEO公寓)暖金琥珀
- 光影减法：移除黄色点光源，保留顶部紫色主光 + 底部蓝色辅光，玻璃透光度降至 0.6
- 材质区分：正面项目面板用微磨砂玻璃+彩色边缘光，右侧部门面板用半透明网格纹理

### 交互反馈与空间导航
- 点击聚焦：相机平滑移动到目标楼层，面板外圈呼吸光晕
- 浮动标签改为 Billboard 始终面向相机
- 视角书签：左下角正面/右侧/CEO三个视角快捷按钮
- 悬停预览：鼠标悬浮时浮现卡片预摘要

### 侧边面板信息降噪
- 磨砂玻璃背景 + 紫光细线边框
- 成员列表改为横向可滚动圆形头像卡片
- 创建团队流程优化为迷你组织架构网格
- 项目状态附加微动效（进度滑动/虚线闪烁/勾号粒子）

### 性能优化
- 玻璃面板改为 InstancedMesh 合并渲染
- 动态小人 LOD：远距离用静态光点替代
- 3D 文字迁移到 CSS overlay 世界坐标投影

### 叙事感与微动效
- 小人添加水平走位动画
- 楼体内部加入向上流动的光点粒子（数据流）
- 全息 AI 助手颜色跟随当前选中部门变化

### 移动端与可访问性
- 768px 以下：3D 场景占上半 60%，下半为可拖拽半屏抽屉
- 触控手势适配
- aria-label + 键盘导航 + Esc 关闭面板

## Impact
- Affected specs: 无前置依赖 spec
- Affected code: `src/components/TechTowerView.tsx`（主文件，所有改动集中于此）

## ADDED Requirements

### Requirement: 垂直渐变色彩系统
系统 SHALL 根据楼层高度使用渐变色彩，底层冷色、中层过渡、顶层暖色，取代当前的五色循环。

#### Scenario: 玻璃面板色彩
- **WHEN** 大楼渲染完成
- **THEN** 1-3层玻璃面板呈科技蓝色调，4-6层呈紫蓝色调，7-8层+CEO公寓呈暖金琥珀色调

### Requirement: 相机动画聚焦
系统 SHALL 在用户点击楼层标记时，平滑移动相机到目标楼层并显示呼吸光晕。

#### Scenario: 点击项目面板
- **WHEN** 用户点击正面某项目面板
- **THEN** 相机在 1 秒内平滑移动到该楼层正面视角，面板外圈出现呼吸光晕动画

### Requirement: 视角书签导航
系统 SHALL 在 UI 左下角提供三个视角快捷按钮。

#### Scenario: 切换视角
- **WHEN** 用户点击"正面视图"按钮
- **THEN** 相机平滑移动到大楼正面中央视角

### Requirement: 悬停预览卡片
系统 SHALL 在鼠标悬浮楼层面板时显示轻量预摘要。

#### Scenario: 悬停项目面板
- **WHEN** 鼠标悬浮在某项目面板上
- **THEN** 旁边浮现小卡片显示项目名、进度条、部门图标

### Requirement: 磨砂玻璃侧边面板
系统 SHALL 使用毛玻璃 + 紫光细线边框样式渲染侧边面板。

#### Scenario: 打开详情面板
- **WHEN** 用户点击任意楼层标记
- **THEN** 右侧滑入毛玻璃质感面板，边缘有紫光细线

### Requirement: 卡片式团队展示
系统 SHALL 将成员列表改为横向可滚动的圆形头像卡片。

#### Scenario: 查看部门详情
- **WHEN** 用户打开某部门详情面板
- **THEN** 团队成员以圆形头像卡片横向排列，可左右滚动，点击展开角色详情

### Requirement: 项目状态微动效
系统 SHALL 为不同项目状态附加差异化微动效。

#### Scenario: 进行中项目
- **WHEN** 项目状态为 active
- **THEN** 状态标签处有细微进度点来回滑动动画

### Requirement: InstancedMesh 合并渲染
系统 SHALL 将同类型玻璃面板合并为 InstancedMesh 渲染。

#### Scenario: 玻璃幕墙渲染
- **WHEN** 大楼渲染完成
- **THEN** 正面、背面、左面、右面各自使用一个 InstancedMesh，减少 draw call

### Requirement: 动态小人 LOD
系统 SHALL 根据相机距离对小人模型进行 LOD 切换。

#### Scenario: 远距离观察
- **WHEN** 相机距离大于 40
- **THEN** 小人简化为静态球体+颜色光点

### Requirement: 数据流粒子
系统 SHALL 在楼体内部渲染向上流动的光点粒子。

#### Scenario: 粒子流动
- **WHEN** 大楼渲染完成
- **THEN** 楼体内有蓝色光点从底层向顶层持续流动，密度随项目迭代数变化

### Requirement: 全息 AI 联动反馈
系统 SHALL 让全息 AI 助手颜色跟随当前选中部门变化。

#### Scenario: 选中部门
- **WHEN** 用户选中某部门查看详情
- **THEN** 全息 AI 助手颜色变为该部门主题色，旋转速度短暂加快

### Requirement: 响应式移动端布局
系统 SHALL 在窄屏设备上切换为上下分栏布局。

#### Scenario: 移动端访问
- **WHEN** 视口宽度小于 768px
- **THEN** 3D 场景占上半 60%，下半为可拖拽半屏抽屉面板

### Requirement: 键盘无障碍导航
系统 SHALL 支持键盘 Tab 导航和 Enter/Esc 操作。

#### Scenario: 键盘操作
- **WHEN** 用户按 Tab 键
- **THEN** 焦点在可交互楼层标记间切换，Enter 打开详情，Esc 关闭面板

## MODIFIED Requirements

### Requirement: 灯光系统
当前三组强点光源改为两组：保留顶部紫色主光（象征决策）和底部蓝色辅光（象征技术基底），移除黄色光。霓虹边线承担节奏感。

### Requirement: 玻璃面板材质
玻璃面板透光度从 0.75-0.85 降至 0.6，正面面板增加微磨砂粗糙度（0.15），右侧面板使用网格纹理 pattern。

### Requirement: 浮动楼层标签
FloorLabels 组件从固定朝向改为 Billboard 模式，始终面向相机。

## REMOVED Requirements
无移除需求。

## Migration
所有改动集中在 `TechTowerView.tsx` 单文件内，不影响外部 API（onStartMeeting/onSendTask/onBackToSingle 三个回调不变）。InstancedMesh 改造为内部实现细节，对外无影响。
