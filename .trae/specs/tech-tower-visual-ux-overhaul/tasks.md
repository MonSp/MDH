# Tasks

## Phase 1: 视觉基础重塑（减法优先）

- [x] Task 1: 垂直渐变色彩系统 — 改造 GlassCurtainWall / GlassPanel，用楼层高度计算渐变色取代 DEPT_COLORS 循环。底层(0-2) → 科技蓝 #0a84ff~#1a5aff，中层(3-5) → 紫蓝 #5e56e0~#9b59b6，顶层(6-7) → 暖金 #ff9f0a~#ffb340
  - [ ] 1.1: 新增 `getFloorGradientColor(floor: number): string` 工具函数，根据 floor index 返回渐变色
  - [ ] 1.2: 修改 GlassPanel 组件，调用渐变色函数替代 `DEPT_COLORS[floor % DEPT_COLORS.length]`
  - [ ] 1.3: 调整 useGlassMaterial 的 transmission 参数降至 0.6，roughness 提升至 0.12（微磨砂）

- [x] Task 2: 灯光系统减法 — 移除黄色点光源，调整剩余光源参数
  - [ ] 2.1: 删除 Scene 中 `color="#ffb347"` 的 pointLight
  - [ ] 2.2: 顶部紫色光 intensity 从 1.5 调至 1.2，底部蓝色光 intensity 从 1.0 调至 0.8
  - [ ] 2.3: 霓虹边线 NeonEdges opacity 基线从 0.5 调至 0.4，脉冲幅度保持

- [x] Task 3: 材质区分 — 正面/右侧面板使用不同材质风格
  - [ ] 3.1: 修改 FrontFaceProjects 的 FloorClickMarker，使用 roughness 0.15 的磨砂玻璃 + 彩色 emissive 边缘
  - [ ] 3.2: 修改 RightFaceDepts 的 FloorClickMarker，使用半透明网格纹理（wireframe overlay 或 custom shader pattern）

## Phase 2: 空间交互增强

- [x] Task 4: 相机动画聚焦 — 点击面板时平滑移动相机
  - [ ] 4.1: 在 Scene 中新增 cameraTarget state 和 useFrame 中的 lerp 动画逻辑
  - [ ] 4.2: FloorClickMarker 的 onClick 回调传入世界坐标，触发相机 target 更新
  - [ ] 4.3: 添加呼吸光晕组件 BreathingRing，附着在被点击面板外圈

- [x] Task 5: Billboard 浮动标签 — FloorLabels 改为始终面向相机
  - [ ] 5.1: 将 FloorLabels 中的 Float+Text 替换为 drei 的 Billboard 组件包裹 Text

- [x] Task 6: 视角书签导航 — 左下角三个视角按钮
  - [ ] 6.1: 新增 ViewBookmarks 组件，包含正面/右侧/CEO三个按钮
  - [ ] 6.2: 每个按钮定义目标 camera position 和 target，点击后触发 lerp 动画
  - [ ] 6.3: 按钮样式：极简线框 icon + 半透明背景，hover 时高亮

- [x] Task 7: 悬停预览卡片 — 鼠标悬浮时浮现轻量摘要
  - [ ] 7.1: FloorClickMarker 新增 hovered state，onPointerOver 时设置预览数据到父组件
  - [ ] 7.2: 新增 HoverPreview 组件（CSS overlay），根据鼠标位置渲染项目名+进度条+部门 icon
  - [ ] 7.3: 使用 Html 组件（drei）将预览卡片锚定到 3D 位置

## Phase 3: 侧边面板升级

- [x] Task 8: 磨砂玻璃面板美化 — 升级 SidePanel 视觉风格
  - [ ] 8.1: 面板背景添加 CSS noise 纹理（background-image: url(data:...)）
  - [ ] 8.2: 左边框改为 1px 紫光渐变 `linear-gradient(180deg, #bf5af2, #5e56e0)`
  - [ ] 8.3: 滚动条样式：宽度 4px，轨道透明，滑块 rgba(100,210,255,0.2)

