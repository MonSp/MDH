# 赛博朋克场景建筑逼真度与材质系统全栈升级 — 需求规格

## 目标

将当前基于 React Three Fiber 的赛博朋克 Web 3D 场景的建筑系统从"简单 BoxGeometry 方块"升级为"电影级逼真建筑群"。聚焦三大核心改造：建筑几何系统（ExtrudeGeometry 程序化建筑轮廓 + 建筑细节附件）、窗户系统（InstancedMesh 实例化渲染数千个独立窗户）、材质系统（MeshPhysicalMaterial 高级 PBR 材质），同时整合之前 cinematic-overhaul 规格中的天空/雾/后处理/密度改进，实现全栈电影级逼真升级。

当前场景的 CyberpunkBuildings.tsx 使用 BoxGeometry 三层退台方块 + 256x256 Canvas 程序化纹理（rust/concrete/metal 三种）+ PlaneGeometry 条带窗户（每层一条）+ 天线/空调/管道细节。已有 55+ 栋建筑按环形分布。但几何体过于规则（纯方块）、窗户无独立实例化、材质仅用 MeshStandardMaterial 无 clearcoat、缺乏建筑风格多样性。目标场景应具备 ExtrudeGeometry 生成的带凹凸轮廓建筑、InstancedMesh 渲染的数千个独立发光窗户、MeshPhysicalMaterial 实现的玻璃幕墙/混凝土/金属面板高级材质、以及至少 3 种可辨识的建筑风格。

## 范围

### 包含范围

- 重写 CyberpunkBuildings.tsx 建筑几何系统：从 BoxGeometry 升级为 ExtrudeGeometry，支持退台/凹凸/女儿墙等建筑特征
- 新增 InstancedMesh 窗户渲染器：每栋建筑约 200 个独立窗户实例，总计约 1 万个
- 升级建筑材质系统：从 MeshStandardMaterial 升级为 MeshPhysicalMaterial，支持 clearcoat/metalness/roughness/envMapIntensity
- 定义并实现 3 种建筑风格：现代玻璃幕墙、老式砖楼、工业风建筑
- 实现真实城市高度分布算法：中心高、边缘低
- 建筑细节附件系统：空调外机、管道、阳台、广告牌支架的 BufferGeometry 实例化
- 窗户发光与随机点亮系统：emissive + toneMapped=false + 60% 点亮率
- 整合之前 cinematic-overhaul 的天空/雾/后处理/密度改进
- 性能验证与 LOD 优化

### 不包含范围

- 主建筑（BuildingScene）的结构改造（已使用 MeshPhysicalMaterial）
- CEO 顶层公寓和家具系统
- 侧边面板 UI 功能
- 新增 npm 依赖（Three.js v0.170 已内置所有所需特性）
- GLTFLoader 外部模型加载（用户选择混合方案，主体用程序化生成）
- 地面街道层面的行人/地面车辆

## 功能要求

### FR1: ExtrudeGeometry 建筑轮廓生成器

系统应提供 BuildingProfileGenerator 模块，使用 THREE.Shape 定义建筑俯视轮廓（矩形+凹凸+L形），通过 THREE.ExtrudeGeometry 拉伸生成 3D 几何体。每种建筑风格应有独立的轮廓模板集。退台应通过分段 Extrude 实现：底层宽、中层收窄、顶层更窄。轮廓点数应控制在 30-50 个以平衡细节与性能。每栋建筑的几何体应通过 seed 参数确定性生成。

### FR2: 建筑细节附件系统

系统应为每栋非简化建筑生成可辨识的细节附件：空调外机（BoxGeometry 0.5x0.3x0.4）、管道（CylinderGeometry 半径 0.05-0.15）、阳台（BoxGeometry 扁平悬挑）、广告牌支架（BufferGeometry L形金属架）。附件应使用 THREE.Group 挂载，通过 seed 确定性放置在建筑立面和屋顶。远景建筑（simplified=true）应跳过细节生成以降低 GPU 开销。

### FR3: InstancedMesh 窗户渲染器

系统应创建 BuildingWindows 组件，使用 THREE.InstancedMesh 渲染窗户。共享窗户几何体应为 PlaneGeometry(0.6, 0.4)。每栋建筑应在 4 个立面上按网格布局放置窗户实例（行间距 2.5，列间距 1.2），约 200 个实例/栋。应使用 setMatrixAt() 设置每个实例的位置和旋转，通过 count 动态控制可见实例数。

### FR4: 窗户发光与随机点亮