- [x] Task 9: 卡片式团队展示 — 成员改为横向圆形头像卡片
  - [ ] 9.1: 新增 MemberCard 组件：圆形头像（显示首字母 emoji）+ 名字，横向排列
  - [ ] 9.2: 容器使用 `overflow-x: auto; white-space: nowrap` 实现横向滚动
  - [ ] 9.3: 点击卡片展开角色详情弹出层（position: absolute）

- [x] Task 10: 项目状态微动效 — 为不同状态附加差异化动画
  - [ ] 10.1: active 状态：CSS animation 进度点左右滑动 `@keyframes slide`
  - [ ] 10.2: planning 状态：虚线边框 CSS animation 闪烁 `@keyframes dash-blink`
  - [ ] 10.3: completed 状态：勾号 SVG 粒子飘散 CSS animation `@keyframes float-up`

## Phase 4: 性能优化

- [x] Task 11: InstancedMesh 合并渲染合并玻璃面板
  - [x] 11.1: 将 GlassCurtainWall 改为按面（front/back/left/right）各一个 InstancedMesh
  - [x] 11.2: 每帧通过 instanceMatrix 更新位置/旋转，instanceColor 更新颜色
  - [x] 11.3: 移除 GlassPanel 单独组件，合并到 InstancedGlassWall 组件

- [x] Task 12: 动态小人 LOD
  - [ ] 12.1: TeamFigure 内部使用 useFrame 检测相机距离
  - [ ] 12.2: 距离 > 40 时渲染简化版（单个 Sphere + emissive），距离 <= 40 时渲染完整版

- [x] Task 13: 数据流粒子系统
  - [ ] 13.1: 新增 DataFlowParticles 组件，使用 THREE.Points 渲染
  - [ ] 13.2: 粒子从 y=0 向 y=BUILDING_H 匀速上升，到达顶部后重置到底部
  - [ ] 13.3: 粒子密度 = `baseCount + projectIterations * factor`，颜色跟随楼层渐变

## Phase 5: 叙事微动效

- [x] Task 14: 小人走位动画 — 替换原地浮动为水平小幅移动
  - [ ] 14.1: TeamFigure 的 useFrame 中增加 x 轴 `Math.sin(t * 0.5 + delay) * 0.3` 位移
  - [ ] 14.2: 添加简单的"面朝行走方向"旋转

- [x] Task 15: 全息 AI 联动反馈
  - [ ] 15.1: HolographicAI 接收 `activeDeptColor` prop
  - [ ] 15.2: 使用 useFrame lerp 将 emissive color 过渡到目标色
  - [ ] 15.3: 选中部门时旋转速度从 0.5 加速到 1.5，2 秒后回落

- [x] Task 16: 天线信号灯联动
  - [ ] 16.1: Antenna 接收 `activeDeptColor` prop，信号灯颜色跟随变化
  - [ ] 16.2: 选中部门时闪烁节奏从 3Hz 变为 6Hz，持续 2 秒

## Phase 6: 移动端与可访问性

- [x] Task 17: 响应式布局
  - [ ] 17.1: 使用 `window.matchMedia('(max-width: 768px)')` 检测窄屏
  - [ ] 17.2: 窄屏时 Canvas 高度改为 60%，下方渲染 DrawerPanel（可拖拽上拉）
  - [ ] 17.3: DrawerPanel 顶部添加拖拽指示条（40px 宽 4px 高的灰色条）

- [x] Task 18: 键盘无障碍导航
  - [ ] 18.1: FloorClickMarker 添加 `tabIndex={0}` 和 `aria-label` 属性
  - [ ] 18.2: onKeyDown 监听 Enter 触发 onClick，Esc 关闭 SidePanel
  - [ ] 18.3: SidePanel 打开时自动 focus 到关闭按钮，Esc 关闭

# Task Dependencies
- Task 1, 2, 3 无依赖，可并行
- Task 4 依赖 Task 1（渐变色确定后才能做光晕匹配）
- Task 5, 6, 7 无依赖，可并行
- Task 8, 9, 10 无依赖，可并行
- Task 11 依赖 Task 1, 3（材质参数确定后再合并）
- Task 12, 13, 14, 15, 16 无依赖，可并行
- Task 17, 18 无依赖，可并行，但建议在 Phase 1-3 完成后再做