窗户材质应使用 MeshStandardMaterial，emissive 为暖黄(#ffaa44)或冷蓝(#4488ff)，emissiveIntensity=0.8-1.5，toneMapped=false 以在 Bloom 中产生 HDR 辉光。应通过 seed 随机决定每个窗户的色调和是否点亮（约 60% 点亮率）。应使用 setColorAt() 为每个实例设置独立颜色。已点亮窗户应有微弱的 emissive 强度脉冲动画（±0.2）。

### FR5: MeshPhysicalMaterial 材质升级

系统应将建筑材质从 MeshStandardMaterial 升级为 MeshPhysicalMaterial。应为三种建筑风格定义独立的材质参数集：
- 现代玻璃幕墙：color=#4a6a8a, metalness=0.9, roughness=0.05, clearcoat=1.0, clearcoatRoughness=0.1, envMapIntensity=2.0
- 老式砖楼：color=#6a4a3a, metalness=0.0, roughness=0.85, clearcoat=0.0, envMapIntensity=0.5
- 工业风建筑：color=#3a3a4a, metalness=0.6, roughness=0.3, clearcoat=0.5, clearcoatRoughness=0.3, envMapIntensity=1.2

材质应使用现有 Environment HDR（dikhololo_night_1k.hdr）作为环境反射源。

### FR6: 三种建筑风格定义

系统应定义三种建筑风格的几何与材质组合：
1. 现代玻璃幕墙（style='glass'）：矩形轮廓，宽大平顶，少退台，高反射玻璃材质，窗户密集
2. 老式砖楼（style='brick'）：窄高轮廓，多退台/阶梯，砖红色材质，窗户稀疏
3. 工业风建筑（style='industrial'）：L形或不规则轮廓，平顶+大量管道/排气口，暗灰金属材质

建筑风格应由 seed 确定性分配，比例约 40% 玻璃、30% 砖楼、30% 工业。

### FR7: 真实城市高度分布

系统应修改 generateBuildings() 函数，使用距离衰减函数控制建筑高度。中心区域（半径<25）建筑高度应为 40-80 单位，中间区域（半径 25-50）高度应为 20-45 单位，边缘区域（半径>50）高度应为 10-25 单位。每环内的高度应有随机波动（±20%）以避免过于规律。

### FR8: 电影级氛围系统整合

系统应确保 SkyDome 天空穹顶、12 层体积雾平面、Bloom+ChromaticAberration+Noise+Vignette 四种后处理效果、以及 ACESFilmic ToneMapping 与新建筑材质系统正常协作。MeshPhysicalMaterial 的 clearcoat 应正确使用 Environment HDR 反射，Bloom 应正确响应 emissive 窗户的 HDR 辉光。

## 验收标准

### AC1: 建筑几何验收

当用户从默认视角（position=[30,38,30]）观察时，背景建筑应显示可辨识的退台、凹凸轮廓、女儿墙等建筑特征，而非简单方块。建筑轮廓应有明显的非矩形几何变化（如 L形凹入、阶梯退台）。

### AC2: 窗户系统验收

当用户使用正面视角观察单栋建筑时，建筑立面上应显示约 200 个独立窗户实例（非条带），窗户应呈网格状均匀分布。约 60% 的窗户应发出暖黄或冷蓝的发光效果，Bloom 后处理应在窗户周围产生可见的辉光。

### AC3: 材质质感验收

当用户使用 OrbitControls 旋转视角观察建筑时，玻璃幕墙建筑应显示可辨识的 clearcoat 高光反射（随视角移动），砖楼建筑应显示粗糙的哑光表面，工业风建筑应显示中等金属光泽。三种风格的材质视觉差异应明显可辨。

### AC4: 风格多样性验收

当用户使用全景视角（position=[55,45,55]）观察时，场景中应至少存在 3 种可辨识的建筑风格（玻璃幕墙/砖楼/工业风），每种风格的建筑应有独立的几何轮廓和材质外观。

### AC5: 高度分布验收

当用户使用俯视视角观察时，中心区域建筑应明显高于边缘区域，天际线应呈现自然的高低错落效果，不应出现所有建筑等高的情况。

### AC6: 细节附件验收

当用户使用近景视角（距离建筑 <10 单位）观察时，建筑上应可见空调外机、管道等细节元素。远景建筑（距离 >60 单位）应使用简化几何。

### AC7: 性能验收

在中端设备（GTX1060 / M1 MacBook）上运行改造后场景时，帧率应保持 ≥30 FPS，页面滚动和视角切换应无明显卡顿。

## 非功能需求

- 所有改动限于 src/components/cyberpunk/ 和 src/components/techtower/TowerScene.tsx
- 建筑生成函数支持 seed 参数产生确定性结果
- 保持现有 UI 覆盖层（视角按钮、底部控制栏、侧边面板）正常工作
- InstancedMesh 使用共享 BufferGeometry + 共享材质以减少 draw call
- 保留主建筑和 CEO 场景的功能性交互
